# Changelog

All notable changes to `@naeemba/next-starter`. Migration steps live in [UPGRADING.md](./UPGRADING.md).

## [0.10.0](https://github.com/naeemba/next-typescript-starter/compare/v0.9.1...v0.10.0) (2026-07-07)

### Features

* **auth:** validate Postal env vars for EMAIL_TRANSPORT=postal ([dd4b64d](https://github.com/naeemba/next-typescript-starter/commit/dd4b64d405cb62fe8fa8bb8ee5ac65043c4f743e))
* **email:** add Postal HTTPS API transport ([a4d2d18](https://github.com/naeemba/next-typescript-starter/commit/a4d2d18f56eea3e52e8723d59b965f3852ce7959))
* **email:** add provider resolver for EMAIL_TRANSPORT selection ([ce75f2c](https://github.com/naeemba/next-typescript-starter/commit/ce75f2c78a5d266dccf71dad1f088ae486b8b22b))
* **email:** dispatch Postal via EMAIL_TRANSPORT in sendEmail ([a2e5c49](https://github.com/naeemba/next-typescript-starter/commit/a2e5c49523ce19d33c59b01b54f5f4a5713b7922))

### Bug Fixes

* **email:** strip trailing slashes from POSTAL_API_URL before path join ([18b4522](https://github.com/naeemba/next-typescript-starter/commit/18b45226a05879e9d15d9b5d5b1d72569f4e53ac))
## [0.9.1](https://github.com/naeemba/next-typescript-starter/compare/v0.9.0...v0.9.1) (2026-07-06)
## [0.9.0](https://github.com/naeemba/next-typescript-starter/compare/v0.8.0...v0.9.0) (2026-06-25)

### Features

* **auth:** forward passkey registration/authentication options ([ee0f55c](https://github.com/naeemba/next-typescript-starter/commit/ee0f55c64919abd8dacdb909dd60679494daec48))
## [0.8.0](https://github.com/naeemba/next-typescript-starter/compare/v0.7.2...v0.8.0) (2026-06-19)

### ⚠ BREAKING CHANGES

* **cli:** stop scaffolding auth drizzle wiring; package owns migrations

### Features

* **cli:** add migrate and migrate baseline subcommands ([281013a](https://github.com/naeemba/next-typescript-starter/commit/281013a6cb2eba4e83122c9fdf9a0020bcd0c510))
* **cli:** stop scaffolding auth drizzle wiring; package owns migrations ([e42b0fa](https://github.com/naeemba/next-typescript-starter/commit/e42b0fa5cb9ace8b8f85d4e12c562dea221e51ba))
* **db:** add baselineAuth for adopting pre-0.8.0 databases ([a05ed01](https://github.com/naeemba/next-typescript-starter/commit/a05ed01ef000d8bf6b519da7f1f1209e7bc41824))
* **db:** add migrateAuth + resolveMigrationsFolder ([fe96b4b](https://github.com/naeemba/next-typescript-starter/commit/fe96b4ba0407b6f2ee31268e36e261508d08c456))
* **db:** generate canonical auth migration lineage ([8c33e6c](https://github.com/naeemba/next-typescript-starter/commit/8c33e6c7e079313df382e9bd9da3b963f2fffdc7))

### Bug Fixes

* **build:** keep optional peers out of static bundler resolution ([671720d](https://github.com/naeemba/next-typescript-starter/commit/671720ddc86aac8bcfa71faa5c1561e330dc01b6))
* **cli:** label top-level error by subcommand, not always "init" ([7f3b7af](https://github.com/naeemba/next-typescript-starter/commit/7f3b7af9386a08c12a4cff46c61790a7232b67d9))
* **db:** guard baselineAuth against missing auth tables ([ff33dda](https://github.com/naeemba/next-typescript-starter/commit/ff33dda4bd717882a24c1d05b2fb9393ed635716))
* **db:** make db:check:auth robust to untracked migration files ([b784d11](https://github.com/naeemba/next-typescript-starter/commit/b784d118d739d8f81953ee7fd493fd7cda7ffc16))
* **db:** resolve migrations folder by walking up to the _journal.json marker ([0e91dc3](https://github.com/naeemba/next-typescript-starter/commit/0e91dc3cce4deee61ed6e136304a6422028041fc))
* guard unknown migrate subcommands + final-review polish ([facd69c](https://github.com/naeemba/next-typescript-starter/commit/facd69ca66e220f45ec505f583bb5384e1d41cf4))
## [0.7.2](https://github.com/naeemba/next-typescript-starter/compare/v0.7.1...v0.7.2) (2026-06-15)
## [0.7.1](https://github.com/naeemba/next-typescript-starter/compare/v0.7.0...v0.7.1) (2026-06-14)

### Bug Fixes

* **sign-in:** default-navigate after passkey sign-in when onSignedIn is unset ([39b631f](https://github.com/naeemba/next-typescript-starter/commit/39b631f1c8a3a379d1cf240ac71c88d8106f08ba))
## 0.7.0

### Breaking

- **`createAuth()` is now async.** Returns `Promise<Auth>` instead of `Auth`. Update call sites with one `await`:
  ```diff
  - export const auth = createAuth({ /* ... */ })
  + export const auth = await createAuth({ /* ... */ })
  ```
  Reason: `@better-auth/passkey` 1.6.x is ESM-only, so the optional-peer load for passkey must use `await import()`. That bubbles up to the factory. Downstream importers (`createAuthRoute(auth)`, `createServer(auth)`) are unchanged — top-level await resolves `auth` to a plain `Auth` instance before downstream code runs.

### Changed

- CLI: `next-starter init` now scaffolds `export const auth = await createAuth(...)` in `lib/auth.ts`.

## [0.6.0](https://github.com/naeemba/next-typescript-starter/compare/v0.5.0...v0.6.0) (2026-06-13)

### Features

* **auth:** rateLimit knob + BETTER_AUTH_RATE_LIMIT_DISABLED env override ([323591f](https://github.com/naeemba/next-typescript-starter/commit/323591f9af9acacaf47c681616107f2fb61a1d64))
* **auth:** transport injection — BYO email delivery for magic-link mail ([b581c95](https://github.com/naeemba/next-typescript-starter/commit/b581c959d3dc30567db6d2cf5438ae156fe05334))
* **cli:** scaffold proxy.ts by default ([ecf1c4b](https://github.com/naeemba/next-typescript-starter/commit/ecf1c4b6cf00d9142bd6925c6bd20654a14383f4))
* **passkey-manager:** ship PasskeyManagerPage wrapper + CLI scaffold ([70a344f](https://github.com/naeemba/next-typescript-starter/commit/70a344fb58679c223a04537ed8d83d0f4257c76d))
* **schema:** index FK / lookup columns on session, account, verification, passkey ([1d49041](https://github.com/naeemba/next-typescript-starter/commit/1d490413fb0dbe9ec9243e208250df8b722cda74))
* **sign-in:** read callbackUrl from query string ([56f4fad](https://github.com/naeemba/next-typescript-starter/commit/56f4fad189b8a055c8506bc2c48ab4342b61182e))
* **sign-in:** ship SignInErrorPage + wire errorCallbackUrl through ([78ab268](https://github.com/naeemba/next-typescript-starter/commit/78ab268f5f565cf1c78d4a29feb8874d299ec7e1))

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
