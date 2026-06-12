import { describe, it, expectTypeOf } from "vitest"
import type { CreateAuthOptions } from "../src/auth/index.js"

describe("CreateAuthOptions", () => {
  it("accepts google + passkey + accountLinking options", () => {
    expectTypeOf<CreateAuthOptions>().toMatchTypeOf<{
      google?: {
        clientId?: string
        clientSecret?: string
        scopes?: string[]
        allowlist?: (profile: { email: string; emailVerified: boolean }) =>
          boolean | Promise<boolean>
      }
      passkey?: {
        rpName?: string
        rpID?: string
        origin?: string
        allowlist?: (user: { id: string; email: string }) =>
          boolean | Promise<boolean>
      }
      accountLinking?: false | { trustedProviders: string[] }
    }>()
  })
})
