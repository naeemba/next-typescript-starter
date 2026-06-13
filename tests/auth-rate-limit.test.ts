import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setupAuthEnv, restoreAuthEnv, authOpts } from "./helpers/auth-internals"

interface RateLimitShape {
  rateLimit?: { enabled?: boolean; window?: number; max?: number; storage?: string }
}

describe("createAuth rateLimit", () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    restoreAuthEnv()
  })

  it("does NOT set rateLimit when opts.rateLimit is undefined (better-auth's prod-on default applies)", async () => {
    setupAuthEnv()
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth()
    expect(authOpts<RateLimitShape>(auth).rateLimit).toBeUndefined()
  })

  it("forces { enabled: false } when opts.rateLimit === false", async () => {
    setupAuthEnv()
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth({ rateLimit: false })
    expect(authOpts<RateLimitShape>(auth).rateLimit).toEqual({ enabled: false })
  })

  it("passes through window / max / storage when opts.rateLimit is an object", async () => {
    setupAuthEnv()
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth({ rateLimit: { window: 3600, max: 5 } })
    expect(authOpts<RateLimitShape>(auth).rateLimit).toEqual({ window: 3600, max: 5 })
  })

  it("respects an explicit `enabled: true` to override the env-var escape hatch", async () => {
    setupAuthEnv({ BETTER_AUTH_RATE_LIMIT_DISABLED: "1" })
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth({ rateLimit: { enabled: true, max: 50 } })
    // Env override only applies when opts.rateLimit isn't explicitly enabling
    // it. An explicit enabled:true wins; otherwise the env var would silently
    // disable a production rate limit that the consumer thought they enabled.
    expect(authOpts<RateLimitShape>(auth).rateLimit).toEqual({ enabled: true, max: 50 })
  })

  it("BETTER_AUTH_RATE_LIMIT_DISABLED=1 forces { enabled: false } when no opts given", async () => {
    setupAuthEnv({ BETTER_AUTH_RATE_LIMIT_DISABLED: "1" })
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth()
    expect(authOpts<RateLimitShape>(auth).rateLimit).toEqual({ enabled: false })
  })

  it("BETTER_AUTH_RATE_LIMIT_DISABLED=1 forces disable when opts.rateLimit is an object without explicit enabled", async () => {
    setupAuthEnv({ BETTER_AUTH_RATE_LIMIT_DISABLED: "1" })
    const { createAuth } = await import("../src/auth/index")
    const auth = await createAuth({ rateLimit: { window: 60, max: 5 } })
    expect(authOpts<RateLimitShape>(auth).rateLimit).toEqual({ window: 60, max: 5, enabled: false })
  })

  it("BETTER_AUTH_RATE_LIMIT_DISABLED with a falsy value ('0', '', 'false') does NOT disable", async () => {
    for (const val of ["0", "", "false"]) {
      setupAuthEnv({ BETTER_AUTH_RATE_LIMIT_DISABLED: val })
      vi.resetModules()
      const { createAuth } = await import("../src/auth/index")
      const auth = await createAuth()
      expect(authOpts<RateLimitShape>(auth).rateLimit, `val=${val}`).toBeUndefined()
    }
  })
})
