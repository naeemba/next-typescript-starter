import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createAuth } from "../src/auth/index.js"
import { setupAuthEnv, restoreAuthEnv, pluginIds, findPlugin } from "./helpers/auth-internals.js"

beforeEach(() => setupAuthEnv())
afterEach(() => restoreAuthEnv())

type PasskeyOpts = { rpID?: string; rpName?: string; origin?: string }
const passkeyPlugin = (auth: unknown) =>
  findPlugin(auth, "passkey") as { options?: PasskeyOpts } | undefined

describe("createAuth({ passkey })", () => {
  it("loads the passkey plugin when opts.passkey is set", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: { rpName: "Acme" },
    })
    expect(pluginIds(auth)).toContain("passkey")
  })

  it("does NOT load the passkey plugin when opts.passkey is omitted", () => {
    const auth = createAuth({ db: {} as never })
    expect(pluginIds(auth)).not.toContain("passkey")
  })

  it("defaults rpID, rpName and origin from BETTER_AUTH_URL when not provided", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: {},
    })
    const p = passkeyPlugin(auth)
    expect(p?.options?.rpID).toBe("app.example.com")
    expect(p?.options?.rpName).toBe("app.example.com")
    expect(p?.options?.origin).toBe("https://app.example.com")
  })

  it("respects explicit rpName / rpID / origin", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: { rpName: "Acme", rpID: "acme.example", origin: "https://acme.example" },
    })
    const p = passkeyPlugin(auth)
    expect(p?.options?.rpName).toBe("Acme")
    expect(p?.options?.rpID).toBe("acme.example")
    expect(p?.options?.origin).toBe("https://acme.example")
  })

  // The point of normalising BETTER_AUTH_URL through `new URL(...).origin`
  // is hardening against trailing slashes / paths in env — @simplewebauthn
  // does a strict string compare against the browser-sent RFC 6454 origin
  // (no slash, no path). A regression that reverted to
  // `origin: opts.passkey.origin ?? env.BETTER_AUTH_URL` would re-introduce
  // the original bug and fail in prod with a generic origin-mismatch error.
  it.each([
    ["https://app.example.com", "https://app.example.com"],
    ["https://app.example.com/", "https://app.example.com"],
    ["https://app.example.com/auth/callback", "https://app.example.com"],
  ])("normalises BETTER_AUTH_URL=%s to passkey.origin=%s", (url, expected) => {
    process.env.BETTER_AUTH_URL = url
    const auth = createAuth({ db: {} as never, passkey: {} })
    expect(passkeyPlugin(auth)?.options?.origin).toBe(expected)
  })

  it("strips the port from rpID via URL.hostname (rpID must be a domain, not an origin)", () => {
    process.env.BETTER_AUTH_URL = "https://app.example.com:8080"
    const auth = createAuth({ db: {} as never, passkey: {} })
    expect(passkeyPlugin(auth)?.options?.rpID).toBe("app.example.com")
  })
})
