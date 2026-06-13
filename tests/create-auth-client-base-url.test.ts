import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Capture every `baseURL` better-auth's createAuthClient is invoked with
// so we can pin the fallback chain at unit level. Mocking the upstream
// factory (instead of asserting against an opaque client instance) keeps
// the assertion focused on the wiring contract — what we pass through —
// rather than the better-auth Proxy's runtime shape.
const baseURLCalls: Array<string | undefined> = []

vi.mock("better-auth/react", () => ({
  createAuthClient: (opts: { baseURL?: string }) => {
    baseURLCalls.push(opts.baseURL)
    return { __baseURL: opts.baseURL }
  },
}))
vi.mock("better-auth/client/plugins", () => ({
  magicLinkClient: () => ({ id: "magic-link" }),
}))

beforeEach(() => {
  baseURLCalls.length = 0
})

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_BETTER_AUTH_URL
const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL
  else process.env.NEXT_PUBLIC_BETTER_AUTH_URL = ORIGINAL_ENV
  if (ORIGINAL_WINDOW === undefined) delete (globalThis as { window?: unknown }).window
  else (globalThis as { window?: unknown }).window = ORIGINAL_WINDOW
})

describe("createAuthClient — baseURL resolution chain", () => {
  it("uses opts.baseURL when provided (highest precedence)", async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "https://from-env.example.com"
    ;(globalThis as { window?: { location: { origin: string } } }).window = {
      location: { origin: "https://from-window.example.com" },
    }
    const { createAuthClient } = await import("../src/client/index.js")
    createAuthClient({ baseURL: "https://from-opts.example.com" })
    expect(baseURLCalls).toEqual(["https://from-opts.example.com"])
  })

  it("falls back to NEXT_PUBLIC_BETTER_AUTH_URL when opts.baseURL is absent", async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "https://from-env.example.com"
    ;(globalThis as { window?: { location: { origin: string } } }).window = {
      location: { origin: "https://from-window.example.com" },
    }
    const { createAuthClient } = await import("../src/client/index.js")
    createAuthClient()
    expect(baseURLCalls).toEqual(["https://from-env.example.com"])
  })

  // Same-origin deployments can drop NEXT_PUBLIC_BETTER_AUTH_URL entirely
  // and the client derives baseURL from the browser at runtime. This is
  // the 0.5.0 footgun-killer for the "site is served from one origin and
  // the env var was forgotten" case.
  it("falls back to window.location.origin when no opts.baseURL and no env var", async () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL
    ;(globalThis as { window?: { location: { origin: string } } }).window = {
      location: { origin: "https://from-window.example.com" },
    }
    const { createAuthClient } = await import("../src/client/index.js")
    createAuthClient()
    expect(baseURLCalls).toEqual(["https://from-window.example.com"])
  })

  // A `process` shim that defines `NEXT_PUBLIC_BETTER_AUTH_URL=""` should
  // NOT short-circuit the fallback chain to an empty string. better-auth
  // treats baseURL="" as "current origin" but ANY truthy value would be
  // consumed as-is by the better-auth client — so an explicit "" returned
  // from `process.env` (Webpack/Vite sometimes inlines empty values from
  // missing keys) would silently route to the wrong host.
  it("treats empty-string NEXT_PUBLIC_BETTER_AUTH_URL as 'not set'", async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = ""
    ;(globalThis as { window?: { location: { origin: string } } }).window = {
      location: { origin: "https://from-window.example.com" },
    }
    const { createAuthClient } = await import("../src/client/index.js")
    createAuthClient()
    expect(baseURLCalls).toEqual(["https://from-window.example.com"])
  })

  // Outside the browser, with no env var, baseURL falls through to
  // undefined — better-auth's client handles that. SSR resolution
  // happens before the bundle ships to the browser, so this path
  // only fires in test/server contexts.
  it("returns undefined baseURL when neither env nor window is available", async () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL
    delete (globalThis as { window?: unknown }).window
    const { createAuthClient } = await import("../src/client/index.js")
    createAuthClient()
    expect(baseURLCalls).toEqual([undefined])
  })
})
