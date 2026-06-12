"use client"

import { PasskeyManager } from "@naeemba/next-starter/pages/passkey-manager"
import { authClient } from "../../../lib/auth-client"

export default function Page() {
  return (
    <main style={{ maxWidth: 520, margin: "10vh auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Your passkeys</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        Register a passkey so you can sign in without an email link next time.
      </p>
      <PasskeyManager authClient={authClient} />
    </main>
  )
}
