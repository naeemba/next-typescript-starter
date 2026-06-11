import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Auth } from "better-auth"

export type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>

export interface RequireSessionOptions {
  redirectTo?: string
}

export function createServer(auth: Auth) {
  async function getSession(): Promise<Session | null> {
    return (await auth.api.getSession({ headers: await headers() })) as Session | null
  }

  async function requireSession(opts: RequireSessionOptions = {}): Promise<Session> {
    const session = await getSession()
    if (!session) {
      redirect(opts.redirectTo ?? "/sign-in")
    }
    return session
  }

  return { getSession, requireSession }
}
