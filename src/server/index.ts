import { headers } from "next/headers"
import { auth } from "../auth/index.js"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
