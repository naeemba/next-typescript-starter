import { describe, it, expect } from "vitest"
import { toSafeRelativePath } from "../src/internal/safe-redirect"

describe("toSafeRelativePath", () => {
  it.each([
    ["/", "/"],
    ["/dashboard", "/dashboard"],
    ["/dashboard?tab=a#x", "/dashboard?tab=a#x"],
    ["/@evil.com", "/@evil.com"],
    ["/a/b%20c", "/a/b%20c"],
  ])("keeps %s", (value, expected) => {
    expect(toSafeRelativePath(value)).toBe(expected)
  })

  // Each value is what the guard sees after URLSearchParams decodes the query
  // once, so `?callbackUrl=/%09/evil.com` arrives as "/\t/evil.com".
  it.each([
    ["tab before the second slash (%09)", "/\t/evil.com"],
    ["newline before the second slash (%0A)", "/\n/evil.com"],
    ["carriage return (%0D)", "/\r/evil.com"],
    ["backslash (%5C)", "/\\evil.com"],
    ["slash then backslash", "/\\/evil.com"],
    ["leading backslash", "\\\\evil.com"],
    ["scheme-relative", "//evil.com"],
    ["scheme-relative with userinfo", "//user:pass@evil.com"],
    ["absolute https", "https://evil.com/x"],
    ["absolute with userinfo", "https://app.test@evil.com/"],
    ["same-origin absolute", "http://localhost:3000/admin"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["bare host", "evil.com"],
    ["double-encoded tab", "/%09/evil.com"],
    ["double-encoded newline", "/%0a/evil.com"],
    ["double-encoded backslash", "/%5Cevil.com"],
    ["double-encoded second slash", "/%2F/evil.com"],
    ["malformed percent-encoding", "/%E0%A4%A"],
    ["empty", ""],
  ])("rejects %s", (_, value) => {
    expect(toSafeRelativePath(value)).toBeNull()
  })

  it("rejects null and undefined", () => {
    expect(toSafeRelativePath(null)).toBeNull()
    expect(toSafeRelativePath(undefined)).toBeNull()
  })
})
