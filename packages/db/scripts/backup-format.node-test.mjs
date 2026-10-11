import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { backupKey, encryptBackup, decryptBackup } from "./backup-format.mjs";

test("AES-256-GCM authenticates and round-trips binary backup bytes", () => {
  const key = backupKey("a1".repeat(32));
  const source = Buffer.from([0, 255, 1, 13, 10, 128]);
  const encrypted = encryptBackup(source, key);
  assert.deepEqual(decryptBackup(encrypted, key), source);
  assert.notDeepEqual(encryptBackup(source, key), encrypted);
  const modified = Buffer.from(encrypted);
  modified[modified.length - 1] ^= 1;
  assert.throws(() => decryptBackup(modified, key));
  assert.throws(() => decryptBackup(encrypted, backupKey("b2".repeat(32))));
});

test("invalid key lengths and backup headers are rejected", () => {
  assert.throws(() => backupKey("password"));
  assert.throws(() => decryptBackup(Buffer.alloc(40), backupKey("a1".repeat(32))));
});
