"use client"

import type { CSSProperties, ReactNode } from "react"
import { SignInForm, type SignInFormClassNames, type SignInFormProps } from "./sign-in-form.js"
import { styled } from "./styled.js"

export interface SignInPageClassNames extends SignInFormClassNames {
  /** Outer `<main>` wrapper. Suppresses the page's centering inline styles when set. */
  main?: string
  /** The `<h1>` title. */
  heading?: string
  /** The `<p>` description, when one is provided. */
  description?: string
}

export interface SignInPageProps extends Omit<SignInFormProps, "classNames"> {
  title?: string
  description?: ReactNode
  classNames?: SignInPageClassNames
}

export function SignInPage(props: SignInPageProps) {
  const { title = "Sign in", description, classNames, ...formProps } = props
  const headingDefaultStyle: CSSProperties = { fontSize: 20, marginBottom: description ? 4 : 12 }
  const descriptionDefaultStyle: CSSProperties = {
    fontSize: 13,
    color: "#555",
    marginTop: 0,
    marginBottom: 12,
  }
  return (
    <main {...styled(classNames?.main, { maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" })}>
      <h1 {...styled(classNames?.heading, headingDefaultStyle)}>{title}</h1>
      {description && (
        <p {...styled(classNames?.description, descriptionDefaultStyle)}>{description}</p>
      )}
      <SignInForm {...formProps} classNames={classNames} />
    </main>
  )
}
