// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { PasskeyManager } from "../src/pages/passkey-manager/index.js"
import type { PasskeyAuthClient } from "../src/client/index.js"
import { enableWebAuthn, disableWebAuthn } from "./helpers/webauthn.js"

afterEach(() => cleanup())

function makeClient(opts: { addPasskey?: PasskeyAuthClient["passkey"]["addPasskey"] } = {}): PasskeyAuthClient {
  return {
    signIn: { passkey: vi.fn(async () => ({ error: null })) },
    passkey: {
      addPasskey: opts.addPasskey ?? vi.fn(async () => ({ data: { id: "p1" }, error: null })),
    },
  }
}

// Same contract as SignInForm's classNames (see sign-in-form-classnames.test.tsx):
//
//   - `classNames.X` present  → emit className, NO inline style
//   - `classNames.X` absent   → keep the inline-style default (back-compat)
//
// The footgun: the status paragraphs shipped with inline `color: "#080"` /
// `"#b00"`, which beat any stylesheet rule — a consumer app could not theme
// them at all (poor contrast on dark themes, no text-destructive match).
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

  it("keeps the button's inline-style default when classNames.button is absent", async () => {
    render(<PasskeyManager authClient={makeClient()} />)
    const button = await screen.findByRole("button", { name: /add a passkey/i })
    expect(button.getAttribute("style")).toContain("padding")
  })

  it("classNames.success replaces the inline style on the success paragraph", async () => {
    render(<PasskeyManager authClient={makeClient()} classNames={{ success: "my-success" }} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    const paragraph = screen.getByText(/passkey added/i)
    expect(paragraph.className).toBe("my-success")
    expect(paragraph.getAttribute("style")).toBeNull()
  })

  it("keeps the success paragraph's inline-style default when classNames.success is absent", async () => {
    render(<PasskeyManager authClient={makeClient()} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    expect(screen.getByText(/passkey added/i).getAttribute("style")).toContain("color")
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

  it("keeps the error paragraph's inline-style default when classNames.error is absent", async () => {
    const addPasskey = vi.fn(async () => ({ error: { message: "user cancelled" } }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    const paragraph = await screen.findByRole("alert")
    expect(paragraph.getAttribute("style")).toContain("color")
  })
})
