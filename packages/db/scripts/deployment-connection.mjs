import { URL } from "node:url";

export function deploymentConnection(environment = process.env) {
  if (environment.DATABASE_URL?.trim()) return environment.DATABASE_URL;
  // Support the pre-existing GitHub database-password secret without exposing or assuming
  // its encoding. This fallback is restricted to the explicit production pooler identity.
  if (
    !environment.POSTGRES_PASSWORD ||
    !environment.ARCHIVE_DATABASE_HOST ||
    !environment.ARCHIVE_DATABASE_USER
  )
    throw new Error("DEPLOYMENT_DATABASE_CREDENTIAL_REQUIRED");
  const url = new URL("postgresql://" + environment.ARCHIVE_DATABASE_HOST + ":5432/postgres");
  url.username = environment.ARCHIVE_DATABASE_USER;
  url.password = environment.POSTGRES_PASSWORD;
  return url.toString();
}
