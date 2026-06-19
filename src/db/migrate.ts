import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { sql } from "drizzle-orm"
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
 * Rather than relying on a fixed relative path (which differs between the
 * source layout `src/db/migrate.ts` and the tsup flat-chunk build
 * `dist/chunk-*.js`), we walk up from the module's own directory until we
 * find an ancestor that contains `migrations/meta/_journal.json`. This
 * works for source, any built layout, and an installed package.
 *
 * Migrations run in Node (the CLI or a deploy hook), never inside the Next
 * bundle, so `import.meta.url` resolution is reliable here.
 */
export function resolveMigrationsFolder(): string {
  const startDir = dirname(fileURLToPath(import.meta.url))
  const candidates: string[] = []
  let dir = startDir
  for (let i = 0; i <= 5; i++) {
    const candidate = join(dir, "migrations")
    candidates.push(candidate)
    if (existsSync(join(candidate, "meta", "_journal.json"))) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  throw new Error(
    `[@naeemba/next-starter] Could not locate the bundled migrations folder.\n` +
      `  Searched (migrations/meta/_journal.json) in:\n` +
      candidates.map((c) => `    ${c}`).join("\n") +
      `\n  This indicates a broken package install or an unexpected bundle layout.`,
  )
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

/**
 * Mark the shipped auth migrations as already-applied WITHOUT running their
 * DDL. For existing apps (pre-0.8.0) whose auth tables were created by the
 * old consumer-owned drizzle-kit path: this writes the same journal rows a
 * fresh `migrateAuth` would have written, so future `migrateAuth` calls skip
 * everything up to this point and apply only genuinely-new migrations.
 *
 * Idempotent: rows whose hash is already present are left untouched.
 *
 * Mirrors the drizzle postgres-js migrator's own bookkeeping: schema
 * `drizzle`, table `__next_starter_migrations(id serial pk, hash text,
 * created_at bigint)`, one row per migration with created_at = folderMillis.
 */
export async function baselineAuth(
  db: Db,
  opts: MigrateAuthOptions = {},
): Promise<{ inserted: number; skipped: number }> {
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder()
  const migrations = readMigrationFiles({ migrationsFolder })

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS "drizzle"."${AUTH_MIGRATIONS_TABLE}" ` +
        `(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    ),
  )

  let inserted = 0
  let skipped = 0
  for (const m of migrations) {
    const existing = await db.execute(
      sql.raw(
        `SELECT 1 FROM "drizzle"."${AUTH_MIGRATIONS_TABLE}" WHERE hash = '${m.hash}' LIMIT 1`,
      ),
    )
    if ((existing as unknown as unknown[]).length > 0) {
      skipped++
      continue
    }
    await db.execute(
      sql.raw(
        `INSERT INTO "drizzle"."${AUTH_MIGRATIONS_TABLE}" (hash, created_at) ` +
          `VALUES ('${m.hash}', ${m.folderMillis})`,
      ),
    )
    inserted++
  }
  return { inserted, skipped }
}
