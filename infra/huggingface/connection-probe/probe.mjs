import { URL } from "node:url";

export const projectRef = "spffrdgttkhlwgosuvix";

export function candidates(connectionString) {
  const configured = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(configured.protocol))
    throw new Error("INVALID_CONFIG");
  const modes = [["configured", configured]];
  // Test only the user's identified Supabase project, not arbitrary discovered endpoints.
  const suppliedUser = decodeURIComponent(configured.username);
  if (!["postgres", `postgres.${projectRef}`].includes(suppliedUser)) return modes;
  if (
    !["aws-1-ap-south-1.pooler.supabase.com", `db.${projectRef}.supabase.co`].includes(
      configured.hostname,
    )
  )
    return modes;
  for (const [name, host, port, user] of [
    ["session", "aws-1-ap-south-1.pooler.supabase.com", "5432", `postgres.${projectRef}`],
    ["transaction", "aws-1-ap-south-1.pooler.supabase.com", "6543", `postgres.${projectRef}`],
    ["direct", `db.${projectRef}.supabase.co`, "5432", "postgres"],
  ]) {
    const url = new URL(configured);
    url.hostname = host;
    url.port = port;
    url.username = user;
    if (url.toString() !== configured.toString()) modes.push([name, url]);
    else modes[0][0] = `configured-${name}`;
  }
  return modes;
}

export function failureCode(error) {
  // Drivers wrap connection errors differently. Inspect locally, but never emit messages.
  const codes = [];
  const messages = [];
  const seen = new Set();
  function inspect(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.code) codes.push(String(value.code));
    if (value.message) messages.push(String(value.message));
    for (const key of ["cause", "originalError", "driverAdapterError", "meta"]) inspect(value[key]);
  }
  inspect(error);
  const message = messages.join(" ");
  if (codes.includes("28P01") || /password authentication failed/i.test(message))
    return "AUTH_FAILED";
  if (/circuit breaker/i.test(message)) return "POOLER_BLOCKED";
  if (
    codes.some((code) => /CERT|SELF_SIGNED|VERIFY_LEAF|ISSUER/.test(code)) ||
    /certificate/i.test(message)
  )
    return "TLS_ERROR";
  if (codes.some((code) => ["ENOTFOUND", "EAI_AGAIN"].includes(code))) return "DNS_ERROR";
  if (
    codes.some((code) =>
      ["ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ECONNRESET"].includes(code),
    )
  )
    return "NETWORK_ERROR";
  if (
    codes.some((code) => ["ETIMEDOUT", "CONNECT_TIMEOUT"].includes(code)) ||
    /timeout|timed out/i.test(message)
  )
    return "TIMEOUT";
  return "CHECK_FAILED";
}

export const identitySql = "SELECT 1 AS ok, current_setting('transaction_read_only') AS read_only";
export const schemaAuditSql = `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname`;

export function verifyIdentity(rows) {
  if (Number(rows?.[0]?.ok) !== 1 || rows?.[0]?.read_only !== "on")
    throw new Error("READ_ONLY_CHECK_FAILED");
}
