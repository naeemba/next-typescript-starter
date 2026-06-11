"use client"

import type { ReactNode } from "react"
import { SignInForm, type SignInFormProps } from "./sign-in-form.js"

export interface SignInPageProps extends SignInFormProps {
  title?: string
  description?: ReactNode
}

export function SignInPage(props: SignInPageProps) {
  const { title = "Sign in", description, ...formProps } = props
  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: description ? 4 : 12 }}>{title}</h1>
      {description && (
        <p style={{ fontSize: 13, color: "#555", marginTop: 0, marginBottom: 12 }}>{description}</p>
      )}
      <SignInForm {...formProps} />
    </main>
  )
}
