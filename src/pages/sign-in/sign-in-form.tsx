"use client"

import { useState, type CSSProperties, type ReactNode, type FormEvent } from "react"
import {
  useWebAuthnSupported,
  type MagicLinkAuthClient as MagicLinkClientShape,
  type SocialAuthClient,
  type PasskeyAuthClient,
} from "../../client/index.js"
import { styled, joinClassNames } from "./styled.js"

/**
 * Structural type for the better-auth client methods SignInForm uses.
 * Compatible with the AuthClient returned by `createAuthClient()`.
 *
 * `social` and `passkey` are declared optional at the *inner* level — that
 * way a magic-link-only `MagicLinkAuthClient` from /client is assignable
 * here without widening. `Partial<SocialAuthClient>` would only weaken the
 * top-level `signIn` key (collapses to required when intersected) and
 * leave `social` required underneath.
 */
export interface SignInAuthClient {
  signIn: {
    magicLink: MagicLinkClientShape["signIn"]["magicLink"]
    social?: SocialAuthClient["signIn"]["social"]
    passkey?: PasskeyAuthClient["signIn"]["passkey"]
  }
}

/**
 * Per-element className overrides. When a key is set, the corresponding
 * inline-style default is suppressed for that element — your CSS / Tailwind
 * layer becomes the single source of truth for that element's appearance.
 * Unset keys keep the built-in inline defaults so you can override just
 * the parts you care about.
 *
 * If you'd rather start from a blank canvas, copy `app/sign-in/page.tsx`
 * (and call `authClient.signIn.magicLink` / `social` / `passkey` directly)
 * — the shipped form is intentionally minimal.
 */
export interface SignInFormClassNames {
  /** Wrapper `<div>`. Composes with the legacy `className` prop. */
  root?: string
  googleButton?: string
  passkeyButton?: string
  /** The flex container holding the divider lines + label. */
  divider?: string
  /** The two horizontal lines that frame the divider label. */
  dividerLine?: string
  /** The label text in the middle of the divider. */
  dividerLabel?: string
  emailLabel?: string
  emailInput?: string
  submitButton?: string
  /** The `<p>` rendered for each method's error state. */
  error?: string
  /** The `<p>` rendered after a successful magic-link send. */
  sentMessage?: string
}

export interface SignInFormProps {
  authClient: SignInAuthClient
  /**
   * Where to redirect after a successful sign-in. Resolution order:
   * 1. `?callbackUrl=` query param (or whatever `callbackParam` is set to)
   * 2. this `callbackUrl` prop
   * 3. `"/"`
   *
   * The query-string read is intentionally `window.location.search`-based
   * rather than Next's `useSearchParams()` — it avoids forcing consumers to
   * wrap the form in a Suspense boundary, and the URL is only read inside
   * the submit / click handlers (client-only events) so SSR + hydration
   * stay deterministic.
   */
  callbackUrl?: string
  /**
   * Name of the URL query param to read for the post-sign-in redirect.
   * Defaults to `"callbackUrl"` to match `createProxy`'s default.
   */
  callbackParam?: string

  /** Show "Continue with Google" button. */
  google?: boolean | { label?: ReactNode }
  /** Show "Sign in with passkey" button. Hidden silently if WebAuthn is unavailable. */
  passkey?: boolean | { label?: ReactNode }
  /** Show the email/magic-link form. Default true. */
  magicLink?: boolean
  /** Divider text between social/passkey buttons and the magic-link form. Default "or". */
  dividerLabel?: ReactNode
  /** Fires after a successful Google or passkey sign-in attempt. (Magic-link uses onSent.) */
  onSignedIn?: () => void

  // Magic-link form knobs (unchanged from 0.2.x)
  emailLabel?: string
  submitLabel?: string
  sentCopy?: (email: string) => ReactNode
  errorCopy?: (message: string) => ReactNode
  onSent?: (email: string) => void
  /** Legacy single-className for the root `<div>`. Still composes with `classNames.root`. */
  className?: string
  /** Per-element className overrides; replaces the inline-style default for any element you provide. */
  classNames?: SignInFormClassNames
}

type Status = "idle" | "sending" | "sent" | "error"
type MethodStatus = { magicLink: Status; google: Status; passkey: Status }

// Open-redirect defense-in-depth. The query-string value travels from
// /sign-in?callbackUrl=... to better-auth's signIn call, which echoes it back
// in the post-auth redirect. better-auth's own `trustedOrigins` is the
// authoritative gate, but a bare passthrough here also lets a phisher
// craft https://app.example.com/sign-in?callbackUrl=https://evil.example.com
// and rely on the user noticing the final hop. Accept only same-origin
// paths; silently drop anything else and fall through to prop / "/".
//
// Rejected shapes:
//   - "//evil.com"   — protocol-relative; resolves to scheme://evil.com
//   - "/\\evil.com"  — backslash bypass that some URL parsers normalize
//   - "javascript:…" / "data:…" / "http(s)://…" — explicit schemes
//   - any absolute URL whose origin != window.location.origin
function isSafeSameOriginCallbackUrl(value: string): boolean {
  if (value.startsWith("//") || value.startsWith("/\\")) return false
  if (value.startsWith("/")) return true
  if (typeof window === "undefined") return false
  try {
    const parsed = new URL(value, window.location.origin)
    return parsed.origin === window.location.origin
  } catch {
    return false
  }
}

function resolveCallbackUrl(callbackParam: string, propValue: string | undefined): string {
  if (typeof window !== "undefined") {
    const fromQuery = new URLSearchParams(window.location.search).get(callbackParam)
    if (fromQuery && isSafeSameOriginCallbackUrl(fromQuery)) return fromQuery
  }
  return propValue ?? "/"
}

export function SignInForm(props: SignInFormProps) {
  const {
    authClient,
    callbackUrl,
    callbackParam = "callbackUrl",
    google,
    passkey,
    magicLink = true,
    dividerLabel = "or",
    onSignedIn,
    emailLabel = "Email",
    submitLabel = "Send magic link",
    sentCopy = (email) => (
      <>
        Check your inbox. We sent a sign-in link to <strong>{email}</strong>.
      </>
    ),
    errorCopy = (message) => <>Couldn't sign in: {message}</>,
    onSent,
    className,
    classNames,
  } = props

  const [email, setEmail] = useState("")
  const [status, setStatusMap] = useState<MethodStatus>({
    magicLink: "idle",
    google: "idle",
    passkey: "idle",
  })
  const [errors, setErrors] = useState<{ magicLink: string; google: string; passkey: string }>({
    magicLink: "",
    google: "",
    passkey: "",
  })
  const isPasskeySupported = useWebAuthnSupported()

  function setMethod(method: keyof MethodStatus, s: Status, errorMessage = "") {
    setStatusMap((prev) => ({ ...prev, [method]: s }))
    setErrors((prev) => ({ ...prev, [method]: errorMessage }))
  }

  async function runAttempt(
    method: keyof MethodStatus,
    call: () => Promise<{ error: { message?: string | null } | null | undefined }>,
    onSuccess?: () => void,
  ) {
    setMethod(method, "sending")
    try {
      const { error } = await call()
      if (error) {
        setMethod(method, "error", error.message ?? "Unknown error")
        return
      }
      setMethod(method, "sent")
      onSuccess?.()
    } catch (err) {
      setMethod(method, "error", err instanceof Error ? err.message : "Network error")
    }
  }

  async function onMagicLinkSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const callbackURL = resolveCallbackUrl(callbackParam, callbackUrl)
    await runAttempt(
      "magicLink",
      () => authClient.signIn.magicLink({ email, callbackURL }),
      () => onSent?.(email),
    )
  }
  const onGoogleClick = () => {
    const social = authClient.signIn.social
    if (!social) {
      setMethod("google", "error", "Google sign-in is not configured on this client.")
      return
    }
    const callbackURL = resolveCallbackUrl(callbackParam, callbackUrl)
    return runAttempt(
      "google",
      () => social({ provider: "google", callbackURL }),
      () => onSignedIn?.(),
    )
  }
  const onPasskeyClick = () => {
    const passkeyMethod = authClient.signIn.passkey
    if (!passkeyMethod) {
      setMethod("passkey", "error", "Passkey sign-in is not configured on this client.")
      return
    }
    return runAttempt("passkey", () => passkeyMethod(), () => onSignedIn?.())
  }

  const showGoogle = !!google
  const showPasskey = !!passkey && isPasskeySupported
  const showDivider = magicLink && (showGoogle || showPasskey)
  const isMagicLinkSent = status.magicLink === "sent"
  const googleLabel =
    typeof google === "object" && google.label ? google.label : "Continue with Google"
  const passkeyLabel =
    typeof passkey === "object" && passkey.label ? passkey.label : "Sign in with passkey"

  const errorStyle: CSSProperties = { color: "#b00", marginTop: 4, marginBottom: 8, fontSize: 13 }
  const magicLinkErrorStyle: CSSProperties = { color: "#b00", marginTop: 8, fontSize: 13 }

  return (
    <div className={joinClassNames(className, classNames?.root)}>
      {showGoogle && (
        <>
          <button
            type="button"
            onClick={onGoogleClick}
            disabled={status.google === "sending"}
            {...styled(classNames?.googleButton, { padding: "8px 12px", width: "100%", marginBottom: 8 })}
          >
            {status.google === "sending" ? "Signing in…" : googleLabel}
          </button>
          {status.google === "error" && (
            <p {...styled(classNames?.error, errorStyle)}>
              {errorCopy(errors.google)}
            </p>
          )}
        </>
      )}

      {showPasskey && (
        <>
          <button
            type="button"
            onClick={onPasskeyClick}
            disabled={status.passkey === "sending"}
            {...styled(classNames?.passkeyButton, { padding: "8px 12px", width: "100%", marginBottom: 8 })}
          >
            {status.passkey === "sending" ? "Signing in…" : passkeyLabel}
          </button>
          {status.passkey === "error" && (
            <p {...styled(classNames?.error, errorStyle)}>
              {errorCopy(errors.passkey)}
            </p>
          )}
        </>
      )}

      {showDivider && (
        <div {...styled(classNames?.divider, { display: "flex", alignItems: "center", margin: "12px 0", gap: 8, fontSize: 13, color: "#888" })}>
          <span {...styled(classNames?.dividerLine, { flex: 1, height: 1, background: "#ddd" })} />
          <span className={classNames?.dividerLabel}>{dividerLabel}</span>
          <span {...styled(classNames?.dividerLine, { flex: 1, height: 1, background: "#ddd" })} />
        </div>
      )}

      {magicLink && (
        isMagicLinkSent ? (
          // Render the "sent" state inline rather than early-returning the
          // whole component. Early-returning unmounts the Google/passkey
          // buttons and drops any in-flight status updates from those
          // methods — defeating the per-method MethodStatus isolation.
          <p className={classNames?.sentMessage}>{sentCopy(email)}</p>
        ) : (
          <form onSubmit={onMagicLinkSubmit}>
            <label
              htmlFor="email"
              {...styled(classNames?.emailLabel, { display: "block", fontSize: 13, marginBottom: 6 })}
            >
              {emailLabel}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status.magicLink === "sending"}
              {...styled(classNames?.emailInput, { width: "100%", padding: 8, marginBottom: 8 })}
            />
            <button
              type="submit"
              disabled={status.magicLink === "sending"}
              {...styled(classNames?.submitButton, { padding: "8px 12px" })}
            >
              {status.magicLink === "sending" ? "Sending…" : submitLabel}
            </button>
            {status.magicLink === "error" && (
              <p {...styled(classNames?.error, magicLinkErrorStyle)}>
                {errorCopy(errors.magicLink)}
              </p>
            )}
          </form>
        )
      )}
    </div>
  )
}
