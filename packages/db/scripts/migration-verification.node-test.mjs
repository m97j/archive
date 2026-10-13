import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, URL } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  legacyInventory,
  fixedFunctionSearchPaths,
  existingApplicationRowsPreserved,
} from "./migration-verification.mjs";

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

test("application preservation checks every existing public table, not only legacy tables", () => {
  const before = [
    table("Post"),
    table("contents"),
    table("localized_revisions"),
    table("render_artifacts"),
  ];
  const after = before.toReversed().map((item) => ({ ...item, rls: true }));
  assert.equal(existingApplicationRowsPreserved(before, after), true);
  assert.equal(
    existingApplicationRowsPreserved(
      before,
      after.filter((item) => item.name !== "contents"),
    ),
    false,
  );
  assert.equal(
    existingApplicationRowsPreserved(
      before,
      after.filter((item) => item.name !== "render_artifacts"),
    ),
    false,
  );
});

test("application preservation rejects changed row counts and changed hashes independently", () => {
  const before = [table("contents"), table("localized_revisions")];
  for (const after of [
    [table("contents", { rows: 1 }), table("localized_revisions")],
    [table("contents", { rows: 3 }), table("localized_revisions")],
    [table("contents"), table("localized_revisions", { sha256: "b".repeat(64) })],
    [table("contents", { rows: 2, sha256: "b".repeat(64) }), table("localized_revisions")],
  ])
    assert.equal(existingApplicationRowsPreserved(before, after), false);
});

test("application preservation rejects missing, renamed and schema-moved public tables", () => {
  const before = [table("contents")];
  assert.equal(existingApplicationRowsPreserved(before, []), false);
  assert.equal(existingApplicationRowsPreserved(before, [table("contents_replacement")]), false);
  assert.equal(
    existingApplicationRowsPreserved(before, [table("contents", { schema: "private" })]),
    false,
  );
});

test("application preservation accepts an additive release while ignoring RLS and migration history changes", () => {
  const before = [table("contents"), table("__drizzle_migrations", { schema: "drizzle", rows: 8 })];
  const after = [
    table("publication_embeddings", { rows: 0 }),
    table("contents", { rls: true }),
    table("__drizzle_migrations", { schema: "drizzle", rows: 9, sha256: "b".repeat(64) }),
  ];
  assert.equal(existingApplicationRowsPreserved(before, after), true);
  assert.equal(existingApplicationRowsPreserved(before, [table("contents")]), true);
});

test("application preservation permits empty initial schemas but still requires an existing empty table", () => {
  assert.equal(existingApplicationRowsPreserved([], []), true);
  assert.equal(existingApplicationRowsPreserved([], [table("contents", { rows: 0 })]), true);
  const before = [table("contents", { rows: 0 })];
  assert.equal(
    existingApplicationRowsPreserved(before, [table("contents", { rows: 0, rls: true })]),
    true,
  );
  assert.equal(existingApplicationRowsPreserved(before, []), false);
  assert.equal(
    existingApplicationRowsPreserved(before, [
      table("contents", { rows: 0, sha256: "b".repeat(64) }),
    ]),
    false,
  );
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
