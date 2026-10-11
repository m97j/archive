import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

function testApp(rateLimitMax = 600) {
  return buildApp({
    authenticate: async () => ({ id: "synthetic-actor" }),
    publisher: { publish: vi.fn() },
    rateLimitMax,
  });
}

describe("request security baseline", () => {
  it("adds security headers without changing health data", async () => {
    const app = testApp();
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-security-policy"]).toContain("default-src");
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });
  it("limits requests and cannot be bypassed by spoofing forwarded IPs", async () => {
    const app = testApp(2);
    try {
      for (const ip of ["198.51.100.1", "198.51.100.2"]) {
        expect(
          (await app.inject({ method: "GET", url: "/health", headers: { "x-forwarded-for": ip } }))
            .statusCode,
        ).toBe(200);
      }
      const response = await app.inject({
        method: "GET",
        url: "/health",
        headers: { "x-forwarded-for": "198.51.100.3" },
      });
      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBeDefined();
      expect(response.json()).toMatchObject({ error: "RATE_LIMITED" });
    } finally {
      await app.close();
    }
  });
  it("keeps oversized and malformed bodies as client errors, not server failures", async () => {
    const app = testApp();
    try {
      const large = await app.inject({
        method: "POST",
        url: "/v1/publications",
        payload: { data: "x".repeat(2_100_001) },
      });
      expect(large.statusCode).toBe(413);
      const invalid = await app.inject({
        method: "POST",
        url: "/v1/publications",
        payload: "{broken",
        headers: { "content-type": "application/json" },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.body).not.toContain("{broken");
    } finally {
      await app.close();
    }
  });
});
