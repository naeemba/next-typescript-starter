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
}) {
  const origin = opts.origin ?? "https://app.example.com"
  const url = new URL(`${origin}${opts.pathname}${opts.search ?? ""}`)
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

  // Without the short-circuit, `protect: ['/**']` matches `/sign-in` and the
  // unauthenticated redirect loops forever (ERR_TOO_MANY_REDIRECTS in browser).
  it("does NOT redirect when the request is already at signInPath, even if protect matches it", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/**"] })
    expect(mw(makeReq({ pathname: "/sign-in" }) as unknown as Parameters<typeof mw>[0])).toEqual({ type: "next" })
    expect(mw(makeReq({ pathname: "/sign-in", search: "?callbackUrl=/admin" }) as unknown as Parameters<typeof mw>[0])).toEqual({ type: "next" })
  })

  it("does NOT redirect when a custom signInPath is matched by protect", async () => {
    const { createMiddleware } = await import("../src/middleware/index.js")
    const mw = createMiddleware({ protect: ["/login", "/admin/**"], signInPath: "/login" })
    expect(mw(makeReq({ pathname: "/login" }) as unknown as Parameters<typeof mw>[0])).toEqual({ type: "next" })
    expect(mw(makeReq({ pathname: "/admin/x" }) as unknown as Parameters<typeof mw>[0])).toMatchObject({ type: "redirect" })
  })
})
