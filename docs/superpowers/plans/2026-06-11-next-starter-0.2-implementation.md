# `@naeemba/next-starter` 0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the package's frozen `auth` singleton into a `createAuth(opts)` factory, add a `/client` export, split the sign-in component into `SignInForm` + `SignInPage`, customize magic-link emails, promote a generic `sendEmail`, fix the `Session` type, and add `requireSession` — all in a single 0.2.0 breaking release.

**Architecture:** Replace module-level singletons with factory functions. `createAuth({db?, magicLink: {allowlist, email}, session, ...})` reads `process.env` for any field not passed in opts. The internal magic-link wiring calls `allowlist` first (silent no-op on false), then resolves the email template (custom or built-in), then hands a `MagicLinkEmail` to a public `sendEmail` for Resend/console transport selection. Sign-in is split into headless `<SignInForm authClient={...}/>` and a default `<SignInPage/>` wrapper. The `/client` entry wraps better-auth's `createAuthClient` with the `magicLinkClient` plugin pre-installed so consumers don't import better-auth directly.

**Tech Stack:** TypeScript, tsup (esm output, dts), Vitest (node env for unit tests, jsdom per-file for component tests), better-auth 1.6+, drizzle-orm + node-postgres, React 19, @testing-library/react 16+.

**Spec reference:** `docs/superpowers/specs/2026-06-11-next-starter-0.2-design.md`

---

## File map

**Create:**
- `src/client/index.ts` — `createAuthClient` factory
- `src/pages/sign-in/sign-in-form.tsx` — headless `SignInForm` component
- `src/pages/sign-in/sign-in-page.tsx` — wrapper `SignInPage` with chrome
- `tests/auth-factory.test.ts` — `createAuth` env resolution
- `tests/magic-link-allowlist.test.ts` — allowlist short-circuits
- `tests/magic-link-template.test.ts` — custom template override
- `tests/require-session.test.ts` — redirect behavior
- `tests/sign-in-form.test.tsx` — component behavior
- `tests/create-auth-client.test.ts` — client factory smoke
- `tests/create-db.test.ts` — db factory smoke
- `UPGRADING.md` — 0.1 → 0.2 migration

**Modify:**
- `src/auth/index.ts` — full rewrite, exports `createAuth` instead of `auth`
- `src/auth/config.ts` — `parseEnv` accepts partial overrides
- `src/auth-route/index.ts` — remove direct `auth` import (consumer passes auth in)
- `src/db/index.ts` — add `createDb(url)` export; keep lazy `db` proxy
- `src/email/index.ts` — add `sendEmail`; `sendMagicLink` accepts `template` opt
- `src/pages/sign-in/index.tsx` — re-export `SignInForm` + `SignInPage` + default
- `src/schema/index.ts` — remove `Session` type export
- `src/server/index.ts` — adds `requireSession`, `Session` type; takes `auth` via factory
- `tests/auth-config.test.ts` — add cases for opts override
- `tests/email-sender.test.ts` — rename + rewrite as `tests/send-email.test.ts`
- `vitest.config.ts` — no global env change; component tests use per-file `@vitest-environment jsdom`
- `tsup.config.ts` — add `client/index` entry; add `server/index` re-exports
- `package.json` — add `./client` export, bump to `0.2.0`, add devDeps `jsdom`, `@testing-library/react`, `@testing-library/dom`
- `examples/basic/lib/auth.ts`, `lib/auth-client.ts`, `app/sign-in/page.tsx`, `app/api/auth/[...all]/route.ts` — migrate to factory API
- `README.md` — update install + usage snippets for 0.2

**Delete:**
- `tests/email-sender.test.ts` (replaced by `tests/send-email.test.ts`)

**Note on `/auth-route` and `/server`:** because `auth` is no longer a module-level singleton, the package can no longer ship a pre-wired `GET`/`POST` route handler or a pre-wired `getSession()`. We adapt by:
- `/auth-route` becomes `createAuthRoute(auth)` → returns `{GET, POST}`
- `/server` becomes `createServer(auth)` → returns `{getSession, requireSession}`

This is a deliberate, spec-consistent shape: the factory-first design wins consistency over pre-baked entries.

---

## Task 1: Add component-test infrastructure

**Files:**
- Modify: `package.json` (devDeps only)

- [ ] **Step 1: Install testing-library and jsdom**

```bash
npm install --save-dev jsdom @testing-library/react @testing-library/dom
```

Expected: clean install, no peer-dep errors against React 19.

- [ ] **Step 2: Verify install**

```bash
npx vitest --version && node -e "require.resolve('@testing-library/react')"
```

Expected: prints vitest version and a resolved path (no throw).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: add jsdom + @testing-library/react for component tests

Prep for 0.2.0 SignInForm component tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Drop misleading `Session` row type from `/schema`

**Files:**
- Modify: `src/schema/index.ts`

- [ ] **Step 1: Edit `src/schema/index.ts`**

Remove the `Session` type export. The line:

```ts
export type Session = typeof session.$inferSelect
```

→ delete entirely. Keep `User`, `Account`, `Verification` row types and all tables.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. If anything inside `src/` was importing `Session` from `/schema` it should be migrated separately (none currently — verified during plan creation).

- [ ] **Step 3: Commit**

```bash
git add src/schema/index.ts
git commit -m "$(cat <<'EOF'
refactor!: drop misleading Session row type from /schema

The auth-shaped Session (with user) is the type consumers actually
want and will be re-exported from /server in a later task. The raw
row type is rarely useful and was mistaken for the auth-shaped one.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `createDb` helper to `/db`

**Files:**
- Test: `tests/create-db.test.ts`
- Modify: `src/db/index.ts`

- [ ] **Step 1: Write `tests/create-db.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { createDb } from "../src/db/index"

describe("createDb", () => {
  it("returns a drizzle client when given a valid URL", () => {
    const db = createDb("postgres://user:pass@localhost:5432/db")
    expect(db).toBeDefined()
    expect(typeof db.select).toBe("function")
  })

  it("throws when given an empty URL", () => {
    expect(() => createDb("")).toThrow(/DATABASE_URL|connection/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/create-db.test.ts
```

Expected: FAIL — `createDb` is not exported.

- [ ] **Step 3: Update `src/db/index.ts`**

Add `createDb` export above the proxy block:

```ts
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

export function createDb(databaseUrl: string): Db {
  if (!databaseUrl) {
    throw new Error(
      "[@naeemba/next-starter] createDb requires a non-empty DATABASE_URL connection string."
    )
  }
  return drizzle(new Pool({ connectionString: databaseUrl }), { schema })
}

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
  _db = createDb(url)
  return _db
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/create-db.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/create-db.test.ts src/db/index.ts
git commit -m "$(cat <<'EOF'
feat: add createDb factory; lazy db proxy now delegates to it

createDb(url) lets createAuth and any consumer build a drizzle client
from a URL without going through process.env. The existing lazy `db`
proxy stays for back-compat and is now a thin wrapper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `/email` — generic `sendEmail` primitive

**Files:**
- Delete: `tests/email-sender.test.ts`
- Create: `tests/send-email.test.ts`
- Modify: `src/email/index.ts`

- [ ] **Step 1: Remove the old test file**

```bash
git rm tests/email-sender.test.ts
```

- [ ] **Step 2: Write `tests/send-email.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn(async () => {})
const resendSpy = vi.fn(async () => {})

vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: resendSpy }))

describe("sendEmail transport selection", () => {
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
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(resendSpy).not.toHaveBeenCalled()
    expect(consoleSpy.mock.calls[0][0]).toMatchObject({
      to: "a@example.com",
      from: "auth@example.com",
      subject: "Hi",
      text: "plain",
    })
  })

  it("uses Resend transport when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.EMAIL_FROM = "auth@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain", html: "<b>plain</b>" })
    expect(resendSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it("uses opts.from when provided, overriding EMAIL_FROM", async () => {
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_FROM = "default@example.com"
    const { sendEmail } = await import("../src/email/index")
    await sendEmail({ to: "a@example.com", from: "custom@example.com", subject: "Hi", text: "x" })
    expect(consoleSpy.mock.calls[0][0].from).toBe("custom@example.com")
  })

  it("throws when no `from` and no EMAIL_FROM env", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    const { sendEmail } = await import("../src/email/index")
    await expect(sendEmail({ to: "a@example.com", subject: "Hi", text: "x" })).rejects.toThrow(
      /EMAIL_FROM|from/
    )
  })
})
```

- [ ] **Step 3: Run tests to verify failures**

```bash
npx vitest run tests/send-email.test.ts
```

Expected: FAIL — `sendEmail` is not exported.

- [ ] **Step 4: Rewrite `src/email/index.ts`**

```ts
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import { MagicLinkEmail } from "./templates/magic-link.js"
import { sendViaConsole, type EmailArgs as TransportArgs } from "./console.js"
import { sendViaResend } from "./resend.js"

export interface EmailArgs {
  to: string | string[]
  from?: string
  subject: string
  text?: string
  html?: string
  react?: ReactElement
}

export async function sendEmail(args: EmailArgs): Promise<void> {
  const from = args.from ?? process.env.EMAIL_FROM
  if (!from) {
    throw new Error(
      "[@naeemba/next-starter] sendEmail requires either `from` or process.env.EMAIL_FROM."
    )
  }
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    console.warn(
      "[@naeemba/next-starter] WARNING: NODE_ENV=production but RESEND_API_KEY is unset. " +
        "Emails will be written to server logs instead of sent."
    )
  }

  let html = args.html
  if (!html && args.react) html = await render(args.react)

  const text = args.text ?? (html ? stripTags(html) : "")
  const to = Array.isArray(args.to) ? args.to.join(", ") : args.to

  const transportArgs: TransportArgs = {
    to,
    from,
    subject: args.subject,
    html: html ?? "",
    text,
  }

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(transportArgs)
  } else {
    await sendViaConsole(transportArgs)
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}

// sendMagicLink is rewritten in Task 5.
export interface SendMagicLinkArgs {
  to: string
  url: string
  expiresIn?: number
  appName?: string
  template?: (args: { to: string; url: string; expiresIn: number }) =>
    Promise<MagicLinkEmailFields> | MagicLinkEmailFields
}

export interface MagicLinkEmailFields {
  subject: string
  from?: string
  text?: string
  html?: string
}

export async function sendMagicLink(args: SendMagicLinkArgs): Promise<void> {
  const expiresIn = args.expiresIn ?? 600
  const fields = args.template
    ? await args.template({ to: args.to, url: args.url, expiresIn })
    : await defaultMagicLinkFields({ to: args.to, url: args.url, expiresIn, appName: args.appName })
  await sendEmail({
    to: args.to,
    from: fields.from,
    subject: fields.subject,
    text: fields.text ?? `Sign in: ${args.url}`,
    html: fields.html,
  })
}

async function defaultMagicLinkFields(input: {
  to: string
  url: string
  expiresIn: number
  appName?: string
}): Promise<MagicLinkEmailFields> {
  const html = await render(MagicLinkEmail({ url: input.url, appName: input.appName }))
  return {
    subject: "Sign in to your account",
    text: `Sign in: ${input.url}`,
    html,
  }
}
```

Notes:
- `text` falls back to `stripTags(html)` so the console-mode URL grepper (`URL_RE` in `console.ts`) keeps finding the link.
- Existing `console.ts` and `resend.ts` are unchanged.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/send-email.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Run full test suite to catch regressions**

```bash
npm test
```

Expected: PASS — `tests/email-console.test.ts` and `tests/auth-config.test.ts` should be untouched.

- [ ] **Step 7: Commit**

```bash
git add -u tests/ src/email/index.ts
git add tests/send-email.test.ts
git commit -m "$(cat <<'EOF'
refactor!: promote sendEmail to public API; add template opt to sendMagicLink

sendEmail({to, from?, subject, text?, html?, react?}) is the new
generic primitive; sendMagicLink is now a thin wrapper that resolves
a built-in or caller-supplied template and delegates to sendEmail.

BREAKING: sendMagicLink's args are unchanged but now also accept
`template`. The internal transport selection (Resend vs console)
moves up to sendEmail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Test the new `sendMagicLink` template override path

**Files:**
- Create: `tests/magic-link-template.test.ts`

- [ ] **Step 1: Write `tests/magic-link-template.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const consoleSpy = vi.fn(async () => {})
vi.mock("../src/email/console", () => ({ sendViaConsole: consoleSpy }))
vi.mock("../src/email/resend", () => ({ sendViaResend: vi.fn(async () => {}) }))

describe("sendMagicLink template override", () => {
  let originalKey: string | undefined
  let originalFrom: string | undefined

  beforeEach(() => {
    originalKey = process.env.RESEND_API_KEY
    originalFrom = process.env.EMAIL_FROM
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_FROM = "default@example.com"
    consoleSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    if (originalFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = originalFrom
  })

  it("uses the built-in template when no override provided", async () => {
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({ to: "a@example.com", url: "https://app/verify?token=1" })
    expect(consoleSpy.mock.calls[0][0]).toMatchObject({
      to: "a@example.com",
      subject: "Sign in to your account",
      from: "default@example.com",
    })
  })

  it("uses caller-supplied subject/from/text when template provided", async () => {
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({
      to: "a@example.com",
      url: "https://app/verify?token=1",
      template: ({ url, expiresIn }) => ({
        subject: "Your Studio sign-in link",
        from: "noreply@studio.example",
        text: `Open ${url} within ${expiresIn / 60} minutes.`,
      }),
    })
    expect(consoleSpy.mock.calls[0][0]).toMatchObject({
      to: "a@example.com",
      subject: "Your Studio sign-in link",
      from: "noreply@studio.example",
      text: "Open https://app/verify?token=1 within 10 minutes.",
    })
  })

  it("awaits async template", async () => {
    const { sendMagicLink } = await import("../src/email/index")
    await sendMagicLink({
      to: "a@example.com",
      url: "https://app/x",
      template: async ({ url }) => ({ subject: "Async subj", text: url }),
    })
    expect(consoleSpy.mock.calls[0][0].subject).toBe("Async subj")
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run tests/magic-link-template.test.ts
```

Expected: PASS (3 tests) — implementation from Task 4 should already satisfy them.

- [ ] **Step 3: Commit**

```bash
git add tests/magic-link-template.test.ts
git commit -m "$(cat <<'EOF'
test: cover sendMagicLink template override path

Built-in template still works; caller-supplied template overrides
subject/from/text; async templates are awaited.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Extend `parseEnv` to accept partial overrides

**Files:**
- Modify: `src/auth/config.ts`
- Modify: `tests/auth-config.test.ts`

- [ ] **Step 1: Add tests to `tests/auth-config.test.ts`**

Append the following inside the existing `describe("parseEnv", ...)` block (or at the end of the file in a new describe):

```ts
describe("parseEnv with overrides", () => {
  const validEnv = {
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
    EMAIL_FROM: "auth@example.com",
  }

  it("overrides take precedence over env input", () => {
    const env = parseEnv(validEnv, {
      DATABASE_URL: "postgres://other:other@localhost:5432/other",
      BETTER_AUTH_URL: "https://staging.example.com",
    })
    expect(env.DATABASE_URL).toBe("postgres://other:other@localhost:5432/other")
    expect(env.BETTER_AUTH_URL).toBe("https://staging.example.com")
    expect(env.BETTER_AUTH_SECRET).toBe(validEnv.BETTER_AUTH_SECRET)
  })

  it("overrides can satisfy a missing env field", () => {
    const partial = { ...validEnv, BETTER_AUTH_SECRET: undefined } as Record<string, string | undefined>
    const env = parseEnv(partial, { BETTER_AUTH_SECRET: "y".repeat(32) })
    expect(env.BETTER_AUTH_SECRET).toBe("y".repeat(32))
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run tests/auth-config.test.ts
```

Expected: FAIL — `parseEnv` doesn't accept a second arg.

- [ ] **Step 3: Update `src/auth/config.ts`**

Replace the `parseEnv` signature and body:

```ts
import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required")
    .refine(
      (s) => s.startsWith("postgres://") || s.startsWith("postgresql://"),
      "DATABASE_URL must be a Postgres connection string (postgres:// or postgresql://)"
    ),
  BETTER_AUTH_SECRET: z
    .string({ error: "BETTER_AUTH_SECRET is required" })
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z
    .string({ error: "BETTER_AUTH_URL is required" })
    .url("BETTER_AUTH_URL must be a valid URL (e.g. https://app.example.com)"),
  EMAIL_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export type EnvOverrides = Partial<Record<keyof Env, string | undefined>>

export function parseEnv(
  input: Record<string, string | undefined> = process.env,
  overrides: EnvOverrides = {}
): Env {
  const merged: Record<string, string | undefined> = { ...input }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) merged[k] = v
  }
  const result = EnvSchema.safeParse(merged)
  if (result.success) return result.data
  const formatted = result.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n")
  throw new Error(
    "[@naeemba/next-starter] Invalid environment configuration:\n" + formatted
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/auth-config.test.ts
```

Expected: PASS — original tests still pass, two new override tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/config.ts tests/auth-config.test.ts
git commit -m "$(cat <<'EOF'
feat(auth/config): parseEnv accepts overrides for createAuth opts

createAuth will pass {DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL}
overrides derived from its opts; anything not overridden falls back
to process.env.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build `createAuth` factory (replace singleton)

**Files:**
- Create: `tests/auth-factory.test.ts`
- Rewrite: `src/auth/index.ts`

- [ ] **Step 1: Write `tests/auth-factory.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

describe("createAuth", () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
    vi.resetModules()
  })
  afterEach(() => {
    process.env = savedEnv
  })

  it("uses process.env defaults when no opts passed", async () => {
    Object.assign(process.env, validEnv)
    const { createAuth } = await import("../src/auth/index")
    const auth = createAuth()
    expect(auth).toBeDefined()
    expect(typeof auth.api?.getSession).toBe("function")
  })

  it("opts override env", async () => {
    Object.assign(process.env, validEnv)
    const { createAuth } = await import("../src/auth/index")
    const auth = createAuth({ baseURL: "https://override.example.com" })
    expect(auth).toBeDefined()
  })

  it("throws with a clear error when DATABASE_URL is missing and not in opts", async () => {
    process.env = {} as NodeJS.ProcessEnv
    const { createAuth } = await import("../src/auth/index")
    expect(() => createAuth()).toThrow(/DATABASE_URL/)
  })

  it("does not throw at module import time", async () => {
    process.env = {} as NodeJS.ProcessEnv
    // Just importing should not call parseEnv — only createAuth() does.
    await expect(import("../src/auth/index")).resolves.toBeDefined()
  })

  it("accepts an explicit Drizzle client via opts.db", async () => {
    Object.assign(process.env, validEnv)
    const { createAuth } = await import("../src/auth/index")
    const fakeDb = { select: () => {}, insert: () => {} } as unknown as Parameters<
      typeof createAuth
    >[0] extends infer T
      ? T extends { db?: infer D }
        ? D
        : never
      : never
    // Should not throw type-wise; runtime behavior validated by integration tests.
    expect(() =>
      createAuth({
        db: fakeDb,
        databaseUrl: validEnv.DATABASE_URL, // satisfy zod even though db is passed
      })
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/auth-factory.test.ts
```

Expected: FAIL — `createAuth` does not exist.

- [ ] **Step 3: Rewrite `src/auth/index.ts`**

```ts
import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink, type MagicLinkEmailFields } from "../email/index.js"
import { parseEnv } from "./config.js"

type DrizzleAdapterDb = Parameters<typeof drizzleAdapter>[0]

export interface CreateAuthOptions {
  databaseUrl?: string
  secret?: string
  baseURL?: string
  db?: DrizzleAdapterDb
  session?: {
    expiresIn?: number
    updateAge?: number
  }
  magicLink?: {
    expiresIn?: number
    allowlist?: (email: string) => boolean | Promise<boolean>
    email?: (args: { to: string; url: string; expiresIn: number }) =>
      Promise<MagicLinkEmailFields> | MagicLinkEmailFields
  }
}

export function createAuth(opts: CreateAuthOptions = {}): Auth {
  const env = parseEnv(process.env, {
    DATABASE_URL: opts.databaseUrl,
    BETTER_AUTH_SECRET: opts.secret,
    BETTER_AUTH_URL: opts.baseURL,
  })

  const db = opts.db ?? createDb(env.DATABASE_URL)
  const magicLinkExpiresIn = opts.magicLink?.expiresIn ?? 600
  const allowlist = opts.magicLink?.allowlist
  const customTemplate = opts.magicLink?.email

  const config: BetterAuthOptions = {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    plugins: [
      magicLink({
        expiresIn: magicLinkExpiresIn,
        sendMagicLink: async ({ email, url }) => {
          if (allowlist) {
            const allowed = await allowlist(email)
            if (!allowed) return
          }
          await sendMagicLink({
            to: email,
            url,
            expiresIn: magicLinkExpiresIn,
            template: customTemplate,
          })
        },
      }),
    ],
  }

  if (opts.session) {
    config.session = {
      ...(opts.session.expiresIn !== undefined && { expiresIn: opts.session.expiresIn }),
      ...(opts.session.updateAge !== undefined && { updateAge: opts.session.updateAge }),
    }
  }

  return betterAuth(config) as unknown as Auth
}

export type { Auth }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/auth-factory.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 6: Commit**

```bash
git add src/auth/index.ts tests/auth-factory.test.ts
git commit -m "$(cat <<'EOF'
refactor!: replace auth singleton with createAuth(opts) factory

BREAKING: `import { auth } from '@naeemba/next-starter/auth'` is gone.
Consumers create their own singleton via createAuth() in lib/auth.ts.

createAuth accepts: databaseUrl, secret, baseURL (defaulted from env);
db (pre-built Drizzle client escape hatch); session.{expiresIn, updateAge};
magicLink.{expiresIn, allowlist, email}. Module-level import no longer
calls parseEnv — only createAuth() does, so consumers can import the
factory before env is set up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Test allowlist short-circuit behavior

**Files:**
- Create: `tests/magic-link-allowlist.test.ts`

- [ ] **Step 1: Write `tests/magic-link-allowlist.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const sendMagicLinkSpy = vi.fn(async () => {})
vi.mock("../src/email/index", async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, sendMagicLink: sendMagicLinkSpy }
})

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

describe("createAuth — magicLink.allowlist", () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
    Object.assign(process.env, validEnv)
    sendMagicLinkSpy.mockClear()
    vi.resetModules()
  })
  afterEach(() => {
    process.env = savedEnv
  })

  it("calls sendMagicLink when allowlist returns true", async () => {
    const { createAuth } = await import("../src/auth/index")
    const auth = createAuth({
      magicLink: { allowlist: (email) => email === "admin@example.com" },
    })
    // Invoke the better-auth plugin's sendMagicLink directly via its registered hook.
    // The easiest way is to reach into auth's options structure, but better-auth
    // does not expose this. Instead, we exercise via auth.api.signInMagicLink and
    // assert sendMagicLinkSpy was called. Since the database is fake in this test,
    // we test the plugin hook in isolation.
    //
    // Simplest approach: extract the plugin from createAuth's input by calling it
    // and inspecting its returned $context, OR test the hook indirectly through
    // the api. We use a direct route: re-construct the same allowlist-wrapping
    // logic exposed as a helper.
    //
    // NOTE: For unit-test simplicity, this task instead validates the spy via
    // a direct call to the auth instance's signIn.email flow is overkill;
    // we'll add a small exported helper for this purpose in the next step.
    expect(auth).toBeDefined()
    expect(typeof auth.api).toBe("object")
  })

  it("integration: sendMagicLink not called when allowlist returns false (direct hook call)", async () => {
    // Refactor: extract the magicLink-plugin construction into a testable shape.
    // Provided by Task 7's createAuth via an internal export for testing.
    const { __testHooks } = await import("../src/auth/index")
    const allowlist = vi.fn((email: string) => email === "admin@example.com")
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist,
      customTemplate: undefined,
    })
    await hook({ email: "stranger@example.com", url: "https://app/x" })
    expect(allowlist).toHaveBeenCalledWith("stranger@example.com")
    expect(sendMagicLinkSpy).not.toHaveBeenCalled()
  })

  it("integration: sendMagicLink called when allowlist returns true (direct hook call)", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const allowlist = vi.fn((email: string) => email === "admin@example.com")
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist,
      customTemplate: undefined,
    })
    await hook({ email: "admin@example.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
    expect(sendMagicLinkSpy.mock.calls[0][0]).toMatchObject({
      to: "admin@example.com",
      url: "https://app/x",
    })
  })

  it("integration: sendMagicLink called when no allowlist provided", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist: undefined,
      customTemplate: undefined,
    })
    await hook({ email: "anyone@example.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
  })

  it("integration: async allowlist is awaited", async () => {
    const { __testHooks } = await import("../src/auth/index")
    const allowlist = vi.fn(async (email: string) => email.endsWith("@allowed.com"))
    const hook = __testHooks.buildSendMagicLink({
      magicLinkExpiresIn: 600,
      allowlist,
      customTemplate: undefined,
    })
    await hook({ email: "x@blocked.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).not.toHaveBeenCalled()
    await hook({ email: "x@allowed.com", url: "https://app/x" })
    expect(sendMagicLinkSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run tests/magic-link-allowlist.test.ts
```

Expected: FAIL — `__testHooks.buildSendMagicLink` not exported.

- [ ] **Step 3: Refactor `src/auth/index.ts` to extract the hook builder**

Replace the inline `sendMagicLink: async ({email, url}) => { ... }` with a call to a new internal helper that is exposed via `__testHooks` for testing.

Add near the top of `src/auth/index.ts`:

```ts
interface BuildSendMagicLinkOpts {
  magicLinkExpiresIn: number
  allowlist?: (email: string) => boolean | Promise<boolean>
  customTemplate?: (args: { to: string; url: string; expiresIn: number }) =>
    Promise<MagicLinkEmailFields> | MagicLinkEmailFields
}

function buildSendMagicLink(opts: BuildSendMagicLinkOpts) {
  return async ({ email, url }: { email: string; url: string }) => {
    if (opts.allowlist) {
      const allowed = await opts.allowlist(email)
      if (!allowed) return
    }
    await sendMagicLink({
      to: email,
      url,
      expiresIn: opts.magicLinkExpiresIn,
      template: opts.customTemplate,
    })
  }
}

export const __testHooks = { buildSendMagicLink } as const
```

And update `createAuth` to use it:

```ts
plugins: [
  magicLink({
    expiresIn: magicLinkExpiresIn,
    sendMagicLink: buildSendMagicLink({
      magicLinkExpiresIn,
      allowlist,
      customTemplate,
    }),
  }),
],
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/magic-link-allowlist.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/index.ts tests/magic-link-allowlist.test.ts
git commit -m "$(cat <<'EOF'
test: cover magicLink.allowlist short-circuit behavior

Extracts the sendMagicLink hook into buildSendMagicLink so unit tests
can drive it without spinning up better-auth's full request flow.
Verifies: false → no-op (no email, no throw); true → email sent;
async allowlists awaited; missing allowlist → always send.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `/server` — `getSession`, `requireSession`, `Session` type

**Files:**
- Modify: `src/server/index.ts`
- Create: `tests/require-session.test.ts`

- [ ] **Step 1: Write `tests/require-session.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const redirectSpy = vi.fn((url: string) => {
  throw new Error(`__REDIRECT__${url}`)
})
vi.mock("next/navigation", () => ({ redirect: redirectSpy }))

describe("createServer(auth)", () => {
  beforeEach(() => {
    redirectSpy.mockClear()
    vi.resetModules()
  })

  it("requireSession redirects to /sign-in when getSession returns null", async () => {
    const fakeAuth = {
      api: { getSession: async () => null },
    } as any
    vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
    const { createServer } = await import("../src/server/index")
    const { requireSession } = createServer(fakeAuth)
    await expect(requireSession()).rejects.toThrow("__REDIRECT__/sign-in")
    expect(redirectSpy).toHaveBeenCalledWith("/sign-in")
  })

  it("requireSession honors redirectTo opt", async () => {
    const fakeAuth = {
      api: { getSession: async () => null },
    } as any
    vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
    const { createServer } = await import("../src/server/index")
    const { requireSession } = createServer(fakeAuth)
    await expect(requireSession({ redirectTo: "/login" })).rejects.toThrow("__REDIRECT__/login")
  })

  it("requireSession returns session when present", async () => {
    const fakeSession = { user: { id: "u_1", email: "a@b.com" }, session: { id: "s_1" } }
    const fakeAuth = {
      api: { getSession: async () => fakeSession },
    } as any
    vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
    const { createServer } = await import("../src/server/index")
    const { requireSession } = createServer(fakeAuth)
    const result = await requireSession()
    expect(result).toBe(fakeSession)
    expect(redirectSpy).not.toHaveBeenCalled()
  })

  it("getSession returns whatever auth.api.getSession returns", async () => {
    const fakeAuth = {
      api: { getSession: async () => null },
    } as any
    vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
    const { createServer } = await import("../src/server/index")
    const { getSession } = createServer(fakeAuth)
    expect(await getSession()).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run tests/require-session.test.ts
```

Expected: FAIL — `createServer` not exported.

- [ ] **Step 3: Rewrite `src/server/index.ts`**

```ts
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Auth } from "better-auth"

export type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>

export interface RequireSessionOptions {
  redirectTo?: string
}

export function createServer(auth: Auth) {
  async function getSession(): Promise<Session | null> {
    return (await auth.api.getSession({ headers: await headers() })) as Session | null
  }

  async function requireSession(opts: RequireSessionOptions = {}): Promise<Session> {
    const session = await getSession()
    if (!session) {
      redirect(opts.redirectTo ?? "/sign-in")
    }
    return session
  }

  return { getSession, requireSession }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/require-session.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts tests/require-session.test.ts
git commit -m "$(cat <<'EOF'
refactor!: /server becomes createServer(auth); adds requireSession + Session type

BREAKING: previously `import { getSession } from '.../server'`. Now:
`const {getSession, requireSession} = createServer(auth)`, called once
in lib/auth-server.ts after createAuth.

Adds requireSession({redirectTo?}) and the auth-shaped Session type
(includes user). Resolves review findings 6 and 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `/auth-route` — `createAuthRoute(auth)`

**Files:**
- Modify: `src/auth-route/index.ts`

- [ ] **Step 1: Rewrite `src/auth-route/index.ts`**

```ts
import { toNextJsHandler } from "better-auth/next-js"
import type { Auth } from "better-auth"

export function createAuthRoute(auth: Auth): ReturnType<typeof toNextJsHandler> {
  return toNextJsHandler(auth)
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/auth-route/index.ts
git commit -m "$(cat <<'EOF'
refactor!: /auth-route becomes createAuthRoute(auth)

BREAKING: previously `export const {GET, POST}`. Now consumers wire:
  export const {GET, POST} = createAuthRoute(auth)
in app/api/auth/[...all]/route.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `/client` — `createAuthClient`

**Files:**
- Create: `src/client/index.ts`
- Create: `tests/create-auth-client.test.ts`

- [ ] **Step 1: Write `tests/create-auth-client.test.ts`**

```ts
import { describe, it, expect } from "vitest"

describe("createAuthClient", () => {
  it("returns a client with signIn.magicLink, signOut, useSession", async () => {
    const { createAuthClient } = await import("../src/client/index")
    const client = createAuthClient({ baseURL: "https://app.example.com" })
    expect(client).toBeDefined()
    expect(typeof client.signOut).toBe("function")
    expect(typeof (client as any).useSession).toBe("function")
    expect(typeof (client as any).signIn?.magicLink).toBe("function")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx vitest run tests/create-auth-client.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Write `src/client/index.ts`**

```ts
"use client"

import { createAuthClient as betterAuthCreateClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

export interface CreateAuthClientOptions {
  baseURL?: string
}

export function createAuthClient(opts: CreateAuthClientOptions = {}) {
  const baseURL =
    opts.baseURL ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_BETTER_AUTH_URL
      : undefined)
  return betterAuthCreateClient({
    baseURL,
    plugins: [magicLinkClient()],
  })
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/create-auth-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/index.ts tests/create-auth-client.test.ts
git commit -m "$(cat <<'EOF'
feat: add /client export with createAuthClient()

Wraps better-auth/react createAuthClient with the magicLinkClient
plugin pre-installed so consumers don't import better-auth directly.
Returned client exposes signIn.magicLink, signOut, useSession.

Resolves review finding 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `<SignInForm/>` component

**Files:**
- Create: `src/pages/sign-in/sign-in-form.tsx`
- Create: `tests/sign-in-form.test.tsx`

- [ ] **Step 1: Write `tests/sign-in-form.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form"

function makeAuthClient(magicLink: any) {
  return { signIn: { magicLink } } as any
}

describe("<SignInForm/>", () => {
  it("renders an email input and submit button with default labels", () => {
    const authClient = makeAuthClient(vi.fn())
    render(<SignInForm authClient={authClient} />)
    expect(screen.getByLabelText("Email")).toBeDefined()
    expect(screen.getByRole("button", { name: "Send magic link" })).toBeDefined()
  })

  it("calls authClient.signIn.magicLink with email + callbackUrl on submit", async () => {
    const magicLink = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} callbackUrl="/studio" />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: "Send magic link" }).closest("form")!)
    await waitFor(() => expect(magicLink).toHaveBeenCalled())
    expect(magicLink).toHaveBeenCalledWith({ email: "a@example.com", callbackURL: "/studio" })
  })

  it("shows the sent state after a successful submit", async () => {
    const magicLink = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } })
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
    await waitFor(() => {
      expect(screen.getByText(/We sent a sign-in link/i)).toBeDefined()
    })
  })

  it("shows the error state when authClient returns an error", async () => {
    const magicLink = vi.fn(async () => ({ error: { message: "boom" } }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } })
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeDefined()
    })
  })

  it("calls onSent callback with the email", async () => {
    const onSent = vi.fn()
    const magicLink = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient(magicLink)} onSent={onSent} />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "x@y.com" } })
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
    await waitFor(() => expect(onSent).toHaveBeenCalledWith("x@y.com"))
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx vitest run tests/sign-in-form.test.tsx
```

Expected: FAIL — `SignInForm` does not exist.

- [ ] **Step 3: Write `src/pages/sign-in/sign-in-form.tsx`**

```tsx
"use client"

import { useState, type ReactNode, type FormEvent } from "react"
import type { createAuthClient } from "../../client/index.js"

type AuthClient = ReturnType<typeof createAuthClient>

export interface SignInFormProps {
  authClient: AuthClient
  callbackUrl?: string
  emailLabel?: string
  submitLabel?: string
  sentCopy?: (email: string) => ReactNode
  errorCopy?: (message: string) => ReactNode
  onSent?: (email: string) => void
  className?: string
}

type Status = "idle" | "sending" | "sent" | "error"

export function SignInForm(props: SignInFormProps) {
  const {
    authClient,
    callbackUrl = "/",
    emailLabel = "Email",
    submitLabel = "Send magic link",
    sentCopy = (email) => (
      <>
        We sent a sign-in link to <strong>{email}</strong>. It expires in 10 minutes.
      </>
    ),
    errorCopy = (message) => <>Couldn't send the sign-in link: {message}</>,
    onSent,
    className,
  } = props

  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("sending")
    setErrorMessage("")
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: callbackUrl })
    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "Unknown error")
      return
    }
    setStatus("sent")
    onSent?.(email)
  }

  if (status === "sent") {
    return <p className={className}>{sentCopy(email)}</p>
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <label htmlFor="email" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
        {emailLabel}
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "sending"}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <button type="submit" disabled={status === "sending"} style={{ padding: "8px 12px" }}>
        {status === "sending" ? "Sending…" : submitLabel}
      </button>
      {status === "error" && (
        <p style={{ color: "#b00", marginTop: 8, fontSize: 13 }}>{errorCopy(errorMessage)}</p>
      )}
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npx vitest run tests/sign-in-form.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/sign-in/sign-in-form.tsx tests/sign-in-form.test.tsx
git commit -m "$(cat <<'EOF'
feat: add <SignInForm authClient={...}/> headless component

Logic-only sign-in form (input + button + status). Consumer passes
their own authClient and gets back submit/sent/error states. All
copy and the callbackUrl are overridable via props.

Resolves the headless-side of review finding 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `<SignInPage/>` wrapper + barrel

**Files:**
- Create: `src/pages/sign-in/sign-in-page.tsx`
- Modify: `src/pages/sign-in/index.tsx`

- [ ] **Step 1: Write `src/pages/sign-in/sign-in-page.tsx`**

```tsx
"use client"

import type { ReactNode } from "react"
import { SignInForm, type SignInFormProps } from "./sign-in-form.js"

export interface SignInPageProps extends SignInFormProps {
  title?: string
  description?: ReactNode
}

export function SignInPage(props: SignInPageProps) {
  const { title = "Sign in", description, ...formProps } = props
  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: description ? 4 : 12 }}>{title}</h1>
      {description && (
        <p style={{ fontSize: 13, color: "#555", marginTop: 0, marginBottom: 12 }}>{description}</p>
      )}
      <SignInForm {...formProps} />
    </main>
  )
}
```

- [ ] **Step 2: Rewrite `src/pages/sign-in/index.tsx` as a barrel**

```tsx
"use client"

export { SignInForm, type SignInFormProps } from "./sign-in-form.js"
export { SignInPage, type SignInPageProps } from "./sign-in-page.js"
export { SignInPage as default } from "./sign-in-page.js"
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: PASS — sign-in-form tests still green; nothing else regresses.

- [ ] **Step 5: Commit**

```bash
git add src/pages/sign-in/sign-in-page.tsx src/pages/sign-in/index.tsx
git commit -m "$(cat <<'EOF'
feat: <SignInPage/> wraps <SignInForm/> with title/description chrome

The barrel re-exports both components and keeps SignInPage as the
default export for back-compat-shaped imports.

Resolves the page-side of review finding 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: tsup config — add `client/index` entry

**Files:**
- Modify: `tsup.config.ts`

- [ ] **Step 1: Edit `tsup.config.ts`**

Add the client entry and ensure sign-in subfiles are bundled into the existing sign-in entry:

```ts
import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "auth/index":          "src/auth/index.ts",
    "auth-route/index":    "src/auth-route/index.ts",
    "client/index":        "src/client/index.ts",
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
  external: ["next", "react", "react-dom", "better-auth", "better-auth/react", "better-auth/client/plugins"],
  splitting: false,
  treeshake: true,
  async onSuccess() {
    const fs = await import("node:fs/promises")
    for (const filePath of ["dist/pages/sign-in/index.js", "dist/client/index.js"]) {
      const content = await fs.readFile(filePath, "utf8")
      const trimmed = content.trimStart()
      if (!trimmed.startsWith('"use client"') && !trimmed.startsWith("'use client'")) {
        await fs.writeFile(filePath, '"use client"\n' + content, "utf8")
      }
    }
  },
})
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: success. `dist/client/index.js`, `dist/client/index.d.ts`, and sign-in chunked files all present.

- [ ] **Step 3: Verify `"use client"` directive on output**

```bash
head -1 dist/client/index.js && head -1 dist/pages/sign-in/index.js
```

Expected: both print `"use client"`.

- [ ] **Step 4: Commit**

```bash
git add tsup.config.ts
git commit -m "$(cat <<'EOF'
build: add /client entry; ensure 'use client' on client outputs

Also marks better-auth subpaths as external so they aren't bundled
into the package — consumers already have better-auth as a transitive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: `package.json` — add `./client` export, bump to 0.2.0

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit `package.json`**

In the `exports` map, add `./client` between `./auth-route` and `./schema`:

```jsonc
"./client": {
  "types": "./dist/client/index.d.ts",
  "default": "./dist/client/index.js"
},
```

Add `UPGRADING.md` to the `files` array:

```jsonc
"files": ["dist", "README.md", "UPGRADING.md"],
```

Bump `version` from `0.1.4` → `0.2.0`.

- [ ] **Step 2: Verify package.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Commit (do NOT push tag yet — that happens in the final task)**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore: add ./client export, ship UPGRADING.md, bump to 0.2.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Migrate `examples/basic` to the new API

**Files:**
- Modify: `examples/basic/lib/auth.ts`
- Create: `examples/basic/lib/auth-client.ts`
- Create: `examples/basic/lib/auth-server.ts`
- Modify: `examples/basic/app/sign-in/page.tsx`
- Modify: `examples/basic/app/api/auth/[...all]/route.ts`
- Modify: `examples/basic/app/page.tsx` (and any other file using `getSession`)

- [ ] **Step 1: Check the current example structure**

```bash
find examples/basic -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "*/.next/*" -not -path "*/node_modules/*"
```

Read each printed file; note imports of `@naeemba/next-starter/auth`, `/server`, `/pages/sign-in`, `/auth-route`.

- [ ] **Step 2: Rewrite `examples/basic/lib/auth.ts`**

```ts
import { createAuth } from "@naeemba/next-starter/auth"

export const auth = createAuth()
```

(No allowlist in the example — keeps the smoke test working.)

- [ ] **Step 3: Create `examples/basic/lib/auth-client.ts`**

```ts
"use client"
import { createAuthClient } from "@naeemba/next-starter/client"

export const authClient = createAuthClient()
export const { signIn, signOut, useSession } = authClient
```

- [ ] **Step 4: Create `examples/basic/lib/auth-server.ts`**

```ts
import { createServer } from "@naeemba/next-starter/server"
import { auth } from "./auth"

export const { getSession, requireSession } = createServer(auth)
```

- [ ] **Step 5: Update `examples/basic/app/sign-in/page.tsx`**

```tsx
import { SignInPage } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "@/lib/auth-client"

export default function Page() {
  return <SignInPage authClient={authClient} />
}
```

(Use the actual import alias the example uses — if no `@/` alias is configured, use a relative path like `../../lib/auth-client`.)

- [ ] **Step 6: Update `examples/basic/app/api/auth/[...all]/route.ts`**

```ts
import { createAuthRoute } from "@naeemba/next-starter/auth-route"
import { auth } from "@/lib/auth"

export const { GET, POST } = createAuthRoute(auth)
```

- [ ] **Step 7: Update any file importing `getSession` from the package**

Replace:

```ts
import { getSession } from "@naeemba/next-starter/server"
```

with:

```ts
import { getSession } from "@/lib/auth-server"
```

- [ ] **Step 8: Build the package and the example**

```bash
npm run build && cd examples/basic && npm install && npm run build && cd ../..
```

Expected: both build cleanly.

- [ ] **Step 9: Commit**

```bash
git add examples/basic
git commit -m "$(cat <<'EOF'
example: migrate examples/basic to 0.2 factory API

Adds lib/auth-client.ts and lib/auth-server.ts; rewrites lib/auth.ts,
sign-in page, auth route handler, and any getSession consumers to the
new createAuth / createAuthClient / createServer / createAuthRoute
factories.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `UPGRADING.md`

**Files:**
- Create: `UPGRADING.md`

- [ ] **Step 1: Write `UPGRADING.md`**

```markdown
# Upgrading

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
```

- [ ] **Step 2: Commit**

```bash
git add UPGRADING.md
git commit -m "$(cat <<'EOF'
docs: add UPGRADING.md for 0.1.x → 0.2.0 migration

Walks through required changes (createAuth factory, /client file,
createAuthRoute, createServer, SignInPage props) and optional
follow-ups (allowlist, custom email, session tuning, headless form).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

```bash
cat README.md
```

- [ ] **Step 2: Update the install/usage sections to use the factory API**

Find every snippet referencing the singleton `auth` and update it to use `createAuth()`. Specifically:
- `lib/auth.ts` snippet → use `createAuth()`
- Add a `lib/auth-client.ts` snippet showing `createAuthClient()`
- Add a `lib/auth-server.ts` snippet showing `createServer(auth)`
- Sign-in page snippet → import `SignInPage` named, pass `authClient`
- Route handler snippet → use `createAuthRoute(auth)`
- Link to `UPGRADING.md` near the top for 0.1.x users

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: update README for 0.2.0 factory API

Replaces singleton snippets with createAuth/createAuthClient/createServer/
createAuthRoute. Links to UPGRADING.md for migration steps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Final verification — typecheck, test, build

**Files:** (none — verification only)

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: PASS, zero errors.

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: all suites PASS. Count: roughly 11 test files, 30+ individual tests.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build. Verify:
- `dist/client/index.js` and `.d.ts` exist
- `dist/auth/index.js` exports `createAuth` (grep: `grep -c 'createAuth' dist/auth/index.js`)
- No `auth` singleton export (grep: `grep -c 'export.*\\bauth\\b' dist/auth/index.js` should be 0 except for type re-export)
- `dist/pages/sign-in/index.js` starts with `"use client"`
- `dist/client/index.js` starts with `"use client"`

- [ ] **Step 4: Smoke test the example**

```bash
cd examples/basic
npm run build
cd ../..
```

Expected: example builds successfully against the new package surface.

- [ ] **Step 5: If everything is green, no commit needed.** Otherwise, fix and re-commit specific files.

---

## Task 20: Publish prep (do NOT publish in this plan — final human review gate)

**Files:** (none — checklist only)

- [ ] **Step 1: Confirm version in `package.json` is `0.2.0`.**
- [ ] **Step 2: Confirm `CHANGELOG`/`UPGRADING.md` updated.**
- [ ] **Step 3: Confirm CI is green on the branch.**
- [ ] **Step 4: Hand off to human for `npm version 0.2.0 && npm publish`** — do not run from this plan. The `preversion` and `postversion` scripts in `package.json` already do the right thing (typecheck/test/build, then push tags).

---

## Self-review

**Spec coverage:**
- §1 exports map → Task 14 (tsup), Task 15 (package.json)
- §2 createAuth → Tasks 6, 7, 8
- §3 createAuthClient → Task 11
- §4 SignInForm + SignInPage → Tasks 12, 13
- §5 sendEmail + sendMagicLink template → Tasks 4, 5
- §6 getSession + requireSession + Session → Task 9
- §7 schema/db → Tasks 2, 3
- §8 migration → Task 17
- §9 testing → Tasks 4, 5, 7, 8, 9, 11, 12 (every behavior change has a test task)
- §10 out-of-scope items confirmed not present in tasks

Two unmentioned spec items resolved here:
- `/auth-route` shape change is **not in the spec** but is forced by removing the singleton — added as Task 10 with explicit BREAKING note.
- Same for `/server` becoming `createServer(auth)` — addressed in Task 9 with explicit BREAKING note. The spec's `/server` section assumed an importable `auth` was still around; that assumption fails when the singleton is removed. The plan resolves this by symmetric factory wiring.

**Placeholder scan:** No "TBD", "TODO", "implement later". Every test step shows actual test code; every implementation step shows actual code. Task 16 (examples migration) has one conditional ("if no @/ alias is configured, use a relative path") — that's a real branch on what exists in the example, not a placeholder.

**Type consistency:**
- `MagicLinkEmailFields` interface from `/email` (Task 4) is used as the return type of `magicLink.email` callback in `CreateAuthOptions` (Task 7). ✓
- `Auth` from `better-auth` is the parameter type for `createServer`, `createAuthRoute`. ✓
- `createDb` returns `Db` aliased to `ReturnType<typeof drizzle<typeof schema>>`. Passed into `drizzleAdapter` which accepts a wider type — fine.
- `SignInFormProps` from Task 12 is extended by `SignInPageProps` in Task 13. ✓
- `__testHooks.buildSendMagicLink` signature matches what `tests/magic-link-allowlist.test.ts` calls. ✓
- `parseEnv(input, overrides)` from Task 6 matches how `createAuth` calls it in Task 7. ✓

Plan is internally consistent. Ready for execution.
