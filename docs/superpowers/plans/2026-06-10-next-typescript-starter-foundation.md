# `@naeemba/next-starter` v0.1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1 foundation slice of `@naeemba/next-starter` — a publishable npm package that gives consumers working magic-link email sign-in via 3 shim files and 2 commands.

**Architecture:** Single flat-root npm package with multi-subpath ESM `exports` map, built by tsup. Better Auth + Drizzle (Postgres) + Resend + React Email + Next.js 14 App Router. Workspace sibling at `examples/basic/` is both the dogfood consumer and the host for one Playwright smoke E2E test.

**Tech Stack:** TypeScript (strict, `moduleResolution: bundler`), tsup (ESM-only multi-entry, `dts: true`), Better Auth (magic-link plugin), Drizzle ORM (Postgres / `node-postgres`), Resend SDK, `@react-email/components`, Zod (env validation), Next.js 14 App Router, Vitest (unit tests for tricky logic), Playwright (one E2E smoke), GitHub Actions CI.

**Source of truth:** All decisions live in `docs/superpowers/specs/2026-06-10-next-typescript-starter-foundation-design.md`. Open the spec alongside this plan if you need rationale for any choice.

**Pre-flight assumption:** Repository is clean except for: `README.md` (modified — the design discussion), the just-committed spec under `docs/superpowers/specs/`, and an untracked `.claude/`. The CRA scaffold (`src/`, `public/`, `package.json`, `yarn.lock`) was already deleted in a prior step but is not yet committed. Task 0 reconciles this.

---

## File map (locked in advance)

### Package (root, flat-root layout)

- `package.json` — published artifact AND workspace meta. Holds the `exports` map, deps, peer deps, scripts.
- `tsconfig.json` — strict TypeScript for the package source.
- `tsup.config.ts` — multi-entry ESM build, `dts: true`.
- `vitest.config.ts` — unit tests for the meaty bits (env parser, Proxy DB client, transport selection, console log format).
- `.gitignore` — replacement for the CRA-flavored one currently in repo.

### Package source — one file = one responsibility

- `src/auth/config.ts` — Zod schema + `parseEnv()` for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_FROM`. Returns a fully-typed `Env` object.
- `src/auth/index.ts` — `betterAuth()` instance, wired to Drizzle adapter and the magicLink plugin.
- `src/auth-route/index.ts` — `toNextJsHandler(auth)`, exports `GET` and `POST`.
- `src/schema/index.ts` — Drizzle tables `user`, `session`, `account`, `verification`.
- `src/db/index.ts` — lazy Drizzle client behind a Proxy.
- `src/email/index.ts` — `sendMagicLink({ to, url })`; picks transport from env.
- `src/email/resend.ts` — Resend SDK wrapper.
- `src/email/console.ts` — dev/fallback transport; emits BOTH a human-readable block AND a single grep-friendly line.
- `src/email/templates/magic-link.tsx` — React Email template.
- `src/pages/sign-in/index.tsx` — Client Component sign-in page using `better-auth/react`.
- `src/server/index.ts` — `getSession()` server helper.

### Tests (package-level unit)

- `tests/auth-config.test.ts` — env parser happy/failure paths.
- `tests/db.test.ts` — Proxy lazy-init behavior.
- `tests/email-console.test.ts` — console transport log format (the contract scraped by the smoke test).
- `tests/email-sender.test.ts` — transport selection based on `RESEND_API_KEY`.

### Example consumer (`examples/basic/`)

- `examples/basic/package.json` — Next 14, workspace-linked package.
- `examples/basic/tsconfig.json` — `moduleResolution: bundler`.
- `examples/basic/next.config.mjs` — empty default config.
- `examples/basic/drizzle.config.ts` — points at the package's built schema.
- `examples/basic/.env.example` — documented env template.
- `examples/basic/app/layout.tsx` — bare HTML shell.
- `examples/basic/app/page.tsx` — Server Component, calls `getSession()`, renders email or sign-in link.
- `examples/basic/app/sign-in/page.tsx` — **Shim #1**.
- `examples/basic/app/api/auth/[...all]/route.ts` — **Shim #2**.
- `examples/basic/playwright.config.ts` — one project, Chromium.
- `examples/basic/e2e/magic-link.spec.ts` — the smoke test.
- `examples/basic/drizzle/` — generated migration SQL, committed.

### CI + repo docs

- `.github/workflows/ci.yml` — typecheck, build, migrate, run smoke test.
- `README.md` — **rewrite** for consumer-facing usage (the design discussion currently in `README.md` is preserved in `docs/superpowers/specs/`).

---

## Dependency version pins

Pinned here so every task block uses the same versions. If `npm install` resolves something different (e.g. a peer dep refuses), bump these and re-run. Don't drift.

```
"better-auth":              "^1.0.0"
"drizzle-orm":              "^0.36.0"
"drizzle-kit":              "^0.27.0"       (dev only)
"pg":                       "^8.13.0"
"@types/pg":                "^8.11.0"       (dev only)
"resend":                   "^4.0.0"
"@react-email/components":  "^0.0.30"
"@react-email/render":      "^1.0.0"
"zod":                      "^3.23.0"
"tsup":                     "^8.3.0"        (dev only)
"typescript":               "^5.6.0"        (dev only)
"vitest":                   "^2.1.0"        (dev only)
"@playwright/test":         "^1.48.0"       (dev only in example app)
"next":                     "^14.2.0"       (peer dep / example app dep)
"react":                    "^18.3.0"       (peer dep / example app dep)
"react-dom":                "^18.3.0"       (peer dep / example app dep)
"@types/react":             "^18.3.0"       (dev only)
"@types/node":              "^20.14.0"      (dev only)
"tailwindcss":              "^3.4.0"        (dev only — utility classes on sign-in page)
"autoprefixer":             "^10.4.0"       (dev only)
"postcss":                  "^8.4.0"        (dev only)
```

---

## Task 0: Reconcile the pre-existing working-tree state

The CRA scaffold has been deleted but not yet committed. We need a clean baseline so subsequent task commits land cleanly.

**Files:**
- Modify: working tree git index (no source files in this task).
- Reset: `README.md` (will be rewritten in a much later task; the modification currently in the working tree is the design discussion that's already preserved in `docs/superpowers/specs/2026-06-10-next-typescript-starter-foundation-design.md`).

- [ ] **Step 1: Inspect working-tree state**

Run: `git status`

Expected: README.md modified; CRA files (`package.json`, `yarn.lock`, `public/*`, `src/*`) deleted; `.claude/` and `docs/` untracked but `docs/superpowers/specs/...` already committed in the previous brainstorming round.

- [ ] **Step 2: Stage the CRA deletion and the README modification, then commit**

Run:
```bash
git add -u
git status
```

Expected: All deletions and the README modification staged. `.claude/` remains untracked (that's correct — it shouldn't be committed; we'll add it to `.gitignore` in Task 1).

Run:
```bash
git commit -m "$(cat <<'EOF'
chore: clear CRA scaffold

The CRA-flavored package.json, src/, public/, and yarn.lock were
boilerplate from `create-react-app` and have no role in the planned
package layout. Design discussion previously in README.md is preserved
in docs/superpowers/specs/2026-06-10-next-typescript-starter-foundation-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify clean baseline**

Run: `git status`

Expected: `nothing to commit, working tree clean` (apart from untracked `.claude/`).

---

## Task 1: Repo scaffolding — `.gitignore`, `tsconfig.json`, `tsup.config.ts`, root `package.json`

**Files:**
- Create: `.gitignore` (replacing the CRA-flavored one inherited from initial commit — overwrite).
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `package.json`

- [ ] **Step 1: Replace `.gitignore`**

The current `.gitignore` is CRA-flavored. Overwrite it.

Write `.gitignore`:
```gitignore
node_modules/
dist/
.next/
out/
coverage/

# Env
.env
.env.local
.env.*.local

# OS / editors
.DS_Store
.idea/
.vscode/
*.log

# Tooling
.claude/
.turbo/
.playwright/
playwright-report/
test-results/

# Drizzle journal cache
drizzle/.snapshot.json
```

- [ ] **Step 2: Create `tsconfig.json`**

Write `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "noEmit": true,
    "allowImportingTsExtensions": false,
    "baseUrl": ".",
    "paths": {
      "@naeemba/next-starter/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "tsup.config.ts", "vitest.config.ts"],
  "exclude": ["dist", "node_modules", "examples"]
}
```

The `paths` mapping lets tests import via the public name without going through `dist/`.

- [ ] **Step 3: Create `tsup.config.ts`**

Write `tsup.config.ts`:
```ts
import { defineConfig } from "tsup"

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

- [ ] **Step 4: Create `vitest.config.ts`**

Write `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: { provider: "v8", reporter: ["text"] },
  },
  resolve: {
    alias: { "@naeemba/next-starter": new URL("./src/", import.meta.url).pathname },
  },
})
```

- [ ] **Step 5: Create root `package.json`**

Write `package.json`:
```json
{
  "name": "@naeemba/next-starter",
  "version": "0.1.0",
  "description": "Opinionated Next.js + Drizzle + Better Auth starter, shipped as a versioned package.",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "private": false,
  "files": ["dist", "README.md"],
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
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "better-auth": "^1.0.0",
    "drizzle-orm": "^0.36.0",
    "pg": "^8.13.0",
    "resend": "^4.0.0",
    "@react-email/components": "^0.0.30",
    "@react-email/render": "^1.0.0",
    "zod": "^3.23.0"
  },
  "peerDependencies": {
    "next": ">=14.0.0",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/pg": "^8.11.0",
    "@types/react": "^18.3.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 6: Install deps**

Run: `npm install`

Expected: completes without errors; `node_modules/` and `package-lock.json` created. Workspaces declared but `examples/basic/` doesn't exist yet — npm will warn but not error.

- [ ] **Step 7: Verify typecheck runs (will be empty)**

Run: `npm run typecheck`

Expected: PASS with no output (no source files to typecheck yet).

- [ ] **Step 8: Commit**

```bash
git add .gitignore tsconfig.json tsup.config.ts vitest.config.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: scaffold root package, build config, and test config

Adds .gitignore, tsconfig (strict + bundler resolution), tsup config
(multi-entry ESM with .d.ts), vitest config, and a publishable
package.json with the exports map locked to the 7 subpaths in the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Drizzle schema

**Files:**
- Create: `src/schema/index.ts`
- Test: (none — schema correctness is verified by typecheck + the Drizzle adapter's runtime use in the smoke test).

- [ ] **Step 1: Write `src/schema/index.ts`**

Write `src/schema/index.ts`:
```ts
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core"

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Account = typeof account.$inferSelect
export type Verification = typeof verification.$inferSelect
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`

Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/schema/index.ts
git commit -m "$(cat <<'EOF'
feat: add Drizzle schema for Better Auth tables

user, session, account, verification — Better Auth standard shapes for
Postgres. account exists even with magic-link only because Better Auth
normalizes all credential types into it. Inferred row types exported.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Lazy Drizzle DB client (TDD)

**Files:**
- Create: `tests/db.test.ts`
- Create: `src/db/index.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/db.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

describe("db Proxy lazy-init", () => {
  let originalUrl: string | undefined
  beforeEach(() => {
    originalUrl = process.env.DATABASE_URL
    vi.resetModules()
  })
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalUrl
  })

  it("does not throw at import time when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL
    const mod = await import("../src/db/index")
    expect(mod.db).toBeDefined()
  })

  it("throws when the Proxy is actually used and DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL
    const { db } = await import("../src/db/index")
    expect(() => (db as unknown as { query: unknown }).query).toThrow(/DATABASE_URL/)
  })
})
```

`vi.resetModules()` in `beforeEach` clears Vitest's module cache so each `await import(...)` re-evaluates the module with whatever env state the test sets up.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/db.test.ts`

Expected: FAIL with `Cannot find module '../src/db/index.ts'`.

- [ ] **Step 3: Implement `src/db/index.ts`**

Write `src/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | null = null

function getDb(): Db {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "[@naeemba/next-starter] DATABASE_URL is required but not set. " +
        "Set it in your .env or environment before using the `db` client."
    )
  }
  _db = drizzle(new Pool({ connectionString: url }), { schema })
  return _db
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/db.test.ts`

Expected: both cases PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/db.test.ts src/db/index.ts
git commit -m "$(cat <<'EOF'
feat: lazy Drizzle client behind Proxy

Import-time evaluation no longer requires DATABASE_URL — only first
use does. Lets Next collect routes during build without env vars set.
Clear error message when env is missing on actual access.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Env validator (`auth/config.ts`) (TDD)

**Files:**
- Create: `tests/auth-config.test.ts`
- Create: `src/auth/config.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/auth-config.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { parseEnv } from "../src/auth/config"

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

describe("parseEnv", () => {
  it("accepts a well-formed env object and returns a typed Env", () => {
    const env = parseEnv(validEnv)
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL)
    expect(env.BETTER_AUTH_URL).toBe(validEnv.BETTER_AUTH_URL)
  })

  it("rejects a missing DATABASE_URL with a clear message", () => {
    const broken = { ...validEnv, DATABASE_URL: undefined } as Record<string, string | undefined>
    expect(() => parseEnv(broken)).toThrow(/DATABASE_URL/)
  })

  it("rejects a short secret", () => {
    const broken = { ...validEnv, BETTER_AUTH_SECRET: "short" }
    expect(() => parseEnv(broken)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it("rejects a malformed BETTER_AUTH_URL", () => {
    const broken = { ...validEnv, BETTER_AUTH_URL: "not-a-url" }
    expect(() => parseEnv(broken)).toThrow(/BETTER_AUTH_URL/)
  })

  it("allows EMAIL_FROM to be missing (Resend will reject in prod)", () => {
    const without = { ...validEnv, EMAIL_FROM: undefined } as Record<string, string | undefined>
    const env = parseEnv(without)
    expect(env.EMAIL_FROM).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/auth-config.test.ts`

Expected: FAIL with `Cannot find module '../src/auth/config'`.

- [ ] **Step 3: Implement `src/auth/config.ts`**

Write `src/auth/config.ts`:
```ts
import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required")
    .refine(
      (s) => s.startsWith("postgres://") || s.startsWith("postgresql://"),
      "DATABASE_URL must be a Postgres connection string (postgres:// or postgresql://)"
    ),
  BETTER_AUTH_SECRET: z
    .string({ required_error: "BETTER_AUTH_SECRET is required" })
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z
    .string({ required_error: "BETTER_AUTH_URL is required" })
    .url("BETTER_AUTH_URL must be a valid URL (e.g. https://app.example.com)"),
  EMAIL_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(input: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(input)
  if (result.success) return result.data
  const formatted = result.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n")
  throw new Error(
    "[@naeemba/next-starter] Invalid environment configuration:\n" + formatted
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/auth-config.test.ts`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/auth-config.test.ts src/auth/config.ts
git commit -m "$(cat <<'EOF'
feat: Zod-validated env parser for auth config

parseEnv() validates DATABASE_URL (Postgres scheme), BETTER_AUTH_SECRET
(>= 32 chars), BETTER_AUTH_URL (valid URL), and the optional EMAIL_FROM
/ RESEND_API_KEY. Throws with a bulleted message listing every failure
so misconfigs are diagnosable at first boot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Console email transport (TDD)

The format here is the contract scraped by the Playwright smoke test. We emit BOTH a human-readable block AND a single machine-readable line (the latter is what the smoke greps).

**Files:**
- Create: `tests/email-console.test.ts`
- Create: `src/email/console.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/email-console.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { sendViaConsole } from "../src/email/console"

describe("sendViaConsole", () => {
  const logs: string[] = []
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })

  afterEach(() => {
    logs.length = 0
  })

  it("emits a single machine-readable line containing email and url", async () => {
    await sendViaConsole({
      to: "alice@example.com",
      from: "auth@example.com",
      subject: "Sign in",
      html: "<p>...</p>",
      text: "Sign in: https://app.local/api/auth/magic-link/verify?token=abc",
    })
    const machineLine = logs.find((l) => l.startsWith("[magic-link-log]"))
    expect(machineLine).toBeDefined()
    expect(machineLine).toMatch(/email=alice@example\.com/)
    expect(machineLine).toMatch(/url=https:\/\/app\.local\/api\/auth\/magic-link\/verify\?token=abc/)
  })

  it("also emits a human-readable header block", async () => {
    await sendViaConsole({
      to: "bob@example.com",
      from: "auth@example.com",
      subject: "Sign in",
      html: "<p>...</p>",
      text: "Sign in: https://app.local/api/auth/magic-link/verify?token=xyz",
    })
    expect(logs.some((l) => l.includes("dev mode"))).toBe(true)
    expect(logs.some((l) => l.includes("bob@example.com"))).toBe(true)
  })

  afterEach(() => spy.mockClear())
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/email-console.test.ts`

Expected: FAIL with `Cannot find module '../src/email/console'`.

- [ ] **Step 3: Implement `src/email/console.ts`**

Write `src/email/console.ts`:
```ts
export interface EmailArgs {
  to: string
  from: string
  subject: string
  html: string
  text: string
}

const URL_RE = /https?:\/\/[^\s)]+/

export async function sendViaConsole(args: EmailArgs): Promise<void> {
  const url = args.text.match(URL_RE)?.[0] ?? "(no URL detected in text body)"

  console.log("")
  console.log("📧 [@naeemba/next-starter] Email (dev mode — RESEND_API_KEY unset)")
  console.log(`   To:      ${args.to}`)
  console.log(`   From:    ${args.from}`)
  console.log(`   Subject: ${args.subject}`)
  console.log(`   ${args.text}`)
  console.log("")

  // Machine-readable single-line summary for the Playwright smoke test to grep.
  console.log(`[magic-link-log] email=${args.to} url=${url}`)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/email-console.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/email-console.test.ts src/email/console.ts
git commit -m "$(cat <<'EOF'
feat: console email transport with grep-friendly contract line

Emits a human-readable block for developers PLUS a single
[magic-link-log] line carrying email and url, which the Playwright
smoke test will scrape. Changing the line format is a breaking
change to the dev-mode contract — update the smoke regex in lockstep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Resend email transport

Thin SDK wrapper. No TDD here — the value lives in the Resend SDK; we'd only be testing the SDK's mock surface.

**Files:**
- Create: `src/email/resend.ts`

- [ ] **Step 1: Write `src/email/resend.ts`**

```ts
import { Resend } from "resend"
import type { EmailArgs } from "./console.js"

let _client: Resend | null = null

function getClient(): Resend {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error("[@naeemba/next-starter] RESEND_API_KEY is required to use the Resend transport.")
  }
  _client = new Resend(key)
  return _client
}

export async function sendViaResend(args: EmailArgs): Promise<void> {
  const { error } = await getClient().emails.send({
    to: args.to,
    from: args.from,
    subject: args.subject,
    html: args.html,
    text: args.text,
  })
  if (error) {
    throw new Error(`[@naeemba/next-starter] Resend send failed: ${error.message}`)
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/email/resend.ts
git commit -m "$(cat <<'EOF'
feat: Resend email transport (lazy client)

Lazy-initializes the SDK so the module can be imported in environments
without RESEND_API_KEY. Surfaces SDK errors with a prefixed message
the auth handler will return as a 500.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: React Email magic-link template

**Files:**
- Create: `src/email/templates/magic-link.tsx`

- [ ] **Step 1: Write the template**

Write `src/email/templates/magic-link.tsx`:
```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface Props {
  url: string
  appName?: string
}

export function MagicLinkEmail({ url, appName = "your account" }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Sign in to {appName}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#fff", padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ fontSize: "20px", margin: "0 0 16px" }}>Sign in to {appName}</Heading>
          <Text style={{ fontSize: "14px", lineHeight: "20px", margin: "0 0 24px" }}>
            Click the button below to sign in. The link is valid for 10 minutes and can only be used once.
          </Text>
          <Section style={{ textAlign: "center", margin: "0 0 24px" }}>
            <Button
              href={url}
              style={{
                backgroundColor: "#000",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "14px",
              }}
            >
              Sign in
            </Button>
          </Section>
          <Text style={{ fontSize: "12px", color: "#666", margin: "0" }}>
            If you didn’t request this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/email/templates/magic-link.tsx
git commit -m "$(cat <<'EOF'
feat: React Email template for magic-link sign-in

Minimal inline-styled template for cross-client compatibility. Includes
a configurable appName prop with a sensible default for v0.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Email sender (`sendMagicLink`) with transport selection (TDD)

**Files:**
- Create: `tests/email-sender.test.ts`
- Create: `src/email/index.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/email-sender.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn(async () => {})
const resendSpy = vi.fn(async () => {})

vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: resendSpy }))
vi.mock("@react-email/render", () => ({
  render: async () => "<html>rendered</html>",
}))

describe("sendMagicLink transport selection", () => {
  let originalKey: string | undefined
  let originalFrom: string | undefined

  beforeEach(() => {
    originalKey = process.env.RESEND_API_KEY
    originalFrom = process.env.EMAIL_FROM
    consoleSpy.mockClear()
    resendSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    if (originalFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = originalFrom
  })

  it("uses console transport when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "a@example.com", url: "https://x/verify?token=1" })
    expect(consoleSpy).toHaveBeenCalledOnce()
    expect(resendSpy).not.toHaveBeenCalled()
  })

  it("uses Resend transport when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test"
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "b@example.com", url: "https://x/verify?token=2" })
    expect(resendSpy).toHaveBeenCalledOnce()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it("falls back to a sentinel from-address when EMAIL_FROM is unset", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "c@example.com", url: "https://x/verify?token=3" })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ from: "auth@example.invalid" })
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/email-sender.test.ts`

Expected: FAIL with `Cannot find module '../src/email/index'`.

- [ ] **Step 3: Implement `src/email/index.ts`**

Write `src/email/index.ts`:
```ts
import { render } from "@react-email/render"
import { MagicLinkEmail } from "./templates/magic-link.js"
import { sendViaConsole, type EmailArgs } from "./console.js"
import { sendViaResend } from "./resend.js"

interface SendMagicLinkArgs {
  to: string
  url: string
  appName?: string
}

export async function sendMagicLink({ to, url, appName }: SendMagicLinkArgs): Promise<void> {
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    console.warn(
      "[@naeemba/next-starter] WARNING: NODE_ENV=production but RESEND_API_KEY is unset. " +
        "Magic links will be written to server logs — anyone with log access can sign in as any user."
    )
  }

  const html = await render(MagicLinkEmail({ url, appName }))
  const text = `Sign in: ${url}`

  const args: EmailArgs = {
    to,
    from: process.env.EMAIL_FROM ?? "auth@example.invalid",
    subject: "Sign in to your account",
    html,
    text,
  }

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(args)
  } else {
    await sendViaConsole(args)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/email-sender.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`

Expected: all tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/email-sender.test.ts src/email/index.ts
git commit -m "$(cat <<'EOF'
feat: sendMagicLink with env-driven transport selection

Picks Resend or console transport per-call based on RESEND_API_KEY.
Logs a production safety warning when running in NODE_ENV=production
without a Resend key set. Renders the React Email template and passes
both HTML and a plaintext copy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Better Auth instance (`src/auth/index.ts`)

**Files:**
- Create: `src/auth/index.ts`

- [ ] **Step 1: Write `src/auth/index.ts`**

```ts
import { betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink } from "../email/index.js"
import { parseEnv } from "./config.js"

const env = parseEnv(process.env)

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLink({ to: email, url })
      },
      expiresIn: 60 * 10,
    }),
  ],
})

export type Auth = typeof auth
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS. (The module evaluates at import time and calls `parseEnv(process.env)` — Vitest's env or our own shell env might not have all vars set. Since `typecheck` is `tsc --noEmit`, it does not run the module — it only typechecks. We're safe.)

- [ ] **Step 3: Commit**

```bash
git add src/auth/index.ts
git commit -m "$(cat <<'EOF'
feat: Better Auth instance wired to Drizzle + magicLink plugin

Validates env at module load, configures the Drizzle adapter against
our schema, and registers the magicLink plugin with a 10-minute token
TTL. sendMagicLink callback delegates to our email sender.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Next.js route handler (`src/auth-route/index.ts`)

**Files:**
- Create: `src/auth-route/index.ts`

- [ ] **Step 1: Write the file**

```ts
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "../auth/index.js"

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/auth-route/index.ts
git commit -m "$(cat <<'EOF'
feat: Next.js route handler exports for Better Auth

GET and POST come straight from toNextJsHandler(auth). Consumer
re-exports both symbols from app/api/auth/[...all]/route.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Sign-in page component (`src/pages/sign-in/index.tsx`)

**Files:**
- Create: `src/pages/sign-in/index.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client"

import { useState } from "react"
import { createAuthClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

const authClient = createAuthClient({
  plugins: [magicLinkClient()],
})

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("sending")
    setErrorMsg(null)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
    })
    if (error) {
      setStatus("error")
      setErrorMsg(error.message ?? "Couldn't send the magic link. Please try again.")
      return
    }
    setStatus("sent")
  }

  if (status === "sent") {
    return (
      <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Check your inbox</h1>
        <p style={{ fontSize: 14, color: "#444" }}>
          We sent a sign-in link to <strong>{email}</strong>. It expires in 10 minutes.
        </p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="email" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          style={{
            width: "100%",
            padding: "8px 10px",
            fontSize: 14,
            backgroundColor: "#000",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: status === "sending" ? "wait" : "pointer",
          }}
        >
          {status === "sending" ? "Sending…" : "Sign in with email"}
        </button>
        {errorMsg && (
          <p role="alert" style={{ fontSize: 13, color: "#b00", marginTop: 12 }}>
            {errorMsg}
          </p>
        )}
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/sign-in/index.tsx
git commit -m "$(cat <<'EOF'
feat: magic-link sign-in page (Client Component)

Single email input, calls authClient.signIn.magicLink with a callback
to '/'. Shows a permanent 'check your inbox' state on success and
inline error on failure. Inline styles keep the package zero-CSS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Server helper (`src/server/index.ts`)

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: Write the helper**

```ts
import { headers } from "next/headers"
import { auth } from "../auth/index.js"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "$(cat <<'EOF'
feat: getSession() server helper

Thin wrapper around auth.api.getSession that reads Next's request
headers. Returns { user, session } | null with full type inference
from Better Auth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: First build + dist verification

**Files:** none modified; we run the build and inspect output.

- [ ] **Step 1: Build the package**

Run: `npm run build`

Expected: tsup completes; `dist/` directory created with subdirectories matching the `entry` keys.

- [ ] **Step 2: Verify dist layout matches the exports map**

Run:
```bash
find dist -name "*.js" -o -name "*.d.ts" | sort
```

Expected to include at minimum:
```
dist/auth/index.d.ts
dist/auth/index.js
dist/auth-route/index.d.ts
dist/auth-route/index.js
dist/db/index.d.ts
dist/db/index.js
dist/email/index.d.ts
dist/email/index.js
dist/pages/sign-in/index.d.ts
dist/pages/sign-in/index.js
dist/schema/index.d.ts
dist/schema/index.js
dist/server/index.d.ts
dist/server/index.js
```

If any path is missing, fix the corresponding `entry` in `tsup.config.ts` and re-build. If types files are missing entirely, ensure `dts: true` is set in tsup config.

- [ ] **Step 3: Verify the package builds compile-clean**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Verify the full unit test suite still passes**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit (build artifacts are gitignored — nothing to commit)**

This task has no commit because `dist/` is in `.gitignore`. If you find yourself wanting to commit something, double-check `.gitignore` hasn't been edited.

---

## Task 14: Example consumer scaffold (`examples/basic/`)

**Files:**
- Create: `examples/basic/package.json`
- Create: `examples/basic/tsconfig.json`
- Create: `examples/basic/next.config.mjs`
- Create: `examples/basic/.env.example`
- Create: `examples/basic/drizzle.config.ts`
- Create: `examples/basic/app/layout.tsx`
- Create: `examples/basic/app/page.tsx`
- Create: `examples/basic/app/sign-in/page.tsx`  (Shim #1)
- Create: `examples/basic/app/api/auth/[...all]/route.ts`  (Shim #2)

- [ ] **Step 1: Create `examples/basic/package.json`**

```json
{
  "name": "@naeemba/next-starter-example-basic",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@naeemba/next-starter": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "drizzle-kit": "^0.27.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `examples/basic/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowJs": true,
    "incremental": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `examples/basic/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {}

export default nextConfig
```

(Empty by design — the package ships pre-compiled JS so `transpilePackages` is not required.)

- [ ] **Step 4: Create `examples/basic/.env.example`**

```bash
# Required
DATABASE_URL=postgres://postgres:postgres@localhost:5432/starter_dev
BETTER_AUTH_SECRET=replace-with-32-plus-chars-of-random-data
BETTER_AUTH_URL=http://localhost:3000

# Optional — when unset, the dev console transport is used
RESEND_API_KEY=
EMAIL_FROM=auth@example.com
```

- [ ] **Step 5: Create `examples/basic/drizzle.config.ts`** (shim #3)

```ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./node_modules/@naeemba/next-starter/dist/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 6: Create `examples/basic/app/layout.tsx`**

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

export const metadata = { title: "Starter example" }
```

- [ ] **Step 7: Create `examples/basic/app/page.tsx`**

```tsx
import Link from "next/link"
import { getSession } from "@naeemba/next-starter/server"

export default async function HomePage() {
  const session = await getSession()
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>@naeemba/next-starter example</h1>
      {session ? (
        <p data-testid="user-email">Signed in as {session.user.email}</p>
      ) : (
        <p>
          <Link href="/sign-in">Sign in</Link>
        </p>
      )}
    </main>
  )
}
```

The `data-testid="user-email"` attribute is what the Playwright smoke test asserts against.

- [ ] **Step 8: Create `examples/basic/app/sign-in/page.tsx`** (Shim #1)

```tsx
export { default } from "@naeemba/next-starter/pages/sign-in"
```

- [ ] **Step 9: Create `examples/basic/app/api/auth/[...all]/route.ts`** (Shim #2)

```ts
export { GET, POST } from "@naeemba/next-starter/auth-route"
```

- [ ] **Step 10: Install example workspace deps**

Run: `npm install`

Expected: workspace picks up the new package; `examples/basic/node_modules/@naeemba/next-starter` is a symlink to the repo root. No errors.

- [ ] **Step 11: Typecheck the example consumer**

Run: `npm --workspace examples/basic run typecheck`

Expected: PASS. If you see "Cannot find module '@naeemba/next-starter/server'" or similar, the `dist/` build hasn't been generated — re-run `npm run build` at the repo root and try again.

- [ ] **Step 12: Commit**

```bash
git add examples/basic package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: example consumer in examples/basic

Workspace-linked Next 14 app exercising the published API: three shim
files (route handler, sign-in page, drizzle config), a root page that
renders getSession() output, and an .env.example documenting the
required + optional vars. This is the dogfood target and the host
for the upcoming Playwright smoke test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Generate and apply the first DB migration

**Prerequisite:** A reachable Postgres at the URL in your `.env`. If you don't have one, run `docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=starter_dev postgres:16` before this task.

**Files:**
- Create: `examples/basic/.env` (locally, NOT committed — `.env` is in `.gitignore`).
- Generated: `examples/basic/drizzle/0000_*.sql` (committed).

- [ ] **Step 1: Copy `.env.example` to `.env` and fill in values**

Run:
```bash
cp examples/basic/.env.example examples/basic/.env
```

Edit `examples/basic/.env`: set `BETTER_AUTH_SECRET` to a 32+ char random string (`openssl rand -hex 32` produces one). Confirm `DATABASE_URL` points at your local Postgres.

- [ ] **Step 2: Verify the package is built**

Run: `npm run build`

Expected: `dist/schema/index.js` exists. (`drizzle.config.ts` reads from there.)

- [ ] **Step 3: Generate the migration**

Run: `npm --workspace examples/basic run db:generate`

Expected: Drizzle inspects the schema and writes `examples/basic/drizzle/0000_<random-name>.sql` plus a `meta/` directory with snapshot JSON.

- [ ] **Step 4: Apply the migration**

Run: `npm --workspace examples/basic run db:migrate`

Expected: Drizzle runs the SQL against Postgres. Tables `user`, `session`, `account`, `verification` exist after this.

Sanity check: connect with `psql $DATABASE_URL -c "\\dt"` and confirm the four tables are listed.

- [ ] **Step 5: Commit the generated migration**

```bash
git add examples/basic/drizzle/
git commit -m "$(cat <<'EOF'
feat: initial Drizzle migration for the example consumer

Generated from the package schema; creates user, session, account,
and verification tables. Migrations live in the consumer's repo by
design — they are forward-only artifacts, not source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Manual verification in a browser (checkpoint)

No code changes — this is a human verification gate before automation. If any step fails, stop and debug; don't add automated tests on top of a broken flow.

- [ ] **Step 1: Start the tsup watcher** (Terminal A)

Run: `npm run dev`

Expected: tsup reports "DTS" and "ESM" build outputs, then enters watch mode.

- [ ] **Step 2: Start the example app** (Terminal B)

Run: `npm --workspace examples/basic run dev`

Expected: Next reports `Ready in <Nms>` on `http://localhost:3000`.

- [ ] **Step 3: Visit `/`**

Open `http://localhost:3000`. Expected: page renders "Sign in" link (no session).

- [ ] **Step 4: Visit `/sign-in` and submit your email**

Click the link. Fill in any email (e.g. `you@example.com`). Click "Sign in with email".

Expected: page transitions to "Check your inbox" panel.

- [ ] **Step 5: Find the magic link in Terminal B's logs**

Look for a line starting with `[magic-link-log] email=you@example.com url=http://localhost:3000/api/auth/magic-link/verify?token=...`. Copy the URL.

- [ ] **Step 6: Open the magic-link URL in the browser**

Expected: redirected to `http://localhost:3000/` (the callback URL); page now renders "Signed in as you@example.com".

- [ ] **Step 7: If anything fails, debug before continuing**

Common issues:
- "DATABASE_URL is required" → check `examples/basic/.env` exists and is loaded by Next (Next reads `.env` from the app dir).
- Page renders but submit does nothing → check browser DevTools console for fetch errors; likely the auth-route shim or the catch-all route name.
- Magic link URL doesn't show in logs → check that `RESEND_API_KEY` is empty (NOT a literal empty string with quotes — `RESEND_API_KEY=` is empty; `RESEND_API_KEY=""` is also empty). If still missing, add a `console.log("sendMagicLink called")` to `src/email/index.ts` temporarily to confirm the hook fires.

Once verified, kill both terminals and proceed.

---

## Task 17: Playwright config and smoke test

**Files:**
- Create: `examples/basic/playwright.config.ts`
- Create: `examples/basic/e2e/magic-link.spec.ts`

- [ ] **Step 1: Install the Chromium binary**

Run: `npx --workspace examples/basic playwright install --with-deps chromium`

Expected: Playwright downloads Chromium. (First-time; subsequent runs are cached.)

- [ ] **Step 2: Create `examples/basic/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
})
```

- [ ] **Step 3: Create the smoke test**

Write `examples/basic/e2e/magic-link.spec.ts`:
```ts
import { test, expect } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

let server: ChildProcess
const logBuf: string[] = []

test.beforeAll(async () => {
  server = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    env: { ...process.env, RESEND_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout!.on("data", (b) => logBuf.push(b.toString()))
  server.stderr!.on("data", (b) => logBuf.push(b.toString()))

  const ready = Date.now() + 60_000
  while (Date.now() < ready) {
    if (logBuf.some((l) => l.includes("Ready in") || l.includes("started server"))) return
    await sleep(500)
  }
  throw new Error("Next dev server did not become ready within 60s")
})

test.afterAll(async () => {
  if (!server) return
  server.kill()
  await new Promise<void>((r) => server.on("exit", () => r()))
})

async function findMagicLink(email: string): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const haystack = logBuf.join("\n")
    const re = new RegExp(
      `\\[magic-link-log\\] email=${email.replace(/[.+*?^$()[\]{}|\\]/g, "\\$&")} url=(https?:\\/\\/\\S+)`
    )
    const m = haystack.match(re)
    if (m && m[1]) return m[1]
    await sleep(250)
  }
  throw new Error(`Magic link for ${email} not found in server logs within 15s`)
}

test("magic-link sign-in works end to end", async ({ page }) => {
  const email = `test+${Date.now()}@example.com`

  await page.goto("/sign-in")
  await page.getByLabel(/email/i).fill(email)
  await page.getByRole("button", { name: /sign in/i }).click()

  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible({
    timeout: 10_000,
  })

  const magicUrl = await findMagicLink(email)

  await page.goto(magicUrl)
  await expect(page).toHaveURL("http://localhost:3000/")
  await expect(page.getByTestId("user-email")).toHaveText(new RegExp(email.replace(/[.+]/g, "\\$&")))
})
```

- [ ] **Step 4: Make sure Postgres is reachable and the DB is migrated**

Run: `psql $DATABASE_URL -c "\\dt"` (with `DATABASE_URL` exported, or open a fresh shell with `examples/basic/.env` loaded).

Expected: shows `user`, `session`, `account`, `verification` tables.

- [ ] **Step 5: Make sure the package is freshly built**

Run: `npm run build`

Expected: `dist/` regenerated. The example app imports from there.

- [ ] **Step 6: Truncate auth tables for a clean test slate**

Run: `psql $DATABASE_URL -c "TRUNCATE TABLE verification, session, account, \"user\" RESTART IDENTITY CASCADE;"`

Expected: no errors.

- [ ] **Step 7: Run the smoke test**

Run: `npm --workspace examples/basic run test:e2e`

Expected: 1 passed (1 total). Total runtime under 60s including server boot.

- [ ] **Step 8: Commit**

```bash
git add examples/basic/playwright.config.ts examples/basic/e2e package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: Playwright smoke test for the magic-link sign-in flow

One test exercises build, exports, Next routing, Better Auth wiring,
Drizzle adapter, console transport, magic-link verification, session
cookies, and server-side getSession() — by spawning the example app's
dev server with RESEND_API_KEY='' and scraping the dev-mode contract
line to retrieve the magic link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Write `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: starter_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=5s
          --health-timeout=5s
          --health-retries=10

    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/starter_test
      BETTER_AUTH_SECRET: ci-secret-must-be-thirty-two-chars-or-more
      BETTER_AUTH_URL: http://localhost:3000
      RESEND_API_KEY: ""
      EMAIL_FROM: auth@example.com

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install
        run: npm ci

      - name: Typecheck (package)
        run: npm run typecheck

      - name: Test (package)
        run: npm test

      - name: Build (package)
        run: npm run build

      - name: Typecheck (example)
        run: npm --workspace examples/basic run typecheck

      - name: Apply migrations
        run: npm --workspace examples/basic run db:migrate

      - name: Install Playwright browser
        run: npx --workspace examples/basic playwright install --with-deps chromium

      - name: E2E smoke test
        run: npm --workspace examples/basic run test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: typecheck, build, migrate, and run smoke test on every PR

GitHub Actions workflow with a Postgres 16 service container. Three
gates: package typechecks + tests, package builds, example consumer
typechecks + migrates + runs the Playwright smoke. RESEND_API_KEY is
explicitly empty so the console transport is exercised — matching
the local dev flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Rewrite `README.md` for consumers

The current `README.md` (still in the working tree from Task 0's commit) is the design discussion. The design discussion lives in `docs/superpowers/specs/2026-06-10-next-typescript-starter-foundation-design.md`. The published package needs a consumer-facing README.

**Files:**
- Overwrite: `README.md`

- [ ] **Step 1: Write the consumer README**

```markdown
# @naeemba/next-starter

Opinionated Next.js + Drizzle + Better Auth starter, shipped as a **versioned npm package** instead of a clone-and-fork template. Add it as a dependency, set env vars, create three shim files, and you have working magic-link email sign-in. Bump the package version to pull in fixes.

## Install

```bash
npm install @naeemba/next-starter
```

Peer dependencies: `next >= 14`, `react >= 18`, `react-dom >= 18`.

## Env vars

```bash
DATABASE_URL=postgres://user:pass@host:5432/db
BETTER_AUTH_SECRET=<32+ char random string>   # openssl rand -hex 32
BETTER_AUTH_URL=https://app.example.com
EMAIL_FROM=auth@example.com                    # optional in dev, required for Resend in prod
RESEND_API_KEY=...                             # optional — when unset, magic links log to stdout
```

## Three shim files in your app

```ts
// app/api/auth/[...all]/route.ts
export { GET, POST } from "@naeemba/next-starter/auth-route"
```

```tsx
// app/sign-in/page.tsx
export { default } from "@naeemba/next-starter/pages/sign-in"
```

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit"
export default defineConfig({
  schema: "./node_modules/@naeemba/next-starter/dist/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

## First-time setup

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

That creates the `user`, `session`, `account`, and `verification` tables. Re-run after a package update that changes the schema (release notes will say so).

## Reading the session in a Server Component

```tsx
import { getSession } from "@naeemba/next-starter/server"

export default async function Page() {
  const session = await getSession()
  if (!session) return <a href="/sign-in">Sign in</a>
  return <p>Hello, {session.user.email}</p>
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
| `@naeemba/next-starter/auth` | Configured Better Auth instance |
| `@naeemba/next-starter/auth-route` | `GET`, `POST` for `/api/auth/[...all]` |
| `@naeemba/next-starter/schema` | Drizzle table definitions |
| `@naeemba/next-starter/db` | Lazy Drizzle client |
| `@naeemba/next-starter/email` | `sendMagicLink({ to, url })` |
| `@naeemba/next-starter/pages/sign-in` | Default-exported sign-in page component |
| `@naeemba/next-starter/server` | `getSession()` |

## Design and rationale

See `docs/superpowers/specs/` in the repo for the full v0.1 foundation design — why a package and not a template, the re-export shim pattern, what's deferred to future versions, and the implementation plan.

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: rewrite README for consumer-facing usage

Replaces the design discussion (preserved in docs/superpowers/specs/)
with the install / setup / shim / TS-config story consumers need. The
package's published README is what shows on the npm listing page, so
this is the user-facing surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Publish dry-run (no actual publish)

Final guardrail before the first real `npm publish`. This task does **not** publish; it inspects what would ship.

**Files:** none.

- [ ] **Step 1: Run a publish dry-run**

Run: `npm publish --dry-run --access public`

Expected output includes a `Tarball Contents` section. Verify the listing contains:
- `dist/` (all the JS + `.d.ts` files for every subpath)
- `package.json`
- `README.md`

And does NOT contain:
- `src/`, `tests/`, `examples/`, `docs/`
- `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`
- `.github/`, `node_modules/`, `package-lock.json`

If anything unexpected is in the tarball, audit the `files` field in `package.json` and the `.gitignore`/`.npmignore` setup. The `files` allowlist should be authoritative.

- [ ] **Step 2: Inspect declared exports vs. emitted dist**

Run:
```bash
node -e "import('./package.json', { assert: { type: 'json' } }).then(({default: p}) => Object.entries(p.exports).forEach(([k, v]) => console.log(k.padEnd(20), v.default)))"
```

Expected: each subpath prints with a `./dist/...` target. Run `ls -la` on each target to confirm the file exists.

- [ ] **Step 3: No commit (dry-run only)**

Nothing to commit. Plan complete.

---

## Verification checklist (run before declaring v0.1 done)

- [ ] `npm run typecheck` passes at repo root
- [ ] `npm test` passes (Vitest unit suite)
- [ ] `npm run build` produces every subpath in `dist/`
- [ ] `npm --workspace examples/basic run typecheck` passes
- [ ] `npm --workspace examples/basic run test:e2e` passes (Playwright smoke)
- [ ] CI workflow passes on a clean PR
- [ ] `npm publish --dry-run` ships only `dist/`, `package.json`, `README.md`
- [ ] Manual browser sign-in flow works against a local Postgres
- [ ] README.md describes the install, env vars, three shim files, and TypeScript `moduleResolution` requirement
- [ ] Spec doc remains in `docs/superpowers/specs/` (unchanged)

When all boxes are checked, v0.1 is ready to `npm publish` (separate manual step — outside this plan's scope).

---

## What this plan deliberately does NOT do (matches spec §1 and §12)

- No UI component library beyond the sign-in page.
- No customization API (render props, config overrides, eject CLI).
- No init CLI (`npx @naeemba/next-starter init`).
- No email+password, OAuth, sign-up page, or separate verify-email page.
- No Changesets / versioning policy docs.
- No SQLite / MySQL support.
- No pluggable email transports beyond Resend + console.
- No actual `npm publish` — first publish is a separate manual decision.

Each of these is a candidate for its own brainstorm → spec → plan cycle in a future session.
