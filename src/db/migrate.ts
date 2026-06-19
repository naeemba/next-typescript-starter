import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { drizzle } from "drizzle-orm/postgres-js"
import type * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

/** Name of the journal table for the package-owned auth migration track.
 *  Distinct from the consumer's `__drizzle_migrations` so the two tracks
 *  never collide. */
export const AUTH_MIGRATIONS_TABLE = "__next_starter_migrations"

/**
 * Absolute path to the `migrations/` folder shipped in the package.
 *
 * This module bundles to `dist/db/index.js`; the shipped folder is the
 * package-root sibling `migrations/`, i.e. two levels up. Migrations run in
 * Node (the CLI or a deploy hook), never inside the Next bundle, so
 * `import.meta.url` resolution is reliable here (unlike the optional-peer
 * loader, which works around Turbopack-virtualized URLs).
 */
export function resolveMigrationsFolder(): string {
  const folder = fileURLToPath(new URL("../../migrations", import.meta.url))
  if (!existsSync(folder)) {
    throw new Error(
      `[@naeemba/next-starter] Could not locate the bundled migrations folder.\n` +
        `  Resolved to: ${folder}\n` +
        `  This indicates a broken package install or an unexpected bundle layout.`,
    )
  }
  return folder
}

export interface MigrateAuthOptions {
  /** Override the migrations folder (tests, monorepo layouts). Defaults to
   *  the package's shipped `migrations/`. */
  migrationsFolder?: string
}

/**
 * Apply pending package-owned auth migrations against `db`. Idempotent:
 * migrations already recorded in `__next_starter_migrations` are skipped.
 */
export async function migrateAuth(db: Db, opts: MigrateAuthOptions = {}): Promise<void> {
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder()
  await migrate(db, { migrationsFolder, migrationsTable: AUTH_MIGRATIONS_TABLE })
}
