import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn(async () => {})
const resendSpy = vi.fn(async () => {})

vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: resendSpy }))
vi.mock("@react-email/render", () => ({
  render: async () => "<html>rendered</html>",
}))

describe("sendMagicLink transport selection", () => {
  let originalKey: string | undefined
  let originalFrom: string | undefined

  beforeEach(() => {
    originalKey = process.env.RESEND_API_KEY
    originalFrom = process.env.EMAIL_FROM
    consoleSpy.mockClear()
    resendSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    if (originalFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = originalFrom
  })

  it("uses console transport when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "a@example.com", url: "https://x/verify?token=1" })
    expect(consoleSpy).toHaveBeenCalledOnce()
    expect(resendSpy).not.toHaveBeenCalled()
  })

  it("uses Resend transport when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test"
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "b@example.com", url: "https://x/verify?token=2" })
    expect(resendSpy).toHaveBeenCalledOnce()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it("falls back to a sentinel from-address when EMAIL_FROM is unset", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "c@example.com", url: "https://x/verify?token=3" })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ from: "auth@example.invalid" })
    )
  })
})
