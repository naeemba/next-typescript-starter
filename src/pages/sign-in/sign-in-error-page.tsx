"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { styled } from "./styled.js"

// Codes better-auth's magic-link plugin emits on the errorCallbackURL
// redirect when the verify endpoint fails. Mapped to user-facing copy
// so the consumer's sign-in/error page doesn't render a raw
// `INVALID_TOKEN` string. Codes the plugin doesn't define (or future
// codes) fall through to the generic copy.
const DEFAULT_MESSAGES: Record<string, ReactNode> = {
  INVALID_TOKEN: "This sign-in link is invalid. It may have already been used.",
  EXPIRED_TOKEN: "This sign-in link has expired. Request a new one to continue.",
  TOKEN_NOT_FOUND: "We couldn't find this sign-in link. Request a new one to continue.",
  MAGIC_LINK_EXPIRED: "This sign-in link has expired. Request a new one to continue.",
  invalid_token: "This sign-in link is invalid. It may have already been used.",
  expired_token: "This sign-in link has expired. Request a new one to continue.",
  token_not_found: "We couldn't find this sign-in link. Request a new one to continue.",
}

const GENERIC_MESSAGE: ReactNode =
  "We couldn't sign you in. Request a new sign-in link to try again."

export interface SignInErrorPageClassNames {
  main?: string
  heading?: string
  message?: string
  link?: string
}

export interface SignInErrorPageProps {
  /**
   * Map of error code → user-facing message. Merged on top of the built-in
   * defaults (INVALID_TOKEN, EXPIRED_TOKEN, etc) so consumers can override
   * just the codes they want to rewrite without redefining every entry.
   * Unknown codes fall through to `genericMessage`.
   */
  errorMessages?: Record<string, ReactNode>
  /** Heading shown above the error message. Default: "Sign in failed". */
  title?: string
  /** Fallback message for codes not in `errorMessages` or the defaults. */
  genericMessage?: ReactNode
  /** Path to send the user back to. Default: "/sign-in". */
  signInPath?: string
  /** Label for the "Back to sign-in" link. Default: "Back to sign in". */
  signInLabel?: ReactNode
  /**
   * Query param to read the error code from. Default: "error".
   * Better-auth's magic-link plugin emits `?error=<code>` on its errorCallbackURL.
   */
  errorParam?: string
  /** Per-element className overrides; parallel to SignInPage's classNames API. */
  classNames?: SignInErrorPageClassNames
}

export function SignInErrorPage(props: SignInErrorPageProps) {
  const {
    errorMessages,
    title = "Sign in failed",
    genericMessage = GENERIC_MESSAGE,
    signInPath = "/sign-in",
    signInLabel = "Back to sign in",
    errorParam = "error",
    classNames,
  } = props

  // Seed the error code from the URL on initial render so the very first
  // paint already shows the mapped friendly copy instead of the generic
  // fallback — otherwise the user briefly sees `genericMessage` flash
  // before the effect-driven re-render swaps it for the real message.
  // SSR returns `null` (the effect below picks it up on hydration), and a
  // subsequent `errorParam` prop change is handled by the effect too.
  const [code, setCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get(errorParam)
  })
  useEffect(() => {
    if (typeof window === "undefined") return
    setCode(new URLSearchParams(window.location.search).get(errorParam))
  }, [errorParam])

  const merged = { ...DEFAULT_MESSAGES, ...errorMessages }
  // Try the code as-is, then uppercased (better-auth emits snake_case
  // codes sometimes, screaming-snake other times — accept both).
  const message: ReactNode = code
    ? (merged[code] ?? merged[code.toUpperCase()] ?? genericMessage)
    : genericMessage

  const mainStyle: CSSProperties = { maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }
  const headingStyle: CSSProperties = { fontSize: 20, marginBottom: 12 }
  const messageStyle: CSSProperties = { fontSize: 14, color: "#555", marginBottom: 16 }
  const linkStyle: CSSProperties = { fontSize: 14 }

  return (
    <main {...styled(classNames?.main, mainStyle)}>
      <h1 {...styled(classNames?.heading, headingStyle)}>{title}</h1>
      <p {...styled(classNames?.message, messageStyle)}>{message}</p>
      <a href={signInPath} {...styled(classNames?.link, linkStyle)}>
        {signInLabel}
      </a>
    </main>
  )
}
