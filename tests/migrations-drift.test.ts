import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"

describe("auth migrations drift", () => {
  it(
    "src/schema matches the shipped migrations (db:check:auth is clean)",
    { timeout: 60_000 },
    () => {
      // Throws if drizzle-kit emits a new migration or leaves migrations/ dirty.
      expect(() => {
        try {
          execFileSync("npm", ["run", "db:check:auth"], { stdio: "pipe" })
        } catch (err: unknown) {
          const e = err as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string }
          const detail = [
            e.stderr ? `stderr:\n${e.stderr.toString()}` : "",
            e.stdout ? `stdout:\n${e.stdout.toString()}` : "",
          ]
            .filter(Boolean)
            .join("\n")
          throw new Error(`db:check:auth failed\n${detail}`, { cause: err })
        }
      }).not.toThrow()
    },
  )
})
