# `@naeemba/next-starter` 0.2.0 — `createAuth` factory and consumer customization

## Background

`@naeemba/next-starter` 0.1.4 ships a frozen `auth` singleton with no configuration surface: no allowlist hook, no session tuning, no magic-link email customization, no client-side export, and a `SignInPage` that takes zero props. A code-review against the raxel-studio consumer surfaced 14 findings; the seven Critical/High items (1–7) collapse into one cohesive change: **convert the package to a factory-based API**, with `createAuth(opts)` replacing the singleton, a new `/client` entry exposing `createAuthClient`, a split `SignInForm` + `SignInPage` component pair, a customizable magic-link template, and a generic `sendEmail` primitive.

0.1.4 has a single known consumer (raxel-studio). We bump to 0.2.0 with a breaking API; an `UPGRADING.md` covers the migration.

## Goals

- Configure auth behavior without monkey-patching: allowlist, session lifetime, magic-link email body/subject/from.
- Provide a first-class browser client (`createAuthClient`) so consumers don't reach for `better-auth/react` directly.
- Let consumers customize the sign-in surface — title, copy, callback URL, label text — without forking the component.
- Promote the internal Resend/console transport to a public `sendEmail` for general transactional mail.
- Re-export the auth-shaped `Session` type (with user) from `/server`, replacing the misleading row-shaped `Session` in `/schema`.

## Non-goals (0.2.0)

- Drizzle config factory (finding #8) — deferred.
- Shipped migration SQL (#11) — deferred.
- Cosmetic chunk-file letter aliases (#14) — defer (consumer-facing types already use proper names).
- Driver factory (#9) — dissolved by accepting an optional pre-built Drizzle client on `createAuth`; not a standalone deliverable.

## Architecture

### Exports map

```jsonc
{
  "./auth":          // createAuth(), CreateAuthOptions, MagicLinkEmail, Auth type
  "./auth-route":    // unchanged: toNextJsHandler shim
  "./client":        // NEW: createAuthClient()
  "./db":            // createDb(url) + lazy `db` proxy (default reads DATABASE_URL)
  "./email":         // sendEmail(), sendMagicLink()
  "./pages/sign-in": // SignInPage (default + named) + SignInForm
  "./schema":        // tables + User/Account/Verification row types (no Session row type)
  "./server":        // getSession(), requireSession(), Session type (auth-shaped, with user)
}
```

Net change vs 0.1.4: +1 entry (`/client`). No removals.

### `/auth` — `createAuth` factory

```ts
import type { Auth } from "better-auth"
import type { drizzle } from "drizzle-orm/node-postgres"

type DrizzleClient = ReturnType<typeof drizzle>

export interface CreateAuthOptions {
  databaseUrl?: string  // default: process.env.DATABASE_URL
  secret?: string       // default: process.env.BETTER_AUTH_SECRET
  baseURL?: string      // default: process.env.BETTER_AUTH_URL

  /** Pre-built Drizzle client. If omitted, builds one from databaseUrl via node-postgres. */
  db?: DrizzleClient

  session?: {
    expiresIn?: number  // seconds; default leaves better-auth's default
    updateAge?: number  // seconds; default leaves better-auth's default
  }

  magicLink?: {
    expiresIn?: number  // default 600
    /** Return false to silently drop the request (no email sent, no error thrown). */
    allowlist?: (email: string) => boolean | Promise<boolean>
    /** Override the built-in template. */
    email?: (args: { to: string; url: string; expiresIn: number }) =>
      Promise<MagicLinkEmail> | MagicLinkEmail
  }
}

export interface MagicLinkEmail {
  subject: string
  from?: string  // default: process.env.EMAIL_FROM
  text?: string
  html?: string
}

export function createAuth(opts?: CreateAuthOptions): Auth
export type { Auth }
```

Implementation:
- `createAuth()` resolves config: for each field not provided in `opts`, falls back to `process.env`. Throws a single zod-validated error naming any required field that is missing from both.
- If `opts.db` provided, uses it; else builds `drizzle(new Pool({connectionString: databaseUrl}))` on the spot. Consumers are expected to call `createAuth` once at module scope and export the result (see migration §1).
- Magic-link `sendMagicLink` callback is wired to: (1) check `allowlist` if present → if false, resolve as no-op; (2) call `magicLink.email(...)` if present, else the built-in template; (3) hand the resulting `MagicLinkEmail` to internal `sendEmail` for transport selection.

The module-level `auth` singleton from 0.1 is **removed**. There is no back-compat shim — consumers create their own singleton via `createAuth()` in `lib/auth.ts`.

The `db` opt is typed structurally to accept any Drizzle-compatible client (`Parameters<typeof drizzleAdapter>[0]`), not narrowly to `node-postgres`'s `drizzle` return type, so consumers on `postgres-js` or other drivers can pass their own client without a type error.

### `/client` — `createAuthClient`

```ts
import type { createAuthClient as betterAuthCreateClient } from "better-auth/react"

export interface CreateAuthClientOptions {
  baseURL?: string  // default: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? undefined (better-auth defaults to origin)
}

export function createAuthClient(opts?: CreateAuthClientOptions): ReturnType<typeof betterAuthCreateClient>
```

Built on `better-auth/react` + `magicLinkClient()` plugin. Returned client exposes `.signIn.magicLink`, `.signOut`, `.useSession`, etc. The module is `"use client"`. We do not export a default singleton — consumers create theirs in a `"use client"` file (typically `lib/auth-client.ts`) so React hooks work cleanly.

### `/pages/sign-in` — split into `SignInForm` + `SignInPage`

```tsx
import type { createAuthClient } from "../client"

type AuthClient = ReturnType<typeof createAuthClient>

export interface SignInFormProps {
  authClient: AuthClient
  callbackUrl?: string                           // default "/"
  emailLabel?: string                            // default "Email"
  submitLabel?: string                           // default "Send magic link"
  sentCopy?: (email: string) => React.ReactNode  // default: "We sent a sign-in link to <strong>{email}</strong>. It expires in 10 minutes."
  errorCopy?: (message: string) => React.ReactNode
  onSent?: (email: string) => void
  className?: string
}

export function SignInForm(props: SignInFormProps): JSX.Element

export interface SignInPageProps extends SignInFormProps {
  title?: string                                 // default "Sign in"
  description?: React.ReactNode
}

export function SignInPage(props: SignInPageProps): JSX.Element
export default SignInPage
```

`SignInForm` is the headless logic (input + button + status). `SignInPage` adds title/description and the centered layout from 0.1. Default export is `SignInPage` for symmetry with 0.1's import shape, but it now requires `authClient` so consumers can't import-and-mount with zero config.

### `/email` — `sendEmail` + `sendMagicLink`

```ts
export interface EmailArgs {
  to: string | string[]
  from?: string  // default: process.env.EMAIL_FROM
  subject: string
  text?: string
  html?: string
  react?: React.ReactElement  // rendered via @react-email/render if html omitted
}

export async function sendEmail(args: EmailArgs): Promise<void>

export interface SendMagicLinkArgs {
  to: string
  url: string
  expiresIn?: number  // default 600
  appName?: string    // back-compat with built-in template
  template?: (args: { to: string; url: string; expiresIn: number }) =>
    Promise<MagicLinkEmail> | MagicLinkEmail
}
export async function sendMagicLink(args: SendMagicLinkArgs): Promise<void>
```

`sendEmail` selects transport the same way the internal helper does today: Resend if `RESEND_API_KEY` set, console fallback otherwise. `sendMagicLink` becomes a thin wrapper that resolves the template (custom or built-in), then delegates to `sendEmail`.

### `/server` — `getSession`, `requireSession`, Session type

```ts
import type { Auth } from "better-auth"

export async function getSession(): Promise<Session | null>

export interface RequireSessionOptions {
  redirectTo?: string  // default "/sign-in"
}
export async function requireSession(opts?: RequireSessionOptions): Promise<Session>

export type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>
```

`requireSession` calls `getSession()`; if null, calls Next's `redirect(opts.redirectTo)`. The `Session` type now includes `user` (the auth-shaped session), matching what `auth.api.getSession()` actually returns. The row-shaped `Session` previously exported from `/schema` is dropped.

### `/schema` — drop misleading Session row type

Tables (`user`, `session`, `account`, `verification`) and row types for `User`, `Account`, `Verification` stay. `export type Session = typeof session.$inferSelect` is **removed** — consumers should use `Session` from `/server` for the auth-shaped type, or `typeof session.$inferSelect` inline if they specifically need the row.

### `/db` — `createDb` helper

```ts
import type { drizzle } from "drizzle-orm/node-postgres"

export function createDb(databaseUrl: string): ReturnType<typeof drizzle>
export const db: ReturnType<typeof drizzle>  // lazy proxy reading DATABASE_URL, same as 0.1
```

`createAuth` uses `createDb` internally when no `db` is passed. Exposing it as a public helper costs nothing extra and lets consumers reuse the same construction.

## Migration story (0.1.4 → 0.2.0)

`UPGRADING.md` ships at the repo root. Three required consumer changes:

1. **Replace singleton with factory.** In `lib/auth.ts`:
   ```diff
   - import { auth } from "@naeemba/next-starter/auth"
   - export { auth }
   + import { createAuth } from "@naeemba/next-starter/auth"
   + export const auth = createAuth({
   +   magicLink: { allowlist: (email) => email === process.env.ADMIN_EMAIL },
   + })
   ```
2. **Create the auth client in a `"use client"` file.** New `lib/auth-client.ts`:
   ```ts
   "use client"
   import { createAuthClient } from "@naeemba/next-starter/client"
   export const authClient = createAuthClient()
   ```
3. **Pass `authClient` to the sign-in page.** In `app/sign-in/page.tsx`:
   ```diff
   - export { default } from "@naeemba/next-starter/pages/sign-in"
   + import { SignInPage } from "@naeemba/next-starter/pages/sign-in"
   + import { authClient } from "@/lib/auth-client"
   + export default function Page() {
   +   return <SignInPage authClient={authClient} callbackUrl="/studio" />
   + }
   ```

Optional changes:
- Custom magic-link copy: pass `magicLink.email` to `createAuth`.
- Session lifetime: pass `session.expiresIn` to `createAuth`.
- Custom `Session` type imports: switch from `@naeemba/next-starter/schema` to `@naeemba/next-starter/server`.

## Testing

- **Unit (`tests/auth-factory.test.ts`)** — `createAuth({})` uses env defaults; `createAuth({databaseUrl, secret, baseURL})` overrides env; missing env without opts throws zod error with field name.
- **Unit (`tests/magic-link-allowlist.test.ts`)** — allowlist returning false skips `sendEmail` call; allowlist returning true sends; allowlist returning a Promise is awaited.
- **Unit (`tests/magic-link-template.test.ts`)** — custom `magicLink.email` overrides subject/from/body; missing custom template uses built-in.
- **Unit (`tests/send-email.test.ts`)** — `sendEmail` picks Resend transport when `RESEND_API_KEY` set; picks console transport otherwise; supports `react` prop via render.
- **Unit (`tests/require-session.test.ts`)** — `requireSession` redirects to `/sign-in` by default when null; respects `redirectTo` opt; returns session when present (type narrows to non-null).
- **Component (`tests/sign-in-form.test.tsx`)** — renders form; calls `authClient.signIn.magicLink({email, callbackURL})` on submit; surfaces sent state; surfaces error from authClient.
- **Integration** — `examples/basic` migrated to the new API; existing smoke test green.

## Build / publish

- tsup config adds `"client/index": "src/client/index.ts"` entry.
- `package.json` exports map adds `./client`.
- Version bump: `0.1.4` → `0.2.0`.
- `prepublishOnly` script unchanged (typecheck + test + build).
- `UPGRADING.md` added to `files` array.

## Open questions

None blocking. The shape is fixed by the brainstorming session; implementation details (e.g., how `parseEnv` interleaves with `opts` overrides, how the React 19 vs 18 peer-dep affects `react` prop rendering) are routine.
