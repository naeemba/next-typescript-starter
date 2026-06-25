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
      }
      accountLinking?: false | { trustedProviders: string[] }
    }>()
  })

  it("accepts passkey registration / authentication extensions (e.g. PRF)", () => {
    // Acceptance criterion: a consumer object enabling the PRF extension must
    // be assignable to CreateAuthOptions WITHOUT `@better-auth/passkey`
    // installed (the type re-declares the shape structurally instead of
    // importing the optional peer).
    expectTypeOf<{
      passkey: {
        rpName: string
        registration: { extensions: { prf: Record<string, never> } }
        authentication: { extensions: { prf: { eval: { first: BufferSource } } } }
      }
    }>().toMatchTypeOf<CreateAuthOptions>()
  })
})
