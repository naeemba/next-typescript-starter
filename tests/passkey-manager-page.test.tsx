// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { PasskeyManagerPage } from "../src/pages/passkey-manager/passkey-manager-page"
import { enableWebAuthn, disableWebAuthn } from "./helpers/webauthn.js"

beforeEach(() => enableWebAuthn())
afterEach(() => {
  cleanup()
  disableWebAuthn()
})

function makeAuthClient() {
  return {
    passkey: { addPasskey: vi.fn(async () => ({ data: {}, error: null })) },
  } as any
}

describe("<PasskeyManagerPage/>", () => {
  it("renders a heading, default description, and the underlying add-passkey button", async () => {
    render(<PasskeyManagerPage authClient={makeAuthClient()} />)
    expect(screen.getByRole("heading", { name: "Passkeys" })).toBeDefined()
    expect(screen.getByText(/sign in faster on this device/i)).toBeDefined()
    expect(await screen.findByRole("button", { name: /add a passkey/i })).toBeDefined()
  })

  it("allows overriding the title and description", () => {
    render(
      <PasskeyManagerPage
        authClient={makeAuthClient()}
        title="Security keys"
        description="Manage your registered keys."
      />,
    )
    expect(screen.getByRole("heading", { name: "Security keys" })).toBeDefined()
    expect(screen.getByText("Manage your registered keys.")).toBeDefined()
  })

  it("hides the description when explicitly set to null", () => {
    const { container } = render(
      <PasskeyManagerPage authClient={makeAuthClient()} description={null} />,
    )
    // No <p> inside the page wrapper — only the heading and the manager body.
    const paragraphs = container.querySelectorAll("main > p")
    expect(paragraphs.length).toBe(0)
  })

  it("forwards props to the inner PasskeyManager (addLabel)", async () => {
    render(<PasskeyManagerPage authClient={makeAuthClient()} addLabel="Register a passkey" />)
    expect(await screen.findByRole("button", { name: /register a passkey/i })).toBeDefined()
  })
})
