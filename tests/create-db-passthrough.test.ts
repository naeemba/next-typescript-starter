import { describe, it, expect, vi, beforeEach } from "vitest"

// Hoisted mocks — spy on the postgres() factory to assert exactly what
// reaches the driver, and short-circuit the drizzle wrapper so the spy
// can return a minimal stub. Without the drizzle mock, postgres-js
// `client.options.parsers` is null and drizzle blows up during init.
vi.mock("postgres", () => {
  const postgres = vi.fn(() => ({ end: vi.fn(), unsafe: vi.fn() }))
  return { default: postgres }
})
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({ select: vi.fn(), insert: vi.fn(), $client: {} })),
}))

import postgres from "postgres"
import { createDb } from "../src/db/index"

const URL = "postgres://u:p@h:5432/d"

beforeEach(() => {
  vi.mocked(postgres).mockClear()
})

describe("createDb → postgres() passthrough", () => {
  // Without these assertions, a refactor that drops the `idle_timeout: opts.idleTimeout`
  // mapping or flips the default `prepare` flag silently ships the regression —
  // type-only tests can't catch a camelCase→snake_case rename mistake.

  it("defaults to prepare:true, max:10, idle_timeout:20 when no opts are passed", () => {
    createDb(URL)
    expect(postgres).toHaveBeenCalledTimes(1)
    expect(postgres).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ prepare: true, max: 10, idle_timeout: 20 }),
    )
  })

  it("translates the camelCase idleTimeout opt to the snake_case idle_timeout postgres.js expects", () => {
    createDb(URL, { idleTimeout: 5 })
    expect(postgres).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ idle_timeout: 5 }),
    )
  })

  it("passes prepare:false through (the Supabase/Neon transaction-pool fix)", () => {
    createDb("postgres://u:p@host:6543/d", { prepare: false })
    expect(postgres).toHaveBeenCalledWith(
      "postgres://u:p@host:6543/d",
      expect.objectContaining({ prepare: false }),
    )
  })

  it("passes max through unchanged", () => {
    createDb(URL, { max: 25 })
    expect(postgres).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ max: 25 }),
    )
  })
})
