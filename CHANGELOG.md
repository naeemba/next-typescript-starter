# Changelog

All notable changes to `@naeemba/next-starter`. Migration steps live in [UPGRADING.md](./UPGRADING.md).

## 0.4.0

### Added

- `createAuth({ singleAdmin: "owner@example.com" })` — string-or-array shortcut that auto-fills `magicLink.allowlist` and `google.allowlist` with a case-insensitive exact match. Google additionally rejects `emailVerified=false` profiles. Explicit allowlists on either provider override `singleAdmin` for that provider.
- `@naeemba/next-starter/middleware` subpath exporting `createMiddleware({ protect, signInPath?, callbackParam?, cookiePrefix? })`. Edge-runtime safe; checks for the better-auth session cookie's presence and redirects to `signInPath` with `callbackUrl` set when missing. The real session gate stays at the server-component level via `requireSession`.
- `next-starter init` CLI scaffolder — `npx @naeemba/next-starter init [target]` writes the seven shim files documented in the README plus an `.env.example`. Flags: `--force`, `--src`, `--no-src`, `--no-google`, `--no-passkey`, `--skip-env`.

### Changed

- `postgres`, `@react-email/components`, `@react-email/render`, and `resend` are now **optional peer dependencies** instead of hard dependencies. Existing consumers' lockfiles are unaffected; fresh installs surface a peer warning if the relevant package is omitted. Consumers who supply their own db client / email template / Resend alternative can skip the install cost. See UPGRADING.md for details.
- `package.json` now declares a `bin` mapping for the `next-starter` CLI; the published tarball includes `bin/`.

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
