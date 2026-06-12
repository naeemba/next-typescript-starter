import { NextResponse, type NextRequest } from "next/server"

export interface CreateMiddlewareOptions {
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

const SEGMENT_RE = /:[a-zA-Z_][a-zA-Z0-9_]*\*?|\*\*|\*/g

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

export function createMiddleware(opts: CreateMiddlewareOptions) {
  if (!opts.protect || opts.protect.length === 0) {
    throw new Error(
      "[@naeemba/next-starter] createMiddleware: 'protect' must be a non-empty array. Pass at least one path pattern (e.g. ['/admin/:path*']).",
    )
  }
  const signInPath = opts.signInPath ?? "/sign-in"
  const callbackParam = opts.callbackParam ?? "callbackUrl"
  const cookiePrefix = opts.cookiePrefix ?? "better-auth"
  const cookieNames = [`${cookiePrefix}.session_token`, `__Secure-${cookiePrefix}.session_token`]
  const compiled = opts.protect.map((p) => compile(p))

  return function middleware(req: NextRequest): NextResponse {
    const pathname = req.nextUrl.pathname
    const isProtected = compiled.some((re) => re.test(pathname))
    if (!isProtected) return NextResponse.next()

    const hasSession = cookieNames.some((name) => Boolean(req.cookies.get(name)?.value))
    if (hasSession) return NextResponse.next()

    const target = new URL(signInPath, req.nextUrl.origin)
    target.searchParams.set(callbackParam, pathname + req.nextUrl.search)
    return NextResponse.redirect(target)
  }
}
