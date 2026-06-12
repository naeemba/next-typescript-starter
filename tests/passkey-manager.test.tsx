// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { PasskeyManager } from "../src/pages/passkey-manager/index.js"
import type { PasskeyAuthClient } from "../src/client/index.js"

afterEach(() => cleanup())

function makeClient(opts: { addPasskey?: PasskeyAuthClient["passkey"]["addPasskey"] } = {}): PasskeyAuthClient {
  return {
    signIn: { passkey: vi.fn(async () => ({ error: null })) },
    passkey: {
      addPasskey: opts.addPasskey ?? vi.fn(async () => ({ data: { id: "p1" }, error: null })),
    },
  }
}

function enablePasskey() {
  Object.defineProperty(window, "PublicKeyCredential", { value: function () {}, configurable: true })
}
function disablePasskey() {
  Reflect.deleteProperty(window, "PublicKeyCredential")
}

describe("<PasskeyManager/>", () => {
  beforeEach(() => { enablePasskey() })
  afterEach(() => { disablePasskey() })

  it("renders the default 'Add a passkey' button when WebAuthn is supported", async () => {
    render(<PasskeyManager authClient={makeClient()} />)
    expect(await screen.findByRole("button", { name: /add a passkey/i })).toBeTruthy()
  })

  it("renders nothing (or the unsupportedCopy) when WebAuthn is unavailable", () => {
    disablePasskey()
    const { container } = render(
      <PasskeyManager authClient={makeClient()} unsupportedCopy="Not supported" />,
    )
    expect(screen.queryByRole("button", { name: /add a passkey/i })).toBeNull()
    expect(container.textContent).toContain("Not supported")
  })

  it("calls passkey.addPasskey() on click", async () => {
    const addPasskey = vi.fn(async () => ({ data: { id: "p1" }, error: null }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(addPasskey).toHaveBeenCalled())
  })

  it("passes passkeyName as the name argument when provided", async () => {
    const addPasskey = vi.fn(async () => ({ data: { id: "p1" }, error: null }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} passkeyName="My MacBook" />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(addPasskey).toHaveBeenCalledWith({ name: "My MacBook" }))
  })

  it("shows the success copy on successful add and fires onAdded", async () => {
    const onAdded = vi.fn()
    render(<PasskeyManager authClient={makeClient()} onAdded={onAdded} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    expect(onAdded).toHaveBeenCalled()
  })

  it("disables the button after a successful add to prevent double-registration", async () => {
    render(<PasskeyManager authClient={makeClient()} />)
    const button = (await screen.findByRole("button", { name: /add a passkey/i })) as HTMLButtonElement
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    expect(button.disabled).toBe(true)
  })

  it("shows an inline error when addPasskey returns an error", async () => {
    const addPasskey = vi.fn(async () => ({ error: { message: "user cancelled" } }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/user cancelled/i)).not.toBeNull())
  })

  it("accepts a custom addLabel", async () => {
    render(<PasskeyManager authClient={makeClient()} addLabel="Register passkey" />)
    expect(await screen.findByRole("button", { name: /register passkey/i })).toBeTruthy()
  })
})
