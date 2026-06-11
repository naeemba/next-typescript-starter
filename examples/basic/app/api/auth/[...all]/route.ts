import { createAuthRoute } from "@naeemba/next-starter/auth-route"
import { auth } from "../../../../lib/auth"

export const { GET, POST } = createAuthRoute(auth)
