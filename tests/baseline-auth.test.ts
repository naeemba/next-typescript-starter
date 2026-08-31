import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import { baselineAuth, migrateAuth, AUTH_MIGRATIONS_TABLE } from "../src/db/migrate.js"
import * as schema from "../src/schema/index.js"

// Both suites here take exclusive ownership of the auth tables, so they share
// one file: vitest runs files in parallel but the tests inside one in order.
const url = process.env.DATABASE_URL
const d = url ? describe : describe.skip

const migrationsDir = join(import.meta.dirname, "..", "migrations")

d("baselineAuth (integration)", () => {
  let client: ReturnType<typeof postgres>
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeAll(async () => {
    client = postgres(url!, { max: 1 })
    db = drizzle(client, { schema })
    // Simulate an app that already created the auth tables the OLD way and
    // has NO package journal yet.
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql.raw(
      `DROP TABLE IF EXISTS "passkey","verification","account","session","user" CASCADE`,
    ))
    await migrateAuth(db) // create tables + journal as a real fresh install would
    // Now wipe ONLY the journal to mimic a pre-0.8.0 app (tables exist, no journal).
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  })

  afterAll(async () => {
    await client.end({ timeout: 5 })
  })

  it("records all shipped migrations without re-running DDL", async () => {
    const result = await baselineAuth(db)
    expect(result.inserted).toBeGreaterThan(0)
    const rows = await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM "drizzle"."${AUTH_MIGRATIONS_TABLE}"`),
    )
    const firstRow = (rows as unknown as { n: number }[])[0]
    expect(firstRow?.n).toBe(result.inserted)
  })

  it("is idempotent — a second baseline inserts nothing", async () => {
    const result = await baselineAuth(db)
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
  })

  it("leaves migrateAuth as a clean no-op afterward", async () => {
    await expect(migrateAuth(db)).resolves.toBeUndefined()
  })

  it("refuses to baseline when the canonical auth table is absent", async () => {
    // Mimic a fresh/empty DB or a wrong DATABASE_URL: no auth tables, no journal.
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql.raw(
      `DROP TABLE IF EXISTS "passkey","verification","account","session","user" CASCADE`,
    ))
    await expect(baselineAuth(db)).rejects.toThrow(/public\.user.*does not exist/s)
    // Recreate tables so the suite leaves the DB in a sane state.
    await migrateAuth(db)
  })

  // A pre-0.8.0 app's tables were created before better-auth needed
  // `account.issuer`. Baselining past that migration would record DDL that
  // never ran, and the miss would only show up as a failed sign-in.
  it("stops baselining at a migration the database does not already have", async () => {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql`ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer"`)

    const result = await baselineAuth(db)
    expect(result.inserted).toBe(1) // 0000 only; 0001 adds the missing column

    await migrateAuth(db)
    const cols = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'account'
         AND column_name = 'issuer'
    `)
    expect((cols as unknown as unknown[]).length).toBe(1)
  })
})

/** Drizzle wraps driver errors; the Postgres message is one level down. */
function causeMessage(err: unknown): string {
  const cause = (err as { cause?: unknown }).cause
  return String((cause as { message?: string })?.message ?? (err as Error).message)
}

function statements(file: string): string[] {
  return readFileSync(join(migrationsDir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)
}

d("account.issuer backfill (integration)", () => {
  let client: ReturnType<typeof postgres>
  let db: ReturnType<typeof drizzle<typeof schema>>

  const run = async (file: string) => {
    for (const statement of statements(file)) {
      await db.execute(sql.raw(statement))
    }
  }

  beforeAll(() => {
    client = postgres(url!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end({ timeout: 5 })
  })

  // Start from the pre-1.7 schema every time: 0000 only, no issuer column.
  beforeEach(async () => {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(
      sql.raw(`DROP TABLE IF EXISTS "passkey","verification","account","session","user" CASCADE`),
    )
    await run("0000_magenta_old_lace.sql")
    await db.execute(sql`INSERT INTO "user" (id, email) VALUES ('u1', 'a@example.com')`)
  })

  it("maps google rows to Google's own OIDC issuer", async () => {
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id)
      VALUES ('a1', 'u1', 'google-subject-1', 'google')
    `)

    await run("0001_brave_black_crow.sql")

    const rows = await db.execute(sql`SELECT issuer FROM "account" WHERE id = 'a1'`)
    expect((rows as unknown as { issuer: string }[])[0]?.issuer).toBe(
      "https://accounts.google.com",
    )
  })

  it("applies cleanly to a database with no account rows", async () => {
    await expect(run("0001_brave_black_crow.sql")).resolves.toBeUndefined()
  })

  it("refuses to guess an issuer for a provider it did not create", async () => {
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id)
      VALUES ('a1', 'u1', 'github-1', 'github')
    `)

    // Drizzle wraps the driver error, so the provider name is on the cause.
    await expect(run("0001_brave_black_crow.sql").catch(causeMessage)).resolves.toMatch(
      /Cannot backfill account\.issuer for provider_id\(s\): github/,
    )
  })

  it("rejects two accounts sharing one (issuer, accountId)", async () => {
    await db.execute(sql`INSERT INTO "user" (id, email) VALUES ('u2', 'b@example.com')`)
    await db.execute(sql`
      INSERT INTO "account" (id, user_id, account_id, provider_id) VALUES
        ('a1', 'u1', 'google-subject-1', 'google'),
        ('a2', 'u2', 'google-subject-1', 'google')
    `)

    await expect(run("0001_brave_black_crow.sql").catch(causeMessage)).resolves.toMatch(
      /account_issuer_account_id_idx/,
    )
  })
})
