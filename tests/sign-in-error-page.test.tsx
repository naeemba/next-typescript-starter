// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { SignInErrorPage } from "../src/pages/sign-in/sign-in-error-page"

beforeEach(() => {
  window.history.replaceState({}, "", "/")
})
afterEach(() => {
  cleanup()
  window.history.replaceState({}, "", "/")
})

describe("<SignInErrorPage/>", () => {
  it("renders the default heading + back link", () => {
    render(<SignInErrorPage />)
    expect(screen.getByRole("heading", { name: "Sign in failed" })).toBeDefined()
    const link = screen.getByRole("link", { name: "Back to sign in" })
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/sign-in")
  })

  it("maps EXPIRED_TOKEN to friendly copy", async () => {
    window.history.replaceState({}, "", "/sign-in/error?error=EXPIRED_TOKEN")
    render(<SignInErrorPage />)
    await screen.findByText(/sign-in link has expired/i)
  })

  it("accepts lowercase 'expired_token' too (better-auth emits both casings)", async () => {
    window.history.replaceState({}, "", "/sign-in/error?error=expired_token")
    render(<SignInErrorPage />)
    await screen.findByText(/sign-in link has expired/i)
  })

  it("maps INVALID_TOKEN to a different friendly copy", async () => {
    window.history.replaceState({}, "", "/sign-in/error?error=INVALID_TOKEN")
    render(<SignInErrorPage />)
    await screen.findByText(/may have already been used/i)
  })

  it("falls back to the generic message for unknown codes", async () => {
    window.history.replaceState({}, "", "/sign-in/error?error=SOMETHING_NEW")
    render(<SignInErrorPage />)
    await screen.findByText(/couldn't sign you in/i)
  })

  it("allows consumer override via errorMessages without redefining every entry", async () => {
    window.history.replaceState({}, "", "/sign-in/error?error=EXPIRED_TOKEN")
    render(
      <SignInErrorPage
        errorMessages={{ EXPIRED_TOKEN: "Your link timed out. Please try again." }}
      />,
    )
    await screen.findByText("Your link timed out. Please try again.")
  })

  it("honors a custom errorParam name", async () => {
    window.history.replaceState({}, "", "/sign-in/error?reason=EXPIRED_TOKEN")
    render(<SignInErrorPage errorParam="reason" />)
    await screen.findByText(/sign-in link has expired/i)
  })

  it("respects a custom signInPath in the back link", () => {
    render(<SignInErrorPage signInPath="/login" signInLabel="Back to login" />)
    const link = screen.getByRole("link", { name: "Back to login" })
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/login")
  })

  it("renders the generic message when no error param is present", () => {
    render(<SignInErrorPage />)
    expect(screen.getByText(/couldn't sign you in/i)).toBeDefined()
  })
})
