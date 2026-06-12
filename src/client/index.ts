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
   * Load the @better-auth/passkey client plugin. Defaults to `true`.
   *
   * When `false`, the returned client's TYPE drops `PasskeyAuthClient` too
   * (via the function overload below) — so a consumer who calls
   * `createAuthClient({ passkey: false })` cannot accidentally reach for
   * `client.passkey.addPasskey` and hit a runtime `TypeError`.
   */
  passkey?: boolean
}

/** AuthClient when the passkey plugin is loaded (the default). */
export type AuthClient =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & PasskeyAuthClient
  & SocialAuthClient

/** AuthClient when `createAuthClient({ passkey: false })` was used. */
export type AuthClientWithoutPasskey =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & SocialAuthClient

// Overloads: the literal `{ passkey: false }` narrows away `PasskeyAuthClient`.
// Anything else (including `passkey: true` and the default) returns the full
// AuthClient. The order matters — the most-specific signature must come first.
export function createAuthClient(
  opts: CreateAuthClientOptions & { passkey: false }
): AuthClientWithoutPasskey
export function createAuthClient(opts?: CreateAuthClientOptions): AuthClient
export function createAuthClient(opts: CreateAuthClientOptions = {}): AuthClient {
  const baseURL =
    opts.baseURL ??
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BETTER_AUTH_URL : undefined)
  const plugins: Array<ReturnType<typeof magicLinkClient> | ReturnType<typeof passkeyClient>> = [
    magicLinkClient(),
  ]
  if (opts.passkey ?? true) plugins.push(passkeyClient())
  return betterAuthCreateClient({ baseURL, plugins }) as AuthClient
}
