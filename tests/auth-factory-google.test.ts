import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createAuth } from "../src/auth/index.js"
import { setupAuthEnv, restoreAuthEnv, authOpts } from "./helpers/auth-internals.js"

beforeEach(() => setupAuthEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined }))
afterEach(() => restoreAuthEnv())

type AuthOpts = {
  socialProviders?: {
    google?: {
      clientId?: string
      clientSecret?: string
      scopes?: string[]
      mapProfileToUser?: (profile: {
        email: string
        email_verified: boolean
      }) => Promise<Record<string, unknown>> | Record<string, unknown>
    }
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

const opts = (auth: unknown) => authOpts<AuthOpts>(auth)

describe("createAuth({ google })", () => {
  it("wires the google socialProvider when clientId/Secret are passed as opts", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: { clientId: "id-from-opts", clientSecret: "secret-from-opts" },
    })
    expect(opts(auth).socialProviders?.google?.clientId).toBe("id-from-opts")
    expect(opts(auth).socialProviders?.google?.clientSecret).toBe("secret-from-opts")
  })

  it("falls back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from env when opts omit them", async () => {
    process.env.GOOGLE_CLIENT_ID = "id-from-env"
    process.env.GOOGLE_CLIENT_SECRET = "secret-from-env"
    const auth = await createAuth({ db: {} as never, google: {} })
    expect(opts(auth).socialProviders?.google?.clientId).toBe("id-from-env")
    expect(opts(auth).socialProviders?.google?.clientSecret).toBe("secret-from-env")
  })

  it("throws if google is enabled but no clientId/Secret resolvable", async () => {
    await expect(createAuth({ db: {} as never, google: {} })).rejects.toThrow(/GOOGLE_CLIENT_ID/)
  })

  it("forwards opts.google.scopes as socialProviders.google.scopes", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y", scopes: ["email", "profile", "openid"] },
    })
    expect(opts(auth).socialProviders?.google?.scopes).toEqual(["email", "profile", "openid"])
  })

  it("enables accountLinking with google in trustedProviders by default when google is set", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
    })
    expect(opts(auth).account?.accountLinking?.enabled).toBe(true)
    expect(opts(auth).account?.accountLinking?.trustedProviders).toContain("google")
  })

  it("does NOT configure accountLinking when google is omitted", async () => {
    const auth = await createAuth({ db: {} as never })
    expect(opts(auth).account?.accountLinking).toBeUndefined()
  })

  it("disables accountLinking when explicitly set to false", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: false,
    })
    expect(opts(auth).account?.accountLinking).toBeUndefined()
  })

  it("respects a custom trustedProviders list (with google auto-merged)", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: { trustedProviders: ["github"] },
    })
    expect(opts(auth).account?.accountLinking?.trustedProviders).toEqual(["github", "google"])
  })

  it("preserves the order when google is already in trustedProviders", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: { trustedProviders: ["google", "github"] },
    })
    expect(opts(auth).account?.accountLinking?.trustedProviders).toEqual(["google", "github"])
  })

  it("wires accountLinking even when google is omitted (for later provider additions)", async () => {
    const auth = await createAuth({
      db: {} as never,
      accountLinking: { trustedProviders: ["github"] },
    })
    expect(opts(auth).account?.accountLinking?.enabled).toBe(true)
    expect(opts(auth).account?.accountLinking?.trustedProviders).toEqual(["github"])
  })

  it("wires google.allowlist as socialProviders.google.mapProfileToUser", async () => {
    const seen: Array<{ email: string; emailVerified: boolean }> = []
    const auth = await createAuth({
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
    const map = opts(auth).socialProviders?.google?.mapProfileToUser
    expect(map).toBeDefined()

    await map!({ email: "alice@acme.com", email_verified: true })
    expect(seen[0]).toEqual({ email: "alice@acme.com", emailVerified: true })

    await expect(
      map!({ email: "bob@other.com", email_verified: true })
    ).rejects.toThrow(/google\.allowlist/)
  })

  it("does NOT wire a global databaseHooks.user.create.before hook for google.allowlist", async () => {
    const auth = await createAuth({
      db: {} as never,
      google: {
        clientId: "x",
        clientSecret: "y",
        allowlist: () => true,
      },
    })
    // Magic-link signups, account-create flows from other providers, and any
    // direct user.create call must NOT be gated by google.allowlist.
    expect(opts(auth).databaseHooks?.user?.create?.before).toBeUndefined()
  })

  // Regression: a stale/malformed DATABASE_URL in env must not break the
  // opts.db path. parseEnv rejects non-postgres URLs, so without the placeholder
  // override `createAuth({ db, google: {...} })` would fail for a consumer
  // using a different driver but who still has DATABASE_URL set.
  it("ignores a non-postgres process.env.DATABASE_URL when opts.db is provided", async () => {
    process.env.DATABASE_URL = "mysql://x:y@localhost/z"
    process.env.GOOGLE_CLIENT_ID = "id"
    process.env.GOOGLE_CLIENT_SECRET = "secret"
    await expect(
      createAuth({ db: {} as never, google: {} }),
    ).resolves.toBeDefined()
  })
})
