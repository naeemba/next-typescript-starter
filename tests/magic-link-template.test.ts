import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn(async () => {})
vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: vi.fn(async () => {}) }))

describe("sendMagicLink template override", () => {
  let originalKey: string | undefined
  let originalFrom: string | undefined

  beforeEach(() => {
    originalKey = process.env.RESEND_API_KEY
    originalFrom = process.env.EMAIL_FROM
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_FROM = "default@example.com"
    consoleSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    if (originalFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = originalFrom
  })

  it("uses the built-in template when no override provided", async () => {
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "a@example.com", url: "https://app/verify?token=1" })
    expect(consoleSpy.mock.calls[0][0]).toMatchObject({
      to: "a@example.com",
      subject: "Sign in to your account",
      from: "default@example.com",
    })
  })

  it("uses caller-supplied subject/from/text when template provided", async () => {
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({
      to: "a@example.com",
      url: "https://app/verify?token=1",
      template: ({ url, expiresIn }) => ({
        subject: "Your Studio sign-in link",
        from: "noreply@studio.example",
        text: `Open ${url} within ${expiresIn / 60} minutes.`,
      }),
    })
    expect(consoleSpy.mock.calls[0][0]).toMatchObject({
      to: "a@example.com",
      subject: "Your Studio sign-in link",
      from: "noreply@studio.example",
      text: "Open https://app/verify?token=1 within 10 minutes.",
    })
  })

  it("awaits async template", async () => {
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({
      to: "a@example.com",
      url: "https://app/x",
      template: async ({ url }) => ({ subject: "Async subj", text: url }),
    })
    expect(consoleSpy.mock.calls[0][0].subject).toBe("Async subj")
  })
})
