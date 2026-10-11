import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";
import { databasePoolConfig, type DatabaseEnvironment } from "./runtime-config.js";

export * from "./schema/index.js";
export * from "./outbox.js";
export * from "./publication.js";
export * from "./jobs.js";
export * from "./public-content.js";
export * from "./workflow.js";
export * from "./taxonomy.js";
export * from "./knowledge.js";
export * from "./catalog.js";
export * from "./navigation.js";
export * from "./admin-content.js";
export * from "./content-access.js";
export { schema };
export { databasePoolConfig } from "./runtime-config.js";

export type ArchiveDatabase = ReturnType<typeof createDatabase>["db"];

export interface DatabaseOptions {
  connectionString?: string;
  pool?: PoolConfig;
}

/**
 * Creates a PostgreSQL pool and a typed Drizzle client. The connection string works with
 * direct PostgreSQL and Supabase pooler URLs; TLS and pool tuning remain caller-controlled.
 */
export function createDatabase(options: DatabaseOptions = {}) {
  const pool = new Pool({
    ...(options.connectionString === undefined
      ? {}
      : { connectionString: options.connectionString }),
    ...options.pool,
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

export function createDatabaseFromEnvironment(environment: DatabaseEnvironment = process.env) {
  const connectionString = environment.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error("DATABASE_URL is required");
  return createDatabase({ pool: databasePoolConfig(connectionString, environment) });
}
