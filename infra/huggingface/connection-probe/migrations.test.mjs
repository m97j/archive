import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test(
  "all migrations and RLS/grants work in disposable local PostgreSQL, preserving legacy rows",
  { timeout: 60000 },
  async () => {
    const db = new PGlite(); // In-memory only. No production URL, credentials or network.
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public."Post" (id integer PRIMARY KEY, title text);
      CREATE TABLE public."Tag" (id integer PRIMARY KEY);
      CREATE TABLE public."TagOnPost" (id integer PRIMARY KEY);
      CREATE TABLE public."_prisma_migrations" (id integer PRIMARY KEY);
      INSERT INTO public."Post" VALUES (1, 'synthetic preserved legacy row');
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (id integer PRIMARY KEY);
      GRANT ALL ON drizzle.__drizzle_migrations TO anon, authenticated;
    `);
      const directory = new URL("../../../supabase/migrations/", import.meta.url);
      const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", directory), "utf8"));
      for (const entry of journal.entries) {
        await db.exec(readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8"));
      }
      // Security changes themselves can be reapplied without rewriting or deleting data.
      await db.exec(readFileSync(new URL("0006_server_only_access.sql", directory), "utf8"));
      const { rows: tables } = await db.query(`SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'`);
      assert.equal(tables.length, 30);
      assert.ok(tables.every((table) => table.relrowsecurity === true));
      assert.equal(
        (await db.query('SELECT count(*)::integer AS count FROM public."Post"')).rows[0].count,
        1,
      );
      await db.exec(
        "INSERT INTO public.contents (kind, canonical_key) VALUES ('DOC', 'synthetic-rules-check')",
      );
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(
          db.query("SELECT * FROM public.contents"),
          (error) => error.code === "42501",
        );
        await assert.rejects(
          db.exec("INSERT INTO public.contents (kind, canonical_key) VALUES ('DOC', 'blocked')"),
          (error) => error.code === "42501",
        );
        await assert.rejects(
          db.query('SELECT * FROM public."Post"'),
          (error) => error.code === "42501",
        );
        await db.exec("RESET ROLE");
      }
      const { rows: permissions } = await db.query(`SELECT
      has_table_privilege('anon', 'public.contents', 'SELECT') AS anon_read,
      has_table_privilege('authenticated', 'public.contents', 'INSERT') AS user_write,
      has_table_privilege('authenticated', 'drizzle.__drizzle_migrations', 'SELECT') AS history_read`);
      assert.deepEqual(permissions[0], {
        anon_read: false,
        user_write: false,
        history_read: false,
      });
    } finally {
      await db.close();
    }
  },
);
