# Upgrading

## 0.5.x → 0.6.0

0.6.0 is fully additive — there are no breaking API changes. The notable behavior changes:

### Schema indexes (new migration)

Four indexes ship with the schema in 0.6.0: `session_user_id_idx`, `account_user_id_idx`, `verification_identifier_idx`, `passkey_user_id_idx`. They're necessary for any deployment past a few thousand users (every session check is otherwise a sequential scan).

Run `npx drizzle-kit generate` after upgrading. The generated migration is a single `CREATE INDEX` per table — fast and non-blocking on Postgres. Apply with `npx drizzle-kit migrate`.

If your app already has these indexes (e.g. you hand-rolled them after spotting the gap), drizzle-kit's generator may emit a redundant `CREATE INDEX IF NOT EXISTS` or skip them entirely depending on your snapshot. Inspect the generated SQL before running.

### `SignInForm` reads `?callbackUrl=` from the URL

`<SignInPage/>` and `<SignInForm/>` now resolve the post-sign-in redirect from the URL query string in addition to the `callbackUrl` prop. Resolution order is query → prop → `"/"`.

This restores the proxy → sign-in roundtrip: `proxy.ts` redirects `/studio → /sign-in?callbackUrl=/studio`, and after sign-in the user lands at `/studio` instead of `/`. No prop changes required if you only set `callbackUrl="/"` (now redundant — drop it if you like). Custom param name via `callbackParam` to match a non-default `createProxy({ callbackParam })`.

**Same-origin defense:** values that target a different origin, use a `javascript:`/`data:` scheme, or begin with `//` / `/\` are silently dropped (falls back to the prop / `"/"`). This is defense-in-depth on top of better-auth's `trustedOrigins` and does not require any consumer changes.

### Magic-link error pages (opt-in via `errorCallbackUrl`)

To turn better-auth's verify-endpoint failures (expired token, used token, etc) into friendly copy, scaffold `app/sign-in/error/page.tsx` and pass `errorCallbackUrl="/sign-in/error"` to `<SignInPage/>`. A fresh `next-starter init` does this automatically; for existing apps, opt in by hand:

```tsx
// app/sign-in/page.tsx
return <SignInPage authClient={authClient} errorCallbackUrl="/sign-in/error" google passkey />

// app/sign-in/error/page.tsx
import { SignInErrorPage } from "@naeemba/next-starter/pages/sign-in"
export default function Page() { return <SignInErrorPage /> }
```

When unset, behavior is unchanged — better-auth returns a JSON 400 on verify failure.

### CLI grows new scaffolds

`next-starter init` now writes three additional files when their conditions are met:

| File | When |
|---|---|
| `proxy.ts` | always (unless `--no-proxy` or `proxy.ts`/`middleware.ts` already exists) |
| `app/account/passkeys/page.tsx` | when `--passkey` (default) — uses `<PasskeyManagerPage/>` |
| `app/sign-in/error/page.tsx` | always — uses `<SignInErrorPage/>` |

`proxy.ts` is consumer-owned (never overwritten, even with `--force`); the others are starter-owned (skip-or-`--force`).

### `rateLimit` knob

`createAuth({ rateLimit })` surfaces better-auth's existing rate-limit config so you don't have to reach into the raw options object. Defaults unchanged (better-auth: on in production).

Env shortcut for local dev:

```bash
BETTER_AUTH_RATE_LIMIT_DISABLED=1 npm run dev
```

An explicit `{ enabled: true }` in code overrides the env, so a stray export in CI can't silently disable a production limit.

### `transport` knob — BYO email delivery

If you already have a `lib/email` wrapper around Postmark/Mailgun/SES/Resend, you can hand it to the starter and skip the second Resend client:

```ts
createAuth({
  transport: async ({ to, from, subject, text, html }) => {
    await mySendEmail({ to, from, subject, text, html })
  },
})
```

Composes with both the default template and a custom `magicLink.email`. `RESEND_API_KEY` is not required when `transport` is set.

## 0.4.x → 0.5.0

0.5.0 is mostly additive. The one behavioral change is on `next-starter init --force`: it no longer overwrites `db/schema.ts` or `drizzle.config.ts` — see *CLI file ownership* below. If you don't run the CLI's `--force` flag against an existing project, nothing changes.

### CLI file ownership (the one behavioral change)

`next-starter init --force` used to overwrite every file it scaffolds, including `db/schema.ts`. That was a footgun — consumers who'd added app tables (`blog_posts`, `inquiries`, ...) lost them.

Two files are now classified as consumer-owned and **never overwritten, even with `--force`**:

- `db/schema.ts` — if the `@naeemba/next-starter/schema` re-export is missing, the CLI **prepends** it instead of touching the rest. If the re-export is already present, the file is left alone.
- `drizzle.config.ts` — preserved as-is when it exists. Consumer config (`verbose`, `casing`, `schemaFilter`, custom credentials) is not the CLI's surface.

The five starter-owned shims (`lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts`, `app/api/auth/[...all]/route.ts`, `app/sign-in/page.tsx`) keep their old behavior: skip if exists, overwrite with `--force`.

Output legend:
- `+ path` — file created
- `! path  (overwritten)` — starter-owned file replaced with `--force`
- `~ path  (merged: prepended @naeemba/next-starter/schema re-export)` — db/schema.ts gained the line
- `= path  (exists, consumer-owned — not overwritten)` — drizzle.config.ts / db/schema.ts preserved as-is
- `= path  (exists, use --force to overwrite)` — starter-owned file skipped

### BREAKING — proxy-only: rename `/middleware` → `/proxy`, `createMiddleware` → `createProxy`

Next 16 renamed `middleware.ts` → `proxy.ts` and `middleware()` → `proxy()`. Since this package targets Next ≥ 16 (the existing peer floor), only the proxy form ships. Migration is a one-line import rename:

```diff
- // middleware.ts
- import { createMiddleware } from "@naeemba/next-starter/middleware"
- export default createMiddleware({ protect: ["/admin/:path*"] })
+ // proxy.ts (rename the file too!)
+ import { createProxy } from "@naeemba/next-starter/proxy"
+ export default createProxy({ protect: ["/admin/:path*"] })

  export const config = { matcher: ["/((?!_next/|favicon.ico|api/auth/).*)"] }
```

Three things change together:

1. **Filename**: rename `middleware.ts` → `proxy.ts` at your project root. (Next 16 looks for `proxy.ts`.)
2. **Import**: subpath `@naeemba/next-starter/middleware` → `@naeemba/next-starter/proxy`, factory `createMiddleware` → `createProxy`.
3. **Type**: `CreateMiddlewareOptions` → `CreateProxyOptions` (same shape).

The function body is identical — just the names changed. The construction-time loop guard, the `:path*` / `**` pattern compiler, the basePath-aware redirect, and the cookie-prefix knob all behave exactly as before.

### Custom `proxy.ts`? `getSessionCookie` is now re-exported

If you have an existing `proxy.ts` doing host canonicalization / geo gating / A/B routing and want the same cheap session-cookie check the starter's `createProxy` does internally, you can now import the helper from the same module:

```ts
import { getSessionCookie } from "@naeemba/next-starter/proxy"

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin")) {
    if (!getSessionCookie(req)) return NextResponse.redirect(new URL("/sign-in", req.url))
  }
  // ... your other proxy concerns
  return NextResponse.next()
}
```

(Previously you had to know that `getSessionCookie` lives in `better-auth/cookies` and reach past `@naeemba/next-starter` to import it. The function is the same one — just re-exported here for discoverability.)

### Sign-in styling — `classNames` overrides

If you'd been working around the inline-style defaults in `<SignInForm/>` / `<SignInPage/>` (e.g. with `!important` rules), you can now drop them in favor of `classNames`:

```tsx
<SignInPage
  authClient={authClient}
  classNames={{
    main: "min-h-screen flex items-center justify-center",
    heading: "text-3xl font-bold",
    submitButton: "btn btn-primary w-full",
    googleButton: "btn btn-outline w-full",
    emailInput: "input input-bordered w-full",
  }}
/>
```

Contract: when a `classNames.X` key is set, the corresponding inline-style default is dropped and your CSS becomes the single source of truth for that element. Unset keys keep the built-in defaults (no behavior change). The legacy `className` prop still works and composes with `classNames.root`.

Available keys (form): `root`, `googleButton`, `passkeyButton`, `divider`, `dividerLine`, `dividerLabel`, `emailLabel`, `emailInput`, `submitButton`, `error`, `sentMessage`. Page adds: `main`, `heading`, `description`.

### `NEXT_PUBLIC_BETTER_AUTH_URL` is now optional

For same-origin deployments, you can drop the env var entirely. `createAuthClient()` falls back to `window.location.origin` when neither `opts.baseURL` nor `NEXT_PUBLIC_BETTER_AUTH_URL` is set. The resolution order is:

1. `opts.baseURL` (explicit)
2. `NEXT_PUBLIC_BETTER_AUTH_URL` (only when non-empty)
3. `window.location.origin` (runtime, browser only)

Keep `NEXT_PUBLIC_BETTER_AUTH_URL` set if the URL the browser sees differs from `window.location.origin` (e.g. behind a proxy with a different public hostname).

The CLI's scaffolded `lib/auth-client.ts` no longer wires the env var by default. Existing handwritten `createAuthClient({ baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL })` calls keep working — they hit case (1) above.

### CLI: existing `db/index.ts` is now wired into `createAuth`

If your project already has `db/index.ts` (or `src/db/index.ts`) exporting a named `db` Drizzle client, `next-starter init` now generates `lib/auth.ts` with:

```ts
import { db } from "@/db"
import { createAuth } from "@naeemba/next-starter/auth"
export const auth = createAuth({ db, ... })
```

instead of letting the starter's lazy proxy open a second postgres pool to the same database. Detection looks for `export const db`, `export { db }`, `export { foo as db }`, etc. — re-run `init` to pick it up.

If you don't have a `db/index.ts`, nothing changes — the starter's lazy proxy seeded from `DATABASE_URL` is still the default.

### CLI: obsolete `auth:generate` script

The old README documented an `auth:generate` script that ran `better-auth generate --output db/auth-schema.ts`. The schema now ships from `@naeemba/next-starter/schema` — any `better-auth generate` script is dead code. `next-starter init` flags these automatically and, with `--clean-scripts`, removes them:

```bash
npx @naeemba/next-starter init --clean-scripts
```

Without the flag, the CLI only warns and leaves `package.json` alone.

### CLI: `drizzle.config.ts` template now loads env

Fresh installs that scaffold `drizzle.config.ts` get an `@next/env`-based env loader so `pnpm db:push` works against `.env.local` locally without a separate dotenv install:

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

(`@next/env` ships with `next`, already a peer dependency — no new install.) Existing `drizzle.config.ts` files are preserved per the file-ownership rule above.

## 0.3.x → 0.4.0

### Optional peer dependencies

`postgres`, `@react-email/components`, `@react-email/render`, `resend`, and `@better-auth/passkey` moved from `dependencies` to `peerDependencies` (with `peerDependenciesMeta.optional = true`). If you installed `@naeemba/next-starter` with an `npm i` that pinned a lockfile, you already have these packages and nothing changes. On a fresh install you'll see a peer warning if you skip one — install whichever you use:

```bash
# Default path (postgres + Resend + the built-in magic-link template + passkey)
npm i postgres @react-email/components @react-email/render resend @better-auth/passkey

# BYO db client (createAuth({ db })) — skip postgres
npm i @react-email/components @react-email/render resend @better-auth/passkey

# Custom magic-link email (magicLink: { email: ... }) — skip @react-email/*
npm i postgres resend @better-auth/passkey

# BYO transport (skip the built-in Resend transport) — skip resend
npm i postgres @react-email/components @react-email/render @better-auth/passkey

# No passkey support — skip @better-auth/passkey
npm i postgres @react-email/components @react-email/render resend
```

`@better-auth/passkey` is loaded lazily on the server (via `loadOptionalPeer` inside `createAuth({ passkey })`) and via factory injection on the client (`createAuthClient({ passkey: passkeyClient })`). If you don't enable passkey on either side, the dep is never resolved and your bundle excludes it.

If a runtime path needs a peer that isn't installed, you'll see an instructional error like:

> Optional peer 'postgres' is not installed.
> Install it with: npm i postgres
> Used by: createDb / DATABASE_URL

### New CLI

`npx @naeemba/next-starter init` now scaffolds the seven shim files for you. If you wired the package by hand under 0.3.x, you don't need to do anything — your existing files keep working.

### `singleAdmin` shortcut

If your `0.3.x` consumer code did this:

```ts
createAuth({
  magicLink: { allowlist: (email) => email === "owner@example.com" },
  google: { allowlist: (p) => p.email === "owner@example.com" && p.emailVerified },
})
```

You can collapse it to:

```ts
createAuth({ singleAdmin: "owner@example.com", google: {} })
```

The explicit allowlist forms still work and continue to override `singleAdmin` for that provider.

### `createMiddleware`

Optional. If you want a fast bounce for unauthenticated traffic to protected routes, add a `middleware.ts` at the project root:

```ts
import { createMiddleware } from "@naeemba/next-starter/middleware"
export default createMiddleware({ protect: ["/admin/:path*", "/dashboard/:path*"] })
export const config = { matcher: ["/((?!_next/|favicon.ico|api/auth/).*)"] }
```

Server components should still call `requireSession()` — middleware checks cookie presence only, not validity.

## 0.2.x → 0.3.0

0.3.0 is additive. Existing 0.2.x consumers need no code changes unless they opt in to one of the new methods.

### What's new

- `createAuth({ google: {...} })` — Google OAuth via better-auth `socialProviders`. Auto-enables account linking with Google as a trusted provider (verified-email gated).
- `createAuth({ passkey: {...} })` — WebAuthn passkey sign-in via `@better-auth/passkey`.
- `<SignInForm/>` gains `google`, `passkey`, `magicLink` (toggle), `dividerLabel`, and `onSignedIn` props.
- New `@naeemba/next-starter/pages/passkey-manager` entry exporting `<PasskeyManager/>` for settings pages.
- `passkey` table added to `@naeemba/next-starter/schema` (always exported, unused if you don't opt in).
- **Database driver switched from `pg` (node-postgres) to `postgres` (postgres.js by Porsager.)** The `Db` inferred type now wraps a postgres-js client. The connection string format is unchanged. If you pass your own `db?:` via `createAuth({ db })`, it must now be a `drizzle-orm/postgres-js` instance, not `drizzle-orm/node-postgres`. The `pg` dependency has been removed.

### postgres.js pooler caveat

postgres.js defaults to `prepare: true` (prepared-statement mode), which **breaks pgBouncer transaction-pool mode** — the default for the Supabase pooler (port 6543) and the standard Neon pooler URL. Symptom: `prepared statement "..." does not exist` on the second request after a connection rotation.

The documented `import { db }` proxy and `createAuth({})` (without an explicit `opts.db`) both honour pool tuning via env vars — so a Supabase/Neon consumer who follows the README bare-import path just sets:

```bash
# .env.local — for Supabase pooler port 6543 / Neon pooler URL
DATABASE_PREPARE=false
DATABASE_IDLE_TIMEOUT=20
# DATABASE_POOL_MAX=10  # optional
```

The explicit-options path still works if you'd rather inject a tuned client:

```ts
import { createDb } from "@naeemba/next-starter/db"
const db = createDb(process.env.DATABASE_URL!, {
  prepare: false,   // <-- for Supabase/Neon transaction-pool URLs
  max: 10,
  idleTimeout: 20,  // seconds; postgres.js's own default is no timeout
})

export const auth = createAuth({ db })
```

If you use the session pooler (Supabase port 5432) or a direct connection, keep the defaults.

### Migration steps — only if you enable passkey

1. Re-run drizzle-kit to add the `passkey` table:

   ```bash
   DATABASE_URL=... npx drizzle-kit generate
   DATABASE_URL=... npx drizzle-kit migrate
   ```

2. Opt in:

   ```ts
   // lib/auth.ts
   export const auth = createAuth({
     passkey: { rpName: "Your App" },
   })
   ```

3. Render the sign-in button:

   ```tsx
   <SignInForm authClient={authClient} passkey />
   ```

4. Add a registration page (optional but recommended — passkey sign-in requires a registered credential):

   ```tsx
   // app/settings/passkeys/page.tsx
   "use client"
   import { PasskeyManager } from "@naeemba/next-starter/pages/passkey-manager"
   import { authClient } from "../../../lib/auth-client"

   export default function Page() {
     return <PasskeyManager authClient={authClient} />
   }
   ```

If you don't enable passkey, you can skip the migration; the empty table costs nothing.

### Migration steps — only if you enable Google

1. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your environment.
2. Opt in:

   ```ts
   export const auth = createAuth({ google: {} })
   ```

3. Render the button:

   ```tsx
   <SignInForm authClient={authClient} google />
   ```

### Defaults to know

- When `google` is set and `accountLinking` is not explicitly disabled, the factory wires `accountLinking: { enabled: true, trustedProviders: ["google"] }`. Sign-ins with a verified Google email matching an existing user's email link to the same user. Opt out with `accountLinking: false`.
- When `passkey` is enabled but `window.PublicKeyCredential` is undefined (older browsers), the passkey button is hidden silently.

### Notes

- `passkey.allowlist` is intentionally NOT supported. `@better-auth/passkey` does not expose a `beforeRegistration` hook, and passkey registration requires an active session, so the magic-link / Google allowlists already gate who can register a passkey.
- `<PasskeyManager/>` for 0.3.0 only supports "add" — listing and removing passkeys via the React client is deferred until `@better-auth/passkey` exposes direct list/delete methods (it currently exposes them as nanostore atoms and fetch endpoints).

## 0.1.x → 0.2.0

0.2.0 replaces the frozen `auth` singleton with a `createAuth({...})` factory and introduces a new `/client` export. Migration requires three file edits in your consumer app.

### Required changes

#### 1. Replace the singleton with the factory

Before (`lib/auth.ts`):
```ts
import { auth } from "@naeemba/next-starter/auth"
export { auth }
```

After:
```ts
import { createAuth } from "@naeemba/next-starter/auth"

export const auth = createAuth({
  // optional: restrict who can sign in
  magicLink: {
    allowlist: (email) => email === process.env.ADMIN_EMAIL,
  },
})
```

`createAuth` reads `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` from `process.env` if you don't pass them in opts (same env behavior as 0.1).

#### 2. Add a client file

New `lib/auth-client.ts`:
```ts
"use client"
import { createAuthClient } from "@naeemba/next-starter/client"

export const authClient = createAuthClient()
export const { signIn, signOut, useSession } = authClient
```

#### 3. Wire your auth into route handler and server helpers

`app/api/auth/[...all]/route.ts`:
```ts
import { createAuthRoute } from "@naeemba/next-starter/auth-route"
import { auth } from "@/lib/auth"

export const { GET, POST } = createAuthRoute(auth)
```

New `lib/auth-server.ts`:
```ts
import { createServer } from "@naeemba/next-starter/server"
import { auth } from "./auth"

export const { getSession, requireSession } = createServer(auth)
```

Update any `import { getSession } from "@naeemba/next-starter/server"` to import from your local `lib/auth-server`.

#### 4. Pass `authClient` to the sign-in page

Before:
```ts
export { default } from "@naeemba/next-starter/pages/sign-in"
```

After:
```ts
import { SignInPage } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  return <SignInPage authClient={authClient} callbackUrl="/" />
}
```

### Optional changes

- **Custom magic-link email.** Pass `magicLink.email` to `createAuth`:
  ```ts
  createAuth({
    magicLink: {
      email: ({ to, url, expiresIn }) => ({
        subject: "Your sign-in link",
        from: "noreply@studio.example",
        text: `Open ${url} within ${expiresIn / 60} minutes.`,
      }),
    },
  })
  ```
- **Session lifetime.** Pass `session.expiresIn` (seconds) and `session.updateAge`.
- **Custom-driver Drizzle client.** Pass `db` to `createAuth` if you build your own Drizzle client (e.g. via `postgres-js`).
- **`requireSession` instead of manual null-checks.**
  ```ts
  const { user, session } = await requireSession() // redirects to /sign-in if null
  ```
- **`Session` type.** Import from your local `lib/auth-server` (re-exported from `@naeemba/next-starter/server`). The previous `Session` row type from `/schema` is removed.

### Headless sign-in

If the bundled `<SignInPage/>` chrome doesn't fit your design, use `<SignInForm/>` directly:

```tsx
import { SignInForm } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  return (
    <YourLayout>
      <SignInForm
        authClient={authClient}
        callbackUrl="/dashboard"
        submitLabel="Continue"
        sentCopy={(email) => <>Check {email} for your link.</>}
      />
    </YourLayout>
  )
}
```

### `sendEmail` for transactional mail

`@naeemba/next-starter/email` now exports `sendEmail({to, subject, text?, html?, react?})` for any transactional mail, not just magic links.
