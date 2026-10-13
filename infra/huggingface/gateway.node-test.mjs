import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGateway } from "./gateway.mjs";

test("CMS/API routing replaces untrusted forwarding headers", async () => {
  const backend = (name) =>
    createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name,
          host: request.headers.host,
          forwarded: request.headers["x-forwarded-host"],
          ip: request.headers["x-forwarded-for"],
        }),
      );
    });
  const api = backend("api"),
    cms = backend("cms");
  api.listen(0, "127.0.0.1");
  cms.listen(0, "127.0.0.1");
  await Promise.all([once(api, "listening"), once(cms, "listening")]);
  const gateway = createGateway({
    publicOrigin: "https://studio.example.test",
    apiPort: api.address().port,
    cmsPort: cms.address().port,
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  try {
    const base = `http://127.0.0.1:${gateway.address().port}`;
    for (const [path, name] of [
      ["/v1/public/search", "api"],
      ["/health", "api"],
      ["/ko/admin", "cms"],
    ]) {
      const response = await fetch(base + path, {
        headers: { "x-forwarded-host": "evil.test", "x-forwarded-for": "1.2.3.4" },
      });
      assert.deepEqual(await response.json(), {
        name,
        host: "studio.example.test",
        forwarded: "studio.example.test",
      });
    }
    const oversized = await fetch(base, { method: "POST", body: "x".repeat(2_100_001) });
    assert.equal(oversized.status, 413);
    const chunked = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(2_100_001)));
        controller.close();
      },
    });
    const tooLarge = await fetch(base, { method: "POST", body: chunked, duplex: "half" });
    assert.equal(tooLarge.status, 413);
    assert.equal((await fetch(base + "/health")).status, 200);
  } finally {
    await Promise.all(
      [gateway, api, cms].map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
          }),
      ),
    );
  }
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function closeServers(...servers) {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
}

test("chunked oversized input never reaches an immediately responding upstream", async () => {
  let calls = 0;
  const backend = createServer((_request, response) => {
    calls += 1;
    response.end("early reply");
  });
  const port = await listen(backend);
  const gateway = createGateway({ apiPort: port, cmsPort: port });
  const base = `http://127.0.0.1:${await listen(gateway)}`;
  try {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_000));
        controller.enqueue(new Uint8Array(1_100_001));
        controller.close();
      },
    });
    const rejected = await fetch(base + "/v1/probe", { method: "POST", body, duplex: "half" });
    assert.equal(rejected.status, 413);
    assert.equal(calls, 0);
    const accepted = await fetch(base + "/v1/probe", { method: "POST", body: "allowed" });
    assert.equal(accepted.status, 200);
    assert.equal(calls, 1);
  } finally {
    await closeServers(gateway, backend);
  }
});

test("bounded body is forwarded completely with truthful length", async () => {
  const backend = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () =>
      response.end(
        JSON.stringify({
          content: Buffer.concat(chunks).toString(),
          length: request.headers["content-length"],
          encoding: request.headers["transfer-encoding"],
        }),
      ),
    );
  });
  const port = await listen(backend);
  const gateway = createGateway({ apiPort: port });
  const base = `http://127.0.0.1:${await listen(gateway)}`;
  try {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("synthetic-"));
        controller.enqueue(new TextEncoder().encode("payload"));
        controller.close();
      },
    });
    const response = await fetch(base + "/v1/probe", { method: "POST", body, duplex: "half" });
    assert.deepEqual(await response.json(), { content: "synthetic-payload", length: "17" });
  } finally {
    await closeServers(gateway, backend);
  }
});

test("a stalled request body times out before any upstream work", { timeout: 5000 }, async () => {
  let calls = 0;
  const backend = createServer((_request, response) => {
    calls += 1;
    response.end("unexpected");
  });
  const port = await listen(backend);
  const gateway = createGateway({ apiPort: port, bodyTimeoutMs: 70 });
  const gatewayPort = await listen(gateway);
  try {
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: "127.0.0.1",
          port: gatewayPort,
          path: "/v1/probe",
          method: "POST",
          headers: { "transfer-encoding": "chunked" },
        },
        (response) => {
          response.resume();
          response.on("end", () => {
            request.destroy();
            resolve(response.statusCode);
          });
        },
      );
      request.on("error", (error) => {
        if (error.code !== "ECONNRESET") reject(error);
      });
      request.write("unfinished");
    });
    assert.equal(status, 408);
    assert.equal(calls, 0);
  } finally {
    await closeServers(gateway, backend);
  }
});

test("outstanding request limit is released after completion", { timeout: 5000 }, async () => {
  let ready;
  const observed = new Promise((resolve) => {
    ready = resolve;
  });
  let heldResponse;
  const backend = createServer((_request, response) => {
    heldResponse = response;
    ready();
  });
  const port = await listen(backend);
  const gateway = createGateway({ apiPort: port, maxConcurrent: 1 });
  const base = `http://127.0.0.1:${await listen(gateway)}`;
  try {
    const first = fetch(base + "/v1/probe");
    await observed;
    const second = await fetch(base + "/v1/probe");
    assert.equal(second.status, 503);
    assert.equal(second.headers.get("retry-after"), "5");
    heldResponse.end("released");
    assert.equal(await (await first).text(), "released");
    const third = fetch(base + "/v1/probe");
    await new Promise((resolve) => setTimeout(resolve, 30));
    heldResponse.end("next");
    assert.equal(await (await third).text(), "next");
  } finally {
    await closeServers(gateway, backend);
  }
});

test("absolute upstream deadline ends a silent response", { timeout: 5000 }, async () => {
  const backend = createServer(() => {});
  const port = await listen(backend);
  const gateway = createGateway({ apiPort: port, upstreamTimeoutMs: 80 });
  const base = `http://127.0.0.1:${await listen(gateway)}`;
  try {
    const response = await fetch(base + "/v1/probe");
    assert.equal(response.status, 504);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await closeServers(gateway, backend);
  }
});

test(
  "truncated upstream destroys downstream instead of hanging or appending an error",
  { timeout: 5000 },
  async () => {
    const backend = createServer((request, response) => {
      if (request.url === "/health") {
        response.end("healthy");
        return;
      }
      response.writeHead(200, { "content-length": "100" });
      response.write("partial");
      setTimeout(() => response.destroy(), 20);
    });
    const port = await listen(backend);
    const gateway = createGateway({ apiPort: port });
    const base = `http://127.0.0.1:${await listen(gateway)}`;
    try {
      const response = await fetch(base + "/v1/probe");
      await assert.rejects(response.text());
      assert.equal(await (await fetch(base + "/health")).text(), "healthy");
    } finally {
      await closeServers(gateway, backend);
    }
  },
);

test("abandoning a downstream response aborts upstream work", { timeout: 5000 }, async () => {
  let closed;
  const upstreamClosed = new Promise((resolve) => {
    closed = resolve;
  });
  const backend = createServer((_request, response) => {
    const timer = setInterval(() => response.write("synthetic"), 15);
    response.once("close", () => {
      clearInterval(timer);
      closed();
    });
  });
  const port = await listen(backend);
  const gateway = createGateway({ apiPort: port });
  const gatewayPort = await listen(gateway);
  try {
    await new Promise((resolve, reject) => {
      const request = httpRequest(
        { host: "127.0.0.1", port: gatewayPort, path: "/v1/probe" },
        (response) => {
          response.once("data", () => {
            response.destroy();
            resolve();
          });
          response.on("error", () => {});
        },
      );
      request.on("error", reject);
      request.end();
    });
    await upstreamClosed;
  } finally {
    await closeServers(gateway, backend);
  }
});
