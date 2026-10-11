import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { databasePoolConfig } from "../src/runtime-config.ts";
import { databaseInventory } from "./backup.mjs";
import { resolve, dirname } from "node:path";
import { sha256 } from "./backup-format.mjs";
import { deploymentConnection } from "./deployment-connection.mjs";
import { failureStatus } from "./check-password.mjs";

const apply = process.argv.includes("--apply");
const folder = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const pool = new Pool(databasePoolConfig(deploymentConnection()));
try {
  const exists = (await pool.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS history"))
    .rows[0].history;
  const applied = exists
    ? (
        await pool.query(
          "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
        )
      ).rows
    : [];
  const files = readMigrationFiles({ migrationsFolder: folder });
  for (const previous of applied) {
    const source = files.find((file) => file.folderMillis === Number(previous.created_at));
    if (!source || source.hash !== previous.hash) throw new Error("MIGRATION_HISTORY_MISMATCH");
  }
  const pending = files.filter(
    (file) => !applied.some((row) => Number(row.created_at) === file.folderMillis),
  );
  if (apply && pending.length) {
    const receiptPath = process.env.ARCHIVE_BACKUP_RECEIPT;
    if (!receiptPath) throw new Error("VERIFIED_BACKUP_RECEIPT_REQUIRED");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (
      receipt.verified !== true ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
      receipt.encryptedFile !== "application.dump.aesgcm" ||
      receipt.durableCopy?.hashVerified !== true
    )
      throw new Error("VERIFIED_BACKUP_RECEIPT_REQUIRED");
    const encrypted = readFileSync(resolve(dirname(receiptPath), receipt.encryptedFile));
    if (sha256(encrypted) !== receipt.encryptedSha256)
      throw new Error("ENCRYPTED_BACKUP_HASH_MISMATCH");
    const age = Date.now() - Date.parse(receipt.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > 60 * 60 * 1000)
      throw new Error("FRESH_BACKUP_REQUIRED");
    if (JSON.stringify(await databaseInventory(pool)) !== JSON.stringify(receipt.inventory))
      throw new Error("SOURCE_CHANGED_SINCE_BACKUP");
    await migrate(drizzle(pool), { migrationsFolder: folder });
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "plan",
      pending: pending.length,
      migrationSetSha256: createHash("sha256")
        .update(files.map((file) => file.hash).join("\n"))
        .digest("hex"),
      historyVerified: true,
      applied: apply ? pending.length : 0,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: /^[A-Z_]+$/.test(error.message ?? "") ? error.message : "MIGRATION_FAILED",
      status: failureStatus(error),
      databaseUrlLogged: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
