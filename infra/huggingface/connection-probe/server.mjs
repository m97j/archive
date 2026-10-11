import { createServer } from "node:http";
import { setTimeout, clearTimeout } from "node:timers";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { sql as drizzleSql } from "drizzle-orm";
import postgres from "postgres";
import { Kysely, PostgresDialect, sql as kyselySql } from "kysely";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./prisma/generated/index.js";
import { createClient } from "@supabase/supabase-js";
import { databasePoolConfig } from "../../../packages/db/src/runtime-config.ts";
import { candidates, failureCode, identitySql, schemaAuditSql, verifyIdentity } from "./probe.mjs";

const report = {
  version: 1,
  state: "running",
  readOnly: true,
  runtime: process.version,
  results: [],
};

// HF private gateway protects this diagnostic report. It never serves credentials or DB rows.
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET" || !["/health", "/report"].includes(request.url)) {
    response.writeHead(404);
    response.end('{"error":"not_found"}');
    return;
  }
  response.end(
    JSON.stringify(
      request.url === "/report"
        ? report
        : { service: "archive-connection-probe", state: report.state },
    ),
  );
});
server.listen(Number(process.env.PORT ?? 7860), "0.0.0.0");

async function testDriver(name, config) {
  if (name === "pg") {
    const pool = new Pool(config);
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN READ ONLY");
      verifyIdentity((await client.query(identitySql)).rows);
      const audit = (await client.query(schemaAuditSql)).rows;
      await client.query("ROLLBACK");
      return audit;
    } finally {
      client?.release(true);
      await pool.end();
    }
  }
  if (name === "drizzle-pg") {
    const pool = new Pool(config);
    try {
      const db = drizzlePg(pool);
      await db.transaction(
        async (tx) => verifyIdentity((await tx.execute(drizzleSql.raw(identitySql))).rows),
        { accessMode: "read only" },
      );
    } finally {
      await pool.end();
    }
    return;
  }
  if (name === "drizzle-postgres-js") {
    const client = postgres(config.connectionString, {
      ssl: config.ssl,
      prepare: false,
      max: 1,
      connect_timeout: 8,
      connection: { statement_timeout: 8000, default_transaction_read_only: "on" },
    });
    try {
      const db = drizzlePostgres(client);
      await db.transaction(
        async (tx) => verifyIdentity(await tx.execute(drizzleSql.raw(identitySql))),
        { accessMode: "read only" },
      );
    } finally {
      await client.end({ timeout: 2 });
    }
    return;
  }
  if (name === "prisma-pg") {
    const client = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
    try {
      await client.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          verifyIdentity(await tx.$queryRawUnsafe(identitySql));
        },
        { maxWait: 10000, timeout: 10000 },
      );
    } finally {
      await client.$disconnect();
    }
    return;
  }
  if (name === "kysely-pg") {
    const db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool(config) }) });
    try {
      await db.transaction().execute(async (tx) => {
        await kyselySql.raw("SET TRANSACTION READ ONLY").execute(tx);
        verifyIdentity((await kyselySql.raw(identitySql).execute(tx)).rows);
      });
    } finally {
      await db.destroy();
    }
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    report.state = "missing_database_url";
    return;
  }
  for (const [mode, url] of candidates(connectionString)) {
    const config = databasePoolConfig(url.toString(), {
      ...process.env,
      DATABASE_POOL_MAX: "1",
      DATABASE_CONNECT_TIMEOUT_MS: "8000",
      DATABASE_STATEMENT_TIMEOUT_MS: "8000",
      DATABASE_QUERY_TIMEOUT_MS: "10000",
    });
    for (const driver of ["pg", "drizzle-pg", "drizzle-postgres-js", "prisma-pg", "kysely-pg"]) {
      const start = Date.now();
      try {
        const audit = await testDriver(driver, {
          ...config,
          application_name: "archive-read-only-probe",
        });
        report.results.push({
          mode,
          driver,
          status: "PASS",
          tls: "verified",
          transaction: "read-only",
          elapsedMs: Date.now() - start,
        });
        if (audit) report.schemaAudit = audit;
      } catch (error) {
        const status = failureCode(error);
        report.results.push({ mode, driver, status, elapsedMs: Date.now() - start });
        if (["AUTH_FAILED", "POOLER_BLOCKED"].includes(status)) {
          report.state = "stopped_no_retry";
          return;
        }
      }
    }
  }
  if (!report.results.some((result) => result.status === "PASS")) {
    const key =
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!key) report.httpsFallback = "NOT_TESTED_MISSING_API_KEY";
    else {
      const supabase = createClient("https://spffrdgttkhlwgosuvix.supabase.co", key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) =>
            globalThis.fetch(input, { ...init, signal: globalThis.AbortSignal.timeout(10000) }),
        },
      });
      const { error } = await supabase.from("Post").select("id", { head: true }).limit(1);
      report.httpsFallback = error ? "CHECK_FAILED" : "READ_PASS_RPC_NOT_TESTED";
    }
  } else report.httpsFallback = "NOT_NEEDED_SQL_PATH_PASSED";
  try {
    const jwksResponse = await globalThis.fetch(
      "https://spffrdgttkhlwgosuvix.supabase.co/auth/v1/.well-known/jwks.json",
      { signal: globalThis.AbortSignal.timeout(10000) },
    );
    const jwks = jwksResponse.ok ? await jwksResponse.json() : undefined;
    report.jwks = {
      status: jwksResponse.status,
      publicKeyCount: Array.isArray(jwks?.keys) ? jwks.keys.length : 0,
    };
  } catch {
    report.jwks = { status: "NETWORK_OR_TLS_ERROR" };
  }
  report.state = "complete";
}

const deadline = setTimeout(() => {
  report.state = "deadline_exceeded";
  process.stdout.write(`ARCHIVE_PROBE_RESULT ${JSON.stringify(report)}\n`);
  // Terminate connections rather than letting abandoned probes accumulate in the pooler.
  server.close(() => process.exit(2));
  setTimeout(() => process.exit(2), 1000).unref();
}, 240_000);
main()
  .catch(() => {
    report.state = "configuration_or_probe_error";
  })
  .finally(() => {
    clearTimeout(deadline);
    process.stdout.write(`ARCHIVE_PROBE_RESULT ${JSON.stringify(report)}\n`);
  });
process.once("SIGTERM", () => server.close(() => process.exit(0)));
