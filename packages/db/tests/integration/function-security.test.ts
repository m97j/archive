import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationRoot = new URL("../../../../supabase/migrations/", import.meta.url);
const functionNames = [
  "archive_guard_content_revision",
  "archive_guard_localized_revision",
  "archive_prevent_immutable_history_mutation",
];
const fixtureTables = [
  "contents",
  "content_revisions",
  "localized_revisions",
  "render_artifacts",
  "revision_status_events",
  "translation_status_events",
];

async function migrateBeforeHardening(db: PGlite) {
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", migrationRoot), "utf8"),
  ) as { entries: { tag: string }[] };
  const hardeningTag = "0007_fixed_function_search_path";
  expect(journal.entries.some((entry) => entry.tag === hardeningTag)).toBe(true);
  for (const entry of journal.entries) {
    if (entry.tag === hardeningTag) break;
    await db.exec(await readFile(new URL(`${entry.tag}.sql`, migrationRoot), "utf8"));
  }
  return readFile(new URL(`${hardeningTag}.sql`, migrationRoot), "utf8");
}

async function seedHistory(db: PGlite) {
  await db.exec(`
    INSERT INTO public.contents (id, kind, canonical_key)
      VALUES ('00000000-0000-4000-8000-000000000001', 'DOC', 'function-security-fixture');
    INSERT INTO public.content_revisions (id, content_id, revision_number)
      VALUES ('00000000-0000-4000-8000-000000000002',
              '00000000-0000-4000-8000-000000000001', 1);
    INSERT INTO public.localized_revisions
      (id, revision_id, locale, title, slug, source_markdown, source_hash)
      VALUES ('00000000-0000-4000-8000-000000000003',
              '00000000-0000-4000-8000-000000000002', 'ko', 'Preserved title',
              'preserved-title', '# Preserved source', repeat('a', 64));
    INSERT INTO public.render_artifacts
      (localized_revision_id, compiler_version, source_hash, html, search_text)
      VALUES ('00000000-0000-4000-8000-000000000003', 'fixture', repeat('a', 64),
              '<h1>Preserved source</h1>', 'Preserved source');
    INSERT INTO public.revision_status_events (revision_id, to_status)
      VALUES ('00000000-0000-4000-8000-000000000002', 'DRAFT');
    INSERT INTO public.translation_status_events (localized_revision_id, to_status)
      VALUES ('00000000-0000-4000-8000-000000000003', 'DRAFT');
  `);
}

async function inventory(db: PGlite) {
  const rows = [];
  for (const table of fixtureTables)
    rows.push((await db.query(`SELECT * FROM public.${table} ORDER BY id`)).rows);
  return rows;
}

async function functionIdentity(db: PGlite) {
  return (
    await db.query(
      `SELECT p.oid, p.proname, p.prosrc, p.proowner, p.proacl, p.prosecdef,
              p.prolang, p.prorettype
       FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
       ORDER BY p.proname`,
      [functionNames],
    )
  ).rows;
}

async function expectImmutable(db: PGlite, sql: string) {
  await expect(db.exec(sql)).rejects.toMatchObject({ code: "55000" });
}

describe("function-local search path security", () => {
  it("adds fixed settings without replacing functions or changing existing rows and permissions", async () => {
    const db = new PGlite(); // Disposable local PostgreSQL; no network or credentials.
    try {
      const hardening = await migrateBeforeHardening(db);
      await seedHistory(db);
      const originalFunctions = await functionIdentity(db);
      const originalRows = await inventory(db);
      expect(originalFunctions).toHaveLength(3);

      await db.exec(hardening);
      await db.exec(hardening); // ALTER settings are safe to reapply.
      expect(await functionIdentity(db)).toEqual(originalFunctions);
      expect(await inventory(db)).toEqual(originalRows);
      const settings = await db.query<{ proname: string; proconfig: string[] }>(
        `SELECT proname, proconfig FROM pg_catalog.pg_proc
         WHERE proname = ANY($1::text[]) ORDER BY proname`,
        [functionNames],
      );
      expect(settings.rows.map((row) => row.proname)).toEqual(functionNames);
      expect(settings.rows.every((row) => row.proconfig.includes('search_path=""'))).toBe(true);

      await db.exec(`UPDATE public.content_revisions SET status = 'IN_REVIEW';
                    UPDATE public.localized_revisions SET translation_status = 'REVIEWED';`);
      expect((await db.query("SELECT status FROM public.content_revisions")).rows).toEqual([
        { status: "IN_REVIEW" },
      ]);
      expect(
        (await db.query("SELECT translation_status FROM public.localized_revisions")).rows,
      ).toEqual([{ translation_status: "REVIEWED" }]);
      await expectImmutable(db, "UPDATE public.content_revisions SET change_summary = 'changed'");
      await expectImmutable(
        db,
        "UPDATE public.localized_revisions SET source_markdown = 'changed'",
      );
      await expectImmutable(db, "DELETE FROM public.content_revisions");
      await expectImmutable(db, "DELETE FROM public.localized_revisions");
      for (const table of [
        "render_artifacts",
        "revision_status_events",
        "translation_status_events",
      ]) {
        await expectImmutable(db, `UPDATE public.${table} SET id = id`);
        await expectImmutable(db, `DELETE FROM public.${table}`);
      }
    } finally {
      await db.close();
    }
  }, 30000);

  it("ignores a caller-controlled shadow operator and restores the caller search path", async () => {
    const db = new PGlite();
    try {
      const hardening = await migrateBeforeHardening(db);
      await seedHistory(db);
      await db.exec(hardening);
      await db.exec(`
        CREATE SCHEMA caller_shadow;
        CREATE FUNCTION caller_shadow.text_equals(text, text) RETURNS boolean
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'shadow operator reached'
          USING ERRCODE = 'P9001'; END; $$;
        CREATE OPERATOR caller_shadow.= (
          FUNCTION = caller_shadow.text_equals, LEFTARG = text, RIGHTARG = text
        );
        SET search_path TO caller_shadow, pg_catalog, public;
      `);
      await expect(db.query("SELECT 'a'::text = 'a'::text")).rejects.toMatchObject({
        code: "P9001",
      });
      // First execution compiles trigger expressions with the fixed local path.
      await db.exec(`UPDATE public.content_revisions SET status = 'IN_REVIEW';
                    UPDATE public.localized_revisions SET translation_status = 'REVIEWED';`);
      await expectImmutable(db, "UPDATE public.content_revisions SET change_summary = 'changed'");
      await expectImmutable(db, "UPDATE public.localized_revisions SET title = 'changed'");
      await expectImmutable(db, "DELETE FROM public.render_artifacts");
      expect((await db.query("SHOW search_path")).rows).toEqual([
        { search_path: "caller_shadow, pg_catalog, public" },
      ]);
    } finally {
      await db.close();
    }
  }, 30000);
});
