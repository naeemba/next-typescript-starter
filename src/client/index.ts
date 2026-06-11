"use client"

import { createAuthClient as betterAuthCreateClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

export interface CreateAuthClientOptions {
  baseURL?: string
}

// Return type is intentionally inlined — the better-auth return type references
// internal .mjs types that cannot be imported, so we suppress the declaration
// portability warning here.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuthClient(
  opts: CreateAuthClientOptions = {}
  // @ts-ignore TS2883: return type references better-auth internal mjs types
): ReturnType<typeof betterAuthCreateClient> {
  const baseURL =
    opts.baseURL ??
    (typeof (globalThis as { process?: { env?: Record<string, string | undefined> } }).process !== "undefined"
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["NEXT_PUBLIC_BETTER_AUTH_URL"]
      : undefined)
  return betterAuthCreateClient({
    baseURL,
    plugins: [magicLinkClient()],
  }) as ReturnType<typeof betterAuthCreateClient>
}
