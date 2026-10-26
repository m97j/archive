import { generateKeyPairSync } from "node:crypto";
import { jwtVerify } from "jose";
import { describe, expect, it, vi, type Mock } from "vitest";
import {
  createGoogleAnalyticsReporting,
  eligibleAnalyticsPath,
} from "../src/services/google-analytics.js";
import { AuthenticationError, buildApp } from "../src/app.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const environment = {
  GA4_REPORTING_ENABLED: "true",
  GA4_PROPERTY_ID: "123456789",
  GA4_SERVICE_ACCOUNT_EMAIL: "reporter@archive-reporting.iam.gserviceaccount.com",
  GA4_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  ARCHIVE_PUBLIC_SITE_URL: "https://marchivej.vercel.app",
};
const row = (path: string, users = "8") => ({
  dimensionValues: [{ value: path }],
  metricValues: [{ value: "24" }, { value: users }, { value: "120.5" }],
  clientId: "NEVER_EXPORT_CLIENT",
});
const result = (rows = [row("/ko/docs/public")]) => ({
  dimensionHeaders: [{ name: "pagePath" }],
  metricHeaders: ["screenPageViews", "activeUsers", "userEngagementDuration"].map((name) => ({
    name,
  })),
  rows,
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function provider(
  options: {
    env?: NodeJS.ProcessEnv;
    body?: unknown;
    request?: Mock<typeof fetch>;
    now?: () => number;
  } = {},
) {
  const request =
    options.request ??
    vi.fn<typeof fetch>(async (url) =>
      url === "https://oauth2.googleapis.com/token"
        ? json({ access_token: "PRIVATE_ACCESS_TOKEN", expires_in: 3600 })
        : json(options.body ?? result()),
    );
  const value = createGoogleAnalyticsReporting({
    environment: options.env ?? environment,
    fetch: request,
    isPublicPath: async (path) => path === "/ko/docs/public",
    ...(options.now ? { now: options.now } : {}),
  });
  return { value, request };
}

describe("read-only aggregate reporting", () => {
  it("sends no Google requests before explicit reporting configuration", async () => {
    const { value, request } = provider({ env: {} });
    expect(value.connection()).toMatchObject({ enabled: false, configured: false });
    await expect(value.report()).rejects.toMatchObject({
      code: "ANALYTICS_REPORTING_NOT_CONFIGURED",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects a measurement ID where the numeric property ID is required", async () => {
    const { value, request } = provider({
      env: { ...environment, GA4_PROPERTY_ID: "G-TEST000000" },
    });
    expect(value.connection().configured).toBe(false);
    await expect(value.report()).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("uses a signed readonly assertion and a fixed report, never arbitrary dimensions or audiences", async () => {
    const { value, request } = provider();
    const report = await value.report();
    const form = request.mock.calls.at(0)?.[1]?.body;
    if (!(form instanceof URLSearchParams)) throw new Error("Expected OAuth form");
    const assertion = form.get("assertion");
    if (!assertion) throw new Error("Missing signed assertion");
    const { payload } = await jwtVerify(assertion, publicKey, {
      issuer: environment.GA4_SERVICE_ACCOUNT_EMAIL,
      audience: "https://oauth2.googleapis.com/token",
    });
    expect(payload.scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
    expect(payload.sub).toBeUndefined();
    expect(request.mock.calls.at(1)?.[0]).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport",
    );
    const requestBody = request.mock.calls.at(1)?.[1]?.body;
    if (typeof requestBody !== "string") throw new Error("Expected report body");
    const body = JSON.parse(requestBody);
    expect(body.dimensions).toEqual([{ name: "pagePath" }]);
    expect(body.dateRanges).toEqual([{ startDate: "28daysAgo", endDate: "yesterday" }]);
    expect(body.dimensionFilter.filter.stringFilter.value).toBe("marchivej.vercel.app");
    expect(body.limit).toBe("20");
    expect(report.pages[0]?.views).toBe(24);
    expect(JSON.stringify(report)).not.toMatch(
      /PRIVATE_ACCESS_TOKEN|NEVER_EXPORT_CLIENT|assertion|clientId/,
    );
  });
  it("drops low-count, private, malformed and duplicate paths instead of presenting them as public recommendations", async () => {
    const { value } = provider({
      body: result([
        row("/ko/docs/public"),
        row("/ko/docs/small", "1"),
        row("/ko/admin"),
        row("/ko/private"),
        row("/ko/docs/public?secret=hidden"),
        row("/ko/docs/public"),
      ]),
    });
    const report = await value.report();
    expect(report.pages).toHaveLength(1);
    expect(report.omittedRows).toBe(5);
  });
  it("coalesces repeated requests and serves only a bounded-time memory snapshot", async () => {
    let now = Date.now();
    const { value, request } = provider({ now: () => now });
    const [one, two] = await Promise.all([value.report(), value.report()]);
    expect(one.generatedAt).toBe(two.generatedAt);
    expect(request).toHaveBeenCalledTimes(2);
    expect((await value.report()).cached).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    now += 11 * 60_000;
    expect((await value.report()).cached).toBe(false);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("preserves report quality limitations and distinguishes no eligible rows from zero visits", async () => {
    const { value } = provider({
      body: {
        ...result([]),
        metadata: {
          subjectToThresholding: true,
          dataLossFromOtherRow: true,
          samplingMetadatas: [{}],
        },
      },
    });
    const report = await value.report();
    expect(report.pages).toEqual([]);
    expect(report.quality).toEqual(["sampled", "thresholded", "cardinality"]);
    expect(report).not.toHaveProperty("totalVisits");
  });
  it("does not echo upstream error text, private keys or access tokens", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: "PRIVATE_UPSTREAM_BODY" }, 403));
    const { value } = provider({ request });
    await expect(value.report()).rejects.toMatchObject({
      code: "ANALYTICS_REPORT_UNAVAILABLE",
      message: "ANALYTICS_REPORT_UNAVAILABLE",
    });
  });
  it("rejects oversized responses and unexpected columns", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(300_000)));
    await expect(provider({ request }).value.report()).rejects.toMatchObject({
      code: "ANALYTICS_REPORT_UNAVAILABLE",
    });
    await expect(
      provider({ body: { ...result(), dimensionHeaders: [{ name: "userId" }] } }).value.report(),
    ).rejects.toThrow();
  });
  it("rejects unsafe publication paths even before the publication resolver", () => {
    for (const path of [
      "//outside.test",
      "/ko/privacy",
      "/ko/%61dmin",
      "/ko/docs/../login",
      "/ko/docs/%252fsecret",
      "/ko/docs/a#secret",
    ])
      expect(eligibleAnalyticsPath(path)).toBe(false);
  });
});

describe("analytics management authorization", () => {
  it("authenticates both status and report requests before contacting a provider", async () => {
    const report = vi.fn();
    const connection = vi.fn();
    const app = buildApp({
      publisher: { publish: vi.fn() },
      authenticate: async () => {
        throw new AuthenticationError("Denied");
      },
      analytics: { report, connection },
    });
    expect((await app.inject({ method: "GET", url: "/v1/admin/analytics" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "POST", url: "/v1/admin/analytics/report", payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(report).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
    await app.close();
  });
  it("keeps admin responses private and rejects client-selected queries", async () => {
    const { value } = provider();
    const app = buildApp({
      publisher: { publish: vi.fn() },
      authenticate: async () => ({ id: "owner" }),
      analytics: value,
    });
    const report = await app.inject({
      method: "POST",
      url: "/v1/admin/analytics/report",
      payload: {},
    });
    expect(report.statusCode).toBe(200);
    expect(report.headers["cache-control"]).toBe("private, no-store");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/admin/analytics/report",
          payload: { propertyId: "999999999", dimensions: ["userId"] },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });
});
