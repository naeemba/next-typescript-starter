import { describe, it, expect, vi } from "vitest"

// Minimal NextRequest / NextResponse stand-ins. The real next/server types
// are imported by the helper but the helper only touches a tiny surface:
// req.nextUrl.pathname, req.cookies.get(name), NextResponse.redirect(url).
// We mock next/server before importing the module under test.

const redirectCalls: URL[] = []

vi.mock("next/server", () => {
  class NextResponse {
    static redirect(url: URL | string): { type: "redirect"; url: string } {
      const u = url instanceof URL ? url : new URL(url)
      redirectCalls.push(u)
      return { type: "redirect", url: u.toString() }
    }
    static next(): { type: "next" } {
      return { type: "next" }
    }
  }
  return { NextResponse }
})

function makeReq(opts: {
  pathname: string
  search?: string
  cookies?: Record<string, string>
  origin?: string
  basePath?: string
}) {
  const origin = opts.origin ?? "https://app.example.com"
  const url = new URL(`${origin}${opts.pathname}${opts.search ?? ""}`)
  // Real NextURL exposes `basePath` and `clone()`; the stub provides both
  // so the middleware's basePath-aware redirect path is exercised under test.
  Object.defineProperty(url, "basePath", { value: opts.basePath ?? "", configurable: true })
  Object.defineProperty(url, "clone", {
    value: () => {
      const cloned = new URL(url.toString())
      Object.defineProperty(cloned, "basePath", { value: opts.basePath ?? "", configurable: true })
      return cloned
    },
    configurable: true,
  })
  return {
    nextUrl: url,
    url: url.toString(),
    cookies: {
      get: (name: string) =>
        opts.cookies && name in opts.cookies ? { name, value: opts.cookies[name]! } : undefined,
    },
  } as const
}

describe("createMiddleware", () => {
  it("returns NextResponse.next() for unprotected paths", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    const result = mw(makeReq({ pathname: "/about" }) as unknown as Parameters<typeof mw>[0])
    expect(result).toEqual({ type: "next" })
  })

  it("redirects to /sign-in when protected path has no session cookie", async () => {
    redirectCalls.length = 0
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    const result = mw(makeReq({ pathname: "/admin/users", search: "?q=1" }) as unknown as Parameters<typeof mw>[0])
    expect(result).toMatchObject({ type: "redirect" })
    expect(redirectCalls).toHaveLength(1)
    const redirect = redirectCalls[0]!
    expect(redirect.pathname).toBe("/sign-in")
    expect(redirect.searchParams.get("callbackUrl")).toBe("/admin/users?q=1")
  })

  it("passes through when better-auth.session_token cookie is present", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    const result = mw(
      makeReq({
        pathname: "/admin/users",
        cookies: { "better-auth.session_token": "sess-abc" },
      }) as unknown as Parameters<typeof mw>[0],
    )
    expect(result).toEqual({ type: "next" })
  })

  it("recognizes the __Secure- prefixed cookie variant", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    const result = mw(
      makeReq({
        pathname: "/admin/users",
        cookies: { "__Secure-better-auth.session_token": "sess-abc" },
      }) as unknown as Parameters<typeof mw>[0],
    )
    expect(result).toEqual({ type: "next" })
  })

  it("respects a custom cookiePrefix", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"], cookiePrefix: "my-app" })
    const noCookie = mw(makeReq({ pathname: "/admin/x" }) as unknown as Parameters<typeof mw>[0])
    expect(noCookie).toMatchObject({ type: "redirect" })
    const withCookie = mw(
      makeReq({
        pathname: "/admin/x",
        cookies: { "my-app.session_token": "sess" },
      }) as unknown as Parameters<typeof mw>[0],
    )
    expect(withCookie).toEqual({ type: "next" })
  })

  it("uses custom signInPath and callbackParam", async () => {
    redirectCalls.length = 0
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({
      protect: ["/admin/:path*"],
      signInPath: "/login",
      callbackParam: "next",
    })
    mw(makeReq({ pathname: "/admin/x" }) as unknown as Parameters<typeof mw>[0])
    expect(redirectCalls[0]!.pathname).toBe("/login")
    expect(redirectCalls[0]!.searchParams.get("next")).toBe("/admin/x")
  })

  it("matches nested segments via :path*", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    const result = mw(makeReq({ pathname: "/admin/a/b/c/d" }) as unknown as Parameters<typeof mw>[0])
    expect(result).toMatchObject({ type: "redirect" })
  })

  it("matches if ANY protect pattern matches", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*", "/dashboard/:path*"] })
    expect(
      mw(makeReq({ pathname: "/dashboard/billing" }) as unknown as Parameters<typeof mw>[0]),
    ).toMatchObject({ type: "redirect" })
    expect(
      mw(makeReq({ pathname: "/marketing" }) as unknown as Parameters<typeof mw>[0]),
    ).toEqual({ type: "next" })
  })

  it("treats /admin (no trailing segments) as a match for /admin/:path*", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    // :path* should allow zero-segment match — `/admin` redirects.
    const result = mw(makeReq({ pathname: "/admin" }) as unknown as Parameters<typeof mw>[0])
    expect(result).toMatchObject({ type: "redirect" })
  })

  it("matches mid-pattern :name* with zero segments (/admin/:path*/edit ↔ /admin/edit)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*/edit"] })
    expect(mw(makeReq({ pathname: "/admin/edit" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
    expect(mw(makeReq({ pathname: "/admin/users/edit" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
    expect(mw(makeReq({ pathname: "/admin/a/b/edit" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
    expect(mw(makeReq({ pathname: "/admin/users/view" }) as unknown as Parameters<typeof mw>[0])).toEqual({ type: "next" })
  })

  it("matches /** with zero or more segments", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/**"] })
    expect(mw(makeReq({ pathname: "/admin" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
    expect(mw(makeReq({ pathname: "/admin/users" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
    expect(mw(makeReq({ pathname: "/admin/a/b/c" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
    expect(mw(makeReq({ pathname: "/admincenter" }) as unknown as Parameters<typeof mw>[0])).toEqual({ type: "next" })
  })

  it("throws if protect is empty", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: [] })).toThrow(/'protect' must be a non-empty array/)
  })

  // The construction-time guard is the real fix for the redirect-loop class
  // of bug — it surfaces misconfigurations at module load instead of letting
  // the loop manifest as ERR_TOO_MANY_REDIRECTS in the browser.
  it("throws at construction when a protect pattern matches the default signInPath", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/**"] })).toThrow(/infinite redirect loop/)
  })

  it("throws at construction when a protect pattern matches a custom signInPath", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/login", "/admin/**"], signInPath: "/login" })).toThrow(
      /infinite redirect loop/,
    )
  })

  // `/sign-in/*` is a legitimate way to protect sub-routes under the
  // sign-in path (e.g. /sign-in/forgot-password). It matches /sign-in/
  // but not the bare /sign-in that the unauthenticated redirect targets,
  // so it cannot actually loop — the runtime short-circuit below covers
  // the trailingSlash:true /sign-in/ case. The earlier boot guard
  // rejected this as a false positive; the narrowed guard accepts it.
  it("does NOT throw when protect uses `/sign-in/*` (matches sub-paths, not bare signInPath)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/sign-in/*"] })).not.toThrow()
  })

  // Defense-in-depth: even if a consumer rewrite layer hands us a
  // trailing-slash pathname at request time (without it being declared in
  // `protect`), the runtime short-circuit still passes through.
  it("passes through requests to signInPath with a trailing slash", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    expect(mw(makeReq({ pathname: "/sign-in/" }) as unknown as Parameters<typeof mw>[0])).toEqual({ type: "next" })
  })

  // Path-to-regexp's `?` (optional) and `+` (one-or-more) modifiers are
  // familiar to Next.js consumers, but we don't compile them — silently
  // escaping the trailing punctuation as a literal would produce a regex
  // that matches nothing, so the `protect` pattern would let
  // unauthenticated traffic past. Refuse loudly at construction instead.
  it("throws at construction on unsupported `:name?` modifier", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/:path?"] })).toThrow(/unsupported modifier/)
  })

  it("throws at construction on unsupported `:name+` modifier", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/:path+"] })).toThrow(/unsupported modifier/)
  })

  // Same auth-bypass class as the `:name?` case above but via the glob
  // shape: `**?`, `**+`, `*?`, `*+`, `:name*?`, `:name*+`. Before SEGMENT_RE
  // captured the modifier as part of the glob token, these tokenized as
  // bare `**` / `*` / `:name*` followed by a literal `?`/`+` in the
  // post-token escape path — producing a regex like `^/admin(?:/.*)?\?$`
  // that matches no real pathname, so `/admin/...` requests would silently
  // bypass `protect`.
  it("throws at construction on `**?` (glob + ? modifier)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/**?"] })).toThrow(/unsupported modifier/)
  })
  it("throws at construction on `**+` (glob + + modifier)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/**+"] })).toThrow(/unsupported modifier/)
  })
  it("throws at construction on `*?` (single glob + ? modifier)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/*?"] })).toThrow(/unsupported modifier/)
  })
  it("throws at construction on `*+` (single glob + + modifier)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/*+"] })).toThrow(/unsupported modifier/)
  })
  it("throws at construction on `:name*?` (named glob + ? modifier)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/:path*?"] })).toThrow(/unsupported modifier/)
  })
  it("throws at construction on `:name*+` (named glob + + modifier)", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    expect(() => createMiddleware({ protect: ["/admin/:path*+"] })).toThrow(/unsupported modifier/)
  })

  // basePath: under `next.config.js: { basePath: '/app' }`, the request
  // `nextUrl.pathname` is already basePath-stripped, but
  // `NextResponse.redirect(absoluteURL)` does NOT re-prepend it. The
  // helper has to thread basePath into BOTH the redirect target and the
  // callbackUrl so the post-sign-in roundtrip lands at the right URL.
  it("preserves nextUrl.basePath in redirect target and callbackUrl", async () => {
    redirectCalls.length = 0
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/admin/:path*"] })
    mw(
      makeReq({
        pathname: "/admin/users",
        search: "?q=1",
        basePath: "/app",
      }) as unknown as Parameters<typeof mw>[0],
    )
    expect(redirectCalls).toHaveLength(1)
    expect(redirectCalls[0]!.pathname).toBe("/app/sign-in")
    expect(redirectCalls[0]!.searchParams.get("callbackUrl")).toBe("/app/admin/users?q=1")
  })
})
