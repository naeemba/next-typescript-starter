import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

describe("createAuth", () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
    vi.resetModules()
  })
  afterEach(() => {
    process.env = savedEnv
  })

  it("uses process.env defaults when no opts passed", async () => {
    Object.assign(process.env, validEnv)
    const { createAuth } = await import("../src/auth/index")
    const auth = createAuth()
    expect(auth).toBeDefined()
    expect(typeof auth.api?.getSession).toBe("function")
  })

  it("opts override env", async () => {
    Object.assign(process.env, validEnv)
    const { createAuth } = await import("../src/auth/index")
    const auth = createAuth({ baseURL: "https://override.example.com" })
    expect(auth).toBeDefined()
  })

  it("throws with a clear error when DATABASE_URL is missing and not in opts", async () => {
    process.env = {} as NodeJS.ProcessEnv
    const { createAuth } = await import("../src/auth/index")
    expect(() => createAuth()).toThrow(/DATABASE_URL/)
  })

  it("does not throw at module import time", async () => {
    process.env = {} as NodeJS.ProcessEnv
    await expect(import("../src/auth/index")).resolves.toBeDefined()
  })

  it("accepts opts.db without requiring DATABASE_URL in env", async () => {
    process.env = {
      BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: validEnv.BETTER_AUTH_URL,
    } as NodeJS.ProcessEnv
    const { createAuth } = await import("../src/auth/index")
    const fakeDb = { select: () => {}, insert: () => {} } as any
    expect(() => createAuth({ db: fakeDb })).not.toThrow()
  })
})
