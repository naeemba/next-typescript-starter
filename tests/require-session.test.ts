import { describe, it, expect, vi, beforeEach } from "vitest"

const redirectSpy = vi.fn((url: string) => {
  throw new Error(`__REDIRECT__${url}`)
})
vi.mock("next/navigation", () => ({ redirect: redirectSpy }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))

describe("createServer(auth)", () => {
  beforeEach(() => {
    redirectSpy.mockClear()
    vi.resetModules()
  })

  it("requireSession redirects to /sign-in when getSession returns null", async () => {
    const fakeAuth = { api: { getSession: async () => null } } as any
    const { createServer } = await import("../src/server/index")
    const { requireSession } = createServer(fakeAuth)
    await expect(requireSession()).rejects.toThrow("__REDIRECT__/sign-in")
    expect(redirectSpy).toHaveBeenCalledWith("/sign-in")
  })

  it("requireSession honors redirectTo opt", async () => {
    const fakeAuth = { api: { getSession: async () => null } } as any
    const { createServer } = await import("../src/server/index")
    const { requireSession } = createServer(fakeAuth)
    await expect(requireSession({ redirectTo: "/login" })).rejects.toThrow("__REDIRECT__/login")
  })

  it("requireSession returns session when present", async () => {
    const fakeSession = { user: { id: "u_1", email: "a@b.com" }, session: { id: "s_1" } }
    const fakeAuth = { api: { getSession: async () => fakeSession } } as any
    const { createServer } = await import("../src/server/index")
    const { requireSession } = createServer(fakeAuth)
    const result = await requireSession()
    expect(result).toBe(fakeSession)
    expect(redirectSpy).not.toHaveBeenCalled()
  })

  it("getSession returns whatever auth.api.getSession returns", async () => {
    const fakeAuth = { api: { getSession: async () => null } } as any
    const { createServer } = await import("../src/server/index")
    const { getSession } = createServer(fakeAuth)
    expect(await getSession()).toBeNull()
  })
})
