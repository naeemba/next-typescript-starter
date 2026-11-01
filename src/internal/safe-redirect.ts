// Open-redirect defense shared by every place in the package that follows a
// callback, redirect or "next" URL. Only a same-origin relative path survives.
//
// A prefix test on the raw string is not enough. The URL parser strips tab,
// CR and LF and reads `\` as `/`, so `/<tab>/evil.com` passes a "starts with
// one slash, not two" check and still navigates to evil.com. The query-string
// form `?callbackUrl=/%09/evil.com` arrives here already decoded to that tab.
//
// The value is checked twice: as given, and percent-decoded once, so a
// double-encoded `/%2509/evil.com` or `/%2F/evil.com` cannot slip a second
// slash past a consumer that decodes again before redirecting. Then it is
// parsed against a placeholder origin and only the parsed path, query and
// hash are returned, leaving nothing for the browser to reinterpret.

const PLACEHOLDER_ORIGIN = "http://same-origin.invalid"

// Control characters (tab, CR, LF and the rest of C0, plus DEL) and backslash.
const UNSAFE_CHARACTER = /[\u0000-\u001f\u007f\\]/

function isPlainRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !UNSAFE_CHARACTER.test(value)
}

/**
 * Returns `value` as a same-origin relative path (`/path?query#hash`), or
 * `null` when it is anything else: absolute or scheme-relative URLs
 * (`https://…`, `//evil.com`), `javascript:` / `data:` schemes, `/\evil.com`,
 * userinfo tricks, or any tab, newline or backslash, raw or percent-encoded.
 */
export function toSafeRelativePath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !isPlainRelativePath(value)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  if (!isPlainRelativePath(decoded)) return null
  try {
    const parsed = new URL(value, PLACEHOLDER_ORIGIN)
    if (parsed.origin !== PLACEHOLDER_ORIGIN) return null
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return null
  }
}
