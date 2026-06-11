// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form"

afterEach(cleanup)

function makeAuthClient(magicLink: any) {
  return { signIn: { magicLink } } as any
}

describe("<SignInForm/>", () => {
  it("renders an email input and submit button with default labels", () => {
    const authClient = makeAuthClient(vi.fn())
    render(<SignInForm authClient={authClient} />)
    expect(screen.getByLabelText("Email")).toBeDefined()
    expect(screen.getByRole("button", { name: "Send magic link" })).toBeDefined()
  })

  it("calls authClient.signIn.magicLink with email + callbackUrl on submit", async () => {
    const magicLink = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} callbackUrl="/studio" />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: "Send magic link" }).closest("form")!)
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/studio" })
  })

  it("shows the sent state after a successful submit", async () => {
    const magicLink = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } })
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
    await waitFor(() => {
      expect(screen.getByText(/We sent a sign-in link/i)).toBeDefined()
    })
  })

  it("shows the error state when authClient returns an error", async () => {
    const magicLink = vi.fn(async () => ({ error: { message: "boom" } }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } })
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeDefined()
    })
  })

  it("calls onSent callback with the email", async () => {
    const onSent = vi.fn()
    const magicLink = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} onSent={onSent} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "x@y.com" } })
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("x@y.com"))
  })
})
