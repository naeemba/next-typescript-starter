// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { PasskeyManagerPage } from "../src/pages/passkey-manager/passkey-manager-page"
import { makePasskeyAuthClient } from "./helpers/passkey-client.js"
import { enableWebAuthn, disableWebAuthn } from "./helpers/webauthn.js"

beforeEach(() => enableWebAuthn())
afterEach(() => {
  cleanup()
  disableWebAuthn()
})

describe("<PasskeyManagerPage/>", () => {
  it("renders a heading, default description, and the underlying add-passkey button", async () => {
    render(<PasskeyManagerPage authClient={makePasskeyAuthClient()} />)
    expect(screen.getByRole("heading", { name: "Passkeys" })).toBeDefined()
    expect(screen.getByText(/sign in faster on this device/i)).toBeDefined()
    expect(await screen.findByRole("button", { name: /add a passkey/i })).toBeDefined()
  })

  it("allows overriding the title and description", () => {
    render(
      <PasskeyManagerPage
        authClient={makePasskeyAuthClient()}
        title="Security keys"
        description="Manage your registered keys."
      />,
    )
    expect(screen.getByRole("heading", { name: "Security keys" })).toBeDefined()
    expect(screen.getByText("Manage your registered keys.")).toBeDefined()
  })

  it("hides the description when explicitly set to null", () => {
    const { container } = render(
      <PasskeyManagerPage authClient={makePasskeyAuthClient()} description={null} />,
    )
    // No <p> inside the page wrapper — only the heading and the manager body.
    const paragraphs = container.querySelectorAll("main > p")
    expect(paragraphs.length).toBe(0)
  })

  it("applies classNames to the page chrome and forwards the rest to the manager", async () => {
    const { container } = render(
      <PasskeyManagerPage
        authClient={makePasskeyAuthClient()}
        classNames={{ main: "my-main", heading: "my-heading", description: "my-description", button: "my-button" }}
      />,
    )
    const main = container.querySelector("main")!
    expect(main.className).toBe("my-main")
    // A provided key drops the inline-style default for that element.
    expect(main.getAttribute("style")).toBeNull()
    expect(container.querySelector("h1")!.className).toBe("my-heading")
    expect(container.querySelector("main > p")!.className).toBe("my-description")
    expect((await screen.findByRole("button", { name: /add a passkey/i })).className).toBe("my-button")
  })

  it("forwards props to the inner PasskeyManager (addLabel)", async () => {
    render(<PasskeyManagerPage authClient={makePasskeyAuthClient()} addLabel="Register a passkey" />)
    expect(await screen.findByRole("button", { name: /register a passkey/i })).toBeDefined()
  })
})
