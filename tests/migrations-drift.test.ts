import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"

describe("auth migrations drift", () => {
  it("src/schema matches the shipped migrations (db:check:auth is clean)", () => {
    // Throws if drizzle-kit emits a new migration or leaves migrations/ dirty.
    expect(() =>
      execFileSync("npm", ["run", "db:check:auth"], { stdio: "pipe" }),
    ).not.toThrow()
  })
})
