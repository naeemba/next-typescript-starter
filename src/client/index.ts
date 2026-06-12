"use client"

import { createAuthClient as betterAuthCreateClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"

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
  return betterAuthCreateClient({
    baseURL,
    plugins: [magicLinkClient(), passkeyClient()],
  }) as AuthClient
}
