import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createAuth } from "../src/auth/index.js"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: "postgres://u:p@h/d",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
  }
})
afterEach(() => { process.env = { ...ORIGINAL_ENV } })

function pluginIds(auth: unknown): string[] {
  return ((auth as { options: { plugins?: Array<{ id?: string }> } }).options.plugins ?? [])
    .map((p) => p.id ?? "")
}

function passkeyPlugin(auth: unknown): { options?: { rpID?: string; rpName?: string; origin?: string } } | undefined {
  return ((auth as { options: { plugins?: Array<{ id?: string; options?: { rpID?: string; rpName?: string; origin?: string } }> } }).options.plugins ?? [])
    .find((p) => p.id === "passkey")
}

describe("createAuth({ passkey })", () => {
  it("loads the passkey plugin when opts.passkey is set", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: { rpName: "Acme" },
    })
    expect(pluginIds(auth)).toContain("passkey")
  })

  it("does NOT load the passkey plugin when opts.passkey is omitted", () => {
    const auth = createAuth({ db: {} as never })
    expect(pluginIds(auth)).not.toContain("passkey")
  })

  it("defaults rpID, rpName and origin from BETTER_AUTH_URL when not provided", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: {},
    })
    const p = passkeyPlugin(auth)
    expect(p?.options?.rpID).toBe("app.example.com")
    expect(p?.options?.rpName).toBe("app.example.com")
    expect(p?.options?.origin).toBe("https://app.example.com")
  })

  it("respects explicit rpName / rpID / origin", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: { rpName: "Acme", rpID: "acme.example", origin: "https://acme.example" },
    })
    const p = passkeyPlugin(auth)
    expect(p?.options?.rpName).toBe("Acme")
    expect(p?.options?.rpID).toBe("acme.example")
    expect(p?.options?.origin).toBe("https://acme.example")
  })
})
