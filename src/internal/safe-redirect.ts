// Open-redirect defense shared by every place in the package that follows a
// callback, redirect or "next" URL. Only a same-origin relative path survives.
//
// A prefix test on the raw string is not enough. The URL parser strips tab,
// CR and LF and reads `\` as `/`, so `/<tab>/evil.com` passes a "starts with
// one slash, not two" check and still navigates to evil.com. The query-string
// form `?callbackUrl=/%09/evil.com` arrives here already decoded to that tab.
//
// The path is checked twice: as given, and percent-decoded once, so a
// double-encoded `/%2509/evil.com` or `/%2F/evil.com` cannot slip a second
// slash past a consumer that decodes again before redirecting. The query and
// hash are left encoded: they are data, so `/files?dir=C%3A%5Cdocs` survives.
// Then the value is parsed against a placeholder origin and the parsed path,
// query and hash are checked again before being returned, because the parser
// collapses dot segments and turns `/.//evil.com` into `//evil.com`.

const PLACEHOLDER_ORIGIN = "http://same-origin.invalid"

// Control characters (tab, CR, LF and the rest of C0, plus DEL) and backslash.
const UNSAFE_CHARACTER = /[\u0000-\u001f\u007f\\]/

function isPlainRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !UNSAFE_CHARACTER.test(value)
}

function isSafeRelativePath(value: string): boolean {
  if (!isPlainRelativePath(value)) return false
  try {
    return isPlainRelativePath(decodeURIComponent(value.replace(/[?#].*/s, "")))
  } catch {
    return false
  }
}

/**
 * Returns `value` as a same-origin relative path (`/path?query#hash`), or
 * `null` when it is anything else: absolute or scheme-relative URLs
 * (`https://…`, `//evil.com`), `javascript:` / `data:` schemes, `/\evil.com`,
 * userinfo tricks, or any tab, newline or backslash, raw or percent-encoded.
 */
export function toSafeRelativePath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !isSafeRelativePath(value)) return null
  // Cannot throw: a root-relative path always parses against a valid base.
  const parsed = new URL(value, PLACEHOLDER_ORIGIN)
  const relativePath = parsed.pathname + parsed.search + parsed.hash
  return isSafeRelativePath(relativePath) ? relativePath : null
}
