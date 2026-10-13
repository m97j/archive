import { spawn } from "node:child_process";

const services = [
  ["api", "/app/api/dist/main.js", { HOST: "127.0.0.1", PORT: "7861" }],
  ["worker", "/app/worker/dist/main.js", {}],
  [
    "cms",
    "/app/cms/apps/cms/server.js",
    {
      HOSTNAME: "127.0.0.1",
      PORT: "3001",
      ARCHIVE_API_BASE_URL: "http://127.0.0.1:7861",
      ARCHIVE_API_UPSTREAM_BEARER_TOKEN: "",
      ARCHIVE_API_BEARER_TOKEN: "",
    },
  ],
  ["gateway", "/app/gateway.mjs", { PORT: "7860" }],
].map(([name, entry, overrides]) => ({
  name,
  process: spawn(process.execPath, [entry], {
    stdio: "inherit",
    env: { ...process.env, ...overrides },
  }),
}));

let shuttingDown = false;
function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const service of services) service.process.kill(signal);
  setTimeout(() => process.exit(exitCode), 10_000).unref();
}

for (const service of services) {
  service.process.once("exit", (code, signal) => {
    if (shuttingDown) return;
    process.stderr.write(`${service.name} exited (${signal ?? code ?? "unknown"})\n`);
    shutdown("SIGTERM", code ?? 1);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
