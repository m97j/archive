import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { compileDocument } from "../../../../packages/content-engine/dist/index.js";

// Synthetic loopback services exercise the real production CMS authentication code.
// This helper is not copied to a Space and never connects to production accounts or data.
const port = 17762;
const cmsPort = 3011;
const origin = `http://127.0.0.1:${port}`;
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const kid = "ephemeral-studio-fixture";
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
const identities = new Map();
let requests = [];
const adminId = "00000000-0000-4000-8000-000000000001";
const readerId = "00000000-0000-4000-8000-000000000002";
const user = (admin) => ({
  id: admin ? adminId : readerId,
  aud: "authenticated",
  role: "authenticated",
  email: admin ? "owner@example.test" : "reader@example.test",
  app_metadata: { roles: admin ? ["archive_admin"] : [] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
});
function session(admin) {
  const profile = user(admin);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      ...profile,
      sub: profile.id,
      iss: `${origin}/auth/v1`,
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const body = `${header}.${payload}`;
  return {
    access_token: `${body}.${sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`,
    refresh_token: admin ? "fixture-owner-refresh" : "fixture-reader-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user: profile,
  };
}
const json = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
};
async function bodyOf(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 2_000_000) throw new Error("Fixture request too large");
  }
  return text ? JSON.parse(text) : {};
}
const fixture = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", origin);
    const path = url.pathname;
    if (path === "/__fixtures/reset") {
      identities.clear();
      requests = [];
      return json(response, 200, {});
    }
    if (path === "/__fixtures/requests") return json(response, 200, { requests });
    if (path === "/auth/v1/.well-known/jwks.json")
      return json(response, 200, { keys: [publicJwk] });
    if (path === "/auth/v1/token") {
      const input = await bodyOf(request);
      if (url.searchParams.get("grant_type") === "refresh_token")
        return json(response, 200, session(input.refresh_token === "fixture-owner-refresh"));
      if (
        !["owner@example.test", "reader@example.test"].includes(input.email) ||
        input.password !== "fixture-password"
      )
        return json(response, 400, { error: "invalid_grant", msg: "Invalid login credentials" });
      return json(response, 200, session(input.email === "owner@example.test"));
    }
    if (path === "/auth/v1/user") return json(response, 200, user(true));
    if (path === "/auth/v1/logout") return json(response, 200, {});
    if (!request.headers.authorization?.startsWith("Bearer ")) return json(response, 401, {});
    if (path === "/v1/admin/analytics")
      return json(response, 200, {
        enabled: true,
        configured: true,
        rangeDays: 28,
        cacheMinutes: 10,
        minimumUsers: 5,
      });
    if (path === "/v1/admin/analytics/report") {
      requests.push({ method: request.method, path });
      return json(response, 200, {
        generatedAt: new Date().toISOString(),
        cached: false,
        rangeDays: 28,
        minimumUsers: 5,
        omittedRows: 2,
        quality: [],
        pages: [
          { path: "/ko/docs/retrieval", views: 120, activeUsers: 20, engagementSeconds: 600 },
        ],
      });
    }
    if (path === "/v1/admin/contents")
      return json(response, 200, {
        items: [...identities.values()].filter(
          (item) => url.searchParams.get("includeArchived") === "true" || !item.archivedAt,
        ),
      });
    if (["/v1/admin/taxonomy/nodes", "/v1/admin/tags", "/v1/admin/jobs"].includes(path))
      return json(response, 200, { items: [] });
    const input = request.method === "GET" ? {} : await bodyOf(request);
    requests.push({ method: request.method, path });
    if (path.startsWith("/v1/admin/ai/")) return json(response, 202, { jobId: randomUUID() });
    if (path === "/v1/contents" && request.method === "POST") {
      const id = randomUUID();
      identities.set(id, { id, ...input, updatedAt: new Date().toISOString() });
      return json(response, 201, { id });
    }
    const contentId = path.match(/^\/v1\/(?:admin\/)?contents\/([^/]+)/)?.[1];
    if (contentId && path.endsWith("/revisions")) {
      const content = identities.get(contentId);
      if (!content) return json(response, 404, {});
      const revisionId = randomUUID();
      const number = (content.latestRevision?.revisionNumber || 0) + 1;
      const translations = [];
      for (const translation of input.translations) {
        const artifact = await compileDocument(translation.sourceMarkdown, {
          locale: translation.locale,
        });
        translations.push({
          ...translation,
          id: randomUUID(),
          translationStatus: "DRAFT",
          artifact: { id: randomUUID() },
          compiled: artifact,
        });
      }
      content.latestRevision = {
        id: revisionId,
        revisionNumber: number,
        status: "DRAFT",
        translations,
      };
      return json(response, 201, { contentId, revisionId, revisionNumber: number });
    }
    if (contentId && path.endsWith("/draft")) {
      const content = identities.get(contentId);
      const revision = content?.latestRevision;
      const translation = revision?.translations.find(
        (item) => item.locale === url.searchParams.get("locale"),
      );
      return translation
        ? json(response, 200, {
            ...translation,
            contentId,
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
          })
        : json(response, 404, {});
    }
    if (contentId && path.endsWith("/access")) {
      const content = identities.get(contentId);
      if (!content) return json(response, 404, {});
      if (input.archived) content.archivedAt = new Date().toISOString();
      else if (input.archived === false) delete content.archivedAt;
      if (input.visibility) content.visibility = input.visibility;
      return json(response, 200, content);
    }
    const revisionId = path.match(/^\/v1\/revisions\/([^/]+)\/review$/)?.[1];
    if (revisionId) {
      for (const content of identities.values())
        if (content.latestRevision?.id === revisionId) content.latestRevision.status = input.status;
      return json(response, 200, {});
    }
    const translationId = path.match(/^\/v1\/localized-revisions\/([^/]+)\/review$/)?.[1];
    if (translationId) {
      for (const content of identities.values())
        for (const translation of content.latestRevision?.translations || [])
          if (translation.id === translationId) translation.translationStatus = input.status;
      return json(response, 200, {});
    }
    if (path === "/v1/publications") return json(response, 201, { id: randomUUID(), ...input });
    return json(response, 404, {});
  } catch {
    return json(response, 400, { error: "Invalid local fixture request" });
  }
});
await new Promise((resolve, reject) => {
  fixture.once("error", reject);
  fixture.listen(port, "127.0.0.1", resolve);
});
const production = process.argv.includes("--production");
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)),
    ...(production ? ["start"] : ["dev", "--webpack"]),
    "--hostname",
    "127.0.0.1",
    "--port",
    String(cmsPort),
  ],
  {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: production ? "production" : "development",
      ARCHIVE_DEV_ADMIN_ACCESS_TOKEN: "",
      ARCHIVE_API_BASE_URL: origin,
      ARCHIVE_API_UPSTREAM_BEARER_TOKEN: "",
      ARCHIVE_API_BEARER_TOKEN: "",
      SUPABASE_URL: origin,
      SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      CMS_SESSION_SECRET: randomBytes(32).toString("base64url"),
      CMS_PUBLIC_URL: `http://127.0.0.1:${cmsPort}`,
      CMS_COOKIE_MODE: "top-level",
      ARCHIVE_PUBLIC_SITE_URL: "http://127.0.0.1:3010",
      PUBLISHER_ROLE: "archive_admin",
    },
  },
);
const stop = () => {
  child.kill();
  fixture.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
child.once("exit", (code) => {
  fixture.close();
  process.exitCode = code ?? 0;
});
