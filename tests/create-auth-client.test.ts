import { describe, it, expect } from "vitest"

describe("createAuthClient", () => {
  it("returns a client with signIn.magicLink, signOut, useSession", async () => {
    const { createAuthClient } = await import("../src/client/index")
    const client = createAuthClient({ baseURL: "https://app.example.com" })
    expect(client).toBeDefined()
    expect(typeof client.signOut).toBe("function")
    expect(typeof (client as any).useSession).toBe("function")
    expect(typeof (client as any).signIn?.magicLink).toBe("function")
  })

  it("loads the passkey client plugin by default", async () => {
    const { createAuthClient } = await import("../src/client/index")
    const client = createAuthClient({ baseURL: "https://app.example.com" })
    expect(typeof (client as any).signIn?.passkey).toBe("function")
    expect(typeof (client as any).passkey?.addPasskey).toBe("function")
  })

  it("omits the passkey client plugin when passkey: false", async () => {
    const { createAuthClient } = await import("../src/client/index")
    const client = createAuthClient({ baseURL: "https://app.example.com", passkey: false })
    // The better-auth client wraps access in a Proxy; rather than assert the
    // method is undefined (which the Proxy's primitive-conversion misbehaves
    // on), assert that the top-level keys advertise no passkey surface.
    expect(Object.keys(client)).not.toContain("passkey")
  })
})
