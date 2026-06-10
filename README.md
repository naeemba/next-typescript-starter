# @naeemba/next-starter

Opinionated Next.js + Drizzle + Better Auth starter, shipped as a **versioned npm package** instead of a clone-and-fork template. Add it as a dependency, set env vars, create four shim files, and you have working magic-link email sign-in. Bump the package version to pull in fixes.

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

## Four shim files in your app

```ts
// app/api/auth/[...all]/route.ts
export { GET, POST } from "@naeemba/next-starter/auth-route"
```

```tsx
// app/sign-in/page.tsx
export { default } from "@naeemba/next-starter/pages/sign-in"
```

```ts
// db/schema.ts
export * from "@naeemba/next-starter/schema"
```

```ts
// drizzle.config.ts
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

```tsx
import { getSession } from "@naeemba/next-starter/server"

export default async function Page() {
  const session = await getSession()
  if (!session) return <a href="/sign-in">Sign in</a>
  return <p>Hello, {session.user.email}</p>
}
```

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
| `@naeemba/next-starter/auth` | Configured Better Auth instance |
| `@naeemba/next-starter/auth-route` | `GET`, `POST` for `/api/auth/[...all]` |
| `@naeemba/next-starter/schema` | Drizzle table definitions |
| `@naeemba/next-starter/db` | Lazy Drizzle client |
| `@naeemba/next-starter/email` | `sendMagicLink({ to, url })` |
| `@naeemba/next-starter/pages/sign-in` | Default-exported sign-in page component |
| `@naeemba/next-starter/server` | `getSession()` |

## Design and rationale

See `docs/superpowers/specs/` and `docs/superpowers/plans/` in the repo for the full v0.1 foundation design and implementation plan — why a package and not a template, the re-export shim pattern, what's deferred to future versions, and the step-by-step build process.

## License

MIT
