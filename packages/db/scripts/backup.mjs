import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import { Pool } from "pg";
import { databasePoolConfig } from "../src/runtime-config.ts";
import { backupKey, encryptBackup, decryptBackup, sha256 } from "./backup-format.mjs";
import { deploymentConnection } from "./deployment-connection.mjs";

export const quote = (name) => `"${name.replaceAll('"', '""')}"`;

export async function databaseInventory(client) {
  const tables = (
    await client.query(`SELECT n.nspname AS schema, c.relname AS name,
    c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','drizzle') AND c.relkind='r' ORDER BY n.nspname,c.relname`)
  ).rows;
  const result = [];
  for (const table of tables) {
    const rows = (
      await client.query(`SELECT to_jsonb(t)::text AS value
      FROM ${quote(table.schema)}.${quote(table.name)} t ORDER BY to_jsonb(t)::text`)
    ).rows;
    result.push({ ...table, rows: rows.length, sha256: sha256(JSON.stringify(rows)) });
  }
  return result;
}

function run(tool, args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(tool, args, { env, stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.on("data", () => {
      /* Tool errors can contain rows or credentials; do not log. */
    });
    child.on("error", () => reject(new Error("BACKUP_TOOL_UNAVAILABLE")));
    child.on("exit", (code) => (code === 0 ? accept() : reject(new Error("BACKUP_TOOL_FAILED"))));
  });
}

async function main() {
  const key = backupKey(process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY);
  const output = resolve(process.env.ARCHIVE_BACKUP_DIRECTORY ?? ".backup-output");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const rawPath = resolve(output, "application.dump");
  const encryptedPath = resolve(output, "application.dump.aesgcm");
  const config = databasePoolConfig(deploymentConnection(), {
    ...process.env,
    DATABASE_POOL_MAX: "2",
    DATABASE_STATEMENT_TIMEOUT_MS: "120000",
    DATABASE_QUERY_TIMEOUT_MS: "130000",
  });
  const pool = new Pool(config);
  const connection = new URL(config.connectionString);
  const remote = {
    ...process.env,
    PGHOST: connection.hostname,
    PGPORT: connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: connection.pathname.slice(1),
    PGSSLMODE: "verify-full",
    PGCONNECT_TIMEOUT: "15",
    PGSSLROOTCERT:
      process.env.DATABASE_SSL_CA_FILE ??
      fileURLToPath(new URL("../certificates/supabase-prod-ca-2021.crt", import.meta.url)),
  };
  // pg_restore is allowed only into this empty, disposable loopback test database.
  const restored = new Pool({
    host: "127.0.0.1",
    port: 5433,
    user: "archive_restore",
    password: process.env.ARCHIVE_RESTORE_PASSWORD,
    database: "archive_restore",
    ssl: false,
  });
  const local = {
    ...process.env,
    PGHOST: "127.0.0.1",
    PGPORT: "5433",
    PGUSER: "archive_restore",
    PGPASSWORD: process.env.ARCHIVE_RESTORE_PASSWORD,
    PGDATABASE: "archive_restore",
    PGSSLMODE: "disable",
  };
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0]
      .snapshot;
    const inventory = await databaseInventory(client);
    const version = (await client.query("SHOW server_version")).rows[0].server_version;
    const schemas = (
      await client.query(
        "SELECT nspname FROM pg_namespace WHERE nspname IN ('public','drizzle') ORDER BY nspname",
      )
    ).rows;
    const identity = (
      await restored.query("SELECT current_user AS username,current_database() AS database")
    ).rows[0];
    const existing = (
      await restored.query(
        "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind='r'",
      )
    ).rows[0].count;
    if (
      identity.username !== "archive_restore" ||
      identity.database !== "archive_restore" ||
      existing !== 0
    )
      throw new Error("EMPTY_DISPOSABLE_RESTORE_DATABASE_REQUIRED");
    await run(
      "pg_dump",
      [
        "--format=custom",
        ...schemas.map((schema) => `--schema=${schema.nspname}`),
        `--snapshot=${snapshot}`,
        `--file=${rawPath}`,
      ],
      remote,
    );
    await client.query("ROLLBACK");
    await restored.query("DROP SCHEMA public CASCADE");
    // Default migration policies reference these managed roles; grant data is not restored.
    await restored.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$",
    );
    await run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname=archive_restore", rawPath],
      local,
    );
    if (JSON.stringify(inventory) !== JSON.stringify(await databaseInventory(restored)))
      throw new Error("RESTORED_ROWS_OR_RLS_MISMATCH");
    const raw = readFileSync(rawPath);
    const encrypted = encryptBackup(raw, key);
    if (sha256(decryptBackup(encrypted, key)) !== sha256(raw))
      throw new Error("BACKUP_DECRYPTION_CHECK_FAILED");
    writeFileSync(encryptedPath, encrypted, { mode: 0o600 });
    const receipt = {
      verified: true,
      restoredAndMatched: true,
      sha256: sha256(raw),
      encryptedSha256: sha256(encrypted),
      createdAt: new Date().toISOString(),
      version,
      inventory,
      scope: "public and drizzle application schemas; managed Auth/Storage excluded and unchanged",
      encryption: "AES-256-GCM ARCHIVE1",
      encryptedFile: "application.dump.aesgcm",
    };
    writeFileSync(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        verified: true,
        tableCount: inventory.length,
        sha256: receipt.sha256,
        encryptedSha256: receipt.encryptedSha256,
        rowsLogged: false,
      }),
    );
  } finally {
    if (client) {
      await client.query("ROLLBACK").catch(() => {
        /* The connection may already be closed; do not log credentials or SQL. */
      });
      client.release();
    }
    await pool.end();
    await restored.end();
    // Only this exact temporary dump, never a directory or remote database.
    rmSync(rawPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        error: /^[A-Z_]+$/.test(error.message ?? "") ? error.message : "BACKUP_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}
