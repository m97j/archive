import { SignJWT, importPKCS8 } from "jose";
import {
  LOCALES,
  isReservedPublicationPath,
  type AnalyticsConnection,
  type AnalyticsReport,
} from "@archive/contracts";
import { ProviderError } from "@archive/content-engine";

export interface AnalyticsProvider {
  connection(): AnalyticsConnection;
  report(): Promise<AnalyticsReport>;
}
interface ReportingOptions {
  environment: NodeJS.ProcessEnv;
  isPublicPath(path: string): Promise<boolean>;
  fetch?: typeof fetch;
  now?: () => number;
}
const OAUTH_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const CACHE_MS = 10 * 60_000;
const RESPONSE_LIMIT = 256 * 1024;

/** Aggregate output is minimized, not a claim that an arbitrary small cohort is anonymous. */
export function eligibleAnalyticsPath(path: string): boolean {
  return (
    path.length <= 2048 &&
    !/[?#\\]/.test(path) &&
    !/%(?:25|2f|5c)/i.test(path) &&
    LOCALES.some((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`)) &&
    !isReservedPublicationPath(path)
  );
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error("UPSTREAM_REJECTED");
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > RESPONSE_LIMIT) {
      await reader.cancel();
      throw new Error("UPSTREAM_TOO_LARGE");
    }
    chunks.push(part.value);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("UPSTREAM_INVALID");
  return value as Record<string, unknown>;
}

export function createGoogleAnalyticsReporting(options: ReportingOptions): AnalyticsProvider {
  const env = options.environment;
  const propertyId = env.GA4_PROPERTY_ID?.trim() ?? "";
  const email = env.GA4_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = (env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  let hostname = "";
  try {
    const site = new URL(env.ARCHIVE_PUBLIC_SITE_URL ?? "https://marchivej.vercel.app");
    if (site.protocol === "https:" && !site.username && !site.password) hostname = site.hostname;
  } catch {
    /* Reporting cannot choose an arbitrary destination or origin. */
  }
  const configured =
    /^\d{6,20}$/.test(propertyId) &&
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(email) &&
    privateKey.length <= 16_384 &&
    privateKey.includes("-----BEGIN PRIVATE KEY-----") &&
    Boolean(hostname);
  const enabled = env.GA4_REPORTING_ENABLED === "true";
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let snapshot: AnalyticsReport | undefined;
  let snapshotAt = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<AnalyticsReport> | undefined;
  let access: { token: string; expiresAt: number } | undefined;
  const connection = (): AnalyticsConnection => ({
    enabled,
    configured,
    rangeDays: 28,
    cacheMinutes: 10,
    minimumUsers: 5,
  });

  async function read(): Promise<AnalyticsReport> {
    try {
      if (!access || access.expiresAt <= now()) {
        const issuedAt = Math.floor(now() / 1000);
        const assertion = await new SignJWT({ scope: SCOPE })
          .setProtectedHeader({ alg: "RS256" })
          .setIssuer(email)
          .setAudience(OAUTH_URL)
          .setIssuedAt(issuedAt)
          .setExpirationTime(issuedAt + 3600)
          .sign(await importPKCS8(privateKey, "RS256"));
        const auth = await boundedJson(
          await request(OAUTH_URL, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(6000),
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion,
            }),
          }),
        );
        if (
          typeof auth.access_token !== "string" ||
          auth.access_token.length > 8192 ||
          typeof auth.expires_in !== "number" ||
          auth.expires_in < 120
        )
          throw new Error("INVALID_TOKEN");
        access = {
          token: auth.access_token,
          expiresAt: now() + (Math.min(auth.expires_in, 3600) - 60) * 1000,
        };
      }
      const result = await boundedJson(
        await request(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(6000),
            headers: {
              authorization: `Bearer ${access.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
              dimensions: [{ name: "pagePath" }],
              metrics: [
                { name: "screenPageViews" },
                { name: "activeUsers" },
                { name: "userEngagementDuration" },
              ],
              dimensionFilter: {
                filter: {
                  fieldName: "hostName",
                  stringFilter: { matchType: "EXACT", value: hostname },
                },
              },
              orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
              limit: "20",
              keepEmptyRows: false,
            }),
          },
        ),
      );
      const dimensionHeaders = result.dimensionHeaders as { name?: unknown }[] | undefined;
      const metricHeaders = result.metricHeaders as { name?: unknown }[] | undefined;
      if (
        !Array.isArray(dimensionHeaders) ||
        dimensionHeaders.length !== 1 ||
        dimensionHeaders[0]?.name !== "pagePath" ||
        !Array.isArray(metricHeaders) ||
        metricHeaders.map((value) => value.name).join(",") !==
          "screenPageViews,activeUsers,userEngagementDuration"
      )
        throw new Error("UNEXPECTED_REPORT_COLUMNS");
      if (result.rows !== undefined && !Array.isArray(result.rows)) throw new Error("INVALID_ROWS");
      const rows = (result.rows ?? []) as {
        dimensionValues?: { value?: unknown }[];
        metricValues?: { value?: unknown }[];
      }[];
      if (rows.length > 20) throw new Error("REPORT_ROW_LIMIT");
      const pages: AnalyticsReport["pages"] = [];
      let omittedRows = 0;
      const seen = new Set<string>();
      for (const row of rows) {
        const path = row.dimensionValues?.[0]?.value;
        const values = row.metricValues?.map((value) =>
          typeof value.value === "string" && /^\d+(?:\.\d+)?$/.test(value.value)
            ? Number(value.value)
            : NaN,
        );
        const [views, activeUsers, engagementSeconds] = values ?? [];
        if (
          typeof views !== "number" ||
          typeof activeUsers !== "number" ||
          typeof engagementSeconds !== "number" ||
          typeof path !== "string" ||
          !eligibleAnalyticsPath(path) ||
          !values ||
          values.length !== 3 ||
          values.some(
            (value) => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER,
          ) ||
          !Number.isInteger(views) ||
          !Number.isInteger(activeUsers) ||
          activeUsers < 5 ||
          seen.has(path)
        ) {
          omittedRows++;
          continue;
        }
        if (!(await options.isPublicPath(path))) {
          omittedRows++;
          continue;
        }
        seen.add(path);
        pages.push({
          path,
          views,
          activeUsers,
          engagementSeconds,
        });
      }
      const meta = result.metadata as Record<string, unknown> | undefined;
      const quality: AnalyticsReport["quality"] = [];
      if (Array.isArray(meta?.samplingMetadatas) && meta.samplingMetadatas.length)
        quality.push("sampled");
      if (meta?.subjectToThresholding === true) quality.push("thresholded");
      if (meta?.dataLossFromOtherRow === true) quality.push("cardinality");
      snapshotAt = now();
      snapshot = {
        generatedAt: new Date(snapshotAt).toISOString(),
        cached: false,
        rangeDays: 28,
        minimumUsers: 5,
        omittedRows,
        quality,
        pages,
      };
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => {
        snapshot = undefined;
      }, CACHE_MS);
      expiryTimer.unref();
      return snapshot;
    } catch {
      access = undefined;
      throw new ProviderError("ANALYTICS_REPORT_UNAVAILABLE");
    }
  }
  return {
    connection,
    async report() {
      if (!enabled || !configured) throw new ProviderError("ANALYTICS_REPORTING_NOT_CONFIGURED");
      if (snapshot && now() - snapshotAt < CACHE_MS) return { ...snapshot, cached: true };
      if (pending) return pending;
      pending = read();
      try {
        return await pending;
      } finally {
        pending = undefined;
      }
    },
  };
}
