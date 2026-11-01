import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Auth } from "better-auth"
import { toSafeRelativePath } from "../internal/safe-redirect.js"

export type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>

export interface RequireSessionOptions {
  /** Same-origin relative path. Anything else falls back to `/sign-in`. */
  redirectTo?: string
}

export function createServer(auth: Auth) {
  async function getSession(): Promise<Session | null> {
    return (await auth.api.getSession({ headers: await headers() })) as Session | null
  }

  async function requireSession(opts: RequireSessionOptions = {}): Promise<Session> {
    const session = await getSession()
    if (!session) {
      redirect(toSafeRelativePath(opts.redirectTo) ?? "/sign-in")
    }
    return session
  }

  return { getSession, requireSession }
}
