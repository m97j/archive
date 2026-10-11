import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

const magic = Buffer.from("ARCHIVE1");
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function backupKey(hex) {
  if (!/^[a-fA-F0-9]{64}$/.test(hex ?? "")) throw new Error("BACKUP_KEY_MUST_BE_32_BYTE_HEX");
  return Buffer.from(hex, "hex");
}

export function encryptBackup(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackup(encrypted, key) {
  if (encrypted.length < 36 || !encrypted.subarray(0, 8).equals(magic))
    throw new Error("INVALID_BACKUP_FORMAT");
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(8, 20));
  decipher.setAAD(magic);
  decipher.setAuthTag(encrypted.subarray(20, 36));
  return Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
}
