"use client"

import { useEffect, useState, type ReactNode, type FormEvent } from "react"

/**
 * Minimal structural type covering the better-auth client methods SignInForm uses.
 * Compatible with the AuthClient type exported from `/client`.
 *
 * `social` and `passkey` are optional so 0.2.x consumers who only use magic-link
 * can keep their existing narrower client type. When `google` or `passkey` props
 * are set, the corresponding method MUST be present on the client.
 */
export interface SignInAuthClient {
  signIn: {
    magicLink: (opts: { email: string; callbackURL: string }) =>
      Promise<{ error: { message?: string | null } | null | undefined }>
    social?: (opts: { provider: string; callbackURL: string }) =>
      Promise<{ error: { message?: string | null } | null | undefined }>
    passkey?: (opts?: { autoFill?: boolean }) =>
      Promise<{ error: { message?: string | null } | null | undefined }>
  }
}

/** @deprecated Use SignInAuthClient. Kept as a backwards-compatible alias. */
export type MagicLinkAuthClient = SignInAuthClient

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
  const [isPasskeySupported, setIsPasskeySupported] = useState(false)

  useEffect(() => {
    setIsPasskeySupported(
      typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined"
    )
  }, [])

  function setMethod(method: keyof MethodStatus, s: Status, errorMessage = "") {
    setStatusMap((prev) => ({ ...prev, [method]: s }))
    setErrors((prev) => ({ ...prev, [method]: errorMessage }))
  }

  async function onMagicLinkSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMethod("magicLink", "sending")
    try {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: callbackUrl })
      if (error) {
        setMethod("magicLink", "error", error.message ?? "Unknown error")
        return
      }
      setMethod("magicLink", "sent")
      onSent?.(email)
    } catch (err) {
      setMethod("magicLink", "error", err instanceof Error ? err.message : "Network error")
    }
  }

  async function onGoogleClick() {
    setMethod("google", "sending")
    try {
      const { error } = await authClient.signIn.social!({
        provider: "google",
        callbackURL: callbackUrl,
      })
      if (error) {
        setMethod("google", "error", error.message ?? "Unknown error")
        return
      }
      setMethod("google", "sent")
      onSignedIn?.()
    } catch (err) {
      setMethod("google", "error", err instanceof Error ? err.message : "Network error")
    }
  }

  async function onPasskeyClick() {
    setMethod("passkey", "sending")
    try {
      const { error } = await authClient.signIn.passkey!()
      if (error) {
        setMethod("passkey", "error", error.message ?? "Unknown error")
        return
      }
      setMethod("passkey", "sent")
      onSignedIn?.()
    } catch (err) {
      setMethod("passkey", "error", err instanceof Error ? err.message : "Network error")
    }
  }

  if (status.magicLink === "sent") {
    return <p className={className}>{sentCopy(email)}</p>
  }

  const showGoogle = !!google
  const showPasskey = !!passkey && isPasskeySupported
  const showDivider = magicLink && (showGoogle || showPasskey)
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
      )}
    </div>
  )
}
