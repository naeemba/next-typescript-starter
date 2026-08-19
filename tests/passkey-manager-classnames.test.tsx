// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { PasskeyManager } from "../src/pages/passkey-manager/index.js"
import { makeClient } from "./helpers/passkey-client.js"
import { enableWebAuthn, disableWebAuthn } from "./helpers/webauthn.js"

afterEach(() => cleanup())

// Same present/absent contract as SignInForm's classNames — see the header of
// sign-in-form-classnames.test.tsx. These tests pin this component's wiring of
// each key to its element.
describe("<PasskeyManager/> classNames overrides", () => {
  beforeEach(() => { enableWebAuthn() })
  afterEach(() => { disableWebAuthn() })

  it("composes legacy className with classNames.root on the wrapper div", async () => {
    render(
      <PasskeyManager
        authClient={makeClient()}
        className="legacy-class"
        classNames={{ root: "modern-class" }}
      />,
    )
    const button = await screen.findByRole("button", { name: /add a passkey/i })
    const root = button.closest("div")
    expect(root!.className).toContain("legacy-class")
    expect(root!.className).toContain("modern-class")
  })

  it("applies classNames.root to the wrapper on the unsupported branch too", () => {
    disableWebAuthn()
    const { container } = render(
      <PasskeyManager
        authClient={makeClient()}
        classNames={{ root: "modern-class" }}
        unsupportedCopy="Not supported"
      />,
    )
    const root = container.querySelector("div.modern-class")
    expect(root).not.toBeNull()
    expect(root!.textContent).toContain("Not supported")
  })

  it("classNames.button replaces the inline style on the add button", async () => {
    render(<PasskeyManager authClient={makeClient()} classNames={{ button: "my-button" }} />)
    const button = await screen.findByRole("button", { name: /add a passkey/i })
    expect(button.className).toBe("my-button")
    expect(button.getAttribute("style")).toBeNull()
  })

  it("classNames.success replaces the inline style on the success paragraph", async () => {
    render(<PasskeyManager authClient={makeClient()} classNames={{ success: "my-success" }} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    const paragraph = screen.getByText(/passkey added/i)
    expect(paragraph.className).toBe("my-success")
    expect(paragraph.getAttribute("style")).toBeNull()
  })

  it("classNames.error replaces the inline style on the error paragraph, which is a role=alert", async () => {
    const addPasskey = vi.fn(async () => ({ error: { message: "user cancelled" } }))
    render(
      <PasskeyManager authClient={makeClient({ addPasskey })} classNames={{ error: "my-error" }} />,
    )
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    const paragraph = await screen.findByRole("alert")
    expect(paragraph.textContent).toContain("user cancelled")
    expect(paragraph.className).toBe("my-error")
    expect(paragraph.getAttribute("style")).toBeNull()
  })

  it("keeps the inline-style defaults on button and success paragraph when classNames is absent", async () => {
    render(<PasskeyManager authClient={makeClient()} />)
    const button = await screen.findByRole("button", { name: /add a passkey/i })
    expect(button.getAttribute("style")).toContain("padding")
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    expect(screen.getByText(/passkey added/i).getAttribute("style")).toContain("color")
  })

  it("keeps the inline-style default on the error paragraph when classNames is absent", async () => {
    const addPasskey = vi.fn(async () => ({ error: { message: "user cancelled" } }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    const paragraph = await screen.findByRole("alert")
    expect(paragraph.getAttribute("style")).toContain("color")
  })
})
