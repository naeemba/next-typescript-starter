import { describe, it, expect } from "vitest"
import { createDb } from "../src/db/index"

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
