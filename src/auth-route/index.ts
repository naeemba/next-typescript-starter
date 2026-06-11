import { toNextJsHandler } from "better-auth/next-js"
import type { Auth } from "better-auth"

export function createAuthRoute(auth: Auth): ReturnType<typeof toNextJsHandler> {
  return toNextJsHandler(auth)
}
