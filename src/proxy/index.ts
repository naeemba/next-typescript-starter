import { NextResponse, type NextRequest } from "next/server"

// Re-exported so consumers who write their own proxy (host canonicalization,
// geo gating, A/B routing, etc.) can still do the cheap session-cookie
// presence check this module uses internally without reaching past the
// package into `better-auth/cookies` directly.
export { getSessionCookie } from "better-auth/cookies"

export interface CreateProxyOptions {
  /**
   * Path patterns to protect. Supports a small subset of Next.js path syntax:
   *   `:name`    -> matches a single non-slash segment
   *   `:name*`   -> matches zero or more segments (greedy)
   *   `*`        -> matches a single segment
   *   `**`       -> matches any number of segments
   *
   * Patterns are anchored: `/admin/:path*` matches `/admin`, `/admin/users`,
   * `/admin/a/b/c` — but NOT `/admincenter`.
   */
  protect: string[]
  /** Sign-in path to redirect unauthenticated traffic to. Default: `/sign-in`. */
  signInPath?: string
  /** Query param used to round-trip the original URL. Default: `callbackUrl`. */
  callbackParam?: string
  /** better-auth cookie prefix. Default: `better-auth`. */
  cookiePrefix?: string
}

// Captures `:name`, `:name*`, `**`, and `*`. Trailing `?` / `+` are
// path-to-regexp modifiers (familiar to Next.js users) — we don't support them.
// Crucially the `[?+]?` tail is on every alternative — bare `:name`, named
// glob `:name*`, AND the standalone globs `**` / `*` — so a modifier on a
// glob (`**?`, `*+`, `:path*?`, ...) is captured as part of the same token
// and routed to the reject branch below. Without the glob+modifier tail,
// `**?` would tokenize as `**` followed by a literal `?` in the post-token
// text, producing a regex like `^/admin(?:/.*)?\?$` that matches no real
// pathname — unauthenticated traffic would silently flow past the gate.
const SEGMENT_RE = /:[a-zA-Z_][a-zA-Z0-9_]*\*?[?+]?|\*\*[?+]?|\*[?+]?/g

function compile(pattern: string): RegExp {
  const tokens: Array<{ start: number; end: number; replacement: string }> = []
  for (const match of pattern.matchAll(SEGMENT_RE)) {
    const raw = match[0]!
    const idx = match.index!
    const precededBySlash = idx > 0 && pattern[idx - 1] === "/"
    let start = idx
    let replacement: string
    if (raw === "**") {
      // `/**` should match zero or more segments (including the leading slash).
      // `**` not preceded by `/` is a glob inside a segment — still .* fits.
      if (precededBySlash) {
        start = idx - 1
        replacement = "(?:/.*)?"
      } else {
        replacement = ".*"
      }
    } else if (raw === "*") {
      replacement = "[^/]*"
    } else if (raw.endsWith("?") || raw.endsWith("+")) {
      // path-to-regexp modifiers we do not support. Falling through to
      // `escapeRegex` would literalize the `?`/`+` and silently match
      // nothing, letting unauthenticated traffic past `protect`. Refuse
      // at construction so the consumer notices instead.
      throw new Error(
        `[@naeemba/next-starter] createProxy: pattern '${pattern}' uses unsupported modifier ` +
          `'${raw}'. Supported segments are :name, :name*, *, and **. Drop the trailing '${raw.slice(-1)}' ` +
          `or rewrite the route (e.g. '/admin/:path*').`,
      )
    } else if (raw.endsWith("*")) {
      // `:name*` should match zero or more segments. Same logic as `**`.
      if (precededBySlash) {
        start = idx - 1
        replacement = "(?:/.*)?"
      } else {
        replacement = ".*"
      }
    } else {
      // `:name` — single non-slash segment.
      replacement = "[^/]+"
    }
    tokens.push({ start, end: idx + raw.length, replacement })
  }
  let cursor = 0
  let out = ""
  for (const t of tokens) {
    out += escapeRegex(pattern.slice(cursor, t.start)) + t.replacement
    cursor = t.end
  }
  out += escapeRegex(pattern.slice(cursor))
  return new RegExp(`^${out}$`)
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Build the `proxy` function for Next 16's `proxy.ts` convention.
 * Next 16 renamed `middleware.ts` -> `proxy.ts` and `middleware()` -> `proxy()`;
 * this package targets Next >= 16 and only ships the proxy form.
 *
 * ```ts
 * // proxy.ts (project root)
 * import { createProxy } from "@naeemba/next-starter/proxy"
 *
 * export default createProxy({
 *   protect: ["/admin/:path*", "/dashboard/:path*"],
 *   signInPath: "/sign-in",
 * })
 *
 * export const config = { matcher: ["/((?!_next/|favicon.ico|api/auth/).*)"] }
 * ```
 *
 * Edge-safe: only checks for the better-auth session cookie's *presence*.
 * The real auth gate stays at the server-component level via
 * `requireSession()` (cookie presence != a valid session).
 */
export function createProxy(opts: CreateProxyOptions) {
  if (!opts.protect || opts.protect.length === 0) {
    throw new Error(
      "[@naeemba/next-starter] createProxy: 'protect' must be a non-empty array. Pass at least one path pattern (e.g. ['/admin/:path*']).",
    )
  }
  const signInPath = opts.signInPath ?? "/sign-in"
  const callbackParam = opts.callbackParam ?? "callbackUrl"
  const cookiePrefix = opts.cookiePrefix ?? "better-auth"
  const cookieNames = [`${cookiePrefix}.session_token`, `__Secure-${cookiePrefix}.session_token`]
  const compiled = opts.protect.map((p) => compile(p))

  // Fail loud at construction when a `protect` pattern matches the bare
  // `signInPath` — that combination would deterministically loop the
  // unauthenticated redirect. We DON'T also probe the trailing-slash variant:
  //   pattern `/sign-in/*` (a legitimate way to protect sub-routes like
  //   `/sign-in/forgot-password`) matches `/sign-in/` but not `/sign-in`,
  //   and a request to `/sign-in/` is short-circuited at runtime below
  //   before the protect check runs. Probing the trailing variant here
  //   would reject that pattern as a false positive.
  const signInPathNoSlash = signInPath.replace(/\/+$/, "")
  const offending = opts.protect.find((_p, i) => compiled[i]!.test(signInPathNoSlash))
  if (offending !== undefined) {
    throw new Error(
      `[@naeemba/next-starter] createProxy: 'protect' pattern '${offending}' matches signInPath ` +
        `('${signInPath}') and would cause an infinite redirect loop. Narrow the pattern, exclude ` +
        `the sign-in path, or pass a different signInPath.`,
    )
  }

  return function proxy(req: NextRequest): NextResponse {
    const pathname = req.nextUrl.pathname
    // Defense-in-depth: even with the boot-time guard above, a consumer
    // rewrite upstream could still hand us `/sign-in/` under
    // `trailingSlash: true`. Normalize both sides before comparing.
    if (pathname === signInPath || pathname.replace(/\/+$/, "") === signInPathNoSlash) {
      return NextResponse.next()
    }
    const isProtected = compiled.some((re) => re.test(pathname))
    if (!isProtected) return NextResponse.next()

    const hasSession = cookieNames.some((name) => Boolean(req.cookies.get(name)?.value))
    if (hasSession) return NextResponse.next()

    // `req.nextUrl.basePath` is "" unless the consumer set `basePath` in
    // next.config.js — in which case `pathname` here is already basePath-
    // stripped, and `NextResponse.redirect(absoluteURL)` does NOT re-prepend
    // it. Cloning and assigning a basePath-prefixed pathname is what makes
    // the redirect (and the callbackUrl roundtrip) resolve correctly on
    // sub-path deployments.
    const basePath = req.nextUrl.basePath
    const target = req.nextUrl.clone()
    target.pathname = basePath + signInPath
    target.search = ""
    target.searchParams.set(callbackParam, basePath + pathname + req.nextUrl.search)
    return NextResponse.redirect(target)
  }
}
