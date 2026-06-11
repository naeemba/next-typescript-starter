import { createServer } from "@naeemba/next-starter/server"
import { auth } from "./auth"

export const { getSession, requireSession } = createServer(auth)
