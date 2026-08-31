import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { drizzle } from "drizzle-orm/postgres-js"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import {
  baselineAuth,
  migrateAuth,
  resolveMigrationsFolder,
  AUTH_MIGRATIONS_TABLE,
  BASELINE_EFFECT_CHECKS,
} from "../src/db/migrate.js"
import * as schema from "../src/schema/index.js"

// Both suites here take exclusive ownership of the auth tables, so they share
// one file: vitest runs files in parallel but the tests inside one in order.
const url = process.env.DATABASE_URL
const d = url ? describe : describe.skip

// The same read `baselineAuth` and the real migrator make, so these tests
// follow drizzle's journal order instead of hardcoding its random filenames.
const migrations = readMigrationFiles({ migrationsFolder: resolveMigrationsFolder() })

type Database = ReturnType<typeof drizzle<typeof schema>>

let client: ReturnType<typeof postgres>
let db: Database

beforeAll(() => {
  if (!url) return
  client = postgres(url, { max: 1 })
  db = drizzle(client, { schema })
})

afterAll(async () => {
  await client?.end({ timeout: 5 })
})

/** Back to nothing: no auth tables, no journal. */
async function dropAuth(database: Database): Promise<void> {
  await database.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  await database.execute(
    sql`DROP TABLE IF EXISTS "passkey","verification","account","session","user" CASCADE`,
  )
}

async function hasIssuerColumn(): Promise<boolean> {
  const columns = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'account'
       AND column_name = 'issuer'
  `)
  return (columns as unknown as unknown[]).length > 0
}

// A migration with no entry in the map is baselined blind — recorded as
// already-applied without anything proving its DDL ever ran. That is the exact
// bug this suite exists for, so a new migration without a check fails here
// rather than in a consumer's production. 0000 needs none: baselineAuth's
// canonical-table probe already proves it ran.
describe("BASELINE_EFFECT_CHECKS", () => {
  it("accounts for every shipped migration after 0000", () => {
    const checked = Object.keys(BASELINE_EFFECT_CHECKS)
      .map(Number)
      .sort((a, b) => a - b)
    expect(checked).toEqual(migrations.map((_, index) => index).slice(1))
  })
})

d("baselineAuth (integration)", () => {
  beforeAll(async () => {
    // Simulate an app that already created the auth tables the OLD way and
    // has NO package journal yet.
    await dropAuth(db)
    await migrateAuth(db) // create tables + journal as a real fresh install would
    // Now wipe ONLY the journal to mimic a pre-0.8.0 app (tables exist, no journal).
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  })

  it("records all shipped migrations without re-running DDL", async () => {
    const result = await baselineAuth(db)
    expect(result.inserted).toBe(migrations.length)
    expect(result.pending).toBe(0)
    const rows = await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM "drizzle"."${AUTH_MIGRATIONS_TABLE}"`),
    )
    const firstRow = (rows as unknown as { n: number }[])[0]
    expect(firstRow?.n).toBe(result.inserted)
  })

  it("is idempotent — a second baseline inserts nothing", async () => {
    const result = await baselineAuth(db)
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBe(migrations.length)
  })

  it("leaves migrateAuth as a clean no-op afterward", async () => {
    await expect(migrateAuth(db)).resolves.toBeUndefined()
  })

  it("refuses to baseline when the canonical auth table is absent", async () => {
    // Mimic a fresh/empty DB or a wrong DATABASE_URL: no auth tables, no journal.
    await dropAuth(db)
    await expect(baselineAuth(db)).rejects.toThrow(/public\.user.*does not exist/s)
    // Recreate tables so the suite leaves the DB in a sane state.
    await migrateAuth(db)
  })

  // A pre-0.8.0 app's tables were created before better-auth needed
  // `account.issuer`. Baselining past that migration would record DDL that
  // never ran, and the miss would only show up as a failed sign-in.
  it("stops baselining at a migration the database does not already have", async () => {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql`ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer" CASCADE`)

    const result = await baselineAuth(db)
    expect(result.inserted).toBe(1) // 0000 only; 0001 adds the missing column
    expect(result.pending).toBe(migrations.length - 1)

    await migrateAuth(db)
    expect(await hasIssuerColumn()).toBe(true)
  })

  // An operator who followed better-auth's own upgrade guide and ran
  // `ALTER TABLE account ADD COLUMN issuer text` by hand has the column but not
  // the unique index. Recording 0001 there would leave two Google accounts free
  // to share one (issuer, account_id) — one identity, two users — and plain
  // `migrate` cannot rescue it either: its first statement re-adds a column
  // that is already there. So refuse, and name what is missing.
  it("refuses when the column exists but the migration's index does not", async () => {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql`DROP INDEX IF EXISTS "account_issuer_account_id_idx"`)

    await expect(baselineAuth(db)).rejects.toThrow(
      /only partly applied.*account_issuer_account_id_idx/s,
    )
    // 0001 was not recorded, so creating the index by hand and re-running
    // finishes the baseline — the operator is not left stuck.
    await db.execute(sql`
      CREATE UNIQUE INDEX "account_issuer_account_id_idx"
        ON "account" ("issuer", "account_id")
    `)
    const result = await baselineAuth(db)
    expect(result.inserted + result.skipped).toBe(migrations.length)
    expect(result.pending).toBe(0)

    // Leave the database whole for whoever runs next.
    await dropAuth(db)
    await migrateAuth(db)
  })
})

/** Drizzle wraps driver errors and a transaction wraps them again; the Postgres
 *  message can sit at any depth, so match against the whole chain. */
function causeMessage(err: unknown): string {
  const messages: string[] = []
  let current: unknown = err
  while (current && messages.length < 10) {
    messages.push(String((current as Error).message ?? ""))
    current = (current as { cause?: unknown }).cause
  }
  return messages.join("\n")
}

d("account.issuer backfill (integration)", () => {
  // The real migrator wraps a migration's statements in one transaction
  // (`PgDialect.migrate` → `session.transaction`), so a failure rolls the whole
  // thing back. Running them the same way here is what lets the failure tests
  // assert what an operator actually ends up with.
  const run = (index: number) =>
    db.transaction(async (tx) => {
      for (const statement of migrations[index]!.sql) {
        await tx.execute(sql.raw(statement))
      }
    })

  // Every test here starts from the pre-1.7 schema, and the last one leaves a
  // failed migration behind: tables present, journal gone. Hand the database
  // back fully migrated so whoever owns it next — a dev running the example
  // after `npm test` — finds it the way a fresh install leaves it.
  afterAll(async () => {
    await dropAuth(db)
    await migrateAuth(db)
  })

  // Start from the pre-1.7 schema every time: 0000 only, no issuer column.
  beforeEach(async () => {
    await dropAuth(db)
    await run(0)
    await db.execute(sql`INSERT INTO "user" (id, email) VALUES ('u1', 'a@example.com')`)
  })

  it("maps google rows to Google's own OIDC issuer", async () => {
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id)
      VALUES ('a1', 'u1', 'google-subject-1', 'google')
    `)

    await run(1)

    const rows = await db.execute(sql`SELECT issuer FROM "account" WHERE id = 'a1'`)
    expect((rows as unknown as { issuer: string }[])[0]?.issuer).toBe(
      "https://accounts.google.com",
    )
  })

  it("applies cleanly to a database with no account rows", async () => {
    await expect(run(1)).resolves.toBeUndefined()
  })

  it("refuses to guess an issuer for a provider it did not create", async () => {
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id)
      VALUES ('a1', 'u1', 'github-1', 'github')
    `)

    await expect(run(1).catch(causeMessage)).resolves.toMatch(
      /Cannot backfill account\.issuer for provider_id\(s\): github/,
    )
    // The whole migration rolls back, so the operator is left on the schema
    // they started from rather than half-migrated.
    expect(await hasIssuerColumn()).toBe(false)
  })

  it("rejects two accounts sharing one (issuer, accountId)", async () => {
    await db.execute(sql`INSERT INTO "user" (id, email) VALUES ('u2', 'b@example.com')`)
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id) VALUES
        ('a1', 'u1', 'google-subject-1', 'google'),
        ('a2', 'u2', 'google-subject-1', 'google')
    `)

    await expect(run(1).catch(causeMessage)).resolves.toMatch(
      /account_issuer_account_id_idx/,
    )
    expect(await hasIssuerColumn()).toBe(false)
  })
})
