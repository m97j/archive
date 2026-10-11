import { spawn } from "node:child_process";

const services = [
  ["api", "/app/api/dist/main.js"],
  ["worker", "/app/worker/dist/main.js"],
].map(([name, entry]) => ({
  name,
  process: spawn(process.execPath, [entry], { stdio: "inherit", env: process.env }),
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
