# Upgrading

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
