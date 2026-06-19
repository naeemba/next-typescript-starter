import { defineConfig } from "drizzle-kit"

// Repo-internal ONLY. Generates the canonical auth migration lineage from
// src/schema in isolation (no consumer tables). The output `migrations/`
// folder is what ships in the npm package and what `migrateAuth` applies.
// Consumers never run this config.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
})
