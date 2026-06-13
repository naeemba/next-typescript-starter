# Changelog

All notable changes to `@naeemba/next-starter`. Migration steps live in [UPGRADING.md](./UPGRADING.md).

## 0.6.0

### Added

- `<SignInForm/>` and `<SignInPage/>` now read `?callbackUrl=` from the URL query string and forward it as the post-sign-in redirect — resolution order is query → prop → `"/"`. Fixes the proxy → sign-in roundtrip where `proxy.ts` redirected `/studio → /sign-in?callbackUrl=/studio` but the user landed back on `/` after magic-link verify. The new `callbackParam` prop (default `"callbackUrl"`) lets you change the query name to match a non-default `createProxy({ callbackParam })`.
- **Open-redirect defense-in-depth.** Query-string callbackUrl values are dropped silently if they target a different origin or use a `javascript:`/`data:` scheme. Protocol-relative bypasses (`//evil.com`, `/\evil.com`) are also rejected. Falls through to the prop / `"/"`.
- **Schema indexes on every FK / lookup column.** `session(user_id)`, `account(user_id)`, `verification(identifier)`, and `passkey(user_id)` ship with indexes — every auth check, sign-in, and magic-link verify is no longer a sequential scan. Existing consumers get a single one-line `CREATE INDEX` per table on the next `drizzle-kit generate`; greenfield consumers see no churn.
- `<PasskeyManagerPage/>` exported from `@naeemba/next-starter/pages/passkey-manager` — chrome-wrapped variant of `<PasskeyManager/>` parallel to `<SignInPage/>`'s relationship with `<SignInForm/>`. Heading + description + main wrapper.
- `<SignInErrorPage/>` exported from `@naeemba/next-starter/pages/sign-in` — friendly user-facing copy for better-auth's magic-link verify errors (`INVALID_TOKEN`, `EXPIRED_TOKEN`, `TOKEN_NOT_FOUND`, plus lowercase variants). Overridable per-code via `errorMessages`.
- `<SignInForm/>` accepts `errorCallbackUrl` and forwards it as `errorCallbackURL` on the magic-link sign-in call. Better-auth's verify endpoint redirects to that URL with `?error=<code>` on failure — pair with `<SignInErrorPage/>` for the friendly path.
- `createAuth({ rateLimit })` — surface better-auth's top-level rate-limit knob (`{ enabled?, window?, max?, storage? }` or `false`). Defaults unchanged (better-auth: on in production). New env var `BETTER_AUTH_RATE_LIMIT_DISABLED=1` force-disables for local-dev iteration; an explicit `{ enabled: true }` overrides the env so production configs aren't silently downgraded.
- `createAuth({ transport })` — BYO email delivery for magic-link mail. `transport(args)` receives the fully rendered fields (`to`, `from`, `subject`, `text?`, `html?`) and is responsible for sending. When set, the built-in Resend/console dispatch is skipped entirely — no `RESEND_API_KEY` required. Composes with `allowlist` and a custom `magicLink.email` template.
- CLI: scaffolds `proxy.ts` at the project root by default. Skipped when `--no-proxy` is passed, an existing `proxy.ts` is preserved (consumer-owned), or an existing `middleware.ts` / `src/proxy.ts` / `src/middleware.ts` is detected (so the CLI doesn't drop a competing gate next to one the consumer already has).
- CLI: scaffolds `app/account/passkeys/page.tsx` wired to `<PasskeyManagerPage/>` whenever `--passkey` is enabled (the default). Skipped under `--no-passkey`.
- CLI: scaffolds `app/sign-in/error/page.tsx` wired to `<SignInErrorPage/>`. The scaffolded `app/sign-in/page.tsx` sets `errorCallbackUrl="/sign-in/error"` so a fresh consumer gets the wired error flow with no extra setup.

### Changed

- `MagicLinkAuthClient` widens to accept an optional `errorCallbackURL` on the magic-link sign-in call. Source-compatible — existing call sites that pass only `email` + `callbackURL` continue to typecheck.

## 0.5.0

### Breaking

- **Proxy-only.** Next 16 renamed `middleware.ts` → `proxy.ts` and `middleware()` → `proxy()`; since `next >= 16` is already the peer floor, the package now ships only the proxy form:
  - Subpath: `@naeemba/next-starter/middleware` → **`@naeemba/next-starter/proxy`**
  - Export: `createMiddleware` → **`createProxy`** (the function body is identical)
  - The inner returned function is now named `proxy` (was `middleware`)
  - Type: `CreateMiddlewareOptions` → **`CreateProxyOptions`**
  - Migration is a one-line import rename — see UPGRADING.md.

### Added

- `createProxy({ protect, signInPath?, callbackParam?, cookiePrefix? })` exported from `@naeemba/next-starter/proxy` — Edge-safe helper for the Next 16 `proxy.ts` convention.
- `getSessionCookie` is re-exported from `@naeemba/next-starter/proxy`. Consumers writing their own custom `proxy.ts` (host canonicalization, geo gating, A/B routing) can now do the cookie-presence check without reaching past the package into `better-auth/cookies` directly.
- `SignInForm` and `SignInPage` accept a `classNames` prop with per-element overrides (`root`, `googleButton`, `passkeyButton`, `divider`, `dividerLine`, `dividerLabel`, `emailLabel`, `emailInput`, `submitButton`, `error`, `sentMessage`, plus `main` / `heading` / `description` on the page). When set, the corresponding inline-style default is dropped so your Tailwind/CSS rules win without `!important`. The legacy `className` prop still composes with `classNames.root`.
- CLI: `--clean-scripts` flag opt-in removes obsolete `package.json` scripts (currently anything that runs `better-auth generate`). Without the flag, the CLI warns and leaves `package.json` alone.
- CLI: auto-detects an existing `db/index.ts` (or `src/db/index.ts`) exporting `db` and wires it into the generated `lib/auth.ts` via `createAuth({ db })`. Eliminates the double-pool footgun where the starter's lazy proxy and the consumer's pre-existing postgres-js client both opened connections to the same database.
- `createAuthClient()` falls back to `window.location.origin` when neither `opts.baseURL` nor `NEXT_PUBLIC_BETTER_AUTH_URL` is set. Same-origin deployments can now drop the `NEXT_PUBLIC_BETTER_AUTH_URL` env var entirely. Empty-string values from build-time `process.env` shims are treated as "not set" so they don't short-circuit the fallback chain.

### Changed

- **CLI file-ownership model (breaking for `--force` semantics on two files).** `db/schema.ts` and `drizzle.config.ts` are now classified as consumer-owned:
  - `db/schema.ts`: if the `@naeemba/next-starter/schema` re-export is missing, the CLI **prepends** it instead of overwriting the file. If the re-export is already present, the file is left alone. **`--force` no longer overwrites this file** — fixes the v0.4 footgun where `init --force` destroyed consumer-defined tables.
  - `drizzle.config.ts`: never overwritten if it exists. Same rationale — consumer config (verbose, casing, `schemaFilter`) is not the CLI's surface.
  - The five starter-owned shims (`lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts`, `app/api/auth/[...all]/route.ts`, `app/sign-in/page.tsx`) keep their existing skip-or-overwrite-with-`--force` behavior.
- CLI's scaffolded `drizzle.config.ts` now loads env via `@next/env` (`loadEnvConfig(process.cwd())`) so `pnpm db:push` works locally without a separate dotenv install. The template also uses `process.env.DATABASE_URL!` to satisfy TypeScript's strict-null-check on `dbCredentials.url`.
- CLI's scaffolded `lib/auth-client.ts` no longer passes `baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL` — the factory derives the URL from `window.location.origin` at runtime by default. Consumers serving the site from a different origin than the browser sees can still set the env var explicitly.
- `.env.example` marks `NEXT_PUBLIC_BETTER_AUTH_URL` as optional (commented out) since the client now defaults to `window.location.origin` for same-origin deployments.

## 0.4.0

### Added

- `createAuth({ singleAdmin: "owner@example.com" })` — string-or-array shortcut that auto-fills `magicLink.allowlist` and `google.allowlist` with a case-insensitive exact match. Google additionally rejects `emailVerified=false` profiles. Explicit allowlists on either provider override `singleAdmin` for that provider.
- `@naeemba/next-starter/middleware` subpath exporting `createMiddleware({ protect, signInPath?, callbackParam?, cookiePrefix? })`. Edge-runtime safe; checks for the better-auth session cookie's presence and redirects to `signInPath` with `callbackUrl` set when missing. The real session gate stays at the server-component level via `requireSession`.
- `next-starter init` CLI scaffolder — `npx @naeemba/next-starter init [target]` writes the seven shim files documented in the README plus an `.env.example`. Flags: `--force`, `--src`, `--no-src`, `--no-google`, `--no-passkey`, `--skip-env`.

### Changed

- `postgres`, `@react-email/components`, `@react-email/render`, and `resend` are now **optional peer dependencies** instead of hard dependencies. Existing consumers' lockfiles are unaffected; fresh installs surface a peer warning if the relevant package is omitted. Consumers who supply their own db client / email template / Resend alternative can skip the install cost. See UPGRADING.md for details.
- `package.json` now declares a `bin` mapping for the `next-starter` CLI; the published tarball includes `bin/`.
- Internal: split the default magic-link template into its own entry (`dist/email/templates/magic-link-lazy.js`) so loading `email/index.js` no longer eagerly pulls `@react-email/components`. Not part of the public `exports` map.

## 0.3.0

### Added

- `createAuth({ google: {...} })` — Google OAuth via better-auth `socialProviders`. Auto-enables account linking with Google as a trusted provider (verified-email gated). Opt out with `accountLinking: false`.
- `createAuth({ passkey: {...} })` — WebAuthn passkey sign-in via `@better-auth/passkey`.
- `<SignInForm/>` gained `google`, `passkey`, `magicLink` (toggle), `dividerLabel`, and `onSignedIn` props. Passkey button is hidden silently when `window.PublicKeyCredential` is undefined.
- New `@naeemba/next-starter/pages/passkey-manager` entry exporting `<PasskeyManager/>` — an "Add a passkey" button for settings pages.
- `passkey` table added to `@naeemba/next-starter/schema`.
- Optional env vars `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Changed

- Database driver switched from `pg` (node-postgres) to `postgres` (postgres.js by Porsager). The `Db` inferred type now wraps a postgres-js client. The connection string format is unchanged.
- Consumers passing their own `db?:` to `createAuth({ db })` must now use a `drizzle-orm/postgres-js` instance.
- Tightened peer dependency floors: `next >= 16`, `react >= 19`, `react-dom >= 19`. Older versions are no longer tested.
- Replaced `@ts-ignore TS2883` with `@ts-expect-error` in `src/client/index.ts` — and then dropped the directive entirely since the underlying error no longer fires.

### Removed

- `pg` dependency (and `@types/pg`). Use `postgres` instead.

### Notes

- `passkey.allowlist` is intentionally not supported. `@better-auth/passkey` exposes no `beforeRegistration` hook and passkey registration requires an active session, so the magic-link / Google allowlists already gate who can register a passkey.
- `<PasskeyManager/>` for 0.3.0 only supports "add". Listing and removing passkeys via the React client is deferred until `@better-auth/passkey` exposes those as direct methods (currently only nanostore atoms + fetch endpoints).

## 0.2.0

### Changed

- Replaced the frozen `auth` singleton with a `createAuth({...})` factory.
- Split `<SignInForm/>` (headless) from `<SignInPage/>` (with chrome).
- Magic-link email is now fully customizable via `createAuth({ magicLink: { email } })`.

### Added

- New `@naeemba/next-starter/client` export with `createAuthClient()`.
- `<SignInForm/>` and `<SignInPage/>` exposed under `@naeemba/next-starter/pages/sign-in`.

See [UPGRADING.md](./UPGRADING.md) for the full migration guide.

## 0.1.x

Initial releases of the starter as a versioned npm package. Magic-link email sign-in, Drizzle schema, Better Auth integration, postgres support, console + Resend email transports.
