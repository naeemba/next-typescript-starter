// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
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

describe("<PasskeyManager/>", () => {
  it("renders the default 'Add a passkey' button", () => {
    render(<PasskeyManager authClient={makeClient()} />)
    expect(screen.getByRole("button", { name: /add a passkey/i })).toBeTruthy()
  })

  it("calls passkey.addPasskey() on click", async () => {
    const addPasskey = vi.fn(async () => ({ data: { id: "p1" }, error: null }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} />)
    fireEvent.click(screen.getByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(addPasskey).toHaveBeenCalled())
  })

  it("passes passkeyName as the name argument when provided", async () => {
    const addPasskey = vi.fn(async () => ({ data: { id: "p1" }, error: null }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} passkeyName="My MacBook" />)
    fireEvent.click(screen.getByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(addPasskey).toHaveBeenCalledWith({ name: "My MacBook" }))
  })

  it("shows the success copy on successful add and fires onAdded", async () => {
    const onAdded = vi.fn()
    render(<PasskeyManager authClient={makeClient()} onAdded={onAdded} />)
    fireEvent.click(screen.getByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/passkey added/i)).not.toBeNull())
    expect(onAdded).toHaveBeenCalled()
  })

  it("shows an inline error when addPasskey returns an error", async () => {
    const addPasskey = vi.fn(async () => ({ error: { message: "user cancelled" } }))
    render(<PasskeyManager authClient={makeClient({ addPasskey })} />)
    fireEvent.click(screen.getByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(screen.queryByText(/user cancelled/i)).not.toBeNull())
  })

  it("accepts a custom addLabel", () => {
    render(<PasskeyManager authClient={makeClient()} addLabel="Register passkey" />)
    expect(screen.getByRole("button", { name: /register passkey/i })).toBeTruthy()
  })
})
