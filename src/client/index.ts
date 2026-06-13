"use client"

import { useEffect, useState } from "react"
import { createAuthClient as betterAuthCreateClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

// `@better-auth/passkey/client` is browser code — `loadOptionalPeer` (Node
// `createRequire`-based) can't load it, so the sync server pattern doesn't
// apply here. Instead the consumer passes the factory in. That keeps our
// bundle free of any top-level `@better-auth/passkey/client` reference, so
// a consumer who scaffolds with `--no-passkey` (or just omits the option)
// gets a bundle without it — and `@better-auth/passkey` can sit in
// peerDependencies marked optional rather than a hard dependency we'd
// otherwise force into every consumer's node_modules.
//
// Structural type — not `typeof import("@better-auth/passkey/client").passkeyClient`
// — so our shipped `.d.ts` doesn't reference the optional peer at all.
// Consumers without it can typecheck cleanly.
type PasskeyClientFactory = () => { id?: string } & Record<string, unknown>

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
   * Enable passkey support by passing the `passkeyClient` factory from
   * `@better-auth/passkey/client`:
   *
   * ```ts
   * import { createAuthClient } from "@naeemba/next-starter/client"
   * import { passkeyClient } from "@better-auth/passkey/client"
   *
   * export const authClient = createAuthClient({
   *   baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
   *   passkey: passkeyClient,
   * })
   * ```
   *
   * Omit (or pass `false`) to skip. With the factory omitted, this module
   * has no top-level `@better-auth/passkey/client` import, so the consumer
   * bundle excludes it entirely — `@better-auth/passkey` can be left
   * uninstalled.
   */
  passkey?: PasskeyClientFactory | false
}

/** AuthClient when a passkey factory was passed. */
export type AuthClient =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & PasskeyAuthClient
  & SocialAuthClient

/** AuthClient when no passkey factory was passed (the default). */
export type AuthClientWithoutPasskey =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & SocialAuthClient

// Overloads: passing a passkey factory widens the return type to include
// the passkey surface; the default (no factory or `false`) narrows it away.
// Order matters — most-specific signature first.
export function createAuthClient(
  opts: CreateAuthClientOptions & { passkey: PasskeyClientFactory },
): AuthClient
export function createAuthClient(opts?: CreateAuthClientOptions): AuthClientWithoutPasskey
export function createAuthClient(
  opts: CreateAuthClientOptions = {},
): AuthClient | AuthClientWithoutPasskey {
  // Resolution order:
  //   1. explicit opts.baseURL                       — caller knows best
  //   2. NEXT_PUBLIC_BETTER_AUTH_URL                  — set when site is
  //      served from a different origin than the browser sees (e.g. a
  //      proxy in front, or a public URL the client must use)
  //   3. window.location.origin                       — same-origin default,
  //      lets consumers drop NEXT_PUBLIC_BETTER_AUTH_URL in the common case
  //
  // (1) and (2) are evaluated at module load (build-time inlined for Next),
  // (3) at first call site in the browser. The fallback chain is structured
  // so a `process` shim that defines an empty NEXT_PUBLIC_BETTER_AUTH_URL
  // doesn't short-circuit to "" — we only consume the env var when it's a
  // non-empty string.
  const envBaseURL =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BETTER_AUTH_URL : undefined
  const baseURL =
    opts.baseURL ??
    (envBaseURL && envBaseURL.length > 0 ? envBaseURL : undefined) ??
    (typeof window !== "undefined" ? window.location.origin : undefined)
  const plugins: Array<ReturnType<typeof magicLinkClient>> = [magicLinkClient()]
  // Cast: passkeyClient() returns better-auth's BetterAuthClientPlugin (non-
  // optional `id`), but we type the factory structurally so our `.d.ts` doesn't
  // pull in `@better-auth/passkey/client` for consumers that don't use it.
  if (typeof opts.passkey === "function") {
    plugins.push(opts.passkey() as unknown as ReturnType<typeof magicLinkClient>)
  }
  return betterAuthCreateClient({ baseURL, plugins }) as unknown as AuthClient
}
