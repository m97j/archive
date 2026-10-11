import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

function positiveInteger(environment: DatabaseEnvironment, name: string, fallback: number): number {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function certificateAuthority(
  environment: DatabaseEnvironment,
  hostname: string,
): string | undefined {
  const inline = environment.DATABASE_SSL_CA?.trim();
  const file = environment.DATABASE_SSL_CA_FILE?.trim();
  if (inline && file) throw new Error("Choose DATABASE_SSL_CA or DATABASE_SSL_CA_FILE, not both");
  const isSupabase =
    /^db\.[a-z0-9]+\.supabase\.co$/.test(hostname) ||
    /^(?:[a-z0-9-]+\.)?pooler\.supabase\.com$/.test(hostname);
  let ca: string | undefined;
  try {
    ca =
      inline?.replace(/\\n/g, "\n") ??
      (file
        ? readFileSync(file, "utf8")
        : isSupabase
          ? readFileSync(
              new URL("../certificates/supabase-prod-ca-2021.crt", import.meta.url),
              "utf8",
            )
          : undefined);
  } catch {
    throw new Error("Database CA file could not be read");
  }
  if (ca !== undefined) {
    try {
      if (/PRIVATE KEY/.test(ca)) throw new Error("Private key supplied instead of public CA");
      const certificate = new X509Certificate(ca);
      if (!certificate.ca || Date.parse(certificate.validTo) <= Date.now()) {
        throw new Error("Invalid or expired CA");
      }
    } catch {
      throw new Error("Database CA must be a valid, unexpired public CA certificate");
    }
  }
  return ca;
}

/** Shared by the business API, worker, migrations and read-only deployment probe. */
export function databasePoolConfig(
  connectionString: string,
  environment: DatabaseEnvironment = process.env,
): PoolConfig & { connectionString: string } {
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
      throw new Error("Invalid PostgreSQL URL");
    }
  } catch {
    // Never put the supplied URL, password or underlying parser error in logs.
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const mode = environment.DATABASE_SSL_MODE?.trim() || (local ? "disable" : "verify-full");
  if (!["disable", "verify-full"].includes(mode) || (!local && mode === "disable")) {
    throw new Error("Remote database connections require DATABASE_SSL_MODE=verify-full");
  }
  const urlMode = url.searchParams.get("sslmode");
  if (!local && ["disable", "no-verify"].includes(urlMode ?? "")) {
    throw new Error("DATABASE_URL must not disable remote certificate verification");
  }
  // pg-connection-string otherwise overwrites the explicit ssl object (including its CA).
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl"]) {
    url.searchParams.delete(key);
  }
  const ca = mode === "verify-full" ? certificateAuthority(environment, url.hostname) : undefined;
  return {
    connectionString: url.toString(),
    ssl: mode === "disable" ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: positiveInteger(environment, "DATABASE_POOL_MAX", 4),
    connectionTimeoutMillis: positiveInteger(environment, "DATABASE_CONNECT_TIMEOUT_MS", 10_000),
    idleTimeoutMillis: positiveInteger(environment, "DATABASE_IDLE_TIMEOUT_MS", 30_000),
    statement_timeout: positiveInteger(environment, "DATABASE_STATEMENT_TIMEOUT_MS", 15_000),
    query_timeout: positiveInteger(environment, "DATABASE_QUERY_TIMEOUT_MS", 20_000),
    application_name: "archive",
  };
}
