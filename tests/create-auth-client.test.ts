import { describe, it, expect, expectTypeOf } from "vitest"
import { passkeyClient } from "@better-auth/passkey/client"
import {
  createAuthClient,
  type AuthClient,
  type AuthClientWithoutPasskey,
  type PasskeyAuthClient,
} from "../src/client/index"

// Type-level assertion (never invoked): passing the passkeyClient factory
// MUST widen the return type so `client.passkey.addPasskey` is reachable;
// omitting it (or `passkey: false`) MUST narrow it away. Without the
// overload, the structural `PasskeyClientFactory` couldn't be discriminated.
function _createAuthClientReturnNarrowing() {
  const withPasskey = createAuthClient({ baseURL: "x", passkey: passkeyClient })
  expectTypeOf(withPasskey).toMatchTypeOf<PasskeyAuthClient>()

  const minimal = createAuthClient({ baseURL: "x" })
  // @ts-expect-error — passkey surface must NOT be reachable when no factory is passed
  minimal.passkey.addPasskey
  expectTypeOf<typeof minimal>().toEqualTypeOf<AuthClientWithoutPasskey>()
  expectTypeOf<typeof withPasskey>().toEqualTypeOf<AuthClient>()

  const explicitFalse = createAuthClient({ baseURL: "x", passkey: false })
  expectTypeOf<typeof explicitFalse>().toEqualTypeOf<AuthClientWithoutPasskey>()
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

  it("loads the passkey client plugin when the factory is passed", () => {
    const client = createAuthClient({
      baseURL: "https://app.example.com",
      passkey: passkeyClient,
    })
    expect(typeof client.signIn.passkey).toBe("function")
    expect(typeof client.passkey.addPasskey).toBe("function")
  })

  it("omits the passkey client plugin when no factory is passed (default)", () => {
    const client = createAuthClient({ baseURL: "https://app.example.com" })
    // The better-auth client wraps access in a Proxy; rather than assert the
    // method is undefined (which the Proxy's primitive-conversion misbehaves
    // on), assert that the top-level keys advertise no passkey surface.
    expect(Object.keys(client)).not.toContain("passkey")
  })

  it("omits the passkey client plugin when passkey: false is explicit", () => {
    const client = createAuthClient({
      baseURL: "https://app.example.com",
      passkey: false,
    })
    expect(Object.keys(client)).not.toContain("passkey")
  })
})
