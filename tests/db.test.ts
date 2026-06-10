import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

describe("db Proxy lazy-init", () => {
  let originalUrl: string | undefined
  beforeEach(() => {
    originalUrl = process.env.DATABASE_URL
    vi.resetModules()
  })
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalUrl
  })

  it("does not throw at import time when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL
    const mod = await import("../src/db/index")
    expect(mod.db).toBeDefined()
  })

  it("throws when the Proxy is actually used and DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL
    const { db } = await import("../src/db/index")
    expect(() => (db as unknown as { query: unknown }).query).toThrow(/DATABASE_URL/)
  })
})
