import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import { baselineAuth, migrateAuth, AUTH_MIGRATIONS_TABLE } from "../src/db/migrate.js"
import * as schema from "../src/schema/index.js"

const url = process.env.DATABASE_URL
const d = url ? describe : describe.skip

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
})
