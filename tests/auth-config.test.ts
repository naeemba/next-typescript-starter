import { describe, it, expect } from "vitest"
import { parseEnv } from "../src/auth/config"
import { BASE_ENV } from "./helpers/auth-internals"

describe("parseEnv", () => {
  it("accepts a well-formed env object and returns a typed Env", () => {
    const env = parseEnv(BASE_ENV)
    expect(env.DATABASE_URL).toBe(BASE_ENV.DATABASE_URL)
    expect(env.BETTER_AUTH_URL).toBe(BASE_ENV.BETTER_AUTH_URL)
  })

  it("rejects a missing DATABASE_URL with a clear message", () => {
    const broken = { ...BASE_ENV, DATABASE_URL: undefined }
    expect(() => parseEnv(broken)).toThrow(/DATABASE_URL/)
  })

  it("rejects a short secret", () => {
    const broken = { ...BASE_ENV, BETTER_AUTH_SECRET: "short" }
    expect(() => parseEnv(broken)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it("rejects a malformed BETTER_AUTH_URL", () => {
    const broken = { ...BASE_ENV, BETTER_AUTH_URL: "not-a-url" }
    expect(() => parseEnv(broken)).toThrow(/BETTER_AUTH_URL/)
  })

  it("allows EMAIL_FROM to be missing (Resend will reject in prod)", () => {
    const without = { ...BASE_ENV, EMAIL_FROM: undefined }
    const env = parseEnv(without)
    expect(env.EMAIL_FROM).toBeUndefined()
  })

  // Regression: CI platforms (and our own .env.example) emit
  // `EMAIL_FROM=` as the empty string for unset values. parseEnv must
  // treat that the same as "absent" rather than throwing
  // "Invalid email" — which would crash createAuth() at module load.
  it("treats EMAIL_FROM='' as missing rather than rejecting", () => {
    const blank = { ...BASE_ENV, EMAIL_FROM: "" }
    const env = parseEnv(blank)
    expect(env.EMAIL_FROM).toBeUndefined()
  })

  it("treats other optional vars set to '' as missing too", () => {
    const blanks = {
      ...BASE_ENV,
      RESEND_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    }
    const env = parseEnv(blanks)
    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined()
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined()
  })

  it("accepts optional GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET", () => {
    const env = parseEnv({
      ...BASE_ENV,
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
    })
    expect(env.GOOGLE_CLIENT_ID).toBe("google-client-id")
    expect(env.GOOGLE_CLIENT_SECRET).toBe("google-client-secret")
  })

  it("treats GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as optional", () => {
    const env = parseEnv(BASE_ENV)
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined()
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined()
  })
})

describe("parseEnv with overrides", () => {
  it("overrides take precedence over env input", () => {
    const env = parseEnv(BASE_ENV, {
      DATABASE_URL: "postgres://other:other@localhost:5432/other",
      BETTER_AUTH_URL: "https://staging.example.com",
    })
    expect(env.DATABASE_URL).toBe("postgres://other:other@localhost:5432/other")
    expect(env.BETTER_AUTH_URL).toBe("https://staging.example.com")
    expect(env.BETTER_AUTH_SECRET).toBe(BASE_ENV.BETTER_AUTH_SECRET)
  })

  it("overrides can satisfy a missing env field", () => {
    const partial = { ...BASE_ENV, BETTER_AUTH_SECRET: undefined }
    const env = parseEnv(partial, { BETTER_AUTH_SECRET: "y".repeat(32) })
    expect(env.BETTER_AUTH_SECRET).toBe("y".repeat(32))
  })
})
