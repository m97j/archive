import { defineConfig } from "drizzle-kit";
import { databasePoolConfig } from "./src/runtime-config.js";

const connection = databasePoolConfig(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "../../supabase/migrations",
  dbCredentials: {
    url: connection.connectionString,
    ssl: connection.ssl,
  },
  strict: true,
  verbose: true,
});
