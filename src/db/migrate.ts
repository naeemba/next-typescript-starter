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
 * shipped journal.
 *
 * Baseline exists for apps whose auth tables were created by the pre-0.8.0
 * drizzle-kit path, so their schema matches migration 0000 and nothing after
 * it. Recording a later migration for such a database would skip DDL that
 * never ran — 0001 adds `account.issuer`, which better-auth >=1.7 filters on
 * for every account lookup, so the miss would only show up as a failed
 * sign-in. Baseline therefore stops at the first migration whose effect is
 * absent and lets `migrateAuth` apply that one for real.
 *
 * Each entry must describe the migration's WHOLE effect, not one part of it:
 * a database where the column was added by hand but the unique index never
 * created must not be baselined past it. Position 0 needs no entry — the
 * canonical-table probe below already proves 0000 ran.
 *
 * Every migration after 0000 needs an entry here, or `baselineAuth` records it
 * blind. `tests/baseline-auth.test.ts` fails when one is missing.
 */
export const BASELINE_EFFECT_CHECKS: Record<
  number,
  { table: string; column: string; notNull: boolean; index?: string }
> = {
  1: {
    table: "account",
    column: "issuer",
    notNull: true,
    index: "account_issuer_account_id_idx",
  },
}

type BaselineEffectCheck = (typeof BASELINE_EFFECT_CHECKS)[number]

async function exists(db: Db, query: ReturnType<typeof sql>): Promise<boolean> {
  const rows = await db.execute(query)
  return (rows as unknown as unknown[]).length > 0
}

interface MissingEffect {
  /** The migration's column is absent, so nothing of it ran. */
  columnAbsent: boolean
  /** Human-readable list of every part that is absent. Empty means fully applied. */
  missing: string[]
}

/**
 * Which parts of a migration's effect the database does NOT already have.
 * `missing` empty means the migration is fully applied and safe to record.
 */
async function missingEffect(db: Db, check: BaselineEffectCheck): Promise<MissingEffect> {
  const missing: string[] = []
  let columnAbsent = false

  const columns = await db.execute(sql`
    SELECT is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ${check.table}
       AND column_name = ${check.column}
     LIMIT 1
  `)
  const column = (columns as unknown as Array<{ is_nullable: string }>)[0]
  if (!column) {
    columnAbsent = true
    missing.push(`column "${check.table}"."${check.column}"`)
  } else if (check.notNull && column.is_nullable !== "NO") {
    missing.push(`NOT NULL on "${check.table}"."${check.column}"`)
  }

  if (check.index) {
    const index = sql`
      SELECT 1
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ${check.index}
       LIMIT 1
    `
    if (!(await exists(db, index))) missing.push(`index "${check.index}"`)
  }

  return { columnAbsent, missing }
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
 * stops at the first migration listed in `BASELINE_EFFECT_CHECKS` whose effect
 * is missing, leaving it and everything after it for `migrateAuth` to apply.
 * `pending` reports how many were left that way — 0 when the whole journal was
 * recorded — so callers can tell a complete baseline from a stopped one.
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
): Promise<{ inserted: number; skipped: number; pending: number }> {
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
  let pending = 0
  for (const [index, migration] of migrations.entries()) {
    const check = BASELINE_EFFECT_CHECKS[index]
    if (check) {
      const { columnAbsent, missing } = await missingEffect(db, check)
      // Some of the migration ran and some did not — most often an operator who
      // added the column by hand from better-auth's upgrade guide and never
      // created the index. Recording it would leave the missing half missing
      // forever; `migrateAuth` cannot apply it either, because its first
      // statement re-adds a column that is already there. Only a human can
      // decide, so say exactly what is absent and stop.
      if (missing.length > 0) {
        if (!columnAbsent) {
          throw new Error(
            `[@naeemba/next-starter] Refusing to baseline: migration ${index} is ` +
              `only partly applied to this database.\n` +
              `  Missing: ${missing.join(", ")}.\n` +
              `  baseline records a migration as already-applied without running ` +
              `its DDL, so recording this one would leave the missing part missing ` +
              `for good — and \`migrate\` cannot apply it either, because the part ` +
              `that IS present would make its first statement fail.\n` +
              `  Create the missing object(s) by hand, then re-run ` +
              `\`next-starter migrate baseline\`. See UPGRADING.md.`,
          )
        }
        pending = migrations.length - index
        break
      }
    }

    const alreadyRecorded = await exists(
      db,
      sql.raw(
        `SELECT 1 FROM "drizzle"."${AUTH_MIGRATIONS_TABLE}" WHERE hash = '${migration.hash}' LIMIT 1`,
      ),
    )
    if (alreadyRecorded) {
      skipped++
      continue
    }
    await db.execute(
      sql.raw(
        `INSERT INTO "drizzle"."${AUTH_MIGRATIONS_TABLE}" (hash, created_at) ` +
          `VALUES ('${migration.hash}', ${migration.folderMillis})`,
      ),
    )
    inserted++
  }
  return { inserted, skipped, pending }
}
