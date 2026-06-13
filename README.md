# @naeemba/next-starter

Opinionated Next.js + Drizzle + Better Auth starter, shipped as a **versioned npm package** instead of a clone-and-fork template. Add it as a dependency, set env vars, create a few shim files, and you have working magic-link email sign-in. Bump the package version to pull in fixes.

If you're upgrading, see [UPGRADING.md](./UPGRADING.md).

## Sign-in methods

| Method     | Enable via                                          | Required env                                |
| ---------- | --------------------------------------------------- | ------------------------------------------- |
| Magic link | Default (or `createAuth({ magicLink: {...} })`)     | `RESEND_API_KEY` in production              |
| Google     | `createAuth({ google: {} })`                        | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`  |
| Passkey    | `createAuth({ passkey: { rpName: 'Your App' } })`   | none (uses `BETTER_AUTH_URL`)               |

Each method is opt-in. Enabling one does not require the others.

## Install

```bash
npm install @naeemba/next-starter
```

Then scaffold the seven shim files automatically:

```bash
npx @naeemba/next-starter init
```

Or skip the CLI and create them by hand (see [Setup files in your app](#setup-files-in-your-app)).

Peer dependencies: `next >= 16`, `react >= 19`, `react-dom >= 19`. Node `>= 20`.

## Env vars

```bash
DATABASE_URL=postgres://user:pass@host:5432/db
BETTER_AUTH_SECRET=<32+ char random string>   # openssl rand -hex 32
BETTER_AUTH_URL=https://app.example.com
EMAIL_FROM=auth@example.com                    # optional in dev, required for Resend in prod
RESEND_API_KEY=...                             # optional — when unset, magic links log to stdout
# Optional: NEXT_PUBLIC_BETTER_AUTH_URL — only set when the public URL the
# browser must call differs from window.location.origin (e.g. a proxy in
# front with a different hostname). Otherwise the client derives it at runtime.
# Note: postgres, @react-email/*, @better-auth/passkey, and resend are optional
# peer dependencies. Install only the ones you actually use — see UPGRADING.md.
```

## Setup files in your app

### lib/auth.ts

```ts
import { createAuth } from "@naeemba/next-starter/auth"
export const auth = await createAuth()
```

`createAuth` is async (since 0.7.0) so it can `import()` ESM-only optional peers like `@better-auth/passkey`. Top-level await resolves once at module init in Next 16 server modules; downstream importers see `auth` as a resolved `Auth` instance, not a `Promise`.

`createAuth` accepts options for `magicLink` (custom expiry, `allowlist`, custom `email` template), `session` (override session cookie / expiry settings), `google`, `passkey`, `singleAdmin` (lock sign-in to one or more emails), `accountLinking`, `rateLimit` (better-auth's rate-limit knob; `BETTER_AUTH_RATE_LIMIT_DISABLED=1` env force-disables for local dev), and `transport` (BYO email delivery — replaces the built-in Resend/console dispatch for magic-link mail).

### lib/auth-client.ts

```ts
"use client"
import { createAuthClient } from "@naeemba/next-starter/client"
import { passkeyClient } from "@better-auth/passkey/client"
export const authClient = createAuthClient({ passkey: passkeyClient })
export const { signIn, signOut, useSession } = authClient
```

> Drop the `passkeyClient` import (and the `passkey:` field) to skip
> passkey support — the consumer bundle then excludes
> `@better-auth/passkey` entirely.
>
> `baseURL` resolution: `opts.baseURL` → `NEXT_PUBLIC_BETTER_AUTH_URL` →
> `window.location.origin`. For same-origin deployments you can drop both
> the env var and the option. Set one only when the public URL the client
> must call differs from what the browser sees.

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
  return <SignInPage authClient={authClient} errorCallbackUrl="/sign-in/error" />
}
```

`SignInPage` reads `?callbackUrl=` from the URL query string and forwards it as the post-sign-in redirect (falling back to the `callbackUrl` prop, then `"/"`). Cross-origin and protocol-relative values are dropped silently to prevent open-redirect abuse. Set `callbackParam` to use a different query name. Set `errorCallbackUrl` to redirect to a friendly page when the magic-link verify endpoint fails — see the [SignInErrorPage](#magic-link-error-pages) recipe below.

### app/sign-in/error/page.tsx

```tsx
import { SignInErrorPage } from "@naeemba/next-starter/pages/sign-in"
export default function Page() {
  return <SignInErrorPage />
}
```

Renders a heading + user-friendly message based on the `?error=<code>` query the magic-link verify endpoint redirects to on failure (expired token, used token, etc).

### db/schema.ts

```ts
export * from "@naeemba/next-starter/schema"
```

### drizzle.config.ts

```ts
import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

loadEnvConfig(process.cwd())

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

Why `loadEnvConfig`? drizzle-kit runs as a CLI outside Next.js, so it doesn't auto-read `.env.local` / `.env`. `@next/env` ships with `next` (already a peer dep) and applies Next's env file precedence so `pnpm db:push` works locally with no extra install.

Why a `db/schema.ts` shim? drizzle-kit does not follow symlinks and requires a `.ts` schema source — so the cleanest pattern is a one-line re-export that drizzle-kit can read directly. You can add app tables to `db/schema.ts` alongside the re-export; the CLI's merge behavior preserves them on re-init.

## First-time setup

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

That creates the `user`, `session`, `account`, `verification`, and `passkey` tables. Re-run after a package update that changes the schema (release notes will say so).

## Enabling Google sign-in

```ts
// lib/auth.ts
export const auth = await createAuth({
  google: {
    // clientId / clientSecret default to env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
    allowlist: (profile) => profile.email.endsWith("@acme.com"), // optional
  },
})
```

`createAuth({ google })` auto-enables account linking with Google as a trusted provider (verified-email gated). Opt out with `accountLinking: false`.

Render the button:

```tsx
<SignInForm authClient={authClient} google />
```

## Locking sign-in to one or more emails

For solo apps or admin tools, use the `singleAdmin` shortcut:

```ts
await createAuth({
  singleAdmin: "owner@example.com",          // or ["a@x.com", "b@x.com"]
  google: { /* clientId/secret from env */ },
})
```

`singleAdmin` auto-fills `magicLink.allowlist` and `google.allowlist` with a case-insensitive exact match. Google additionally rejects sign-in if the OAuth profile's email isn't verified. If you also pass an explicit `magicLink.allowlist` or `google.allowlist`, the explicit callback wins for that provider.

## Enabling passkeys

```ts
// lib/auth.ts
export const auth = await createAuth({
  passkey: { rpName: "Your App" },  // rpID and origin default from BETTER_AUTH_URL
})
```

Run a migration so the `passkey` table exists (covered by the `npx drizzle-kit generate && migrate` above).

Render the sign-in button:

```tsx
<SignInForm authClient={authClient} passkey />
```

The button is hidden silently in browsers without WebAuthn support.

Add a registration page (the `init` CLI scaffolds this automatically when `--passkey` is enabled — the default):

```tsx
// app/account/passkeys/page.tsx
import { PasskeyManagerPage } from "@naeemba/next-starter/pages/passkey-manager"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  return <PasskeyManagerPage authClient={authClient} />
}
```

`PasskeyManagerPage` is the chrome-wrapped variant (heading + description + main wrapper, parallel to `SignInPage`). Use the lower-level `PasskeyManager` directly if you want to drop the "Add a passkey" button into existing settings UI.

## Reading the session in a Server Component

```ts
import { requireSession } from "@/lib/auth-server"

export default async function Page() {
  const { user } = await requireSession()
  return <div>Signed in as {user.email}</div>
}
```

Use `getSession` instead of `requireSession` if you want to handle the unauthenticated case yourself (it returns `null` rather than redirecting).

## Common UX recipes

### Sign out

```tsx
"use client"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"

export function SignOutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut()
        router.push("/sign-in")
        router.refresh()  // clears server-component sessions
      }}
    >
      Sign out
    </button>
  )
}
```

`authClient.signOut()` clears the better-auth session cookie. `router.refresh()` is what tells server components to re-read the session — without it, the user appears signed in until the next navigation.

### Magic-link error pages

Set `errorCallbackUrl="/sign-in/error"` on `SignInPage`. When the verify endpoint fails, better-auth redirects to that URL with `?error=<code>`. Pair with `<SignInErrorPage/>` for friendly copy. Override codes with `errorMessages`:

```tsx
<SignInErrorPage
  errorMessages={{ EXPIRED_TOKEN: "Your link timed out. Request a new one." }}
/>
```

### Rate limits

```ts
await createAuth({
  rateLimit: { window: 60, max: 5 },  // shorter window / lower max than the prod default
})
```

Pass `rateLimit: false` to disable entirely, or export `BETTER_AUTH_RATE_LIMIT_DISABLED=1` to force-disable for local dev (the env var is overridden by an explicit `{ enabled: true }`).

### BYO email transport

Skip the built-in Resend dispatch entirely — use your existing email wrapper:

```ts
import { sendEmail as mySendEmail } from "@/lib/email"

await createAuth({
  transport: async ({ to, from, subject, text, html }) => {
    await mySendEmail({ to, from, subject, text, html })
  },
})
```

The transport receives the fully rendered email (subject, html, text). `RESEND_API_KEY` is not needed when transport is set. `allowlist` still gates ahead of transport — rejected addresses never reach your function.

### Custom `callbackUrl` query param

```tsx
<SignInPage authClient={authClient} callbackParam="next" />
```

Pair with `createProxy({ callbackParam: "next" })` so the proxy → sign-in roundtrip uses the same query name end-to-end.

## Protecting routes with proxy.ts

Next 16 renamed `middleware.ts` → `proxy.ts` and `middleware()` → `proxy()`. This package targets Next ≥ 16, so only the proxy form ships:

```ts
// proxy.ts (project root)
import { createProxy } from "@naeemba/next-starter/proxy"

export default createProxy({
  protect: ["/admin/:path*", "/dashboard/:path*"],
  signInPath: "/sign-in",         // default
})

export const config = { matcher: ["/((?!_next/|favicon.ico|api/auth/).*)"] }
```

The helper checks for the better-auth session cookie's *presence* — it does not validate the session against the database (that would require Node runtime; the Edge runtime can't reach Postgres). Unauthenticated requests are redirected to `signInPath?callbackUrl=<original>`. The real auth gate stays at the server-component level via `requireSession()`.

### Custom proxy.ts

If you already have a `proxy.ts` doing other work (host canonicalization, geo gating, A/B routing), import the cookie helper directly instead of wrapping `createProxy`:

```ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "@naeemba/next-starter/proxy"

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin") && !getSessionCookie(req)) {
    return NextResponse.redirect(new URL("/sign-in", req.url))
  }
  // your other concerns ...
  return NextResponse.next()
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
| `@naeemba/next-starter/auth` | `createAuth()` factory |
| `@naeemba/next-starter/client` | `createAuthClient()` factory |
| `@naeemba/next-starter/auth-route` | `createAuthRoute(auth)` — returns `GET`, `POST` handlers |
| `@naeemba/next-starter/schema` | Drizzle table definitions |
| `@naeemba/next-starter/db` | Lazy Drizzle client |
| `@naeemba/next-starter/email` | `sendMagicLink({ to, url })` |
| `@naeemba/next-starter/pages/sign-in` | `SignInForm` (headless), `SignInPage` (with chrome), `SignInErrorPage` (friendly magic-link error UI). Supports `google`, `passkey`, `magicLink` props; reads `?callbackUrl=` from the URL with open-redirect defense. |
| `@naeemba/next-starter/pages/passkey-manager` | `PasskeyManager` (button only) + `PasskeyManagerPage` (with chrome) — "Add a passkey" UI for settings pages |
| `@naeemba/next-starter/server` | `createServer(auth)` — returns `getSession`, `requireSession` |
| `@naeemba/next-starter/proxy` | `createProxy` Edge-safe helper for redirecting unauthenticated traffic to your sign-in page (Next 16 `proxy.ts` convention). Also re-exports `getSessionCookie` for custom proxies. |

## Design and rationale

This is a **versioned npm package**, not a clone-and-fork template. Consumers depend on it like any other package, set env vars, and create a handful of re-export shim files (`lib/auth.ts`, `lib/auth-client.ts`, etc.) that import from the package's subpath exports. Fixes flow through a `^` bump, not a manual diff against your fork.

The re-export shim pattern is deliberate: it keeps the package's surface minimal (no client/server entry confusion at the Next.js level) while letting consumers customize per-app concerns (`createAuth({ google, passkey, magicLink: { allowlist } })`) in code they own.

## Styling

`<SignInForm/>`, `<SignInPage/>`, `<SignInErrorPage/>`, `<PasskeyManager/>`, and `<PasskeyManagerPage/>` ship with **minimal inline styles** (plain HTML attributes) — no CSS file, no Tailwind classes, no styled-components dependency.

For one-off targeting, every component takes a `className` prop. For full restyling (Tailwind, shadcn, your design system), use `classNames`:

```tsx
<SignInPage
  authClient={authClient}
  classNames={{
    main: "min-h-screen flex items-center justify-center bg-background",
    heading: "text-3xl font-bold tracking-tight",
    submitButton: "btn btn-primary w-full",
    googleButton: "btn btn-outline w-full",
    emailInput: "input input-bordered w-full",
    emailLabel: "text-sm font-medium",
    error: "text-sm text-destructive mt-1",
  }}
/>
```

When a `classNames.X` key is set, the corresponding inline-style default is dropped for that element — your CSS becomes the single source of truth without `!important`. Unset keys keep the built-in defaults so you can override piecemeal.

Form keys: `root`, `googleButton`, `passkeyButton`, `divider`, `dividerLine`, `dividerLabel`, `emailLabel`, `emailInput`, `submitButton`, `error`, `sentMessage`. Page adds: `main`, `heading`, `description`.

For complete control, the shipped page is intentionally minimal — copy `app/sign-in/page.tsx` and call `authClient.signIn.magicLink` / `social` / `passkey` directly.

## License

MIT — see [LICENSE](./LICENSE).
