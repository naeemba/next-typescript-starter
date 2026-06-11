import { describe, it, expect } from "vitest"
import { parseEnv } from "../src/auth/config"

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

describe("parseEnv", () => {
  it("accepts a well-formed env object and returns a typed Env", () => {
    const env = parseEnv(validEnv)
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL)
    expect(env.BETTER_AUTH_URL).toBe(validEnv.BETTER_AUTH_URL)
  })

  it("rejects a missing DATABASE_URL with a clear message", () => {
    const broken = { ...validEnv, DATABASE_URL: undefined } as Record<string, string | undefined>
    expect(() => parseEnv(broken)).toThrow(/DATABASE_URL/)
  })

  it("rejects a short secret", () => {
    const broken = { ...validEnv, BETTER_AUTH_SECRET: "short" }
    expect(() => parseEnv(broken)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it("rejects a malformed BETTER_AUTH_URL", () => {
    const broken = { ...validEnv, BETTER_AUTH_URL: "not-a-url" }
    expect(() => parseEnv(broken)).toThrow(/BETTER_AUTH_URL/)
  })

  it("allows EMAIL_FROM to be missing (Resend will reject in prod)", () => {
    const without = { ...validEnv, EMAIL_FROM: undefined } as Record<string, string | undefined>
    const env = parseEnv(without)
    expect(env.EMAIL_FROM).toBeUndefined()
  })
})

describe("parseEnv with overrides", () => {
  const validEnv = {
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
    EMAIL_FROM: "auth@example.com",
  }

  it("overrides take precedence over env input", () => {
    const env = parseEnv(validEnv, {
      DATABASE_URL: "postgres://other:other@localhost:5432/other",
      BETTER_AUTH_URL: "https://staging.example.com",
    })
    expect(env.DATABASE_URL).toBe("postgres://other:other@localhost:5432/other")
    expect(env.BETTER_AUTH_URL).toBe("https://staging.example.com")
    expect(env.BETTER_AUTH_SECRET).toBe(validEnv.BETTER_AUTH_SECRET)
  })

  it("overrides can satisfy a missing env field", () => {
    const partial = { ...validEnv, BETTER_AUTH_SECRET: undefined } as Record<string, string | undefined>
    const env = parseEnv(partial, { BETTER_AUTH_SECRET: "y".repeat(32) })
    expect(env.BETTER_AUTH_SECRET).toBe("y".repeat(32))
  })
})
