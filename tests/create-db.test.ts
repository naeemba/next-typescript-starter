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

  it("ignores DATABASE_PREPARE values other than 'true'/'false'", () => {
    expect(createDbOptionsFromEnv({ DATABASE_PREPARE: "yes" })).toEqual({})
  })

  it("parses DATABASE_POOL_MAX and DATABASE_IDLE_TIMEOUT as numbers", () => {
    expect(
      createDbOptionsFromEnv({ DATABASE_POOL_MAX: "20", DATABASE_IDLE_TIMEOUT: "30" }),
    ).toEqual({ max: 20, idleTimeout: 30 })
  })

  it("drops non-numeric pool sizes silently", () => {
    expect(createDbOptionsFromEnv({ DATABASE_POOL_MAX: "not-a-number" })).toEqual({})
  })

  it("rejects negative pool sizes and timeouts", () => {
    expect(createDbOptionsFromEnv({ DATABASE_POOL_MAX: "-1" })).toEqual({})
  })
})
