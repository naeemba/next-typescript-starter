import { describe, it, expect, vi, afterEach } from "vitest"
import { sendViaConsole } from "../src/email/console"

describe("sendViaConsole", () => {
  const logs: string[] = []
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })

  afterEach(() => {
    logs.length = 0
  })

  it("emits a single machine-readable line containing email and url", async () => {
    await sendViaConsole({
      to: "alice@example.com",
      from: "auth@example.com",
      subject: "Sign in",
      html: "<p>...</p>",
      text: "Sign in: https://app.local/api/auth/magic-link/verify?token=abc",
    })
    const machineLine = logs.find((l) => l.startsWith("[magic-link-log]"))
    expect(machineLine).toBeDefined()
    expect(machineLine).toMatch(/email=alice@example\.com/)
    expect(machineLine).toMatch(/url=https:\/\/app\.local\/api\/auth\/magic-link\/verify\?token=abc/)
  })

  it("also emits a human-readable header block", async () => {
    await sendViaConsole({
      to: "bob@example.com",
      from: "auth@example.com",
      subject: "Sign in",
      html: "<p>...</p>",
      text: "Sign in: https://app.local/api/auth/magic-link/verify?token=xyz",
    })
    expect(logs.some((l) => l.includes("dev mode"))).toBe(true)
    expect(logs.some((l) => l.includes("bob@example.com"))).toBe(true)
  })

  afterEach(() => spy.mockClear())
})
