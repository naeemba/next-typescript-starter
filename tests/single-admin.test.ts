import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setupAuthEnv, restoreAuthEnv, findPlugin, authOpts } from "./helpers/auth-internals.js"

const sendMagicLinkSpy = vi.fn(async () => {})
vi.mock("../src/email/index.ts", () => ({
  sendMagicLink: sendMagicLinkSpy,
}))

interface GoogleSocialOpts {
  socialProviders?: {
    google?: {
      mapProfileToUser?: (p: { email: string; email_verified: boolean }) => Promise<unknown>
    }
  }
}

beforeEach(() => {
  vi.resetModules()
  sendMagicLinkSpy.mockClear()
  setupAuthEnv({ GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" })
})
afterEach(() => restoreAuthEnv())

describe("singleAdmin — invalid inputs", () => {
  // `singleAdmin: process.env.ADMIN_EMAIL ?? ""` would otherwise silently
  // disable the allowlist and open sign-in to everyone. Fail loud instead.
  it("throws when the string form is empty / whitespace", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    expect(() => createAuth({ singleAdmin: "" })).toThrow(/no non-empty emails/)
    expect(() => createAuth({ singleAdmin: "   " })).toThrow(/no non-empty emails/)
  })

  it("throws when the array form is empty or only whitespace entries", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    expect(() => createAuth({ singleAdmin: [] })).toThrow(/no non-empty emails/)
    expect(() => createAuth({ singleAdmin: ["", "  "] })).toThrow(/no non-empty emails/)
  })
})

describe("singleAdmin — magic-link allowlist defaulting", () => {
  it("string form: allowed email triggers sendMagicLink, non-match is silently skipped", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    const auth = createAuth({ singleAdmin: "owner@example.com" })
    const ml = findPlugin(auth, "magic-link") as { options: { sendMagicLink: (a: { email: string; url: string }) => Promise<void> } } | undefined
    expect(ml?.options.sendMagicLink).toBeTypeOf("function")
    await ml!.options.sendMagicLink({ email: "OWNER@example.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
    await ml!.options.sendMagicLink({ email: "stranger@example.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1) // unchanged — blocked
  })

  it("array form: each listed email allowed, others blocked (case-insensitive)", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    const auth = createAuth({ singleAdmin: ["A@x.com", "B@x.com"] })
    const ml = findPlugin(auth, "magic-link") as { options: { sendMagicLink: (a: { email: string; url: string }) => Promise<void> } } | undefined
    await ml!.options.sendMagicLink({ email: "a@X.com", url: "u" })
    await ml!.options.sendMagicLink({ email: "b@x.com", url: "u" })
    await ml!.options.sendMagicLink({ email: "c@x.com", url: "u" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(2)
  })
})

describe("singleAdmin — wired into createAuth", () => {
  it("magic-link plugin is registered even with only singleAdmin set", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    const auth = createAuth({ singleAdmin: "owner@example.com" })
    expect(findPlugin(auth, "magic-link")).toBeDefined()
  })

  it("google socialProvider is wired and gets a mapProfileToUser when singleAdmin is set", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    const auth = createAuth({
      singleAdmin: "owner@example.com",
      google: {},
    })
    const opts = authOpts<GoogleSocialOpts>(auth)
    const map = opts.socialProviders?.google?.mapProfileToUser
    expect(map).toBeTypeOf("function")
    await expect(map!({ email: "owner@example.com", email_verified: true })).resolves.toEqual({})
    await expect(map!({ email: "owner@example.com", email_verified: false })).rejects.toThrow(
      /rejected by google.allowlist/,
    )
    await expect(map!({ email: "stranger@example.com", email_verified: true })).rejects.toThrow(
      /rejected by google.allowlist/,
    )
  })

  it("explicit magicLink.allowlist overrides singleAdmin for magic-link, but google still falls back to singleAdmin", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    const explicitMagicLink = vi.fn((email: string) => email === "anyone@x.com")
    const auth = createAuth({
      singleAdmin: "owner@example.com",
      magicLink: { allowlist: explicitMagicLink },
      google: {},
    })
    // Magic-link: explicit callback used (the singleAdmin "owner@example.com" is ignored).
    const ml = findPlugin(auth, "magic-link") as { options: { sendMagicLink: (a: { email: string; url: string }) => Promise<void> } } | undefined
    await ml!.options.sendMagicLink({ email: "anyone@x.com", url: "u" })
    expect(explicitMagicLink).toHaveBeenCalledWith("anyone@x.com")
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
    await ml!.options.sendMagicLink({ email: "owner@example.com", url: "u" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1) // unchanged — explicit said no
    // Google: still gated by singleAdmin.
    const opts = authOpts<GoogleSocialOpts>(auth)
    await expect(opts.socialProviders!.google!.mapProfileToUser!({ email: "stranger@x.com", email_verified: true })).rejects.toThrow(/rejected by google.allowlist/)
  })

  it("explicit google.allowlist overrides singleAdmin for google", async () => {
    const { createAuth } = await import("../src/auth/index.js")
    const explicit = vi.fn(async () => true)
    const auth = createAuth({
      singleAdmin: "owner@example.com",
      google: { allowlist: explicit },
    })
    const opts = authOpts<GoogleSocialOpts>(auth)
    await expect(opts.socialProviders!.google!.mapProfileToUser!({ email: "stranger@x", email_verified: true })).resolves.toEqual({})
    expect(explicit).toHaveBeenCalledWith({ email: "stranger@x", emailVerified: true })
  })
})
