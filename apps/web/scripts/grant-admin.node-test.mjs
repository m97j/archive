import assert from "node:assert/strict";
import test from "node:test";

import { grantAdministrator, readConfiguration } from "./grant-admin.mjs";

const userId = "12345678-1234-1234-1234-123456789012";
const configuration = { userId, email: "admin@example.com" };

function mockClient(metadata = { provider: "email", roles: ["editor"] }) {
  const user = { id: userId, email: configuration.email, app_metadata: metadata };
  const updates = [];
  return {
    user,
    updates,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user }, error: null }),
        updateUserById: async (id, attributes) => {
          updates.push({ id, attributes });
          return { data: { user: { ...user, ...attributes } }, error: null };
        },
      },
    },
  };
}

test("default dry-run never updates an account", async () => {
  const client = mockClient();
  assert.deepEqual(await grantAdministrator(client, configuration), { status: "dry-run" });
  assert.equal(client.updates.length, 0);
});

test("apply preserves unrelated metadata and roles and targets exactly one UUID", async () => {
  const client = mockClient({
    provider: "email",
    providers: ["email"],
    custom: 42,
    roles: ["editor"],
  });
  assert.deepEqual(await grantAdministrator(client, configuration, { apply: true }), {
    status: "applied",
  });
  assert.deepEqual(client.updates, [
    {
      id: userId,
      attributes: {
        app_metadata: {
          provider: "email",
          providers: ["email"],
          custom: 42,
          roles: ["editor", "archive_admin"],
        },
      },
    },
  ]);
});

test("already-present role is idempotent", async () => {
  const client = mockClient({ roles: ["archive_admin"] });
  assert.deepEqual(await grantAdministrator(client, configuration, { apply: true }), {
    status: "already-present",
  });
  assert.equal(client.updates.length, 0);
});

for (const field of ["id", "email"]) {
  test(`mismatched ${field} prevents writes`, async () => {
    const client = mockClient();
    client.user[field] = "different";
    await assert.rejects(
      grantAdministrator(client, configuration, { apply: true }),
      /does not match/,
    );
    assert.equal(client.updates.length, 0);
  });
}

test("malformed existing roles prevents writes", async () => {
  const client = mockClient({ roles: "editor" });
  await assert.rejects(
    grantAdministrator(client, configuration, { apply: true }),
    /array of strings/,
  );
  assert.equal(client.updates.length, 0);
});

test("SDK lookup errors are sanitized", async () => {
  const client = mockClient();
  client.auth.admin.getUserById = async () => {
    throw new Error("secret-value-must-not-leak");
  };
  await assert.rejects(grantAdministrator(client, configuration), (error) => {
    assert.equal(error.message.includes("secret-value-must-not-leak"), false);
    return /lookup failed/.test(error.message);
  });
});

test("SDK update errors are sanitized and do not trigger retries", async () => {
  const client = mockClient();
  let calls = 0;
  client.auth.admin.updateUserById = async () => {
    calls += 1;
    return { error: { message: "secret-value-must-not-leak" } };
  };
  await assert.rejects(
    grantAdministrator(client, configuration, { apply: true }),
    /outcome is unknown/,
  );
  assert.equal(calls, 1);
});

test("configuration rejects browser keys and untrusted project URLs", () => {
  const env = {
    ARCHIVE_BOOTSTRAP_SUPABASE_URL: "https://example.supabase.co",
    ARCHIVE_BOOTSTRAP_SUPABASE_SECRET_KEY: "sb_secret_test-only",
    ARCHIVE_BOOTSTRAP_USER_ID: userId,
    ARCHIVE_BOOTSTRAP_EXPECTED_EMAIL: "Admin@example.com",
  };
  assert.equal(readConfiguration(env).email, configuration.email);
  for (const url of [
    "http://example.supabase.co",
    "https://attacker.example",
    "https://example.supabase.co/auth/v1",
  ]) {
    assert.throws(
      () => readConfiguration({ ...env, ARCHIVE_BOOTSTRAP_SUPABASE_URL: url }),
      /project origin/,
    );
  }
  assert.throws(
    () =>
      readConfiguration({ ...env, ARCHIVE_BOOTSTRAP_SUPABASE_SECRET_KEY: "sb_publishable_test" }),
    /not a publishable key/,
  );
});
