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
})
