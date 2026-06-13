import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setupAuthEnv, restoreAuthEnv } from "./helpers/auth-internals"

describe("createAuth({ transport })", () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    restoreAuthEnv()
  })

  it("uses the injected transport instead of Resend/console for magic-link mail", async () => {
    setupAuthEnv()
    const transport: any = vi.fn(async () => undefined)
    const { __testHooks } = await import("../src/auth/index")
    const send = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      transport,
    })
    await send({ email: "a@example.com", url: "https://app.example.com/magic-link/verify?token=x" })
    expect(transport).toHaveBeenCalledTimes(1)
    const arg = transport.mock.calls[0][0] as {
      to: string
      from: string
      subject: string
      text?: string
      html?: string
    }
    expect(arg.to).toBe("a@example.com")
    expect(arg.subject).toBeTypeOf("string")
    // The default template still renders — the transport just dispatches.
    expect(arg.html).toBeTypeOf("string")
    expect(arg.html).toContain("https://app.example.com/magic-link/verify?token=x")
  })

  it("does NOT touch Resend when transport is provided (no RESEND_API_KEY needed)", async () => {
    setupAuthEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: "auth@example.com" })
    const transport = vi.fn(async () => undefined)
    const { __testHooks } = await import("../src/auth/index")
    const send = __testHooks.buildSendMagicLink({ magicLinkExpiresIn: 600, transport })
    // If transport weren't honored, this would fall through to the console
    // path which writes to stdout. We only verify the transport was called
    // with no error; resend module is not imported.
    await expect(
      send({ email: "a@example.com", url: "https://app.example.com/verify?t=x" }),
    ).resolves.toBeUndefined()
    expect(transport).toHaveBeenCalled()
  })

  it("transport composes with allowlist — rejected emails never invoke transport", async () => {
    setupAuthEnv()
    const transport = vi.fn(async () => undefined)
    const { __testHooks } = await import("../src/auth/index")
    const send = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      transport,
      allowlist: (email) => email === "ok@example.com",
    })
    await send({ email: "bad@example.com", url: "https://app.example.com/verify?t=x" })
    expect(transport).not.toHaveBeenCalled()
    await send({ email: "ok@example.com", url: "https://app.example.com/verify?t=x" })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("transport works alongside a customTemplate", async () => {
    setupAuthEnv()
    const transport: any = vi.fn(async () => undefined)
    const { __testHooks } = await import("../src/auth/index")
    const send = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      transport,
      customTemplate: async ({ to, url }) => ({
        subject: "Custom subject",
        text: `Custom body for ${to}: ${url}`,
      }),
    })
    await send({ email: "a@example.com", url: "https://app.example.com/verify?t=x" })
    const arg = transport.mock.calls[0][0] as { subject: string; text?: string }
    expect(arg.subject).toBe("Custom subject")
    expect(arg.text).toContain("Custom body for a@example.com")
  })

  it("createAuth({ transport }) wires the transport into the plugin's sendMagicLink", async () => {
    setupAuthEnv()
    const { createAuth } = await import("../src/auth/index")
    const transport = vi.fn(async () => undefined)
    const auth = await createAuth({ transport })
    // Drill into the magic-link plugin instance and call its sendMagicLink.
    type PluginShape = {
      id?: string
      options?: { sendMagicLink?: (args: { email: string; url: string; token?: string }) => Promise<void> }
    }
    const plugin = (auth as { options: { plugins: PluginShape[] } }).options.plugins.find(
      (p) => p.id === "magic-link",
    )
    expect(plugin?.options?.sendMagicLink).toBeTypeOf("function")
    await plugin!.options!.sendMagicLink!({
      email: "a@example.com",
      url: "https://app.example.com/verify?t=x",
    })
    expect(transport).toHaveBeenCalled()
  })
})
