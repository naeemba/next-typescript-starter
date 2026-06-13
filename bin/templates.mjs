// Inlined string templates for the 7 shim files the CLI writes.
// Kept as a separate module purely for readability; bin/cli.mjs imports
// the named exports.

export const libAuth = ({ google, passkey }) => `import { createAuth } from "@naeemba/next-starter/auth"

export const auth = createAuth({${google ? `
  google: {
    // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET read from process.env by default.
  },` : ""}${passkey ? `
  passkey: {
    rpName: "My App",
    // rpID / origin default to BETTER_AUTH_URL's host.
  },` : ""}
  // singleAdmin: "owner@example.com",  // optional: lock sign-in to one email
})
`

export const libAuthClient = ({ passkey }) => `"use client"
import { createAuthClient } from "@naeemba/next-starter/client"${passkey ? `
import { passkeyClient } from "@better-auth/passkey/client"` : ""}

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,${passkey ? `
  passkey: passkeyClient,` : ""}
})
`

export const libAuthServer = `import { createServer } from "@naeemba/next-starter/server"
import { auth } from "./auth"

export const { getSession, requireSession } = createServer(auth)
`

export const dbSchema = ({ passkey }) => `export { user, session, account, verification${passkey ? ", passkey" : ""} } from "@naeemba/next-starter/schema"
`

// `schema` must track the prefix the CLI uses to write db/schema.ts.
// With `--src` (or auto-detected src layout) the schema lives at
// `src/db/schema.ts`, otherwise `db/schema.ts`. A hardcoded
// `./db/schema.ts` would make `npm run db:generate` fail in src layouts
// with "Could not find schema file" — exactly the paper-cut the CLI is
// meant to eliminate.
export const drizzleConfig = ({ src }) => `import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "${src ? "./src/db/schema.ts" : "./db/schema.ts"}",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
`

export const authRoute = `import { createAuthRoute } from "@naeemba/next-starter/auth-route"
import { auth } from "@/lib/auth"

export const { GET, POST } = createAuthRoute(auth)
`

export const signInPage = ({ google, passkey }) => `import { SignInPage } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  return <SignInPage authClient={authClient}${google ? " google" : ""}${passkey ? " passkey" : ""} />
}
`

export const envExample = `DATABASE_URL=postgres://user:pass@host:5432/db
BETTER_AUTH_SECRET=<32+ char random string — generate with: openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Optional — magic-link email delivery via Resend.
# When unset in development, magic links are printed to the server log.
RESEND_API_KEY=
EMAIL_FROM=auth@example.com

# Optional — enable google sign-in.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
`
