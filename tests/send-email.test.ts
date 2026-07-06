import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn<(args: any) => Promise<void>>(async () => {})
const resendSpy = vi.fn<(args: any) => Promise<void>>(async () => {})
const postalSpy = vi.fn<(args: any) => Promise<void>>(async () => {})

vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: resendSpy }))
vi.mock("../src/email/postal", () => ({ sendViaPostal: postalSpy }))

describe("sendEmail transport selection", () => {
  let originalKey: string | undefined
  let originalFrom: string | undefined
  let originalTransport: string | undefined
  let originalPostalApiUrl: string | undefined
  let originalPostalApiKey: string | undefined

  beforeEach(() => {
    originalKey = process.env.RESEND_API_KEY
    originalFrom = process.env.EMAIL_FROM
    originalTransport = process.env.EMAIL_TRANSPORT
    originalPostalApiUrl = process.env.POSTAL_API_URL
    originalPostalApiKey = process.env.POSTAL_API_KEY
    consoleSpy.mockClear()
    resendSpy.mockClear()
    postalSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    if (originalFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = originalFrom
    if (originalTransport === undefined) delete process.env.EMAIL_TRANSPORT
    else process.env.EMAIL_TRANSPORT = originalTransport
    if (originalPostalApiUrl === undefined) delete process.env.POSTAL_API_URL
    else process.env.POSTAL_API_URL = originalPostalApiUrl
    if (originalPostalApiKey === undefined) delete process.env.POSTAL_API_KEY
    else process.env.POSTAL_API_KEY = originalPostalApiKey
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

  it("uses Postal when EMAIL_TRANSPORT=postal", async () => {
    process.env.EMAIL_TRANSPORT = "postal"
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
    expect(postalSpy).toHaveBeenCalledTimes(1)
    expect(resendSpy).not.toHaveBeenCalled()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it("uses Resend when EMAIL_TRANSPORT=resend even without an API key env heuristic", async () => {
    process.env.EMAIL_TRANSPORT = "resend"
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
    expect(resendSpy).toHaveBeenCalledTimes(1)
    expect(postalSpy).not.toHaveBeenCalled()
  })

  it("uses console when EMAIL_TRANSPORT=console even with RESEND_API_KEY present", async () => {
    process.env.EMAIL_TRANSPORT = "console"
    process.env.RESEND_API_KEY = "re_x"
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(resendSpy).not.toHaveBeenCalled()
  })
})
