# 0.3.0 — Google OAuth + Passkey login

**Status:** design approved
**Author:** Naeem Baghi
**Date:** 2026-06-12
**Target release:** 0.3.0 (additive, no breaking changes)

## Goal

Add Google OAuth and WebAuthn passkey support to `@naeemba/next-starter`, keeping the magic-link path untouched and the additions opt-in per method.

## Non-goals

- Other OAuth providers (GitHub, Apple). One provider at a time; Google first.
- `<LinkedAccounts/>` UI surfacing the union of methods per user.
- `<SignOutButton/>`, `<UserMenu/>`, profile-edit primitives.
- Email-verified-required gates for magic-link.
- WebAuthn conditional UI (autofill credential picker).

## Architecture

`createAuth(opts)` remains the single integration point. Two new opt-in keys gate the corresponding better-auth integrations:

- `google` → adds an entry to `socialProviders.google`
- `passkey` → adds the `passkey()` plugin

When either is set, account linking auto-enables with Google in `trustedProviders`. When both are omitted, behavior is identical to 0.2.0 — no new env vars required, no new plugins loaded.

## Server: factory API

### `CreateAuthOptions` additions

```ts
interface CreateAuthOptions {
  // existing: databaseUrl, secret, baseURL, db, session, magicLink

  google?: {
    clientId?: string        // defaults to env.GOOGLE_CLIENT_ID
    clientSecret?: string    // defaults to env.GOOGLE_CLIENT_SECRET
    scopes?: string[]        // default ["email", "profile"]
    allowlist?: (profile: { email: string; emailVerified: boolean }) =>
      boolean | Promise<boolean>
  }

  passkey?: {
    rpName?: string          // defaults to URL host of BETTER_AUTH_URL
    rpID?: string            // defaults to URL host of BETTER_AUTH_URL
    origin?: string          // defaults to BETTER_AUTH_URL
    allowlist?: (user: { id: string; email: string }) =>
      boolean | Promise<boolean>
  }

  // Escape hatch; defaults to auto-linking Google when google is set.
  accountLinking?: false | { trustedProviders: string[] }
}
```

### Env additions (`src/auth/config.ts`)

```ts
GOOGLE_CLIENT_ID:     z.string().optional()
GOOGLE_CLIENT_SECRET: z.string().optional()
```

Validation runs at `createAuth()` call time, not at module load: if `opts.google` is set but neither `clientId` (from opts) nor `GOOGLE_CLIENT_ID` (from env) resolves, throw with the same error style as the existing DATABASE_URL check.

### Account linking default

When `google` is set, the factory wires:

```ts
accountLinking: { enabled: true, trustedProviders: ["google"] }
```

into the better-auth config. Auto-link only happens on verified emails (better-auth enforces this for trusted providers — Google sends `email_verified`). Consumers who want a different stance set `accountLinking: false` or pass their own `trustedProviders` array.

### Allowlist semantics

- `google.allowlist`: called inside a `databaseHooks.user.create.before` hook; returning `false` rejects the sign-up with a generic error message. Mirrors `magicLink.allowlist`.
- `passkey.allowlist`: called inside the passkey plugin's `beforeRegistration` hook; returning `false` rejects credential registration.

## UI: `<SignInForm/>` changes

### New props

```ts
interface SignInFormProps {
  authClient: AuthClient

  google?: boolean | { label?: ReactNode }
  passkey?: boolean | { label?: ReactNode }
  magicLink?: boolean        // default true; set false to hide the email form
                             // (UI-only — the server-side magicLink plugin is
                             // still loaded if createAuth({ magicLink }) opts it in)

  dividerLabel?: ReactNode   // default "or"
  onSignedIn?: () => void    // fires after google/passkey success

  // existing: callbackUrl, emailLabel, submitLabel, sentCopy, errorCopy,
  //           onSent, className
}
```

### Render order

```
[ Continue with Google ]       ← if google
[ Sign in with passkey ]       ← if passkey
────────  or  ────────         ← if (google || passkey) && magicLink
Email: [____________]
[ Send magic link ]            ← if magicLink (default)
```

### Per-method status

Internal state widens from a single `Status` to `{ google: Status; passkey: Status; magicLink: Status }` (`Status = "idle" | "sending" | "sent" | "error"`). A Google attempt's spinner does not block the passkey button. The existing "sent" terminal screen only renders after magic-link success — Google and passkey navigate away on success.

Errors render inline under the offending button.

### Passkey browser-capability guard

If `passkey` is enabled but `window.PublicKeyCredential` is undefined, the passkey button is hidden silently — no console noise, no broken click.

Implementation: a `useEffect` sets `isPasskeySupported` after mount. SSR markup omits the button (capability unknown server-side) and the client re-renders to add it when supported. This avoids hydration mismatch warnings.

### `<SignInPage/>` is untouched

It still wraps `<SignInForm/>` and forwards all props transparently.

## UI: new `<PasskeyManager/>`

Location: `src/pages/passkey-manager/index.tsx`, exported from `@naeemba/next-starter/pages/passkey-manager` (matches the existing `/pages/sign-in` convention).

```ts
interface PasskeyManagerProps {
  authClient: AuthClient
  className?: string
  emptyCopy?: ReactNode                          // default "No passkeys yet."
  addLabel?: ReactNode                           // default "Add a passkey"
  formatDevice?: (p: PasskeyRow) => ReactNode    // default: deviceType + createdAt
  onAdded?: (p: PasskeyRow) => void
  onRemoved?: (id: string) => void
}
```

Behavior:
- On mount, calls `authClient.passkey.listUserPasskeys()` and renders the list.
- "Add a passkey" button triggers `authClient.passkey.addPasskey()` and prepends the new row on success.
- Each row has a remove button that calls `authClient.passkey.deletePasskey({ id })` and removes the row on success.
- Errors render inline next to the offending row / button.
- No router dependency — the caller decides where to mount it. Settings page is the obvious home.

Styling matches `SignInForm`: minimal inline styles, overridable via `className`. No new CSS imports.

`<PasskeyManager/>` requires the server-side passkey plugin to be enabled via `createAuth({ passkey: ... })`. Without it, the list/add/remove calls return 404. Documented in the component's JSDoc and in the UPGRADING.md example.

## Client (`src/client/index.ts`)

```ts
import { passkeyClient } from "better-auth/client/plugins"

export type AuthClient =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & PasskeyAuthClient

export function createAuthClient(opts: CreateAuthClientOptions = {}) {
  return betterAuthCreateClient({
    baseURL,
    plugins: [magicLinkClient(), passkeyClient()],
  })
}
```

`passkeyClient()` is added unconditionally. It's a small client plugin and loading it without server-side passkey support is a no-op until a method is called. Keeps `createAuthClient()` parameter-free.

Social sign-in (`authClient.signIn.social({ provider: "google" })`) is built into the better-auth react client, so no additional plugin is needed for Google.

`PasskeyAuthClient` is a minimal structural type mirroring the `MagicLinkAuthClient` pattern — covers the methods `SignInForm` and `PasskeyManager` actually use, without importing better-auth internal `.mjs` types.

## Schema (`src/schema/index.ts`)

```ts
export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name"),                  // user-supplied label
  publicKey: text("public_key").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type"),     // "singleDevice" | "multiDevice"
  backedUp: boolean("backed_up").notNull().default(false),
  transports: text("transports"),      // comma-joined: usb,nfc,ble,internal,hybrid
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type PasskeyRow = typeof passkey.$inferSelect
```

Always exported, even when the consumer doesn't enable passkey. Keeps the schema module static (no conditional exports) and the drizzle config simple. Empty-table storage cost is negligible.

No changes to `user` or `account`. The `passkey` plugin uses only this dedicated table; OAuth providers like Google fit the existing `account` table.

## Tests

New files in `tests/`:

- `auth-factory-google.test.ts` — google opts parsing, env-var fallback, allowlist hook wiring, throws when `clientId`/`GOOGLE_CLIENT_ID` both missing
- `auth-factory-passkey.test.ts` — passkey opts parsing, `rpID`/`origin` defaults from `BETTER_AUTH_URL`, allowlist wiring
- `auth-factory-account-linking.test.ts` — auto-link when google is set, opt-out via `accountLinking: false`
- `sign-in-form-multi-method.test.tsx` — render permutations (google only, passkey only, all three, `magicLink: false`), per-method status isolation, passkey hide-when-unsupported
- `passkey-manager.test.tsx` — empty state, list render, add flow, remove flow, error handling

Extend existing:

- `create-auth-client.test.ts` — assert passkey methods statically present on returned type

E2E (`examples/basic/`):

- Add a passkey sign-in path to the Playwright smoke test using virtual authenticators.
- Google sign-in is not e2e'd (no provider mock); document a manual smoke step in the example README instead.

## Documentation

- `README.md` — add a "What's included" matrix (magic-link, Google, passkey) and per-method setup snippets.
- `UPGRADING.md` — append a "0.2.x → 0.3.0" section:
  - (a) run the migration to create the `passkey` table — required if you enable passkey, optional otherwise (the table is harmless if unused)
  - (b) opt-in snippets for `google` and `passkey`
  - (c) `<PasskeyManager/>` example
- `examples/basic/` — gated additions:
  - Buttons render only if the corresponding feature is configured (Google: check for `GOOGLE_CLIENT_ID` at server-render time; passkey: always wired in once the migration runs)
  - A new `app/settings/passkeys/page.tsx` that mounts `<PasskeyManager/>`

## Migration

`examples/basic/drizzle/` gets a new migration generated by `drizzle-kit`:

```sql
CREATE TABLE "passkey" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text,
  "public_key" text NOT NULL,
  "credential_id" text NOT NULL UNIQUE,
  "counter" integer NOT NULL,
  "device_type" text,
  "backed_up" boolean NOT NULL DEFAULT false,
  "transports" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
```

## Release

Version: **0.3.0** (minor, additive). All new factory options, props, and components default to off. Existing 0.2.x consumers can upgrade without any code changes if they don't opt in to the new methods.

Tag push triggers the existing `release.yml` workflow → npm publish.
