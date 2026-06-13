// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form"
import { SignInPage } from "../src/pages/sign-in/sign-in-page"

afterEach(cleanup)

function makeAuthClient() {
  return {
    signIn: {
      magicLink: vi.fn(async () => ({ error: null })),
      social: vi.fn(async () => ({ error: null })),
      passkey: vi.fn(async () => ({ error: null })),
    },
  } as any
}

// 0.5.0 — per-element classNames overrides.
//
// The footgun this prop is meant to close: inline `style={...}` beats every
// className-targeted rule short of `!important`. A consumer wiring Tailwind
// would set classes, get partial styling, then have to fight the inline
// defaults. The contract:
//
//   - `classNames.X` present  → emit className, NO inline style
//   - `classNames.X` absent   → keep the inline-style default (back-compat)
//
// Tests pin both halves on each element so a future refactor that forgets
// to swap one direction (style→className for the "present" case, or vice
// versa for the "absent" case) fails loud.
describe("<SignInForm/> classNames overrides", () => {
  it("applies classNames.root to the wrapper div", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        classNames={{ root: "my-form-root" }}
      />,
    )
    const input = screen.getByLabelText("Email")
    const root = input.closest("div.my-form-root")
    expect(root).not.toBeNull()
  })

  it("composes legacy className prop with classNames.root", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        className="legacy-class"
        classNames={{ root: "modern-class" }}
      />,
    )
    const input = screen.getByLabelText("Email")
    const root = input.closest("div")
    expect(root!.className).toContain("legacy-class")
    expect(root!.className).toContain("modern-class")
  })

  it("classNames.submitButton replaces the inline style on the submit button", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        classNames={{ submitButton: "btn-primary" }}
      />,
    )
    const btn = screen.getByRole("button", { name: "Send magic link" }) as HTMLButtonElement
    expect(btn.className).toContain("btn-primary")
    // The contract — inline `style` MUST be empty so external CSS wins.
    expect(btn.getAttribute("style")).toBeNull()
  })

  it("submitButton keeps the inline default when classNames.submitButton is absent", () => {
    render(<SignInForm authClient={makeAuthClient()} />)
    const btn = screen.getByRole("button", { name: "Send magic link" }) as HTMLButtonElement
    expect(btn.className).toBe("")
    expect(btn.getAttribute("style")).toMatch(/padding/)
  })

  it("classNames.googleButton replaces the inline style on the Google button", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        google
        classNames={{ googleButton: "btn-google" }}
      />,
    )
    const btn = screen.getByRole("button", { name: "Continue with Google" }) as HTMLButtonElement
    expect(btn.className).toContain("btn-google")
    expect(btn.getAttribute("style")).toBeNull()
  })

  it("classNames.emailInput replaces the inline style on the email input", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        classNames={{ emailInput: "input-modern" }}
      />,
    )
    const input = screen.getByLabelText("Email") as HTMLInputElement
    expect(input.className).toContain("input-modern")
    expect(input.getAttribute("style")).toBeNull()
  })

  it("classNames.emailLabel replaces the inline style on the email label", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        classNames={{ emailLabel: "label-modern" }}
      />,
    )
    const label = screen.getByText("Email")
    expect(label.className).toContain("label-modern")
    expect(label.getAttribute("style")).toBeNull()
  })

  it("classNames.divider replaces inline styles on the divider container", () => {
    render(
      <SignInForm
        authClient={makeAuthClient()}
        google
        classNames={{ divider: "divider-modern" }}
      />,
    )
    const divider = screen.getByText("or").closest("div.divider-modern")
    expect(divider).not.toBeNull()
    expect(divider!.getAttribute("style")).toBeNull()
  })
})

// 0.5.0 — SignInPage takes the same classNames object and routes the
// form-level keys to the inner SignInForm. `main`, `heading`, `description`
// are page-only.
describe("<SignInPage/> classNames overrides", () => {
  it("classNames.main replaces the inline style on the <main> wrapper", () => {
    const { container } = render(
      <SignInPage
        authClient={makeAuthClient()}
        classNames={{ main: "page-main" }}
      />,
    )
    const main = container.querySelector("main")
    expect(main).not.toBeNull()
    expect(main!.className).toContain("page-main")
    expect(main!.getAttribute("style")).toBeNull()
  })

  it("classNames.heading replaces the inline style on the <h1>", () => {
    render(
      <SignInPage
        authClient={makeAuthClient()}
        title="Welcome"
        classNames={{ heading: "h1-modern" }}
      />,
    )
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1.className).toContain("h1-modern")
    expect(h1.getAttribute("style")).toBeNull()
    expect(h1.textContent).toBe("Welcome")
  })

  it("propagates form-level classNames through to the inner SignInForm", () => {
    render(
      <SignInPage
        authClient={makeAuthClient()}
        classNames={{ submitButton: "btn-primary" }}
      />,
    )
    const btn = screen.getByRole("button", { name: "Send magic link" }) as HTMLButtonElement
    expect(btn.className).toContain("btn-primary")
    expect(btn.getAttribute("style")).toBeNull()
  })
})
