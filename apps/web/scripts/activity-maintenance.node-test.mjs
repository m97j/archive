import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runActivityMaintenance } from "./activity-maintenance.mjs";
const secret = "a".repeat(64);

test("synthetic verification requires an explicit mode and prints only safe boolean results", async () => {
  let called;
  const result = await runActivityMaintenance({
    secret,
    verifyStorage: true,
    fetchImpl: async (url, request) => {
      called = { url, method: request.method, body: request.body };
      return Response.json({
        privateVerified: true,
        conditionalWriteVerified: true,
        listingVerified: true,
        deletionVerified: true,
        expiryVerified: true,
        expiryClockSimulated: true,
        cleanupVerified: true,
        collectionEnabled: false,
        unexpectedPrivateValue: "do-not-print",
      });
    },
  });
  assert.equal(called.url, "https://marchivej.vercel.app/api/privacy/verification");
  assert.equal(called.method, "POST");
  assert.equal(called.body, "{}");
  assert.equal(JSON.stringify(result).includes("do-not-print"), false);
});

test("synthetic verification cannot be combined with real cleanup", async () => {
  await assert.rejects(
    runActivityMaintenance({
      secret,
      verifyStorage: true,
      apply: true,
      fetchImpl: async () => {
        throw new Error("must not call");
      },
    }),
    /MODE_REJECTED/,
  );
});
test("defaults to a read-only readiness check", async () => {
  const methods = [];
  const result = await runActivityMaintenance({
    secret,
    fetchImpl: async (_url, request) => {
      methods.push(request.method);
      return Response.json({ privateVerified: true, maintenanceRecent: false });
    },
  });
  assert.deepEqual(methods, ["GET"]);
  assert.equal(result.readOnly, true);
});
test("continues partial202 pagination and exposes only aggregate summary", async () => {
  const bodies = [];
  const result = await runActivityMaintenance({
    secret,
    apply: true,
    fetchImpl: async (_url, request) => {
      bodies.push(JSON.parse(request.body));
      return bodies.length === 1
        ? Response.json(
            { complete: false, scanned: 8, removed: 3, skipped: 0, cursor: "opaque-next" },
            { status: 202 },
          )
        : Response.json({ complete: true, scanned: 2, removed: 1, skipped: 0 });
    },
  });
  assert.deepEqual(bodies, [{}, { cursor: "opaque-next" }]);
  assert.deepEqual(result, { complete: true, removed: 4, scanned: 10, skipped: 0, pages: 2 });
  assert.equal(JSON.stringify(result).includes("opaque"), false);
});
test("rejects unreviewed origins and malformed secrets without requests", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error("must not run");
  };
  for (const origin of [
    "https://evil.test",
    "https://marchivej.vercel.app/private",
    "http://marchivej.vercel.app",
    "https://user:pw@marchivej.vercel.app",
  ])
    await assert.rejects(
      runActivityMaintenance({ origin, secret, fetchImpl }),
      /SITE_ORIGIN_REJECTED/,
    );
  await assert.rejects(
    runActivityMaintenance({ secret: "wrong", fetchImpl }),
    /MAINTENANCE_SECRET_REQUIRED/,
  );
  assert.equal(calls, 0);
});
test("fails on upstream, unsafe response, repeated cursor or unknown files", async () => {
  for (const response of [
    new Response("private upstream content", { status: 503 }),
    Response.json({ complete: true, scanned: 1, removed: 0, skipped: 1 }),
    Response.json({ complete: false, scanned: 1, removed: 0, skipped: 0 }),
  ])
    await assert.rejects(
      runActivityMaintenance({ secret, apply: true, fetchImpl: async () => response }),
      /MAINTENANCE_/,
    );
});
