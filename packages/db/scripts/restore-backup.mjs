import { readFileSync, writeFileSync } from "node:fs";
import console from "node:console";
import { backupKey, decryptBackup, sha256 } from "./backup-format.mjs";

try {
  const [encryptedPath, targetPath] = process.argv.slice(2);
  if (!encryptedPath || !targetPath || encryptedPath === targetPath)
    throw new Error("PROVIDE_ENCRYPTED_INPUT_AND_NEW_DUMP_PATH");
  const raw = decryptBackup(
    readFileSync(encryptedPath),
    backupKey(process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY),
  );
  // Never overwrite an existing file; this does not execute a production restore.
  writeFileSync(targetPath, raw, { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({ decrypted: true, sha256: sha256(raw), productionRestorePerformed: false }),
  );
} catch {
  console.error("BACKUP_DECRYPTION_FAILED: check paths and the separate encryption key");
  process.exitCode = 1;
}
