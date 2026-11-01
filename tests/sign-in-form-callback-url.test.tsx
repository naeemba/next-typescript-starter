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

  // A phisher crafts /sign-in?callbackUrl=<value> and relies on the user
  // trusting the real sign-in page. Each value is the raw query-string form,
  // so `/%09/evil.com` exercises the browser's decode-then-strip-tab path.
  describe.each([
    ["/%09/evil.com", "encoded tab bypass"],
    ["/%0A/evil.com", "encoded newline bypass"],
    ["/%5Cevil.com", "encoded backslash bypass"],
    ["/%252F/evil.com", "double-encoded second slash"],
    ["%2F%2Fevil.com", "protocol-relative bypass"],
    ["https%3A%2F%2Fapp.test%40evil.com%2F", "userinfo absolute URL"],
    ["javascript%3Aalert(1)", "javascript: scheme"],
  ])("rejects unsafe callbackUrl '%s' (%s)", (badQueryValue) => {
    it("falls back to the prop", async () => {
      const { authClient, magicLink } = makeAuthClient()
      window.history.replaceState({}, "", `/sign-in?callbackUrl=${badQueryValue}`)
      render(<SignInForm authClient={authClient} callbackUrl="/safe" />)
      await submitWithEmail("a@example.com")
      await waitFor(() => expect(magicLink).toHaveBeenCalled())
      expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/safe" })
    })
  })

  it("rejects a same-origin absolute URL: only relative paths are followed", async () => {
    const { authClient, magicLink } = makeAuthClient()
    const sameOriginAbsolute = `${window.location.origin}/admin`
    window.history.replaceState({}, "", `/sign-in?callbackUrl=${encodeURIComponent(sameOriginAbsolute)}`)
    render(<SignInForm authClient={authClient} callbackUrl="/fallback" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/fallback" })
  })

  it("drops an unsafe callbackUrl prop too and falls back to '/'", async () => {
    const { authClient, magicLink } = makeAuthClient()
    render(<SignInForm authClient={authClient} callbackUrl={"/\t/evil.com"} />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/" })
  })

  it("forwards a safe errorCallbackUrl", async () => {
    const { authClient, magicLink } = makeAuthClient()
    render(<SignInForm authClient={authClient} errorCallbackUrl="/sign-in/error" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({
      email: "a@example.com",
      callbackURL: "/",
      errorCallbackURL: "/sign-in/error",
    })
  })

  it("drops an unsafe errorCallbackUrl", async () => {
    const { authClient, magicLink } = makeAuthClient()
    render(<SignInForm authClient={authClient} errorCallbackUrl="//evil.com" />)
    await submitWithEmail("a@example.com")
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/" })
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
