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
})
