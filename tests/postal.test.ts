import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { sendViaPostal } from "../src/email/postal"

const ARGS = {
  to: "user@example.com",
  from: "auth@example.com",
  subject: "Sign in",
  html: "<p>link</p>",
  text: "link",
}

describe("sendViaPostal", () => {
  let originalUrl: string | undefined
  let originalKey: string | undefined
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalUrl = process.env.POSTAL_API_URL
    originalKey = process.env.POSTAL_API_KEY
    process.env.POSTAL_API_URL = "https://postal.example.com"
    process.env.POSTAL_API_KEY = "postal_key_123"
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "success" }),
    }))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalUrl === undefined) delete process.env.POSTAL_API_URL
    else process.env.POSTAL_API_URL = originalUrl
    if (originalKey === undefined) delete process.env.POSTAL_API_KEY
    else process.env.POSTAL_API_KEY = originalKey
  })

  it("posts to the Postal send endpoint with the API key header and mapped body", async () => {
    await sendViaPostal(ARGS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://postal.example.com/api/v1/send/message")
    expect(init.method).toBe("POST")
    expect(init.headers["X-Server-API-Key"]).toBe("postal_key_123")
    expect(JSON.parse(init.body)).toEqual({
      to: ["user@example.com"],
      from: "auth@example.com",
      subject: "Sign in",
      html_body: "<p>link</p>",
      plain_body: "link",
    })
  })

  it("throws when Postal returns a non-success status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "error" }),
    })
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/Postal send failed/)
  })

  it("throws when the HTTP response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => null,
    })
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/HTTP 500/)
  })

  it("throws when POSTAL_API_URL is missing", async () => {
    delete process.env.POSTAL_API_URL
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/POSTAL_API_URL is required/)
  })

  it("throws when POSTAL_API_KEY is missing", async () => {
    delete process.env.POSTAL_API_KEY
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/POSTAL_API_KEY is required/)
  })
})
