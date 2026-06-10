import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "../auth/index.js"

export const { GET, POST } = toNextJsHandler(auth)
