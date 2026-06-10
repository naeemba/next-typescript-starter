import { defineConfig } from "drizzle-kit"
import { realpathSync } from "node:fs"
import { resolve } from "node:path"

// @naeemba/next-starter is a workspace symlink pointing at the repo root.
// drizzle-kit does not follow symlinks when resolving schema paths, so we
// resolve the real path manually. We navigate from this config file's directory
// up to the root node_modules, resolve the symlink, then point at the TS source.
const pkgRealPath = realpathSync(
  resolve(__dirname, "../../node_modules/@naeemba/next-starter")
)
const schemaPath = resolve(pkgRealPath, "src/schema/index.ts")

export default defineConfig({
  schema: schemaPath,
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
