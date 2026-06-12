"use client"

import { SignInForm } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "../../lib/auth-client"

const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1"

export default function Page() {
  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Sign in</h1>
      <SignInForm
        authClient={authClient}
        callbackUrl="/"
        google={googleEnabled}
        passkey
      />
    </main>
  )
}
