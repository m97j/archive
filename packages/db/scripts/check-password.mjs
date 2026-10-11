import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clearTimeout } from "node:timers";

const projectRef = "spffrdgttkhlwgosuvix";
const poolerHost = "aws-1-ap-south-1.pooler.supabase.com";

export function connectionOptions(password, { mode = "session", ca } = {}) {
  if (typeof password !== "string" || password.length === 0 || password.length > 4096) {
    throw Object.assign(new Error("Invalid input"), { code: "CHECK_INPUT" });
  }
  if (!["session", "direct", "transaction"].includes(mode)) {
    throw Object.assign(new Error("Invalid mode"), { code: "CHECK_INPUT" });
  }
  return {
    host: mode === "direct" ? `db.${projectRef}.supabase.co` : poolerHost,
    port: mode === "transaction" ? 6543 : 5432,
    user: mode === "direct" ? "postgres" : `postgres.${projectRef}`,
    database: "postgres",
    password,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    application_name: "archive-password-check",
  };
}

export function failureStatus(error) {
  // Server messages are inspected locally but NEVER included in output.
  if (/circuit breaker/i.test(error?.message ?? ""))
    return "BLOCKED: stop attempts; check the pooler/network ban status.";
  if (error?.code === "28P01")
    return "AUTH_FAILED: credentials rejected; verify username/password (or pooler state after rotation).";
  if (error?.code === "CHECK_INPUT")
    return "INPUT_ERROR: empty password or invalid mode; no connection attempted.";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(error?.code))
    return "DNS_ERROR: password correctness is unknown.";
  if (["ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET"].includes(error?.code))
    return "NETWORK_ERROR: check connectivity, project status, or bans; password correctness is unknown.";
  if (
    [
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(error?.code)
  )
    return "TLS_ERROR: use the trusted Supabase root certificate via -CertificatePath; password correctness is unknown.";
  if (error?.code === "ETIMEDOUT" || /timeout|timed out/i.test(error?.message ?? ""))
    return "TIMEOUT: password correctness is unknown.";
  return "CHECK_FAILED: unconfirmed; sensitive error details were suppressed.";
}

export async function checkPassword(password, { Client, mode, ca } = {}) {
  const client = new Client(connectionOptions(password, { mode, ca }));
  client.on?.("error", () => {
    // Do not print driver errors that could contain connection credentials.
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query(
      "SELECT current_user AS db_user, current_database() AS db_name",
    );
    await client.query("ROLLBACK");
    if (result.rows?.[0]?.db_user !== "postgres" || result.rows?.[0]?.db_name !== "postgres") {
      throw new Error("Unexpected database identity");
    }
    return "SUCCESS: password accepted; read-only query completed (user=postgres, database=postgres).";
  } finally {
    // Disconnect also rolls back any unfinished read-only transaction.
    await client.end().catch(() => {
      // A disconnect failure must not leak details or mask the sanitized result.
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--check-dependency")) {
    process.stderr.write("Use check-password.ps1. Never pass a password as an argument.\n");
    process.exitCode = 2;
    return;
  }
  let Client;
  try {
    const pg = await import("pg");
    Client = pg.Client ?? pg.default?.Client;
    if (!Client) throw new Error("Missing client");
  } catch {
    process.stderr.write("DEPENDENCY_MISSING: install workspace dependencies before checking.\n");
    process.exitCode = 2;
    return;
  }
  if (args[0] === "--check-dependency") {
    process.stdout.write("PostgreSQL driver available.\n");
    return;
  }
  const deadline = setTimeout(() => {
    process.stderr.write("TIMEOUT: check stopped; password correctness is unknown.\n");
    process.exit(2);
  }, 30000);
  try {
    const { password } = JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
    const caFile = process.env.ARCHIVE_DB_CHECK_CA_FILE;
    const ca = caFile ? readFileSync(caFile, "utf8") : undefined;
    const status = await checkPassword(password, {
      Client,
      mode: process.env.ARCHIVE_DB_CHECK_MODE ?? "session",
      ca,
    });
    process.stdout.write(`${status}\n`);
  } catch (error) {
    process.stderr.write(`${failureStatus(error)}\n`);
    process.exitCode = 2;
  } finally {
    clearTimeout(deadline);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
