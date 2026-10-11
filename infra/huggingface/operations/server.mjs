import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import { readFileSync, createReadStream, statSync, mkdirSync } from "node:fs";
import { databasePoolConfig } from "../../../packages/db/src/runtime-config.ts";
import { importLegacy } from "../../../packages/db/scripts/import-legacy-core.mjs";
import { drizzle } from "../connection-probe/node_modules/drizzle-orm/node-postgres/index.js";
import { migrate } from "../connection-probe/node_modules/drizzle-orm/node-postgres/migrator.js";

// Defense in depth: private HF gateway AND a separate, temporary operations credential.
const operationsToken = process.env.ARCHIVE_OPERATIONS_TOKEN;
if (!operationsToken || operationsToken.length < 40)
  throw new Error("Temporary operations authentication is required");
const tokenHash = createHash("sha256").update(operationsToken).digest();
const require = createRequire(new URL("../connection-probe/package.json", import.meta.url));
const { Pool } = require("pg");
const directory = "/app/backups";
const dumpPath = `${directory}/before-public.dump`;
const config = databasePoolConfig(process.env.DATABASE_URL, {
  ...process.env,
  DATABASE_POOL_MAX: "2",
  DATABASE_STATEMENT_TIMEOUT_MS: "120000",
  DATABASE_QUERY_TIMEOUT_MS: "130000",
});
const pool = new Pool(config);
const state = { service: "archive-operations", state: "ready", databaseModified: false };
let busy = false;
let backup;
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function run(executable, args, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", () => {
      /* Never log database rows or credentials from diagnostics. */
    });
    child.on("error", () => reject(new Error("LOCAL_BACKUP_TOOL_START_FAILED")));
    child.on("exit", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${executable.split("/").at(-1).toUpperCase()}_FAILED`)),
    );
  });
}

async function inventory(client) {
  const tables = (
    await client.query(`SELECT c.relname AS name, c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)
  ).rows;
  const results = [];
  for (const table of tables) {
    const rows = (
      await client.query(
        `SELECT to_jsonb(t)::text AS value FROM public.${quote(table.name)} t ORDER BY to_jsonb(t)::text`,
      )
    ).rows;
    const columns = (
      await client.query(
        `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [table.name],
      )
    ).rows;
    results.push({ ...table, rows: rows.length, sha256: digest(JSON.stringify(rows)), columns });
  }
  return results;
}

function pgEnvironment() {
  const url = new URL(config.connectionString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "/app/packages/db/certificates/supabase-prod-ca-2021.crt",
    PGCONNECT_TIMEOUT: "15",
  };
}

async function network() {
  const directHost = "db.spffrdgttkhlwgosuvix.supabase.co";
  const pooledHost = new URL(config.connectionString).hostname;
  const result = {};
  for (const [name, host] of [
    ["direct", directHost],
    ["pooler", pooledHost],
  ]) {
    try {
      result[name] = { dns: await lookup(host, { all: true }) };
    } catch (error) {
      result[name] = { errorCode: error.code ?? "DNS_ERROR" };
    }
  }
  const net = await import("node:net");
  result.ipv6Connect = await new Promise((resolve) => {
    const socket = net.createConnection({ host: directHost, port: 5432, family: 6, timeout: 8000 });
    socket.once("connect", () => {
      resolve({ connected: true });
      socket.destroy();
    });
    socket.once("error", (error) => resolve({ connected: false, errorCode: error.code }));
    socket.once("timeout", () => {
      resolve({ connected: false, errorCode: "TIMEOUT" });
      socket.destroy();
    });
  });
  return result;
}

async function createBackup() {
  if (backup) return backup;
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0]
      .snapshot;
    const before = await inventory(client);
    const version = (await client.query("SELECT version() AS version")).rows[0].version;
    state.preflight = { version, tables: before };
    await run(
      "pg_dump",
      ["--format=custom", "--schema=public", `--snapshot=${snapshot}`, `--file=${dumpPath}`],
      pgEnvironment(),
    );
    await client.query("ROLLBACK");
    const sha256 = digest(readFileSync(dumpPath));
    mkdirSync(`${directory}/restore`, { recursive: true });
    await run("/usr/lib/postgresql/17/bin/initdb", [
      "-D",
      `${directory}/restore`,
      "-A",
      "trust",
      "-U",
      "restore_check",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    await run("/usr/lib/postgresql/17/bin/pg_ctl", [
      "-D",
      `${directory}/restore`,
      "-l",
      `${directory}/restore.log`,
      "-o",
      `-h 127.0.0.1 -p 5433 -k ${directory}`,
      "-w",
      "start",
    ]);
    const restoreEnvironment = {
      ...process.env,
      PGHOST: "127.0.0.1",
      PGPORT: "5433",
      PGDATABASE: "postgres",
      PGUSER: "restore_check",
      PGSSLMODE: "disable",
      PGPASSWORD: "",
    };
    const restoredPool = new Pool({
      host: "127.0.0.1",
      port: 5433,
      user: "restore_check",
      database: "postgres",
      ssl: false,
    });
    try {
      // This is the disposable loopback instance, never the production pool.
      await restoredPool.query("DROP SCHEMA public CASCADE");
      await run(
        "pg_restore",
        ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname=postgres", dumpPath],
        restoreEnvironment,
      );
      const restored = await inventory(restoredPool);
      if (JSON.stringify(before) !== JSON.stringify(restored))
        throw new Error("RESTORE_INVENTORY_MISMATCH");
      backup = {
        scope:
          "public schema: application tables, indexes, functions, grants and all rows; Supabase-managed Auth/Storage unchanged and excluded",
        sha256,
        bytes: statSync(dumpPath).size,
        version,
        tables: before,
        restoredAndMatched: true,
        createdAt: new Date().toISOString(),
      };
      state.backup = backup;
    } finally {
      await restoredPool.end();
      await run("/usr/lib/postgresql/17/bin/pg_ctl", [
        "-D",
        `${directory}/restore`,
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    }
    return backup;
  } finally {
    await client.query("ROLLBACK").catch(() => {
      /* Connection may already be closed. */
    });
    client.release();
  }
}

async function migrateSchema(input) {
  if (!backup?.restoredAndMatched || input.downloadedBackupSha256 !== backup.sha256)
    throw new Error("VERIFIED_DOWNLOADED_BACKUP_REQUIRED");
  const before = await inventory(pool);
  if (JSON.stringify(before) !== JSON.stringify(backup.tables))
    throw new Error("SOURCE_CHANGED_SINCE_BACKUP");
  if (
    before.some((table) => !["Post", "Tag", "TagOnPost", "_prisma_migrations"].includes(table.name))
  )
    throw new Error("UNEXPECTED_SCHEMA_REQUIRES_REVIEW");
  await migrate(drizzle(pool), {
    migrationsFolder: new URL("../../../supabase/migrations/", import.meta.url).pathname,
  });
  state.databaseModified = true;
  const after = await inventory(pool);
  for (const original of before) {
    const preserved = after.find((table) => table.name === original.name);
    if (!preserved || preserved.sha256 !== original.sha256 || preserved.rows !== original.rows)
      throw new Error("LEGACY_PRESERVATION_CHECK_FAILED");
  }
  state.migration = {
    applied: true,
    originalRowsUnchanged: true,
    tableCount: after.length,
    allPublicTablesRls: after.every((table) => table.rls),
    tables: after.map(({ name, rows, rls }) => ({ name, rows, rls })),
  };
  return state.migration;
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "GET" && request.url === "/health")
    return response.end(JSON.stringify({ service: state.service, state: state.state }));
  const suppliedToken = request.headers["x-archive-operations-token"];
  if (
    request.headers.origin ||
    typeof suppliedToken !== "string" ||
    suppliedToken.length > 256 ||
    !timingSafeEqual(createHash("sha256").update(suppliedToken).digest(), tokenHash)
  ) {
    response.writeHead(401);
    return response.end('{"error":"unauthorized"}');
  }
  try {
    if (request.method === "GET" && request.url === "/report")
      return response.end(JSON.stringify(state));
    if (request.method === "GET" && request.url === "/backup-file" && backup) {
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Disposition", 'attachment; filename="before-public.dump"');
      return createReadStream(dumpPath).pipe(response);
    }
    if (request.method !== "POST" || !["/backup", "/migrate", "/import"].includes(request.url)) {
      response.writeHead(404);
      return response.end('{"error":"not_found"}');
    }
    if (busy || !request.headers["content-type"]?.startsWith("application/json")) {
      response.writeHead(409);
      return response.end('{"error":"operation_unavailable"}');
    }
    let body = "";
    for await (const chunk of request) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 2048) throw new Error("BODY_TOO_LARGE");
    }
    const input = JSON.parse(body || "{}");
    busy = true;
    try {
      let result;
      if (request.url === "/backup") result = await createBackup();
      else if (request.url === "/migrate") result = await migrateSchema(input);
      else {
        if (
          !state.migration?.applied ||
          !backup?.restoredAndMatched ||
          input.downloadedBackupSha256 !== backup.sha256
        )
          throw new Error("VERIFIED_MIGRATION_REQUIRED");
        const client = await pool.connect();
        try {
          result = await importLegacy(client);
          state.import = result;
        } finally {
          client.release();
        }
      }
      response.end(JSON.stringify(result));
    } finally {
      busy = false;
    }
  } catch (error) {
    const code = /^[A-Z_]+$/.test(error.message ?? "")
      ? error.message
      : typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : "OPERATION_FAILED";
    state.lastError = code;
    response.writeHead(500);
    response.end(JSON.stringify({ error: code }));
  }
});
server.requestTimeout = 240000;
server.listen(Number(process.env.PORT ?? 7860), "0.0.0.0");
network()
  .then((result) => {
    state.network = result;
  })
  .catch(() => {
    state.network = { error: "NETWORK_PROBE_FAILED" };
  });
process.once("SIGTERM", () => server.close(() => pool.end().finally(() => process.exit(0))));
