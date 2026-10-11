import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, URL } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { legacyInventory, fixedFunctionSearchPaths } from "./migration-verification.mjs";

const table = (name, options = {}) => ({
  schema: "public",
  name,
  rows: 2,
  sha256: "a".repeat(64),
  rls: false,
  ...options,
});

test("legacy fingerprints include both historical join-table names without treating RLS as row changes", () => {
  const before = [table("Post"), table("Tag"), table("TagOnPost"), table("TagonPost")];
  const after = before.toReversed().map((item) => ({ ...item, rls: true }));
  after.push(table("contents"), table("Post", { schema: "other" }));
  assert.deepEqual(legacyInventory(after), legacyInventory(before));
  assert.equal(legacyInventory(before).length, 4);
});

test("legacy row loss, changed hashes and missing tables remain detectable", () => {
  const before = [table("Post"), table("TagOnPost")];
  for (const after of [
    [table("Post", { rows: 1 }), table("TagOnPost")],
    [table("Post"), table("TagOnPost", { sha256: "b".repeat(64) })],
    [table("Post")],
  ])
    assert.notDeepEqual(legacyInventory(after), legacyInventory(before));
});

test("all three distinct functions must have an explicit empty local search path", () => {
  const rows = [
    "archive_prevent_immutable_history_mutation",
    "archive_guard_content_revision",
    "archive_guard_localized_revision",
  ].map((proname) => ({ proname, proconfig: ['search_path=""'] }));
  assert.equal(fixedFunctionSearchPaths(rows), true);
  assert.equal(fixedFunctionSearchPaths(rows.slice(0, 2)), false);
  assert.equal(fixedFunctionSearchPaths([rows[0], rows[0], rows[2]]), false);
  assert.equal(
    fixedFunctionSearchPaths([...rows.slice(0, 2), { ...rows[2], proconfig: null }]),
    false,
  );
  assert.equal(
    fixedFunctionSearchPaths([
      ...rows.slice(0, 2),
      { ...rows[2], proconfig: ["search_path=public"] },
    ]),
    false,
  );
});

test("the real Drizzle reader exposes the registered hardening SQL as a statement array", () => {
  const files = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url)),
  });
  const hardening = files.filter((file) =>
    file.sql.some((statement) =>
      statement.includes(
        'ALTER FUNCTION "public"."archive_guard_content_revision"() SET search_path',
      ),
    ),
  );
  assert.equal(hardening.length, 1);
  assert.equal(hardening[0].sql.length, 3);
  assert.ok(hardening[0].sql.every((statement) => typeof statement === "string"));
  assert.match(hardening[0].hash, /^[a-f0-9]{64}$/);
});
