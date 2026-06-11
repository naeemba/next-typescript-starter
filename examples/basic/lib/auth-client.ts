"use client"
import { createAuthClient } from "@naeemba/next-starter/client"

export const authClient = createAuthClient()
export const { signIn, signOut, useSession } = authClient
