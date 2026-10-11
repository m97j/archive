import assert from "node:assert/strict";
import test from "node:test";
import { checkPassword, connectionOptions, failureStatus } from "./check-password.mjs";

test("password is passed unchanged, without URI encoding, and TLS verification is required", () => {
  const options = connectionOptions("synthetic@#%한글");
  assert.equal(options.password, "synthetic@#%한글");
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.port, 5432);
  assert.equal(options.user, "postgres.spffrdgttkhlwgosuvix");
});

test("endpoints are restricted to the supplied project", () => {
  assert.equal(
    connectionOptions("synthetic", { mode: "direct" }).host,
    "db.spffrdgttkhlwgosuvix.supabase.co",
  );
  assert.equal(connectionOptions("synthetic", { mode: "direct" }).user, "postgres");
  assert.equal(connectionOptions("synthetic", { mode: "transaction" }).port, 6543);
  assert.throws(() => connectionOptions("synthetic", { mode: "attacker" }));
});

test("empty passwords cannot trigger authentication attempts", () => {
  assert.throws(() => connectionOptions(""));
});

test("custom CA keeps certificate verification enabled", () => {
  assert.deepEqual(connectionOptions("synthetic", { ca: "test-ca" }).ssl, {
    rejectUnauthorized: true,
    ca: "test-ca",
  });
});

test("success executes only a read-only transaction and closes the connection", async () => {
  const statements = [];
  let ended = false;
  class Client {
    async connect() {
      // This fixture intentionally has no external connection.
    }
    async query(sql) {
      statements.push(sql);
      return { rows: [{ db_user: "postgres", db_name: "postgres" }] };
    }
    async end() {
      ended = true;
    }
  }
  assert.match(await checkPassword("synthetic", { Client }), /^SUCCESS:/);
  assert.deepEqual(statements, [
    "BEGIN READ ONLY",
    "SELECT current_user AS db_user, current_database() AS db_name",
    "ROLLBACK",
  ]);
  assert.equal(ended, true);
});

test("authentication rejection is not retried and connection is closed", async () => {
  let attempts = 0;
  let ended = false;
  class Client {
    async connect() {
      attempts++;
      throw Object.assign(new Error("synthetic secret"), { code: "28P01" });
    }
    async end() {
      ended = true;
    }
  }
  await assert.rejects(checkPassword("synthetic", { Client }));
  assert.equal(attempts, 1);
  assert.equal(ended, true);
});

test("raw error messages and synthetic secrets are never included in statuses", () => {
  for (const code of [
    "28P01",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNKNOWN",
  ]) {
    assert.ok(
      !failureStatus({ code, message: "synthetic-secret-that-must-not-leak" }).includes(
        "synthetic-secret",
      ),
    );
  }
  assert.match(failureStatus({ code: "28P01" }), /^AUTH_FAILED:/);
  assert.match(failureStatus({ code: "SELF_SIGNED_CERT_IN_CHAIN" }), /^TLS_ERROR:/);
  assert.match(failureStatus({ message: "Circuit breaker open synthetic-secret" }), /^BLOCKED:/);
});

test("unexpected database identity is not reported as success", async () => {
  class Client {
    async connect() {
      // This fixture intentionally has no external connection.
    }
    async query() {
      return { rows: [{ db_user: "other", db_name: "other" }] };
    }
    async end() {
      // This fixture owns no external resource.
    }
  }
  await assert.rejects(checkPassword("synthetic", { Client }));
});
