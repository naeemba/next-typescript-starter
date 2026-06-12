"use client"

import { useEffect, useState } from "react"
import { createAuthClient as betterAuthCreateClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"

/**
 * Returns whether the current browser supports WebAuthn (the `PublicKeyCredential`
 * API). Always returns `false` during SSR; flips to `true` on the first client-side
 * effect when supported. Use this to feature-gate any UI that triggers the passkey
 * client (`signIn.passkey`, `passkey.addPasskey`) — older browsers, iOS Safari < 14,
 * and locked-down profiles surface a generic "Network error" if the call is made.
 */
export function useWebAuthnSupported(): boolean {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined"
    )
  }, [])
  return supported
}

/** Minimal structural type for the magic-link side of the better-auth client. */
export interface MagicLinkAuthClient {
  signIn: {
    magicLink: (opts: { email: string; callbackURL: string }) =>
      Promise<{ error: { message?: string | null } | null | undefined }>
  }
}

/** Minimal structural type for the passkey side of the better-auth client. */
export interface PasskeyAuthClient {
  signIn: {
    passkey: (opts?: { autoFill?: boolean }) =>
      Promise<{ error: { message?: string | null } | null | undefined }>
  }
  passkey: {
    addPasskey: (opts?: { name?: string }) =>
      Promise<{ data?: unknown; error: { message?: string | null } | null | undefined }>
  }
}

/** Minimal structural type for the social side of the better-auth client. */
export interface SocialAuthClient {
  signIn: {
    social: (opts: { provider: string; callbackURL: string }) =>
      Promise<{ error: { message?: string | null } | null | undefined }>
  }
}

export interface CreateAuthClientOptions {
  baseURL?: string
  /**
   * Load the @better-auth/passkey client plugin. Defaults to `true` so the
   * returned client structurally satisfies `PasskeyAuthClient`. Set to `false`
   * when your server-side `createAuth` does NOT enable `passkey` — otherwise
   * a `<SignInForm passkey />` wired against `AuthClient`'s types compiles
   * cleanly but resolves to a 404 at runtime.
   */
  passkey?: boolean
}

export type AuthClient =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & PasskeyAuthClient
  & SocialAuthClient

export function createAuthClient(opts: CreateAuthClientOptions = {}): AuthClient {
  const baseURL =
    opts.baseURL ??
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BETTER_AUTH_URL : undefined)
  const plugins: Array<ReturnType<typeof magicLinkClient> | ReturnType<typeof passkeyClient>> = [
    magicLinkClient(),
  ]
  if (opts.passkey !== false) plugins.push(passkeyClient())
  return betterAuthCreateClient({ baseURL, plugins }) as AuthClient
}
