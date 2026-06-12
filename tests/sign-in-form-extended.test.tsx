// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { SignInForm, type SignInAuthClient } from "../src/pages/sign-in/sign-in-form.js"
import type { MagicLinkAuthClient } from "../src/client/index.js"
import { enableWebAuthn, disableWebAuthn } from "./helpers/webauthn.js"

// Type-level assertion (never invoked): a magic-link-only client must be
// assignable to SignInAuthClient. With the previous
// `Partial<SocialAuthClient> & Partial<PasskeyAuthClient>` shape this failed
// (`social` and `passkey` collapsed to required after intersection), forcing
// test fixtures to `as any` and silently breaking 0.2.x consumers.
function _signInAuthClientAssignability(magicLinkOnly: MagicLinkAuthClient): SignInAuthClient {
  return magicLinkOnly
}
void _signInAuthClientAssignability

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

describe("<SignInForm/> google prop", () => {
  beforeEach(() => { enableWebAuthn() })
  afterEach(() => { disableWebAuthn() })

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

  it("fires onSignedIn on a successful Google sign-in", async () => {
    const onSignedIn = vi.fn()
    render(<SignInForm authClient={makeClient()} google onSignedIn={onSignedIn} />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1))
  })

  it("does NOT fire onSignedIn when Google sign-in returns an error", async () => {
    const onSignedIn = vi.fn()
    const social = vi.fn(async () => ({ error: { message: "google denied" } }))
    render(<SignInForm authClient={makeClient({ social })} google onSignedIn={onSignedIn} />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    await waitFor(() => expect(screen.queryByText(/google denied/i)).not.toBeNull())
    expect(onSignedIn).not.toHaveBeenCalled()
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
  beforeEach(() => { enableWebAuthn() })
  afterEach(() => { disableWebAuthn() })

  it("renders the passkey button when WebAuthn is supported", async () => {
    render(<SignInForm authClient={makeClient()} passkey />)
    expect(await screen.findByRole("button", { name: /sign in with passkey/i })).toBeTruthy()
  })

  it("hides the passkey button when window.PublicKeyCredential is undefined", () => {
    disableWebAuthn()
    render(<SignInForm authClient={makeClient()} passkey />)
    expect(screen.queryByRole("button", { name: /sign in with passkey/i })).toBeNull()
  })

  it("calls signIn.passkey() on click", async () => {
    const passkey = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeClient({ passkey })} passkey />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    await waitFor(() => expect(passkey).toHaveBeenCalled())
  })

  it("fires onSignedIn on a successful passkey sign-in", async () => {
    const onSignedIn = vi.fn()
    render(<SignInForm authClient={makeClient()} passkey onSignedIn={onSignedIn} />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1))
  })

  it("does NOT fire onSignedIn when passkey sign-in returns an error", async () => {
    const onSignedIn = vi.fn()
    const passkey = vi.fn(async () => ({ error: { message: "no creds" } }))
    render(<SignInForm authClient={makeClient({ passkey })} passkey onSignedIn={onSignedIn} />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    await waitFor(() => expect(screen.queryByText(/no creds/i)).not.toBeNull())
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it("displays an inline error if passkey sign-in fails", async () => {
    const passkey = vi.fn(async () => ({ error: { message: "no creds" } }))
    render(<SignInForm authClient={makeClient({ passkey })} passkey />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    await waitFor(() => expect(screen.queryByText(/no creds/i)).not.toBeNull())
  })
})

describe("<SignInForm/> magicLink toggle + divider", () => {
  beforeEach(() => { enableWebAuthn() })
  afterEach(() => { disableWebAuthn() })

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
  beforeEach(() => { enableWebAuthn() })
  afterEach(() => { disableWebAuthn() })

  it("a pending google attempt does not disable the email input, magic-link submit, or passkey button", async () => {
    let resolveSocial: (v: { error: null }) => void = () => {}
    const social = vi.fn(() => new Promise<{ error: null }>((r) => { resolveSocial = r }))
    render(<SignInForm authClient={makeClient({ social })} google passkey />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    const magicLinkSubmit = screen.getByRole("button", { name: /send magic link/i }) as HTMLButtonElement
    const passkeyButton = (await screen.findByRole("button", { name: /sign in with passkey/i })) as HTMLButtonElement

    expect(emailInput.disabled).toBe(false)
    expect(magicLinkSubmit.disabled).toBe(false)
    expect(passkeyButton.disabled).toBe(false)
    resolveSocial({ error: null })
  })

  it("keeps the google + passkey buttons mounted after the magic link is sent (no early-return)", async () => {
    render(<SignInForm authClient={makeClient()} google passkey />)
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: "alice@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }))
    // Sent state is rendered inline; the social/passkey buttons stay mounted.
    await waitFor(() => expect(screen.queryByText(/check your inbox/i)).not.toBeNull())
    expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeNull()
    expect(screen.queryByRole("button", { name: /sign in with passkey/i })).not.toBeNull()
  })
})
