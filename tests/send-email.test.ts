import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn<(args: any) => Promise<void>>(async () => {})
const resendSpy = vi.fn<(args: any) => Promise<void>>(async () => {})

vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: resendSpy }))

describe("sendEmail transport selection", () => {
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
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(resendSpy).not.toHaveBeenCalled()
    expect(consoleSpy.mock.calls[0]![0]).toMatchObject({
      to: "a@example.com",
      from: "auth@example.com",
      subject: "Hi",
      text: "plain",
    })
  })

  it("uses Resend transport when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain", html: "<b>plain</b>" })
    expect(resendSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it("uses opts.from when provided, overriding EMAIL_FROM", async () => {
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_FROM = "default@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", from: "custom@example.com", subject: "Hi", text: "x" })
    expect(consoleSpy.mock.calls[0]![0].from).toBe("custom@example.com")
  })

  it("throws when no `from` and no EMAIL_FROM env", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    const { sendEmail } = await import("../src/email/index")
    await expect(sendEmail({ to: "a@example.com", subject: "Hi", text: "x" })).rejects.toThrow(
      /EMAIL_FROM|from/
    )
  })

  it("passes html as undefined (not empty string) when no html provided", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain only" })
    expect(resendSpy).toHaveBeenCalledTimes(1)
    expect(resendSpy.mock.calls[0]![0].html).toBeUndefined()
  })
})
