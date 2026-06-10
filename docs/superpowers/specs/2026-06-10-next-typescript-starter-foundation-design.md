# `@naeemba/next-starter` — v0.1 Foundation Design

**Date:** 2026-06-10
**Status:** Draft for review
**Scope:** Foundation slice only — package skeleton + Better Auth + Drizzle + magic-link email sign-in + one example consumer. Explicitly deferred: UI library, customization escape hatches, init CLI, versioning policy, sign-up/verify-email pages, full server helpers.

## 1. Goals and non-goals

### Goals

- Ship `@naeemba/next-starter` v0.1 to npm as a public scoped package.
- A consumer can: `npm install`, set 5 env vars, create 3 shim files, run 2 commands, and have working magic-link sign-in.
- Bumping the package version propagates fixes to consumers — no clone-and-fork.
- One automated end-to-end test (Playwright through the example app) gates every PR.

### Non-goals (deferred to follow-up specs)

- `@naeemba/next-starter/ui` — Radix-based component library.
- Customization escape hatches (render props, config overrides, eject CLI).
- `npx @naeemba/next-starter init` CLI.
- Email-and-password auth, OAuth, sign-up page, separate verify-email page.
- Versioning/release policy (Changesets, semver discipline docs).
- Database support beyond Postgres.
- Multiple email transports beyond Resend + console fallback.

## 2. Decisions log

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Package name | `@naeemba/next-starter` | Scoped, descriptive, leaves room for siblings |
| 2 | Repo shape | Single package + `examples/basic` workspace | Avoid premature monorepo; one publishable artifact |
| 3 | Repo layout | Flat-root (root `package.json` IS the published package) | Simpler than `packages/` subdir; npm allows `workspaces` + publishable fields in the same file |
| 4 | Auth flow | Magic link only (Better Auth `magicLink` plugin) | Smallest UI surface; no password reset, no sign-up page |
| 5 | DB | Postgres only | Matches README; SQLite/MySQL later if asked |
| 6 | DB init | Consumer-owned `drizzle.config.ts` + `drizzle-kit generate` + `migrate` | Forward-only migrations, reviewable in consumer's repo |
| 7 | Build tool | tsup (ESM only, multi-entry, `dts: true`) | Best ergonomics for multi-subpath `exports`; Next handles ESM |
| 8 | Email dev behavior | Console-log when `RESEND_API_KEY` is unset | Zero-setup first-time consumer login locally |
| 9 | Tests | One Playwright smoke through example app | Catches the most failure modes per unit of test code |
| 10 | Shim count target | 3 mandatory consumer files | Down from README's 4; drop unnecessary `lib/auth.ts` and `db/schema.ts` re-exports |

## 3. Architecture

### Repo layout (flat-root)

```
next-typescript-starter/
├── package.json                          ← published package + workspace meta
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── src/                                  ← package source
│   ├── auth/{index.ts, config.ts}
│   ├── auth-route/index.ts
│   ├── schema/index.ts
│   ├── db/index.ts
│   ├── email/{index.ts, resend.ts, console.ts, templates/magic-link.tsx}
│   ├── pages/sign-in/index.tsx
│   └── server/index.ts
├── dist/                                 ← tsup output, what npm publishes
├── examples/
│   └── basic/                            ← workspace consumer app
└── docs/superpowers/specs/               ← this doc lives here
```

### Consumer-side mental model

Install one dep, set five env vars, create three shim files (Next route handler + sign-in page + `drizzle.config.ts`), run two commands (`drizzle-kit generate`, `drizzle-kit migrate`). Everything else lives in the package; updates arrive via `npm update`.

The README's `lib/auth.ts` and `db/schema.ts` shims are dropped — consumers import `auth`/`schema` directly via subpath imports. Net 3 shims instead of 4.

## 4. Package shape: `exports` map and `package.json`

### `package.json` (root, single-file workspace + publishable)

```json
{
  "name": "@naeemba/next-starter",
  "version": "0.1.0",
  "description": "Opinionated Next.js + Drizzle + Better Auth starter, shipped as a versioned package",
  "type": "module",
  "sideEffects": false,
  "files": ["dist", "README.md"],
  "private": false,
  "workspaces": ["examples/basic"],
  "exports": {
    "./auth":          { "types": "./dist/auth/index.d.ts",          "default": "./dist/auth/index.js" },
    "./auth-route":    { "types": "./dist/auth-route/index.d.ts",    "default": "./dist/auth-route/index.js" },
    "./schema":        { "types": "./dist/schema/index.d.ts",        "default": "./dist/schema/index.js" },
    "./db":            { "types": "./dist/db/index.d.ts",            "default": "./dist/db/index.js" },
    "./email":         { "types": "./dist/email/index.d.ts",         "default": "./dist/email/index.js" },
    "./pages/sign-in": { "types": "./dist/pages/sign-in/index.d.ts", "default": "./dist/pages/sign-in/index.js" },
    "./server":        { "types": "./dist/server/index.d.ts",        "default": "./dist/server/index.js" }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm run build"
  },
  "dependencies": {
    "better-auth": "...",
    "drizzle-orm": "...",
    "pg": "...",
    "resend": "...",
    "@react-email/components": "...",
    "@react-email/render": "...",
    "zod": "..."
  },
  "peerDependencies": {
    "next": ">=14.0.0",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "devDependencies": {
    "tsup": "...",
    "typescript": "...",
    "@types/node": "...",
    "@types/react": "..."
  },
  "publishConfig": { "access": "public" }
}
```

Version pins for dependencies are intentionally left as `...` here and resolved during implementation against the latest stable at install time.

### Key shape decisions

- **ESM-only.** Next handles it; CJS dual doubles build output for no benefit today.
- **No root export.** Consumers must use a subpath; forces explicit imports and keeps each subpath treeshake-friendly.
- **Per-subpath `types` condition.** Required for TypeScript to resolve declarations across subpaths under `moduleResolution: "bundler" | "node16" | "nodenext"`.
- **`sideEffects: false`** so bundlers drop unused subpaths.
- **`files: ["dist"]`** so source/configs/tests are never published.
- **`publishConfig.access: "public"`** so the first `npm publish` succeeds on a free account without flags.

## 5. Type safety

End-to-end TypeScript with no `any` slippage:

- Package source is fully TypeScript with `strict: true`.
- tsup `dts: true` emits a `.d.ts` alongside each JS entry.
- Each `exports` subpath has a `types` condition pointing at its `.d.ts`.
- Consumer `tsconfig.json` **must** use `moduleResolution: "bundler"` (Next 14+ default), `"node16"`, or `"nodenext"`. The older `"node"` resolution ignores the subpath `types` condition and silently degrades imports to `any`. Document this in the README troubleshooting section.
- Drizzle table types flow through the schema export; consumers get typed query results.
- Better Auth inferred types flow through `auth` and `getSession`.
- Env vars validated with Zod inside `auth/config.ts` — fail-fast at boot with clear errors; types narrowed from the Zod schema.
- CI runs `tsc --noEmit` against both the package and the example consumer; catches any drift between emitted types and runtime shapes.

## 6. Schema and DB init

### Tables (Better Auth standard names, no prefix for v0.1)

`user`, `session`, `account`, `verification` — Postgres only, defined in Drizzle. Even with magic-link only, `account` must exist because Better Auth's data model requires it.

Sketch (final column lists determined during implementation against Better Auth's schema requirements):

```ts
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})
// session, account, verification follow Better Auth's documented shapes.
```

### DB client (lazy singleton via Proxy)

```ts
// src/db/index.ts
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is required")
    _db = drizzle(new Pool({ connectionString: url }), { schema })
  }
  return _db
}
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get: (_, prop) => getDb()[prop as keyof ReturnType<typeof getDb>],
})
```

Lazy via Proxy so top-level imports don't attempt to connect during Next's route-collection phase (when env vars may not be set).

### Consumer DB init flow

1. `npm i @naeemba/next-starter`; set `DATABASE_URL` in `.env`.
2. Create `drizzle.config.ts` pointing at the package's built schema:
   ```ts
   import { defineConfig } from "drizzle-kit"
   export default defineConfig({
     schema: "./node_modules/@naeemba/next-starter/dist/schema/index.js",
     out: "./drizzle",
     dialect: "postgresql",
     dbCredentials: { url: process.env.DATABASE_URL! },
   })
   ```
3. `npx drizzle-kit generate && npx drizzle-kit migrate`. Migration SQL files land in consumer's `drizzle/` directory, committed to consumer's repo. On future package updates with schema changes, consumer re-runs `generate` + `migrate`.

## 7. Auth wiring

### `auth` instance (`src/auth/index.ts`)

```ts
import { betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db"
import * as schema from "../schema"
import { sendMagicLink } from "../email"
import { parseEnv } from "./config"

const env = parseEnv(process.env)

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => sendMagicLink({ to: email, url }),
      expiresIn: 60 * 10,
    }),
  ],
})
```

`parseEnv` is a Zod schema validating `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Throws at module load if anything is missing/malformed.

### Route handler (`src/auth-route/index.ts`)

```ts
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "../auth"
export const { GET, POST } = toNextJsHandler(auth)
```

Consumer re-exports both symbols from `app/api/auth/[...all]/route.ts`.

### Sign-in page (`src/pages/sign-in/index.tsx`)

Client Component: email input, submit button. Uses `better-auth/react`'s `authClient.signIn.magicLink({ email, callbackURL: "/" })`. Shows "check your inbox" on success, inline error on failure. Tailwind utility classes for minimal usable styling. Consumer can override entirely by replacing the page shim.

### Server helper (`src/server/index.ts`)

```ts
import { headers } from "next/headers"
import { auth } from "../auth"
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
```

Returns `{ user, session } | null`. The example app uses this on `/` to display the signed-in email — also how the smoke test asserts success.

### End-to-end flow

1. User visits `/sign-in` → consumer route renders our re-exported page.
2. Submit email → `POST /api/auth/sign-in/magic-link`.
3. Handler creates a verification row; calls `sendMagicLink({ to, url })`.
4. Email sender picks Resend or console transport based on `RESEND_API_KEY`.
5. User clicks link → `GET /api/auth/magic-link/verify?token=...`.
6. Handler verifies token, creates user (if first time) + session, sets cookie, 302 → callbackURL.
7. Subsequent server-side `getSession()` reads the cookie.

### Not in v0.1

- Middleware (Better Auth's middleware is optional; example uses Server Component `getSession()`).
- Separate verify-email page (the magic link click IS the verification).
- Sign-up page (first-time emails create users transparently).

## 8. Email sender

### Single public function (`src/email/index.ts`)

```ts
export async function sendMagicLink({ to, url }: { to: string; url: string }) {
  const html = await render(<MagicLinkEmail url={url} />)
  const text = `Sign in: ${url}`
  const transport = process.env.RESEND_API_KEY ? sendViaResend : sendViaConsole
  await transport({
    to,
    from: process.env.EMAIL_FROM ?? "auth@example.invalid",
    subject: "Sign in to your account",
    html,
    text,
  })
}
```

Transport selected per-call (not per-module-load) so the example app and dev environments can run without ever touching Resend.

### Console transport

Logs the magic-link URL plainly to stdout in a recognizable format. The Playwright smoke test scrapes the URL from log output — that scraping format is part of the dev-mode contract.

### Resend transport

Thin SDK wrapper, lazy-initialized. Failures throw; the auth handler returns 500; the sign-in UI shows a generic "couldn't send email" message. No retries (user can re-submit).

### React Email template

`src/email/templates/magic-link.tsx` — `@react-email/components`, inline styles per email-client conventions. Minimal: heading, button to `url`, footer.

### Production safety

If `NODE_ENV === "production"` and `RESEND_API_KEY` is unset, log a startup `WARN`. (Magic links going to server logs in prod is a security risk: anyone with log access could sign in as any user.)

## 9. Example consumer (`examples/basic/`)

### Layout

```
examples/basic/
├── package.json
├── tsconfig.json
├── next.config.mjs                       ← empty (no transpilePackages needed)
├── drizzle.config.ts                     ← shim #3
├── .env.example
├── drizzle/0000_initial.sql              ← generated, committed
├── playwright.config.ts
├── e2e/magic-link.spec.ts
└── app/
    ├── api/auth/[...all]/route.ts        ← shim #1
    ├── sign-in/page.tsx                  ← shim #2
    ├── layout.tsx
    └── page.tsx                          ← getSession() → render email or sign-in link
```

### The three shims (entire consumer-side starter, ~10 lines total)

```ts
// app/api/auth/[...all]/route.ts
export { GET, POST } from "@naeemba/next-starter/auth-route"
```
```tsx
// app/sign-in/page.tsx
export { default } from "@naeemba/next-starter/pages/sign-in"
```
```ts
// drizzle.config.ts — see §6
```

### `examples/basic/package.json`

Depends on `@naeemba/next-starter: "workspace:*"` so changes to the package's `dist/` are picked up instantly during dev. When somebody installs the published package, they pin a real version range.

Includes scripts: `dev`, `build`, `typecheck`, `db:generate`, `db:migrate`, `test:e2e`.

## 10. Build, publish, dev loop

### `tsup.config.ts`

```ts
export default defineConfig({
  entry: {
    "auth/index":          "src/auth/index.ts",
    "auth-route/index":    "src/auth-route/index.ts",
    "schema/index":        "src/schema/index.ts",
    "db/index":            "src/db/index.ts",
    "email/index":         "src/email/index.ts",
    "pages/sign-in/index": "src/pages/sign-in/index.tsx",
    "server/index":        "src/server/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["next", "react", "react-dom"],
  splitting: false,
  treeshake: true,
})
```

### Dev loop

- Terminal A: `npm run dev` at repo root → tsup watches and rebuilds `dist/` (~100ms per save).
- Terminal B: `cd examples/basic && npm run dev` → Next HMR.
- Workspace symlink means the example app always imports the freshly-built `dist/`.

### Publish flow

1. Bump `version` in root `package.json`.
2. `npm publish` → `prepublishOnly` runs `typecheck` + `build`; if both pass, npm uploads `dist/` + `README.md` + `package.json`.
3. First publish registers the `@naeemba` scope. `publishConfig.access: "public"` makes it succeed on a free account without `--access public` flag.
4. 2FA OTP prompt at publish time (assuming auth-and-writes 2FA is enabled on the npm account).

`prepublishOnly` does not run tests — Playwright needs a Postgres + a running example app, more than is reasonable for a local publish. CI runs tests on every PR; that's the gate.

### CI workflow

```yaml
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: starter_test }
        ports: ["5432:5432"]
    steps:
      - checkout, setup-node 20, npm ci
      - npm run typecheck   # package
      - npm run build       # package
      - cd examples/basic && npm ci && npm run typecheck && npx drizzle-kit migrate
      - cd examples/basic && npx playwright install --with-deps chromium
      - cd examples/basic && npm run test:e2e
```

## 11. Testing strategy

### One Playwright smoke test: `examples/basic/e2e/magic-link.spec.ts`

Spawns `npm run dev` with `RESEND_API_KEY=""` so the console transport is used. Captures the dev server's stdout. The test:

1. Goes to `/sign-in`, submits a unique email.
2. Asserts the "check your inbox" confirmation appears.
3. Scrapes the magic-link URL from the captured stdout.
4. Visits the magic-link URL.
5. Asserts redirected to `/`.
6. Asserts the page shows the signed-in email (via server-side `getSession()`).

This single test exercises: build, exports map, Next route handler, Better Auth wiring, Drizzle adapter, email transport selection, magic-link verification, session cookie, server-side session reading, and page component re-export.

### Out of scope for v0.1

- Resend transport coverage (would require real keys + inbox polling).
- Sign-out, expired tokens, rate limits, concurrent sessions.
- Unit tests on configuration shapes (low value; the smoke test exercises them indirectly).

### CI duration target

Under 60 seconds cold-start on GitHub Actions.

## 12. Open follow-ups (NOT in this spec)

These remain from the README and are deferred to future specs:

- **Customization API** — config overrides, render-prop slots, eject CLI.
- **UI component library** — `@naeemba/next-starter/ui`.
- **`npx @naeemba/next-starter init` CLI** — scaffold shims and run first migration.
- **Versioning policy** — Changesets, communicating breaking changes (schema migrations especially).
- **More auth flows** — email+password, OAuth providers, sign-up page, separate verify-email page.
- **Middleware export** — for route protection.
- **Non-Postgres DB support** — SQLite, MySQL.
- **Pluggable email transports** — Postmark, SES, Mailgun.

## 13. Implementation order (preview for the plan)

Rough sequence the implementation plan should follow:

1. Repo scaffolding: root `package.json` (workspaces + publishable fields), `tsconfig.json`, `tsup.config.ts`, `.gitignore` rewrite.
2. Schema (`src/schema`).
3. DB client (`src/db`).
4. Env validation + auth config (`src/auth/config.ts`).
5. Email sender + template (`src/email/*`).
6. Auth instance (`src/auth/index.ts`).
7. Auth route handler (`src/auth-route/index.ts`).
8. Sign-in page component (`src/pages/sign-in/index.tsx`).
9. Server helper (`src/server/index.ts`).
10. First build; verify `dist/` and emitted `.d.ts` files.
11. Example consumer scaffold (`examples/basic/`): `package.json`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, three shim files, `drizzle.config.ts`, `.env.example`.
12. Run `drizzle-kit generate` + `migrate` against a local Postgres; commit migration files.
13. Manually verify sign-in flow end to end in a browser.
14. Playwright smoke test.
15. CI workflow.
16. README rewrite for consumers (the current `README.md` is the design doc; the published package needs a usage-focused README).
17. First `npm publish` (or dry-run with `npm publish --dry-run` to inspect contents).
