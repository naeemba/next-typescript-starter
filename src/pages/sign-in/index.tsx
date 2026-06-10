"use client"

import { useState } from "react"
import { createAuthClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

const authClient = createAuthClient({
  plugins: [magicLinkClient()],
})

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("sending")
    setErrorMsg(null)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
    })
    if (error) {
      setStatus("error")
      setErrorMsg(error.message ?? "Couldn't send the magic link. Please try again.")
      return
    }
    setStatus("sent")
  }

  if (status === "sent") {
    return (
      <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Check your inbox</h1>
        <p style={{ fontSize: 14, color: "#444" }}>
          We sent a sign-in link to <strong>{email}</strong>. It expires in 10 minutes.
        </p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="email" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            backgroundColor: "#000",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: status === "sending" ? "wait" : "pointer",
          }}
        >
          {status === "sending" ? "Sending…" : "Sign in with email"}
        </button>
        {errorMsg && (
          <p role="alert" style={{ fontSize: 13, color: "#b00", marginTop: 12 }}>
            {errorMsg}
          </p>
        )}
      </form>
    </main>
  )
}
