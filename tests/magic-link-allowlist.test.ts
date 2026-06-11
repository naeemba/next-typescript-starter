import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const sendMagicLinkSpy = vi.fn<(args: any) => Promise<void>>(async () => {})
vi.mock("../src/email/index", async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, sendMagicLink: sendMagicLinkSpy }
})

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

describe("createAuth — magicLink.allowlist", () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
    Object.assign(process.env, validEnv)
    sendMagicLinkSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    process.env = savedEnv
  })

  it("not called when allowlist returns false", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const allowlist = vi.fn((email: string) => email === "admin@example.com")
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist,
      customTemplate: undefined,
    })
    await hook({ email: "stranger@example.com", url: "https://app/x" })
    expect(allowlist).toHaveBeenCalledWith("stranger@example.com")
    expect(sendMagicLinkSpy).not.toHaveBeenCalled()
  })

  it("called when allowlist returns true", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const allowlist = vi.fn((email: string) => email === "admin@example.com")
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist,
      customTemplate: undefined,
    })
    await hook({ email: "admin@example.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
    expect(sendMagicLinkSpy.mock.calls[0]![0]).toMatchObject({
      to: "admin@example.com",
      url: "https://app/x",
    })
  })

  it("always called when no allowlist provided", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist: undefined,
      customTemplate: undefined,
    })
    await hook({ email: "anyone@example.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
  })

  it("awaits async allowlist", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const allowlist = vi.fn(async (email: string) => email.endsWith("@allowed.com"))
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist,
      customTemplate: undefined,
    })
    await hook({ email: "x@blocked.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).not.toHaveBeenCalled()
    await hook({ email: "x@allowed.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
  })
})
