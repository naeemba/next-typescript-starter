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
const describeWithDatabase = url ? describe : describe.skip

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

async function hasIndex(name: string): Promise<boolean> {
  const indexes = await db.execute(sql`
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}
  `)
  return (indexes as unknown as unknown[]).length > 0
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

/** Run one shipped migration's statements the way the real migrator does —
 *  all of them in one transaction, so a failure rolls the whole thing back. */
const run = (index: number) =>
  db.transaction(async (tx) => {
    for (const statement of migrations[index]!.sql) {
      await tx.execute(sql.raw(statement))
    }
  })

describeWithDatabase("baselineAuth (integration)", () => {
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

  // A pre-0.8.0 app's tables predate everything after 0000. Baselining past
  // that would record DDL that never ran, and the miss would only show up as a
  // failed sign-in.
  it("stops baselining at a migration the database does not already have", async () => {
    await dropAuth(db)
    await run(0) // 0000 only, no journal — exactly a pre-0.8.0 app

    const result = await baselineAuth(db)
    expect(result.inserted).toBe(1)
    expect(result.pending).toBe(migrations.length - 1)

    // 0001 adds `issuer` and 0002 drops it again. Both still have to run, and
    // what they leave behind is the unique index on (provider_id, account_id).
    await migrateAuth(db)
    expect(await hasIssuerColumn()).toBe(false)
    expect(await hasIndex("account_provider_id_account_id_idx")).toBe(true)
  })

  // An app on 0.11.0 has `account.issuer`, because 0001 shipped there and 0002
  // did not exist yet. If its journal is gone, baseline must not treat it as a
  // pre-0.8.0 database: recording nothing and handing it to `migrate` would run
  // 0001's `ADD COLUMN issuer` against a column that is already there. Half the
  // work is done and half is not, so refuse and name every part that is absent.
  it("refuses when the issuer column is still there from 0001", async () => {
    await dropAuth(db)
    await run(0)
    await run(1)
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)

    await expect(baselineAuth(db)).rejects.toThrow(
      /only partly applied.*removal of column "account"\."issuer".*account_provider_id_account_id_idx/s,
    )

    // Nothing was recorded, so applying the missing half by hand — 0002 itself —
    // and re-running completes the baseline. The operator is not left stuck.
    await run(2)
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

describeWithDatabase("0001 account.issuer backfill (integration)", () => {
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

describeWithDatabase("0002 account.issuer removal (integration)", () => {
  // 0002 undoes 0001. Every test here starts from the schema 0001 leaves.
  beforeEach(async () => {
    await dropAuth(db)
    await run(0)
    await run(1)
    await db.execute(sql`INSERT INTO "user" (id, email) VALUES ('u1', 'a@example.com')`)
  })

  afterAll(async () => {
    await dropAuth(db)
    await migrateAuth(db)
  })

  it("drops the issuer column and moves uniqueness to (providerId, accountId)", async () => {
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id, issuer)
      VALUES ('a1', 'u1', 'google-subject-1', 'google', 'https://accounts.google.com')
    `)

    await run(2)

    expect(await hasIssuerColumn()).toBe(false)
    expect(await hasIndex("account_issuer_account_id_idx")).toBe(false)
    expect(await hasIndex("account_provider_id_account_id_idx")).toBe(true)
  })

  // Two issuers can share one provider_id, so rows 0001's index let through can
  // collide on the key 0002 makes unique. Postgres would report that as a bare
  // constraint violation naming neither the rows nor the fix, so the migration
  // finds them first.
  it("names the duplicate (providerId, accountId) rows that block it", async () => {
    await db.execute(sql`INSERT INTO "user" (id, email) VALUES ('u2', 'b@example.com')`)
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id, issuer) VALUES
        ('a1', 'u1', 'shared-subject', 'work-sso', 'https://one.example.com'),
        ('a2', 'u2', 'shared-subject', 'work-sso', 'https://two.example.com')
    `)

    await expect(run(2).catch(causeMessage)).resolves.toMatch(
      /Duplicate \(provider_id, account_id\) rows block this migration: \(work-sso, shared-subject\)/,
    )
    // The whole migration rolls back, so the operator keeps the schema they
    // started on rather than a half-dropped column.
    expect(await hasIssuerColumn()).toBe(true)
  })
})
