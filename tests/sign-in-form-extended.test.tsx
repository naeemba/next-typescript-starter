// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { SignInForm, type SignInAuthClient } from "../src/pages/sign-in/sign-in-form.js"

afterEach(() => cleanup())

function makeClient(overrides: {
  social?: SignInAuthClient["signIn"]["social"]
  passkey?: SignInAuthClient["signIn"]["passkey"]
  magicLink?: SignInAuthClient["signIn"]["magicLink"]
} = {}): SignInAuthClient {
  return {
    signIn: {
      magicLink: overrides.magicLink ?? vi.fn(async () => ({ error: null })),
      social: overrides.social ?? vi.fn(async () => ({ error: null })),
      passkey: overrides.passkey ?? vi.fn(async () => ({ error: null })),
    },
  }
}

function enablePasskey() {
  Object.defineProperty(window, "PublicKeyCredential", { value: function () {}, configurable: true })
}
function disablePasskey() {
  Reflect.deleteProperty(window, "PublicKeyCredential")
}

describe("<SignInForm/> google prop", () => {
  beforeEach(() => { enablePasskey() })
  afterEach(() => { disablePasskey() })

  it("does not render the Google button by default", () => {
    render(<SignInForm authClient={makeClient()} />)
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull()
  })

  it("renders 'Continue with Google' when google is set", () => {
    render(<SignInForm authClient={makeClient()} google />)
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy()
  })

  it("calls signIn.social({ provider: 'google', callbackURL }) on click", async () => {
    const social = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeClient({ social })} google callbackUrl="/dashboard" />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    await waitFor(() =>
      expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/dashboard" })
    )
  })

  it("displays an inline error if google sign-in fails", async () => {
    const social = vi.fn(async () => ({ error: { message: "google denied" } }))
    render(<SignInForm authClient={makeClient({ social })} google />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    await waitFor(() => expect(screen.queryByText(/google denied/i)).not.toBeNull())
  })

  it("accepts a custom label via google={{ label }}", () => {
    render(<SignInForm authClient={makeClient()} google={{ label: "Use Workspace" }} />)
    expect(screen.getByRole("button", { name: /use workspace/i })).toBeTruthy()
  })
})

describe("<SignInForm/> passkey prop", () => {
  beforeEach(() => { enablePasskey() })
  afterEach(() => { disablePasskey() })

  it("renders the passkey button when WebAuthn is supported", async () => {
    render(<SignInForm authClient={makeClient()} passkey />)
    expect(await screen.findByRole("button", { name: /sign in with passkey/i })).toBeTruthy()
  })

  it("hides the passkey button when window.PublicKeyCredential is undefined", () => {
    disablePasskey()
    render(<SignInForm authClient={makeClient()} passkey />)
    expect(screen.queryByRole("button", { name: /sign in with passkey/i })).toBeNull()
  })

  it("calls signIn.passkey() on click", async () => {
    const passkey = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeClient({ passkey })} passkey />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    await waitFor(() => expect(passkey).toHaveBeenCalled())
  })

  it("displays an inline error if passkey sign-in fails", async () => {
    const passkey = vi.fn(async () => ({ error: { message: "no creds" } }))
    render(<SignInForm authClient={makeClient({ passkey })} passkey />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    await waitFor(() => expect(screen.queryByText(/no creds/i)).not.toBeNull())
  })
})

describe("<SignInForm/> magicLink toggle + divider", () => {
  beforeEach(() => { enablePasskey() })
  afterEach(() => { disablePasskey() })

  it("renders the email form by default", () => {
    render(<SignInForm authClient={makeClient()} />)
    expect(screen.queryByLabelText(/email/i)).not.toBeNull()
  })

  it("hides the email form when magicLink={false}", () => {
    render(<SignInForm authClient={makeClient()} google passkey magicLink={false} />)
    expect(screen.queryByLabelText(/email/i)).toBeNull()
  })

  it("renders 'or' divider when both google AND magicLink are present", () => {
    render(<SignInForm authClient={makeClient()} google />)
    expect(screen.queryByText(/^or$/i)).not.toBeNull()
  })

  it("does NOT render divider when only magicLink is present", () => {
    render(<SignInForm authClient={makeClient()} />)
    expect(screen.queryByText(/^or$/i)).toBeNull()
  })

  it("does NOT render divider when only google is present (magicLink=false)", () => {
    render(<SignInForm authClient={makeClient()} google magicLink={false} />)
    expect(screen.queryByText(/^or$/i)).toBeNull()
  })

  it("accepts a custom dividerLabel", () => {
    render(<SignInForm authClient={makeClient()} google dividerLabel="OR USE EMAIL" />)
    expect(screen.queryByText("OR USE EMAIL")).not.toBeNull()
  })
})

describe("<SignInForm/> per-method status isolation", () => {
  beforeEach(() => { enablePasskey() })
  afterEach(() => { disablePasskey() })

  it("a pending google attempt does not disable the magic-link email input", async () => {
    let resolveSocial: (v: { error: null }) => void = () => {}
    const social = vi.fn(() => new Promise<{ error: null }>((r) => { resolveSocial = r }))
    render(<SignInForm authClient={makeClient({ social })} google />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    expect(emailInput.disabled).toBe(false)
    resolveSocial({ error: null })
  })
})
