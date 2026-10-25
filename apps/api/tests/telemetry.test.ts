import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activitySignature,
  registerTelemetryRoutes,
  type ActivityBatch,
} from "../src/services/telemetry.js";
const secret = "s".repeat(64);
const id = "12345678-1234-4234-8234-123456789012";
const batch: ActivityBatch = {
  schemaVersion: 1,
  policyVersion: "2026-10-13",
  subjectId: id,
  sessionId: id,
  batchId: id,
  consentedAt: new Date().toISOString(),
  events: [{ id, type: "page_view", path: "/ko/docs/test" }],
};
afterEach(() => vi.unstubAllEnvs());
describe("private durable activity collection", () => {
  it("does not reactivate the retired production Dataset sink through legacy flags", async () => {
    vi.stubEnv("ANALYTICS_ENABLED", "true");
    vi.stubEnv("ANALYTICS_POLICY_REVIEWED", "true");
    const app = Fastify();
    const preserve = vi.fn();
    registerTelemetryRoutes(app, { secret, sink: { preserve } });
    expect(
      (await app.inject({ method: "POST", url: "/v1/telemetry/batches", payload: batch }))
        .statusCode,
    ).toBe(404);
    expect(preserve).not.toHaveBeenCalled();
    await app.close();
  });
  it("stays unavailable when policy review is absent", async () => {
    vi.stubEnv("ANALYTICS_ENABLED", "true");
    vi.stubEnv("ANALYTICS_POLICY_REVIEWED", "false");
    const app = Fastify();
    const preserve = vi.fn();
    registerTelemetryRoutes(app, { secret, sink: { preserve } });
    expect(
      (await app.inject({ method: "POST", url: "/v1/telemetry/batches", payload: batch }))
        .statusCode,
    ).toBe(404);
    expect(preserve).not.toHaveBeenCalled();
    await app.close();
  });
  it("requires HMAC and confirms only durable success", async () => {
    const app = Fastify();
    const preserve = vi.fn().mockResolvedValue(undefined);
    registerTelemetryRoutes(app, { enabled: true, secret, sink: { preserve } });
    const request = { method: "POST" as const, url: "/v1/telemetry/batches", payload: batch };
    expect((await app.inject(request)).statusCode).toBe(401);
    const headers = {
      "x-archive-activity-signature": activitySignature(JSON.stringify(batch), secret),
    };
    expect((await app.inject({ ...request, headers })).statusCode).toBe(201);
    preserve.mockRejectedValue(new Error("DO NOT DISCLOSE"));
    const failed = await app.inject({ ...request, headers });
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain("DISCLOSE");
    await app.close();
  });
  it("rejects sensitive paths before writing", async () => {
    const app = Fastify();
    const preserve = vi.fn();
    registerTelemetryRoutes(app, { enabled: true, secret, sink: { preserve } });
    const bad = { ...batch, events: [{ id, type: "page_view" as const, path: "/ko/admin" }] };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/telemetry/batches",
          payload: bad,
          headers: {
            "x-archive-activity-signature": activitySignature(JSON.stringify(bad), secret),
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(preserve).not.toHaveBeenCalled();
    await app.close();
  });
});
