// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form"

afterEach(() => {
  cleanup()
  window.history.replaceState({}, "", "/")
})

beforeEach(() => {
  window.history.replaceState({}, "", "/")
})

function makeAuthClient() {
  const magicLink = vi.fn(async () => ({ error: null }))
  return { authClient: { signIn: { magicLink } } as any, magicLink }
}

async function submitWithEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } })
  fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
}

describe("<SignInForm/> callbackUrl resolution", () => {
  it("reads callbackUrl from the URL query string when no prop is set", async () => {
    const { authClient, magicLink } = makeAuthClient()
    window.history.replaceState({}, "", "/sign-in?callbackUrl=/studio")
    render(<SignInForm authClient={authClient} />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/studio" })
  })

  it("URL query string wins over the prop", async () => {
    const { authClient, magicLink } = makeAuthClient()
    window.history.replaceState({}, "", "/sign-in?callbackUrl=/from-url")
    render(<SignInForm authClient={authClient} callbackUrl="/from-prop" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/from-url" })
  })

  it("falls back to the prop when no query param is present", async () => {
    const { authClient, magicLink } = makeAuthClient()
    render(<SignInForm authClient={authClient} callbackUrl="/dashboard" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/dashboard" })
  })

  it("falls back to '/' when neither query nor prop is set", async () => {
    const { authClient, magicLink } = makeAuthClient()
    render(<SignInForm authClient={authClient} />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/" })
  })

  it("honors a custom callbackParam name", async () => {
    const { authClient, magicLink } = makeAuthClient()
    window.history.replaceState({}, "", "/sign-in?next=/elsewhere")
    render(<SignInForm authClient={authClient} callbackParam="next" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/elsewhere" })
  })

  it("ignores the default callbackUrl param when callbackParam is customized", async () => {
    const { authClient, magicLink } = makeAuthClient()
    // ?callbackUrl=... is present but we're configured to read ?next=
    window.history.replaceState({}, "", "/sign-in?callbackUrl=/decoy")
    render(<SignInForm authClient={authClient} callbackParam="next" callbackUrl="/from-prop" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/from-prop" })
  })

  // Defense-in-depth: a phisher can craft /sign-in?callbackUrl=https://evil.com
  // and rely on better-auth's trustedOrigins not being configured strictly.
  // The form silently drops non-same-origin values and falls back to the prop / "/".
  describe.each([
    ["//evil.com", "protocol-relative bypass"],
    ["/\\evil.com", "backslash bypass"],
    ["https://evil.com/x", "cross-origin absolute URL"],
    ["javascript:alert(1)", "javascript: scheme"],
    ["data:text/html,x", "data: scheme"],
  ])("rejects unsafe callbackUrl '%s' (%s)", (badValue) => {
    it("falls back to the prop", async () => {
      const { authClient, magicLink } = makeAuthClient()
      window.history.replaceState({}, "", `/sign-in?callbackUrl=${encodeURIComponent(badValue)}`)
      render(<SignInForm authClient={authClient} callbackUrl="/safe" />)
      await submitWithEmail("a@example.com")
      await waitFor(() => expect(magicLink).toHaveBeenCalled())
      expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/safe" })
    })
  })

  it("accepts a same-origin absolute URL (production proxy round-trip case)", async () => {
    const { authClient, magicLink } = makeAuthClient()
    // jsdom defaults window.location.origin to http://localhost:3000
    const sameOriginAbsolute = `${window.location.origin}/admin`
    window.history.replaceState({}, "", `/sign-in?callbackUrl=${encodeURIComponent(sameOriginAbsolute)}`)
    render(<SignInForm authClient={authClient} callbackUrl="/decoy" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: sameOriginAbsolute })
  })

  it("passes the resolved URL through to social sign-in too", async () => {
    const magicLink = vi.fn(async () => ({ error: null }))
    const social = vi.fn(async () => ({ error: null }))
    window.history.replaceState({}, "", "/sign-in?callbackUrl=/admin")
    render(
      <SignInForm
        authClient={{ signIn: { magicLink, social } } as any}
        google
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    await waitFor(() => expect(social).toHaveBeenCalled())
    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/admin" })
  })
})
