"use client"

import { useState, type ReactNode, type FormEvent } from "react"
import {
  useWebAuthnSupported,
  type MagicLinkAuthClient as MagicLinkClientShape,
  type SocialAuthClient,
  type PasskeyAuthClient,
} from "../../client/index.js"

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

export interface SignInFormProps {
  authClient: SignInAuthClient
  callbackUrl?: string

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
  className?: string
}

type Status = "idle" | "sending" | "sent" | "error"
type MethodStatus = { magicLink: Status; google: Status; passkey: Status }

export function SignInForm(props: SignInFormProps) {
  const {
    authClient,
    callbackUrl = "/",
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
    await runAttempt(
      "magicLink",
      () => authClient.signIn.magicLink({ email, callbackURL: callbackUrl }),
      () => onSent?.(email),
    )
  }
  const onGoogleClick = () => {
    const social = authClient.signIn.social
    if (!social) {
      setMethod("google", "error", "Google sign-in is not configured on this client.")
      return
    }
    return runAttempt(
      "google",
      () => social({ provider: "google", callbackURL: callbackUrl }),
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

  return (
    <div className={className}>
      {showGoogle && (
        <>
          <button
            type="button"
            onClick={onGoogleClick}
            disabled={status.google === "sending"}
            style={{ padding: "8px 12px", width: "100%", marginBottom: 8 }}
          >
            {status.google === "sending" ? "Signing in…" : googleLabel}
          </button>
          {status.google === "error" && (
            <p style={{ color: "#b00", marginTop: 4, marginBottom: 8, fontSize: 13 }}>
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
            style={{ padding: "8px 12px", width: "100%", marginBottom: 8 }}
          >
            {status.passkey === "sending" ? "Signing in…" : passkeyLabel}
          </button>
          {status.passkey === "error" && (
            <p style={{ color: "#b00", marginTop: 4, marginBottom: 8, fontSize: 13 }}>
              {errorCopy(errors.passkey)}
            </p>
          )}
        </>
      )}

      {showDivider && (
        <div style={{ display: "flex", alignItems: "center", margin: "12px 0", gap: 8, fontSize: 13, color: "#888" }}>
          <span style={{ flex: 1, height: 1, background: "#ddd" }} />
          <span>{dividerLabel}</span>
          <span style={{ flex: 1, height: 1, background: "#ddd" }} />
        </div>
      )}

      {magicLink && (
        isMagicLinkSent ? (
          // Render the "sent" state inline rather than early-returning the
          // whole component. Early-returning unmounts the Google/passkey
          // buttons and drops any in-flight status updates from those
          // methods — defeating the per-method MethodStatus isolation.
          <p>{sentCopy(email)}</p>
        ) : (
          <form onSubmit={onMagicLinkSubmit}>
            <label htmlFor="email" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
              {emailLabel}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status.magicLink === "sending"}
              style={{ width: "100%", padding: 8, marginBottom: 8 }}
            />
            <button type="submit" disabled={status.magicLink === "sending"} style={{ padding: "8px 12px" }}>
              {status.magicLink === "sending" ? "Sending…" : submitLabel}
            </button>
            {status.magicLink === "error" && (
              <p style={{ color: "#b00", marginTop: 8, fontSize: 13 }}>
                {errorCopy(errors.magicLink)}
              </p>
            )}
          </form>
        )
      )}
    </div>
  )
}
