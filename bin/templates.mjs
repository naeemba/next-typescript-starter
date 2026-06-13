// Inlined string templates for the 7 shim files the CLI writes.
// Kept as a separate module purely for readability; bin/cli.mjs imports
// the named exports.

export const libAuth = ({ google, passkey, db }) => `${db ? `import { db } from "@/db"
` : ""}import { createAuth } from "@naeemba/next-starter/auth"

export const auth = createAuth({${db ? `
  db,` : ""}${google ? `
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

export const authClient = createAuthClient({${passkey ? `
  passkey: passkeyClient,` : ""}
})
`

export const libAuthServer = `import { createServer } from "@naeemba/next-starter/server"
import { auth } from "./auth"

export const { getSession, requireSession } = createServer(auth)
`

// The schema re-export consumers need from @naeemba/next-starter/schema.
// Exposed as a separate constant so the merge path in bin/cli.mjs can
// detect "this re-export is already present" via substring match before
// touching the consumer's existing db/schema.ts (which may carry their
// app tables).
export const dbSchemaReExport = ({ passkey }) =>
  `export { user, session, account, verification${passkey ? ", passkey" : ""} } from "@naeemba/next-starter/schema"
`

// `schema` must track the prefix the CLI uses to write db/schema.ts.
// With `--src` (or auto-detected src layout) the schema lives at
// `src/db/schema.ts`, otherwise `db/schema.ts`. A hardcoded
// `./db/schema.ts` would make `npm run db:generate` fail in src layouts
// with "Could not find schema file" — exactly the paper-cut the CLI is
// meant to eliminate.
//
// `loadEnvConfig` from `@next/env` reads .env / .env.local / .env.<NODE_ENV>
// with Next's precedence so `pnpm db:push` works locally without an extra
// dotenv install. `@next/env` ships with `next` (already a peer dep), so
// no new install is required.
export const drizzleConfig = ({ src }) => `import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

loadEnvConfig(process.cwd())

export default defineConfig({
  schema: "${src ? "./src/db/schema.ts" : "./db/schema.ts"}",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
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
  return (
    <SignInPage
      authClient={authClient}
      errorCallbackUrl="/sign-in/error"${google ? "\n      google" : ""}${passkey ? "\n      passkey" : ""}
    />
  )
}
`

// Minimal /sign-in/error page that turns better-auth's magic-link verify
// errors (?error=EXPIRED_TOKEN, etc) into user-facing copy. Paired with
// the signInPage scaffold above which sets errorCallbackUrl="/sign-in/error".
export const signInErrorPage = `import { SignInErrorPage } from "@naeemba/next-starter/pages/sign-in"

export default function Page() {
  return <SignInErrorPage />
}
`

export const passkeyManagerPage = `import { PasskeyManagerPage } from "@naeemba/next-starter/pages/passkey-manager"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  return <PasskeyManagerPage authClient={authClient} />
}
`

// Next 16 root-level proxy.ts. Default scaffolds a sample /admin/:path* gate.
// The matcher excludes Next internals and the auth route — the latter MUST
// stay outside the protect-and-redirect path or the magic-link verify
// endpoint itself would 302 to /sign-in and the magic link would never land.
// Consumers needing host canonicalization, geo gating, or A/B routing should
// switch to a custom proxy.ts using the re-exported `getSessionCookie` from
// `@naeemba/next-starter/proxy` — see the README's "Custom proxy.ts" section.
export const proxyTemplate = `import { createProxy } from "@naeemba/next-starter/proxy"

export default createProxy({ protect: ["/admin/:path*"] })

export const config = { matcher: ["/((?!_next/|favicon.ico|api/auth/).*)"] }
`

export const envExample = `DATABASE_URL=postgres://user:pass@host:5432/db
BETTER_AUTH_SECRET=<32+ char random string — generate with: openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000

# Optional — only needed if your site is served from a different origin
# than the one the browser sees (e.g. behind a proxy with a public URL
# the client must call). Otherwise the auth client derives its base URL
# from window.location.origin at runtime.
# NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Optional — magic-link email delivery via Resend.
# When unset in development, magic links are printed to the server log.
RESEND_API_KEY=
EMAIL_FROM=auth@example.com

# Optional — enable google sign-in.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
`
