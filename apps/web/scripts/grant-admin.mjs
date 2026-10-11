import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const adminRole = "archive_admin";

export class AdminSetupError extends Error {}

export function readConfiguration(env) {
  let url;
  try {
    url = new URL(env.ARCHIVE_BOOTSTRAP_SUPABASE_URL ?? "");
  } catch {
    throw new AdminSetupError("Provide the Supabase project URL.");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new AdminSetupError("Use an HTTPS Supabase project origin, not an API path.");
  }
  const secretKey = env.ARCHIVE_BOOTSTRAP_SUPABASE_SECRET_KEY?.trim();
  if (!secretKey || (!secretKey.startsWith("sb_secret_") && !secretKey.startsWith("eyJ"))) {
    throw new AdminSetupError(
      "Provide a server secret key or legacy service_role key, not a publishable key.",
    );
  }
  const userId = env.ARCHIVE_BOOTSTRAP_USER_ID?.trim();
  if (!userId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId)) {
    throw new AdminSetupError(
      "Provide the exact administrator user UUID from Authentication > Users.",
    );
  }
  const email = env.ARCHIVE_BOOTSTRAP_EXPECTED_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminSetupError("Provide the expected email to verify the target account.");
  }
  return { url: url.origin, secretKey, userId, email };
}

function verifyUser(user, configuration) {
  if (
    !user ||
    typeof user.id !== "string" ||
    user.id.toLowerCase() !== configuration.userId.toLowerCase() ||
    user.email?.toLowerCase() !== configuration.email
  ) {
    throw new AdminSetupError(
      "The returned account does not match the supplied UUID and email. No further changes made.",
    );
  }
}

/** Only used by the local bootstrap tool, never by a browser or the application server. */
export async function grantAdministrator(client, configuration, { apply = false } = {}) {
  let lookup;
  try {
    lookup = await client.auth.admin.getUserById(configuration.userId);
  } catch {
    throw new AdminSetupError(
      "Account lookup failed. Check the project, secret key, and connectivity.",
    );
  }
  if (lookup.error) {
    throw new AdminSetupError(
      "Account lookup failed. Check the project, secret key, and user UUID.",
    );
  }
  const user = lookup.data?.user;
  verifyUser(user, configuration);
  const metadata = user.app_metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new AdminSetupError("Existing app_metadata is malformed; refusing to overwrite it.");
  }
  const roles = metadata.roles ?? [];
  if (!Array.isArray(roles) || roles.some((role) => typeof role !== "string")) {
    throw new AdminSetupError(
      "Existing roles must be an array of strings; refusing to overwrite them.",
    );
  }
  if (roles.includes(adminRole)) return { status: "already-present" };
  if (!apply) return { status: "dry-run" };

  let update;
  try {
    update = await client.auth.admin.updateUserById(configuration.userId, {
      app_metadata: { ...metadata, roles: [...roles, adminRole] },
    });
  } catch {
    throw new AdminSetupError(
      "Role update failed or its outcome is unknown. Run dry-run to check before retrying.",
    );
  }
  if (update.error) {
    throw new AdminSetupError(
      "Role update failed or its outcome is unknown. Run dry-run to check before retrying.",
    );
  }
  verifyUser(update.data?.user, configuration);
  if (!update.data.user.app_metadata?.roles?.includes(adminRole)) {
    throw new AdminSetupError(
      "The response did not confirm the role. Run dry-run to check before retrying.",
    );
  }
  return { status: "applied" };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "Local administrator bootstrap. Default: read-only dry-run. Use --apply to grant archive_admin.\n" +
        "Recommended: run grant-admin.ps1; it prompts for the secret without echoing or saving it.\n" +
        "Configuration: ARCHIVE_BOOTSTRAP_SUPABASE_URL, ARCHIVE_BOOTSTRAP_SUPABASE_SECRET_KEY,\n" +
        "ARCHIVE_BOOTSTRAP_USER_ID, ARCHIVE_BOOTSTRAP_EXPECTED_EMAIL (child-process environment only).\n",
    );
    return;
  }
  if (args.some((arg) => arg !== "--apply") || args.length > 1) {
    throw new AdminSetupError(
      "Only --apply or --help is accepted; never pass secrets as command arguments.",
    );
  }
  const configuration = readConfiguration(process.env);
  const client = createClient(configuration.url, configuration.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, options) =>
        globalThis.fetch(input, {
          ...options,
          redirect: "error",
          signal: globalThis.AbortSignal.timeout(15_000),
        }),
    },
  });
  const result = await grantAdministrator(client, configuration, {
    apply: args.includes("--apply"),
  });
  const messages = {
    "dry-run": "DRY RUN: account matched. Would append archive_admin; no account was changed.",
    "already-present": "archive_admin is already present. No account was changed.",
    applied: "archive_admin added. Sign out and sign in again to obtain a new user JWT.",
  };
  process.stdout.write(`${messages[result.status]}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Never print SDK error payloads, tokens, request headers, or the whole environment.
    process.stderr.write(
      `${error instanceof AdminSetupError ? error.message : "Setup failed; sensitive error details were suppressed."}\n`,
    );
    process.exitCode = 1;
  });
}
