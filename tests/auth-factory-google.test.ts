import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createAuth } from "../src/auth/index.js"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: "postgres://u:p@h/d",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

type AuthOpts = {
  socialProviders?: {
    google?: { clientId?: string; clientSecret?: string; scopes?: string[] }
  }
  account?: { accountLinking?: { enabled?: boolean; trustedProviders?: string[] } }
  databaseHooks?: {
    user?: {
      create?: {
        before?: (
          user: { email: string; emailVerified?: boolean },
          context?: unknown
        ) => Promise<unknown> | unknown
      }
    }
  }
}

function opts(auth: unknown): AuthOpts {
  return (auth as { options: AuthOpts }).options
}

describe("createAuth({ google })", () => {
  it("wires the google socialProvider when clientId/Secret are passed as opts", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "id-from-opts", clientSecret: "secret-from-opts" },
    })
    expect(opts(auth).socialProviders?.google?.clientId).toBe("id-from-opts")
    expect(opts(auth).socialProviders?.google?.clientSecret).toBe("secret-from-opts")
  })

  it("falls back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from env when opts omit them", () => {
    process.env.GOOGLE_CLIENT_ID = "id-from-env"
    process.env.GOOGLE_CLIENT_SECRET = "secret-from-env"
    const auth = createAuth({ db: {} as never, google: {} })
    expect(opts(auth).socialProviders?.google?.clientId).toBe("id-from-env")
    expect(opts(auth).socialProviders?.google?.clientSecret).toBe("secret-from-env")
  })

  it("throws if google is enabled but no clientId/Secret resolvable", () => {
    expect(() => createAuth({ db: {} as never, google: {} })).toThrow(/GOOGLE_CLIENT_ID/)
  })

  it("forwards opts.google.scopes as socialProviders.google.scopes", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y", scopes: ["email", "profile", "openid"] },
    })
    expect(opts(auth).socialProviders?.google?.scopes).toEqual(["email", "profile", "openid"])
  })

  it("enables accountLinking with google in trustedProviders by default when google is set", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
    })
    expect(opts(auth).account?.accountLinking?.enabled).toBe(true)
    expect(opts(auth).account?.accountLinking?.trustedProviders).toContain("google")
  })

  it("does NOT configure accountLinking when google is omitted", () => {
    const auth = createAuth({ db: {} as never })
    expect(opts(auth).account?.accountLinking).toBeUndefined()
  })

  it("disables accountLinking when explicitly set to false", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: false,
    })
    expect(opts(auth).account?.accountLinking).toBeUndefined()
  })

  it("respects a custom trustedProviders list", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: { trustedProviders: ["google", "github"] },
    })
    expect(opts(auth).account?.accountLinking?.trustedProviders).toEqual(["google", "github"])
  })

  it("wires google.allowlist as a databaseHooks.user.create.before hook", async () => {
    const seen: Array<{ email: string; emailVerified: boolean }> = []
    const auth = createAuth({
      db: {} as never,
      google: {
        clientId: "x",
        clientSecret: "y",
        allowlist: (profile) => {
          seen.push(profile)
          return profile.email.endsWith("@acme.com")
        },
      },
    })
    const hook = opts(auth).databaseHooks?.user?.create?.before
    expect(hook).toBeDefined()

    await hook!({ email: "alice@acme.com", emailVerified: true })
    expect(seen[0]).toEqual({ email: "alice@acme.com", emailVerified: true })

    await expect(
      hook!({ email: "bob@other.com", emailVerified: true })
    ).rejects.toThrow()
  })
})
