import { describe, it, expect } from "vitest"
import { createDb, createDbOptionsFromEnv } from "../src/db/index"

describe("createDb", () => {
  it("returns a drizzle client when given a valid URL", () => {
    const db = createDb("postgres://user:pass@localhost:5432/db")
    expect(db).toBeDefined()
    expect(typeof db.select).toBe("function")
  })

  it("throws when given an empty URL", () => {
    expect(() => createDb("")).toThrow(/DATABASE_URL|connection/i)
  })

  it("accepts prepare: false for pgBouncer transaction-pool compatibility", () => {
    const db = createDb("postgres://user:pass@localhost:5432/db", { prepare: false })
    expect(db).toBeDefined()
  })

  it("accepts max and idleTimeout overrides", () => {
    const db = createDb("postgres://user:pass@localhost:5432/db", {
      max: 5,
      idleTimeout: 60,
    })
    expect(db).toBeDefined()
  })
})

describe("createDbOptionsFromEnv", () => {
  it("returns an empty options object when no tuning env vars are set", () => {
    expect(createDbOptionsFromEnv({})).toEqual({})
  })

  it("reads DATABASE_PREPARE=false as prepare:false (Supabase/Neon pooler)", () => {
    expect(createDbOptionsFromEnv({ DATABASE_PREPARE: "false" })).toEqual({ prepare: false })
  })

  it("reads DATABASE_PREPARE=true as prepare:true", () => {
    expect(createDbOptionsFromEnv({ DATABASE_PREPARE: "true" })).toEqual({ prepare: true })
  })

  // The `import { db }` proxy goes through createDbOptionsFromEnv only — it
  // never touches parseEnv. A silent drop on a typo'd DATABASE_PREPARE=fals
  // would default back to prepare:true and ship prepared statements to a
  // transaction-pool pgBouncer in prod. Fail loud at boot instead.
  it("throws when DATABASE_PREPARE is not 'true' or 'false'", () => {
    expect(() => createDbOptionsFromEnv({ DATABASE_PREPARE: "yes" })).toThrow(
      /DATABASE_PREPARE.*true.*false/,
    )
    expect(() => createDbOptionsFromEnv({ DATABASE_PREPARE: "fals" })).toThrow(/DATABASE_PREPARE/)
  })

  it("parses DATABASE_POOL_MAX and DATABASE_IDLE_TIMEOUT as numbers", () => {
    expect(
      createDbOptionsFromEnv({ DATABASE_POOL_MAX: "20", DATABASE_IDLE_TIMEOUT: "30" }),
    ).toEqual({ max: 20, idleTimeout: 30 })
  })

  it("throws on a non-numeric DATABASE_POOL_MAX", () => {
    expect(() => createDbOptionsFromEnv({ DATABASE_POOL_MAX: "not-a-number" })).toThrow(
      /DATABASE_POOL_MAX/,
    )
  })

  it("throws when DATABASE_POOL_MAX is zero or negative", () => {
    expect(() => createDbOptionsFromEnv({ DATABASE_POOL_MAX: "-1" })).toThrow(/DATABASE_POOL_MAX/)
    expect(() => createDbOptionsFromEnv({ DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/)
  })

  it("throws on a non-numeric or non-positive DATABASE_IDLE_TIMEOUT", () => {
    expect(() => createDbOptionsFromEnv({ DATABASE_IDLE_TIMEOUT: "abc" })).toThrow(
      /DATABASE_IDLE_TIMEOUT/,
    )
    expect(() => createDbOptionsFromEnv({ DATABASE_IDLE_TIMEOUT: "-1" })).toThrow(
      /DATABASE_IDLE_TIMEOUT/,
    )
  })

  // postgres.js treats idle_timeout=0 as "never close idle connections" — the
  // exact footgun the createDb JSDoc warns against. Accepting a typo'd 0
  // would silently re-enable the connection-leak mode this env var exists to
  // override. Reject it at boot with a message explaining the trap.
  it("throws on DATABASE_IDLE_TIMEOUT=0 (postgres.js no-timeout footgun)", () => {
    expect(() => createDbOptionsFromEnv({ DATABASE_IDLE_TIMEOUT: "0" })).toThrow(
      /DATABASE_IDLE_TIMEOUT.*positive integer/,
    )
  })
})
