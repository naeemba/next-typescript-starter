import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setupAuthEnv, restoreAuthEnv } from "./helpers/auth-internals"

describe("createAuth", () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    restoreAuthEnv()
  })

  it("uses process.env defaults when no opts passed", async () => {
    setupAuthEnv()
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth()
    expect(auth).toBeDefined()
    expect(typeof auth.api?.getSession).toBe("function")
  })

  it("opts override env", async () => {
    setupAuthEnv()
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth({ baseURL: "https://override.example.com" })
    expect(auth).toBeDefined()
  })

  it("throws with a clear error when DATABASE_URL is missing and not in opts", async () => {
    setupAuthEnv({ DATABASE_URL: undefined })
    const { createAuth } = await import("../src/auth/index")
    await expect(createAuth()).rejects.toThrow(/DATABASE_URL/)
  })

  it("does not throw at module import time", async () => {
    setupAuthEnv({
      DATABASE_URL: undefined,
      BETTER_AUTH_SECRET: undefined,
      BETTER_AUTH_URL: undefined,
    })
    await expect(import("../src/auth/index")).resolves.toBeDefined()
  })

  it("accepts opts.db without requiring DATABASE_URL in env", async () => {
    setupAuthEnv({ DATABASE_URL: undefined })
    const { createAuth } = await import("../src/auth/index")
    const fakeDb = { select: () => {}, insert: () => {} } as any
    await expect(createAuth({ db: fakeDb })).resolves.toBeDefined()
  })
})
