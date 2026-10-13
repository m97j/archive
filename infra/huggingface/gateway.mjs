import { createServer, request as proxyRequest } from "node:http";
import { pathToFileURL } from "node:url";

const BODY_LIMIT = 2_100_000;
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function safeHeaders(source) {
  const headers = { ...source };
  const nominated = String(source.connection ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase());
  for (const name of [...HOP_BY_HOP, ...nominated]) delete headers[name];
  return headers;
}

function requestFailure(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readBoundedBody(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("aborted", aborted);
      request.off("error", failed);
      if (error) {
        request.pause();
        reject(error);
      } else resolve(Buffer.concat(chunks, bytes));
    };
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > BODY_LIMIT) finish(requestFailure(413, "Request too large"));
      else chunks.push(chunk);
    };
    const end = () => finish();
    const aborted = () => finish(requestFailure(400, "Request aborted"));
    const failed = () => finish(requestFailure(400, "Request could not be accepted"));
    const timer = setTimeout(() => finish(requestFailure(408, "Request timed out")), timeoutMs);
    timer.unref();
    request.on("data", data);
    request.on("end", end);
    request.on("aborted", aborted);
    request.on("error", failed);
  });
}

export function createGateway({
  publicOrigin,
  apiPort = 7861,
  cmsPort = 3001,
  maxConcurrent = 32,
  bodyTimeoutMs = 30_000,
  upstreamTimeoutMs = 120_000,
} = {}) {
  const configured = publicOrigin ? new URL(publicOrigin) : undefined;
  if (
    configured &&
    (configured.username ||
      configured.password ||
      configured.search ||
      configured.hash ||
      configured.pathname !== "/" ||
      !["https:", "http:"].includes(configured.protocol))
  )
    throw new Error("publicOrigin must be an HTTP origin without credentials or a path");
  if (
    ![maxConcurrent, bodyTimeoutMs, upstreamTimeoutMs].every(
      (value) => Number.isInteger(value) && value > 0,
    )
  )
    throw new Error("Gateway bounds must be positive integers");
  const expectedHost = configured?.host;
  let active = 0;
  const server = createServer({ maxHeaderSize: 16_384 }, async (request, response) => {
    const reject = (status, message, extra = {}) => {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        connection: "close",
        ...extra,
      });
      request.resume();
      response.end(message);
    };
    const host = request.headers.host ?? "";
    if (expectedHost && host !== expectedHost && !/^localhost:\d+$|^127\.0\.0\.1:\d+$/.test(host)) {
      reject(400, "Invalid host");
      return;
    }
    const url = request.url ?? "/";
    if (url.length > 4096 || !url.startsWith("/") || url.startsWith("//")) {
      reject(400, "Invalid path");
      return;
    }
    const declared = request.headers["content-length"];
    if (declared !== undefined && Number(declared) > BODY_LIMIT) {
      reject(413, "Request too large");
      return;
    }
    if (active >= maxConcurrent) {
      reject(503, "Gateway is busy; retry later", { "retry-after": "5" });
      return;
    }
    active += 1;
    let upstream;
    let upstreamResult;
    let deadline;
    response.once("close", () => {
      active -= 1;
      clearTimeout(deadline);
      if (!response.writableFinished) {
        upstream?.destroy();
        upstreamResult?.destroy();
      }
    });
    request.on("error", () => reject(400, "Request could not be accepted"));
    try {
      // An upstream must never mutate or reply before a complete body passes the cap.
      const body = await readBoundedBody(request, bodyTimeoutMs);
      if (response.destroyed || response.writableEnded) return;
      const pathname = url.split("?")[0];
      const isApi = pathname === "/health" || pathname === "/v1" || pathname.startsWith("/v1/");
      // Public host is deployment configuration, never client forwarding input.
      // Next Server Actions therefore retain their same-origin CSRF check.
      const headers = {
        ...safeHeaders(request.headers),
        host: expectedHost ?? host,
        "x-forwarded-host": expectedHost ?? host,
        "x-forwarded-proto": configured?.protocol === "https:" ? "https" : "http",
      };
      delete headers["x-forwarded-for"];
      delete headers["content-length"];
      if (body.length || declared !== undefined) headers["content-length"] = String(body.length);
      upstream = proxyRequest(
        {
          hostname: "127.0.0.1",
          port: isApi ? apiPort : cmsPort,
          path: url,
          method: request.method,
          headers,
        },
        (result) => {
          upstreamResult = result;
          if (response.writableEnded || response.destroyed) {
            result.destroy();
            return;
          }
          const failed = () => {
            reject(503, "Service response was interrupted");
            upstream.destroy();
          };
          result.once("aborted", failed);
          result.once("error", failed);
          response.writeHead(result.statusCode ?? 502, safeHeaders(result.headers));
          result.pipe(response);
        },
      );
      // Absolute deadline; a trickle response cannot reset the permitted lifetime.
      deadline = setTimeout(() => {
        reject(504, "Service request timed out");
        upstream.destroy();
        upstreamResult?.destroy();
      }, upstreamTimeoutMs);
      deadline.unref();
      upstream.on("error", () => reject(503, "Service is starting or unavailable"));
      request.once("aborted", () => upstream.destroy());
      upstream.end(body);
    } catch (error) {
      reject(error.status ?? 400, error.status ? error.message : "Request could not be accepted");
    }
  });
  server.requestTimeout = bodyTimeoutMs;
  server.headersTimeout = Math.min(15_000, bodyTimeoutMs);
  server.maxConnections = Math.max(128, maxConcurrent * 2);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.CMS_PUBLIC_URL) throw new Error("CMS_PUBLIC_URL is required");
  const server = createGateway({ publicOrigin: process.env.CMS_PUBLIC_URL });
  server.listen(Number(process.env.PORT ?? 7860), "0.0.0.0");
}
