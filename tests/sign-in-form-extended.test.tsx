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

  // better-auth's signIn.passkey() doesn't redirect on its own (unlike social/OAuth).
  // Without an explicit fallback the form would set the session cookie and then strand
  // the user on /sign-in — the original bug. These tests lock the new default-navigation
  // contract: navigate when onSignedIn is absent, defer to the consumer when present.
  describe("default navigation on success", () => {
    // jsdom marks window.location.assign as non-configurable, so vi.spyOn fails;
    // a spread copy of Location would drop its prototype getters (search,
    // pathname, …) and break resolveCallbackUrl; and a Proxy whose target IS
    // the real Location can't override `assign` (the non-configurable-data
    // invariant forces the Proxy to return the original method). An empty
    // target sidesteps the invariant — we forward every other read to the
    // live Location ourselves so URL state stays correct.
    let assignMock: ReturnType<typeof vi.fn>
    const originalLocation = window.location
    beforeEach(() => {
      window.history.replaceState({}, "", "/sign-in")
      assignMock = vi.fn()
      Object.defineProperty(window, "location", {
        value: new Proxy({}, {
          get(_target, key) {
            if (key === "assign") return assignMock
            const value = Reflect.get(originalLocation, key)
            return typeof value === "function" ? value.bind(originalLocation) : value
          },
        }),
        configurable: true,
        writable: true,
      })
    })
    afterEach(() => {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        configurable: true,
        writable: true,
      })
      window.history.replaceState({}, "", "/")
    })

    it("navigates to '/' by default when neither query nor prop is set", async () => {
      render(<SignInForm authClient={makeClient()} passkey />)
      fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"))
    })

    it("navigates to the callbackUrl prop when no query param is present", async () => {
      render(<SignInForm authClient={makeClient()} passkey callbackUrl="/dashboard" />)
      fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/dashboard"))
    })

    it("navigates to ?callbackUrl= when present (query wins over prop)", async () => {
      window.history.replaceState({}, "", "/sign-in?callbackUrl=/studio")
      render(<SignInForm authClient={makeClient()} passkey callbackUrl="/decoy" />)
      fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/studio"))
    })

    it("does NOT auto-navigate when onSignedIn is provided (consumer owns navigation)", async () => {
      const onSignedIn = vi.fn()
      render(<SignInForm authClient={makeClient()} passkey onSignedIn={onSignedIn} callbackUrl="/dashboard" />)
      fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
      await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1))
      expect(assignMock).not.toHaveBeenCalled()
    })

    it("does NOT auto-navigate when passkey sign-in returns an error", async () => {
      const passkey = vi.fn(async () => ({ error: { message: "no creds" } }))
      render(<SignInForm authClient={makeClient({ passkey })} passkey />)
      fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
      await waitFor(() => expect(screen.queryByText(/no creds/i)).not.toBeNull())
      expect(assignMock).not.toHaveBeenCalled()
    })
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
