"use client"

import { useState, type ReactNode, type FormEvent } from "react"

/** Minimal structural type required by SignInForm — avoids coupling to better-auth internals. */
export interface MagicLinkAuthClient {
  signIn: {
    magicLink: (opts: { email: string; callbackURL: string }) => Promise<{ error: { message?: string } | null }>
  }
}

export interface SignInFormProps {
  authClient: MagicLinkAuthClient
  callbackUrl?: string
  emailLabel?: string
  submitLabel?: string
  sentCopy?: (email: string) => ReactNode
  errorCopy?: (message: string) => ReactNode
  onSent?: (email: string) => void
  className?: string
}

type Status = "idle" | "sending" | "sent" | "error"

export function SignInForm(props: SignInFormProps) {
  const {
    authClient,
    callbackUrl = "/",
    emailLabel = "Email",
    submitLabel = "Send magic link",
    sentCopy = (email) => (
      <>
        We sent a sign-in link to <strong>{email}</strong>. It expires in 10 minutes.
      </>
    ),
    errorCopy = (message) => <>Couldn't send the sign-in link: {message}</>,
    onSent,
    className,
  } = props

  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("sending")
    setErrorMessage("")
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: callbackUrl })
    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "Unknown error")
      return
    }
    setStatus("sent")
    onSent?.(email)
  }

  if (status === "sent") {
    return <p className={className}>{sentCopy(email)}</p>
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <label htmlFor="email" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
        {emailLabel}
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "sending"}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <button type="submit" disabled={status === "sending"} style={{ padding: "8px 12px" }}>
        {status === "sending" ? "Sending…" : submitLabel}
      </button>
      {status === "error" && (
        <p style={{ color: "#b00", marginTop: 8, fontSize: 13 }}>{errorCopy(errorMessage)}</p>
      )}
    </form>
  )
}
