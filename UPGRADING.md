# Upgrading

## 0.2.x → 0.3.0

0.3.0 is additive. Existing 0.2.x consumers need no code changes unless they opt in to one of the new methods.

### What's new

- `createAuth({ google: {...} })` — Google OAuth via better-auth `socialProviders`. Auto-enables account linking with Google as a trusted provider (verified-email gated).
- `createAuth({ passkey: {...} })` — WebAuthn passkey sign-in via `@better-auth/passkey`.
- `<SignInForm/>` gains `google`, `passkey`, `magicLink` (toggle), `dividerLabel`, and `onSignedIn` props.
- New `@naeemba/next-starter/pages/passkey-manager` entry exporting `<PasskeyManager/>` for settings pages.
- `passkey` table added to `@naeemba/next-starter/schema` (always exported, unused if you don't opt in).

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
