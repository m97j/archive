import pino, { type LoggerOptions } from "pino";

export function createLogger(options: LoggerOptions = {}) {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: process.env.SERVICE_NAME ?? "archive" },
    redact: {
      paths: [
        "req.headers.authorization",
        "authorization",
        "token",
        "accessToken",
        "refreshToken",
        "*.password",
      ],
      censor: "[REDACTED]",
    },
    ...options,
  });
}

export type ArchiveLogger = ReturnType<typeof createLogger>;
