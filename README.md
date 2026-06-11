# @naeemba/next-starter

Opinionated Next.js + Drizzle + Better Auth starter, shipped as a **versioned npm package** instead of a clone-and-fork template. Add it as a dependency, set env vars, create a few shim files, and you have working magic-link email sign-in. Bump the package version to pull in fixes.

If you're upgrading from 0.1.x, see [UPGRADING.md](./UPGRADING.md) for the migration steps.

## Install

```bash
npm install @naeemba/next-starter
```

Peer dependencies: `next >= 14`, `react >= 18`, `react-dom >= 18`.

## Env vars

```bash
DATABASE_URL=postgres://user:pass@host:5432/db
BETTER_AUTH_SECRET=<32+ char random string>   # openssl rand -hex 32
BETTER_AUTH_URL=https://app.example.com
EMAIL_FROM=auth@example.com                    # optional in dev, required for Resend in prod
RESEND_API_KEY=...                             # optional — when unset, magic links log to stdout
```

## Setup files in your app

### lib/auth.ts

```ts
import { createAuth } from "@naeemba/next-starter/auth"
export const auth = createAuth()
```

`createAuth` accepts options for `allowlist` (restrict sign-in to specific email addresses or domains), `session` (override session cookie / expiry settings), and a custom `sendMagicLinkEmail` function if you want to control the email template or provider.

### lib/auth-client.ts

```ts
"use client"
import { createAuthClient } from "@naeemba/next-starter/client"
export const authClient = createAuthClient()
export const { signIn, signOut, useSession } = authClient
```

### lib/auth-server.ts

```ts
import { createServer } from "@naeemba/next-starter/server"
import { auth } from "./auth"
export const { getSession, requireSession } = createServer(auth)
```

### app/api/auth/[...all]/route.ts

```ts
import { createAuthRoute } from "@naeemba/next-starter/auth-route"
import { auth } from "@/lib/auth"
export const { GET, POST } = createAuthRoute(auth)
```

### app/sign-in/page.tsx

```tsx
import { SignInPage } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "@/lib/auth-client"
export default function Page() {
  return <SignInPage authClient={authClient} />
}
```

### db/schema.ts

```ts
export * from "@naeemba/next-starter/schema"
```

### drizzle.config.ts

```ts
import { defineConfig } from "drizzle-kit"
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

Why a `db/schema.ts` shim? drizzle-kit does not follow symlinks and requires a `.ts` schema source — so the cleanest pattern is a one-line re-export that drizzle-kit can read directly.

## First-time setup

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

That creates the `user`, `session`, `account`, and `verification` tables. Re-run after a package update that changes the schema (release notes will say so).

## Reading the session in a Server Component

```ts
import { requireSession } from "@/lib/auth-server"

export default async function Page() {
  const { user } = await requireSession()
  return <div>Signed in as {user.email}</div>
}
```

Use `getSession` instead of `requireSession` if you want to handle the unauthenticated case yourself (it returns `null` rather than redirecting).

## Dev experience

If `RESEND_API_KEY` is unset, the magic link is written to your server logs in a line that looks like:

```
[magic-link-log] email=you@example.com url=http://localhost:3000/api/auth/magic-link/verify?token=...
```

Copy-click the URL to sign in. This is useful for local dev before you have a Resend account.

If `NODE_ENV=production` and `RESEND_API_KEY` is unset, a warning is printed at boot: magic links going to logs in prod means anyone with log access can sign in as any user.

## TypeScript

This package is ESM-only with subpath `exports`. Your consumer `tsconfig.json` **must** set `moduleResolution` to `"bundler"` (Next 14+ default), `"node16"`, or `"nodenext"`. The legacy `"node"` resolution silently ignores subpath `types` conditions and imports degrade to `any`.

## What ships in this package

| Subpath | What it is |
|---|---|
| `@naeemba/next-starter/auth` | `createAuth()` factory |
| `@naeemba/next-starter/client` | `createAuthClient()` factory |
| `@naeemba/next-starter/auth-route` | `createAuthRoute(auth)` — returns `GET`, `POST` handlers |
| `@naeemba/next-starter/schema` | Drizzle table definitions |
| `@naeemba/next-starter/db` | Lazy Drizzle client |
| `@naeemba/next-starter/email` | `sendMagicLink({ to, url })` |
| `@naeemba/next-starter/pages/sign-in` | Named-exported `SignInPage` component |
| `@naeemba/next-starter/server` | `createServer(auth)` — returns `getSession`, `requireSession` |

## Design and rationale

See `docs/superpowers/specs/` and `docs/superpowers/plans/` in the repo for the full v0.1 foundation design and implementation plan — why a package and not a template, the re-export shim pattern, what's deferred to future versions, and the step-by-step build process.

## License

MIT
