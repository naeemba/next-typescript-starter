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
 * Migrations that `baselineAuth` may only record as already-applied when the
 * database can be shown to already have their effect. Keyed by position in the
 * shipped journal, and each entry names one column the migration adds.
 *
 * Baseline exists for apps whose auth tables were created by the pre-0.8.0
 * drizzle-kit path, so their schema matches migration 0000 and nothing after
 * it. Recording a later migration for such a database would skip DDL that
 * never ran — 0001 adds `account.issuer`, which better-auth >=1.7 filters on
 * for every account lookup, so the miss would only show up as a failed
 * sign-in. Baseline therefore stops at the first migration whose column is
 * absent and lets `migrateAuth` apply that one for real.
 */
const BASELINE_COLUMN_CHECKS: Record<number, { table: string; column: string }> = {
  1: { table: "account", column: "issuer" },
}

async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ${table}
       AND column_name = ${column}
     LIMIT 1
  `)
  return (rows as unknown as unknown[]).length > 0
}

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
 * Only migrations the database demonstrably already has are recorded. Baseline
 * stops at the first migration listed in `BASELINE_COLUMN_CHECKS` whose column
 * is missing, leaving it and everything after it for `migrateAuth` to apply.
 *
 * Mirrors the drizzle postgres-js migrator's own bookkeeping: schema
 * `drizzle`, table `__next_starter_migrations(id serial pk, hash text,
 * created_at bigint)`, one row per migration with created_at = folderMillis.
 *
 * Guards against the silent-footgun case: baselining a database where the
 * auth tables do not actually exist (fresh DB, wrong DATABASE_URL, partial
 * restore) would otherwise record the migrations as applied and make the
 * follow-up `migrateAuth` a no-op, surfacing later as an opaque
 * `relation "user" does not exist` at request time. We probe one canonical
 * table first and refuse with an actionable error if it's absent.
 */
export async function baselineAuth(
  db: Db,
  opts: MigrateAuthOptions = {},
): Promise<{ inserted: number; skipped: number }> {
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder()
  const migrations = readMigrationFiles({ migrationsFolder })

  // Refuse to baseline a database that has not actually been provisioned with
  // the auth tables — recording the journal rows here would silently mask a
  // missing schema. `to_regclass` returns NULL when the table does not exist.
  const probe = await db.execute(
    sql`SELECT to_regclass('public.user') AS table_oid`,
  )
  const probeRows = probe as unknown as Array<{ table_oid: string | null }>
  if (!probeRows[0]?.table_oid) {
    throw new Error(
      `[@naeemba/next-starter] Refusing to baseline: the canonical auth table ` +
        `"public.user" does not exist in this database.\n` +
        `  baseline only records the shipped migrations as already-applied; it ` +
        `does NOT create tables.\n` +
        `  If this is a fresh or empty database, run plain \`migrate\` instead to ` +
        `create the schema.\n` +
        `  Otherwise check that DATABASE_URL points at the database whose auth ` +
        `tables were created by the pre-0.8.0 drizzle-kit path.`,
    )
  }

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS "drizzle"."${AUTH_MIGRATIONS_TABLE}" ` +
        `(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    ),
  )

  let inserted = 0
  let skipped = 0
  for (const [index, m] of migrations.entries()) {
    const check = BASELINE_COLUMN_CHECKS[index]
    if (check && !(await hasColumn(db, check.table, check.column))) break

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
