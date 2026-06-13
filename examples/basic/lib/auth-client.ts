"use client"
import { createAuthClient } from "@naeemba/next-starter/client"
import { passkeyClient } from "@better-auth/passkey/client"

export const authClient = createAuthClient({ passkey: passkeyClient })
export const { signIn, signOut, useSession } = authClient
