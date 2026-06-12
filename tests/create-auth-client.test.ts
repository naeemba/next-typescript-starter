import { describe, it, expect, expectTypeOf } from "vitest"
import {
  createAuthClient,
  type AuthClient,
  type AuthClientWithoutPasskey,
  type PasskeyAuthClient,
} from "../src/client/index"

// Type-level assertion (never invoked): `passkey: false` MUST narrow the
// return type so `client.passkey.addPasskey` is no longer reachable in TS.
// Without overloads the unconditional `& PasskeyAuthClient` made the runtime
// `undefined` invisible to the compiler.
function _createAuthClientReturnNarrowing() {
  const full = createAuthClient({ baseURL: "x" })
  expectTypeOf(full).toMatchTypeOf<PasskeyAuthClient>()

  const minimal = createAuthClient({ baseURL: "x", passkey: false })
  // @ts-expect-error — passkey surface must NOT be reachable when passkey: false
  minimal.passkey.addPasskey
  expectTypeOf<typeof minimal>().toEqualTypeOf<AuthClientWithoutPasskey>()
  expectTypeOf<typeof full>().toEqualTypeOf<AuthClient>()
}
void _createAuthClientReturnNarrowing

describe("createAuthClient", () => {
  it("returns a client with signIn.magicLink, signOut, useSession", () => {
    const client = createAuthClient({ baseURL: "https://app.example.com" })
    expect(client).toBeDefined()
    expect(typeof client.signOut).toBe("function")
    expect(typeof (client as any).useSession).toBe("function")
    expect(typeof (client as any).signIn?.magicLink).toBe("function")
  })

  it("loads the passkey client plugin by default", () => {
    const client = createAuthClient({ baseURL: "https://app.example.com" })
    expect(typeof client.signIn.passkey).toBe("function")
    expect(typeof client.passkey.addPasskey).toBe("function")
  })

  it("omits the passkey client plugin when passkey: false", () => {
    const client = createAuthClient({ baseURL: "https://app.example.com", passkey: false })
    // The better-auth client wraps access in a Proxy; rather than assert the
    // method is undefined (which the Proxy's primitive-conversion misbehaves
    // on), assert that the top-level keys advertise no passkey surface.
    expect(Object.keys(client)).not.toContain("passkey")
  })
})
