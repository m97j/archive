import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Generation does not connect. Never expose real credentials to Docker build steps.
  datasource: { url: "postgresql://unused:unused@127.0.0.1:5432/unused" },
});
