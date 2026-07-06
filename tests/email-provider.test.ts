import { describe, it, expect } from "vitest"
import { resolveProvider } from "../src/email/provider.js"

describe("resolveProvider", () => {
  it("returns the explicit EMAIL_TRANSPORT when valid", () => {
    expect(resolveProvider({ EMAIL_TRANSPORT: "postal" })).toBe("postal")
    expect(resolveProvider({ EMAIL_TRANSPORT: "resend" })).toBe("resend")
    expect(resolveProvider({ EMAIL_TRANSPORT: "console" })).toBe("console")
  })

  it("explicit value wins even when RESEND_API_KEY is present", () => {
    expect(resolveProvider({ EMAIL_TRANSPORT: "console", RESEND_API_KEY: "re_x" })).toBe("console")
  })

  it("falls back to resend when unset and RESEND_API_KEY present", () => {
    expect(resolveProvider({ RESEND_API_KEY: "re_x" })).toBe("resend")
  })

  it("falls back to console when unset and no RESEND_API_KEY", () => {
    expect(resolveProvider({})).toBe("console")
  })

  it("ignores an unrecognized EMAIL_TRANSPORT and uses the auto heuristic", () => {
    expect(resolveProvider({ EMAIL_TRANSPORT: "sendgrid", RESEND_API_KEY: "re_x" })).toBe("resend")
    expect(resolveProvider({ EMAIL_TRANSPORT: "sendgrid" })).toBe("console")
  })
})
