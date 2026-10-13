import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { compileDocument } from "../../../../packages/content-engine/dist/index.js";

// A loopback-only fixture, never a production API or an authenticated test shortcut.
const fixturePort = 17761;
const webPort = 3010;
const production = process.argv.includes("--production");
const fixtureWebhookSecret = randomBytes(32).toString("base64url");
let mode = process.argv.includes("--empty") ? "empty" : "normal";
const artifacts = new Map();
for (const locale of ["ko", "en"]) {
  const source = `# ${locale === "ko" ? "읽기 환경 테스트" : "Reading environment test"}\n\n## ${locale === "ko" ? "방법" : "Method"}\n\nA deterministic local UI fixture.\n\n### Details\n\n${"Long paragraph for reading and anchor navigation. ".repeat(25)}\n\n## Results\n\n| ${Array.from({ length: 12 }, (_, i) => `Long column ${i}`).join(" | ")} |\n| ${Array.from({ length: 12 }, () => "---").join(" | ")} |\n| ${Array.from({ length: 12 }, () => "long-unbroken-test-value").join(" | ")} |\n\n$$\\sum_{i=0}^{n} x_i^2$$\n\n\`\`\`ts\nconst example = '${"value".repeat(25)}';\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n  A[Question] --> B[Evidence]\n\`\`\`\n`;
  artifacts.set(
    locale,
    await compileDocument(
      source.replace("$$\\sum_{i=0}^{n} x_i^2$$", () => "$$\n\\sum_{i=0}^{n} x_i^2\n$$"),
      { locale },
    ),
  );
}
const json = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
};
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${fixturePort}`);
  if (request.method === "POST" && url.pathname === "/__fixtures/mode") {
    const nextMode = url.searchParams.get("mode");
    if (!["normal", "empty", "offline"].includes(nextMode)) return json(response, 400, {});
    mode = nextMode;
    // Exercise the real signed invalidation contract instead of disabling production caching.
    try {
      for (const locale of ["ko", "en"]) {
        const body = JSON.stringify({
          type: "CONTENT_ACCESS_CHANGED",
          payload: { locale, path: `/${locale}/reading-fixture` },
        });
        const result = await fetch(`http://127.0.0.1:${webPort}/api/revalidate`, {
          method: "POST",
          signal: AbortSignal.timeout(12_000),
          headers: {
            "content-type": "application/json",
            "x-archive-signature": `sha256=${createHmac("sha256", fixtureWebhookSecret).update(body).digest("hex")}`,
          },
          body,
        });
        if (!result.ok) throw new Error("Fixture invalidation was rejected");
      }
    } catch {
      return json(response, 502, { error: "Fixture cache invalidation failed" });
    }
    return json(response, 200, { mode });
  }
  const publicSearch = url.pathname === "/v1/public/search" && request.method === "POST";
  if (publicSearch) {
    let text = "";
    for await (const chunk of request) text += chunk;
    try {
      const input = JSON.parse(text);
      url.searchParams.set("q", String(input.q ?? ""));
      url.searchParams.set("locale", String(input.locale ?? "en"));
    } catch {
      return json(response, 400, {});
    }
  }
  if (url.pathname.includes("/admin") || (request.method !== "GET" && !publicSearch))
    return json(response, 401, {});
  if (mode === "offline" || url.searchParams.get("q") === "offline") return json(response, 503, {});
  const locale = url.searchParams.get("locale") === "ko" ? "ko" : "en";
  const title = locale === "ko" ? "읽기 환경 테스트" : "Reading environment test";
  const item = {
    contentId: "00000000-0000-4000-8000-000000000001",
    kind: "DOC",
    locale,
    path: `/${locale}/reading-fixture`,
    title,
    description: "Local UI fixture, not a published record.",
    publishedAt: "2026-10-01T00:00:00.000Z",
    tags: ["NLP"],
  };
  if (publicSearch)
    return json(response, 200, {
      items: mode === "empty" || url.searchParams.get("q") === "none" ? [] : [item],
      mode: "lexical",
      providerAvailable: false,
    });
  if (url.pathname === "/v1/public/contents")
    return json(
      response,
      200,
      mode === "empty" || url.searchParams.get("q") === "none"
        ? { items: [] }
        : {
            items: [item],
            ...(!url.searchParams.has("cursor") ? { nextCursor: "fixture-next" } : {}),
          },
    );
  if (url.pathname === "/v1/public/navigation")
    return json(response, 200, {
      locale,
      space: url.searchParams.get("space"),
      nodes: [
        {
          id: "test-topic",
          stableKey: "methods",
          slug: "methods",
          label: locale === "ko" ? "방법론" : "Methods",
        },
      ],
    });
  if (url.pathname === "/v1/public/resolve" && url.searchParams.get("path") === item.path)
    return json(response, 200, {
      type: "document",
      ...item,
      revisionNumber: 1,
      artifact: artifacts.get(locale),
    });
  return json(response, 404, {});
});
await new Promise((resolve, reject) => {
  fixture.once("error", reject);
  fixture.listen(fixturePort, "127.0.0.1", resolve);
});
const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const nextBin = fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(
  process.execPath,
  [
    nextBin,
    ...(production ? ["start"] : ["dev", "--webpack"]),
    "--hostname",
    "127.0.0.1",
    "--port",
    String(webPort),
  ],
  {
    cwd: webRoot,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      ARCHIVE_API_BASE_URL: `http://127.0.0.1:${fixturePort}`,
      ARCHIVE_API_UPSTREAM_BEARER_TOKEN: "",
      ARCHIVE_API_BEARER_TOKEN: "",
      ARCHIVE_DEV_ADMIN_ACCESS_TOKEN: "",
      OUTBOX_WEBHOOK_SECRET: fixtureWebhookSecret,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NODE_ENV: production ? "production" : "development",
    },
  },
);
const stop = () => {
  child.kill();
  fixture.close();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
child.once("exit", (code) => {
  fixture.close();
  process.exitCode = code ?? 0;
});
