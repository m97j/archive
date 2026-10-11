import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, failureCode, verifyIdentity } from "./probe.mjs";

test("connection modes preserve an encoded password without exposing it", () => {
  const inputs = candidates(
    "postgresql://postgres.spffrdgttkhlwgosuvix:p%40ss%3Aword@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
  );
  assert.deepEqual(
    inputs.map(([name]) => name),
    ["configured-session", "transaction", "direct"],
  );
  assert.ok(inputs.every(([, url]) => url.password === "p%40ss%3Aword"));
});
test("arbitrary endpoints do not cause an expanded network scan", () => {
  assert.equal(candidates("postgresql://other:dummy@elsewhere.example:5432/test").length, 1);
});
test("driver error wrappers are classified without returning sensitive messages", () => {
  assert.equal(failureCode({ cause: { code: "28P01", message: "secret" } }), "AUTH_FAILED");
  assert.equal(
    failureCode({ meta: { driverAdapterError: { cause: { code: "ENETUNREACH" } } } }),
    "NETWORK_ERROR",
  );
  assert.equal(failureCode(new Error("unrecognized p@ssword")), "CHECK_FAILED");
});
test("a successful query alone cannot pass without a read-only transaction", () => {
  assert.throws(() => verifyIdentity([{ ok: 1, read_only: "off" }]));
  verifyIdentity([{ ok: 1, read_only: "on" }]);
});
