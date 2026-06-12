# 0.3.0 — Google OAuth + Passkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth and WebAuthn passkey sign-in to `@naeemba/next-starter`, opt-in per method, additive 0.3.0 release.

**Architecture:** `createAuth(opts)` factory grows two new opt-in keys (`google`, `passkey`). When set, the factory wires the corresponding better-auth integration: Google goes through `socialProviders.google` plus `databaseHooks` for allowlist; passkey loads the `@better-auth/passkey` plugin. Account linking auto-enables for Google (verified-email-trusted). `<SignInForm/>` grows props for both methods plus a `magicLink: false` toggle; a new `<PasskeyManager/>` component handles registration/management on a settings page.

**Tech Stack:** TypeScript, Next.js, better-auth 1.6.x, @better-auth/passkey 1.6.x, Drizzle ORM (postgres), React 19, Vitest, @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-12-google-passkey-design.md`

---

## Phase 1: Server foundation (schema + env)

### Task 1: Add passkey table to schema

**Spec:** Schema section.

**Files:**
- Modify: `src/schema/index.ts`
- Test: `tests/schema-passkey.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/schema-passkey.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { passkey, type PasskeyRow } from "../src/schema/index.js"

describe("passkey schema", () => {
  it("defines a 'passkey' table with the required columns", () => {
    const cols = Object.keys((passkey as unknown as { _: { columns: Record<string, unknown> } })._.columns)
    expect(cols.sort()).toEqual(
      [
        "id",
        "userId",
        "name",
        "publicKey",
        "credentialId",
        "counter",
        "deviceType",
        "backedUp",
        "transports",
        "createdAt",
      ].sort()
    )
  })

  it("exports a PasskeyRow inferred type", () => {
    const sample: PasskeyRow = {
      id: "p_1",
      userId: "u_1",
      name: "MacBook Air",
      publicKey: "pk",
      credentialId: "cid",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: "internal",
      createdAt: new Date(),
    }
    expect(sample.id).toBe("p_1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schema-passkey.test.ts`
Expected: FAIL — `passkey` and `PasskeyRow` are not exported from `src/schema/index.ts`.

- [ ] **Step 3: Implement minimal code**

Edit `src/schema/index.ts`. Add the `integer` import and the new table + row type:

```ts
import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core"

// ...existing tables (user, session, account, verification) unchanged...

export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: text("transports"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type PasskeyRow = typeof passkey.$inferSelect
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schema-passkey.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/schema/index.ts tests/schema-passkey.test.ts
git commit -m "feat(schema): add passkey table for 0.3.0"
```

---

### Task 2: Add Google env vars to EnvSchema

**Spec:** Server: factory API — env additions.

**Files:**
- Modify: `src/auth/config.ts`
- Test: `tests/auth-config.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append to `tests/auth-config.test.ts` (inside the top-level `describe` block):

```ts
it("accepts optional GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET", () => {
  const env = parseEnv({
    DATABASE_URL: "postgres://u:p@h/d",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  })
  expect(env.GOOGLE_CLIENT_ID).toBe("google-client-id")
  expect(env.GOOGLE_CLIENT_SECRET).toBe("google-client-secret")
})

it("treats GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as optional", () => {
  const env = parseEnv({
    DATABASE_URL: "postgres://u:p@h/d",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
  })
  expect(env.GOOGLE_CLIENT_ID).toBeUndefined()
  expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-config.test.ts`
Expected: FAIL — `Env.GOOGLE_CLIENT_ID` is not a known field; TypeScript error or runtime undefined doesn't match.

- [ ] **Step 3: Implement minimal code**

Edit `src/auth/config.ts`. Add two optional fields inside `EnvSchema`:

```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").refine(
    (s) => s.startsWith("postgres://") || s.startsWith("postgresql://"),
    "DATABASE_URL must be a Postgres connection string (postgres:// or postgresql://)"
  ),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL (e.g. https://app.example.com)"),
  EMAIL_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-config.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/auth/config.ts tests/auth-config.test.ts
git commit -m "feat(config): accept optional GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
```

---

## Phase 2: Server: factory extensions (Google)

### Task 3: Extend `CreateAuthOptions` type surface

**Spec:** Server: factory API — `CreateAuthOptions` additions.

**Files:**
- Modify: `src/auth/index.ts`
- Test: `tests/auth-factory.test.ts` (extend) or new `tests/auth-factory-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/auth-factory-types.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest"
import type { CreateAuthOptions } from "../src/auth/index.js"

describe("CreateAuthOptions", () => {
  it("accepts google + passkey + accountLinking options", () => {
    expectTypeOf<CreateAuthOptions>().toMatchTypeOf<{
      google?: {
        clientId?: string
        clientSecret?: string
        scopes?: string[]
        allowlist?: (profile: { email: string; emailVerified: boolean }) =>
          boolean | Promise<boolean>
      }
      passkey?: {
        rpName?: string
        rpID?: string
        origin?: string
        allowlist?: (user: { id: string; email: string }) =>
          boolean | Promise<boolean>
      }
      accountLinking?: false | { trustedProviders: string[] }
    }>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-factory-types.test.ts`
Expected: FAIL — `google`, `passkey`, `accountLinking` not present on `CreateAuthOptions`.

- [ ] **Step 3: Implement minimal code**

Edit `src/auth/index.ts`. Extend the `CreateAuthOptions` interface (preserve existing fields):

```ts
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
  google?: {
    clientId?: string
    clientSecret?: string
    scopes?: string[]
    allowlist?: (profile: { email: string; emailVerified: boolean }) =>
      boolean | Promise<boolean>
  }
  passkey?: {
    rpName?: string
    rpID?: string
    origin?: string
    allowlist?: (user: { id: string; email: string }) =>
      boolean | Promise<boolean>
  }
  accountLinking?: false | { trustedProviders: string[] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-factory-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/index.ts tests/auth-factory-types.test.ts
git commit -m "feat(auth): extend CreateAuthOptions with google, passkey, accountLinking"
```

---

### Task 4: Wire Google `socialProviders` + auto account linking

**Spec:** Server: factory API — account linking default; allowlist semantics (google part wired in next task).

**Files:**
- Modify: `src/auth/index.ts`
- Test: `tests/auth-factory-google.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/auth-factory-google.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createAuth } from "../src/auth/index.js"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: "postgres://u:p@h/d",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("createAuth({ google })", () => {
  it("wires the google socialProvider when clientId/Secret are passed as opts", () => {
    const auth = createAuth({
      db: {} as never,  // bypass DB connect
      google: { clientId: "id-from-opts", clientSecret: "secret-from-opts" },
    })
    const cfg = (auth as unknown as { options: { socialProviders?: { google?: { clientId: string; clientSecret: string } } } }).options
    expect(cfg.socialProviders?.google?.clientId).toBe("id-from-opts")
    expect(cfg.socialProviders?.google?.clientSecret).toBe("secret-from-opts")
  })

  it("falls back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from env when opts omit them", () => {
    process.env.GOOGLE_CLIENT_ID = "id-from-env"
    process.env.GOOGLE_CLIENT_SECRET = "secret-from-env"
    const auth = createAuth({ db: {} as never, google: {} })
    const cfg = (auth as unknown as { options: { socialProviders?: { google?: { clientId: string; clientSecret: string } } } }).options
    expect(cfg.socialProviders?.google?.clientId).toBe("id-from-env")
    expect(cfg.socialProviders?.google?.clientSecret).toBe("secret-from-env")
  })

  it("throws if google is enabled but no clientId/Secret resolvable", () => {
    expect(() => createAuth({ db: {} as never, google: {} })).toThrow(
      /GOOGLE_CLIENT_ID/
    )
  })

  it("enables accountLinking with google in trustedProviders by default when google is set", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
    })
    const cfg = (auth as unknown as { options: { account?: { accountLinking?: { enabled: boolean; trustedProviders: string[] } } } }).options
    expect(cfg.account?.accountLinking?.enabled).toBe(true)
    expect(cfg.account?.accountLinking?.trustedProviders).toContain("google")
  })

  it("disables accountLinking when explicitly set to false", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: false,
    })
    const cfg = (auth as unknown as { options: { account?: { accountLinking?: { enabled: boolean } } } }).options
    expect(cfg.account?.accountLinking?.enabled ?? false).toBe(false)
  })

  it("respects a custom trustedProviders list", () => {
    const auth = createAuth({
      db: {} as never,
      google: { clientId: "x", clientSecret: "y" },
      accountLinking: { trustedProviders: ["google", "github"] },
    })
    const cfg = (auth as unknown as { options: { account?: { accountLinking?: { trustedProviders: string[] } } } }).options
    expect(cfg.account?.accountLinking?.trustedProviders).toEqual(["google", "github"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-factory-google.test.ts`
Expected: FAIL — `socialProviders.google` not configured; no `accountLinking` wiring.

- [ ] **Step 3: Implement minimal code**

Edit `src/auth/index.ts`. Inside `createAuth`, after `const env = parseEnv(...)` and before the existing `const config: BetterAuthOptions = { ... }` block, build a Google config and account-linking config. Then merge them into `config`. Replace the body of `createAuth` accordingly:

```ts
export function createAuth(opts: CreateAuthOptions = {}): Auth {
  const overrides: Parameters<typeof parseEnv>[1] = {
    BETTER_AUTH_SECRET: opts.secret,
    BETTER_AUTH_URL: opts.baseURL,
  }
  if (opts.databaseUrl) overrides.DATABASE_URL = opts.databaseUrl
  if (opts.db && !overrides.DATABASE_URL && !process.env.DATABASE_URL) {
    overrides.DATABASE_URL = "postgres://unused:unused@localhost/unused"
  }

  const env = parseEnv(process.env, overrides)
  const db = opts.db ?? createDb(env.DATABASE_URL)
  const magicLinkExpiresIn = opts.magicLink?.expiresIn ?? 600

  const config: BetterAuthOptions = {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    plugins: [
      magicLink({
        expiresIn: magicLinkExpiresIn,
        sendMagicLink: buildSendMagicLink({
          magicLinkExpiresIn,
          allowlist: opts.magicLink?.allowlist,
          customTemplate: opts.magicLink?.email,
        }),
      }),
    ],
  }

  if (opts.google) {
    const clientId = opts.google.clientId ?? env.GOOGLE_CLIENT_ID
    const clientSecret = opts.google.clientSecret ?? env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error(
        "[@naeemba/next-starter] createAuth({ google }) requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET " +
          "(either as opts.google.clientId/clientSecret or in process.env)."
      )
    }
    config.socialProviders = {
      ...(config.socialProviders ?? {}),
      google: {
        clientId,
        clientSecret,
        ...(opts.google.scopes ? { scope: opts.google.scopes } : {}),
      },
    }

    if (opts.accountLinking !== false) {
      config.account = {
        ...(config.account ?? {}),
        accountLinking: {
          enabled: true,
          trustedProviders:
            opts.accountLinking?.trustedProviders ?? ["google"],
        },
      }
    }
  }

  if (opts.session) {
    config.session = {
      ...(opts.session.expiresIn !== undefined && { expiresIn: opts.session.expiresIn }),
      ...(opts.session.updateAge !== undefined && { updateAge: opts.session.updateAge }),
    }
  }

  return betterAuth(config) as unknown as Auth
}
```

Note: do NOT add a third arg to `parseEnv` — the existing factory uses the placeholder-URL trick (in the `if (opts.db && !overrides.DATABASE_URL && !process.env.DATABASE_URL)` branch above) to satisfy the schema check when a pre-built `db` is supplied. Preserve that pattern.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-factory-google.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/index.ts tests/auth-factory-google.test.ts
git commit -m "feat(auth): wire google socialProvider and auto account linking"
```

---

### Task 5: Wire `google.allowlist` via `databaseHooks`

**Spec:** Allowlist semantics — google variant.

**Files:**
- Modify: `src/auth/index.ts`
- Test: `tests/auth-factory-google.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/auth-factory-google.test.ts` inside the same `describe` block:

```ts
it("wires google.allowlist as a databaseHooks.user.create.before hook", async () => {
  const seen: Array<{ email: string; emailVerified: boolean }> = []
  const auth = createAuth({
    db: {} as never,
    google: {
      clientId: "x",
      clientSecret: "y",
      allowlist: (profile) => {
        seen.push(profile)
        return profile.email.endsWith("@acme.com")
      },
    },
  })
  const cfg = (auth as unknown as {
    options: {
      databaseHooks?: {
        user?: {
          create?: {
            before?: (
              user: { email: string; emailVerified?: boolean }
            ) => Promise<unknown> | unknown
          }
        }
      }
    }
  }).options

  const hook = cfg.databaseHooks?.user?.create?.before
  expect(hook).toBeDefined()

  // allowed
  await hook!({ email: "alice@acme.com", emailVerified: true })
  expect(seen[0]).toEqual({ email: "alice@acme.com", emailVerified: true })

  // rejected
  await expect(
    hook!({ email: "bob@other.com", emailVerified: true })
  ).rejects.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-factory-google.test.ts -t allowlist`
Expected: FAIL — no `databaseHooks` configured.

- [ ] **Step 3: Implement minimal code**

Edit `src/auth/index.ts`. Inside the `if (opts.google)` block, after the `accountLinking` setup, add:

```ts
if (opts.google.allowlist) {
  const allowlist = opts.google.allowlist
  config.databaseHooks = {
    ...(config.databaseHooks ?? {}),
    user: {
      ...(config.databaseHooks?.user ?? {}),
      create: {
        ...(config.databaseHooks?.user?.create ?? {}),
        before: async (user: { email: string; emailVerified?: boolean }) => {
          const ok = await allowlist({
            email: user.email,
            emailVerified: user.emailVerified ?? false,
          })
          if (!ok) {
            throw new Error(
              "[@naeemba/next-starter] Sign-up rejected by google.allowlist."
            )
          }
          return user
        },
      },
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-factory-google.test.ts`
Expected: PASS (7 tests including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/auth/index.ts tests/auth-factory-google.test.ts
git commit -m "feat(auth): wire google.allowlist via databaseHooks.user.create.before"
```

---

## Phase 3: Server: factory extensions (Passkey)

### Task 6: Install `@better-auth/passkey` and wire the plugin

**Spec:** Server: factory API — passkey config.

**Files:**
- Modify: `package.json`, `src/auth/index.ts`
- Test: `tests/auth-factory-passkey.test.ts` (new)

- [ ] **Step 1: Add dependency**

```bash
npm install @better-auth/passkey@1.6.16
```

- [ ] **Step 2: Write the failing test**

Create `tests/auth-factory-passkey.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createAuth } from "../src/auth/index.js"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: "postgres://u:p@h/d",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://app.example.com",
  }
})
afterEach(() => { process.env = { ...ORIGINAL_ENV } })

function pluginIds(auth: unknown): string[] {
  return ((auth as { options: { plugins?: Array<{ id?: string }> } }).options.plugins ?? [])
    .map((p) => p.id ?? "")
}

describe("createAuth({ passkey })", () => {
  it("loads the passkey plugin when opts.passkey is set", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: { rpName: "Acme" },
    })
    expect(pluginIds(auth)).toContain("passkey")
  })

  it("does NOT load the passkey plugin when opts.passkey is omitted", () => {
    const auth = createAuth({ db: {} as never })
    expect(pluginIds(auth)).not.toContain("passkey")
  })

  it("defaults rpID and origin from BETTER_AUTH_URL when not provided", () => {
    const auth = createAuth({
      db: {} as never,
      passkey: { rpName: "Acme" },
    })
    const passkeyPlugin = (auth as unknown as {
      options: { plugins?: Array<{ id?: string; options?: { rpID?: string; origin?: string } }> }
    }).options.plugins?.find((p) => p.id === "passkey")
    expect(passkeyPlugin?.options?.rpID).toBe("app.example.com")
    expect(passkeyPlugin?.options?.origin).toBe("https://app.example.com")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/auth-factory-passkey.test.ts`
Expected: FAIL — passkey plugin not loaded.

- [ ] **Step 4: Implement minimal code**

Edit `src/auth/index.ts`. Add import at top:

```ts
import { passkey as passkeyPlugin } from "@better-auth/passkey"
```

Inside `createAuth`, after the `if (opts.google) { ... }` block, before the `if (opts.session)` block, add:

```ts
if (opts.passkey) {
  const url = new URL(env.BETTER_AUTH_URL)
  config.plugins!.push(
    passkeyPlugin({
      rpName: opts.passkey.rpName ?? url.hostname,
      rpID: opts.passkey.rpID ?? url.hostname,
      origin: opts.passkey.origin ?? env.BETTER_AUTH_URL,
    })
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/auth-factory-passkey.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/auth/index.ts tests/auth-factory-passkey.test.ts
git commit -m "feat(auth): wire @better-auth/passkey plugin when opts.passkey is set"
```

---

### Task 7: Wire `passkey.allowlist` via plugin hook

**Spec:** Allowlist semantics — passkey variant.

**Files:**
- Modify: `src/auth/index.ts`
- Test: `tests/auth-factory-passkey.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append inside the existing describe block:

```ts
it("wires passkey.allowlist as a beforeRegistration hook that rejects when it returns false", async () => {
  let seen: { id: string; email: string } | null = null
  const auth = createAuth({
    db: {} as never,
    passkey: {
      rpName: "Acme",
      allowlist: (u) => {
        seen = u
        return u.email.endsWith("@acme.com")
      },
    },
  })
  const passkeyOpt = (auth as unknown as {
    options: { plugins?: Array<{ id?: string; options?: { beforeRegistration?: (user: { id: string; email: string }) => Promise<unknown> | unknown } }> }
  }).options.plugins?.find((p) => p.id === "passkey")
  const hook = passkeyOpt?.options?.beforeRegistration
  expect(hook).toBeDefined()

  await hook!({ id: "u_1", email: "alice@acme.com" })
  expect(seen).toEqual({ id: "u_1", email: "alice@acme.com" })

  await expect(hook!({ id: "u_2", email: "bob@other.com" })).rejects.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-factory-passkey.test.ts -t allowlist`
Expected: FAIL — no `beforeRegistration` hook configured.

- [ ] **Step 3: Implement minimal code**

In `src/auth/index.ts`, inside the `if (opts.passkey)` block, replace the plugin push with:

```ts
if (opts.passkey) {
  const url = new URL(env.BETTER_AUTH_URL)
  const allowlist = opts.passkey.allowlist
  config.plugins!.push(
    passkeyPlugin({
      rpName: opts.passkey.rpName ?? url.hostname,
      rpID: opts.passkey.rpID ?? url.hostname,
      origin: opts.passkey.origin ?? env.BETTER_AUTH_URL,
      ...(allowlist
        ? {
            beforeRegistration: async (user: { id: string; email: string }) => {
              const ok = await allowlist({ id: user.id, email: user.email })
              if (!ok) {
                throw new Error(
                  "[@naeemba/next-starter] Passkey registration rejected by passkey.allowlist."
                )
              }
            },
          }
        : {}),
    })
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-factory-passkey.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/index.ts tests/auth-factory-passkey.test.ts
git commit -m "feat(auth): wire passkey.allowlist via plugin beforeRegistration"
```

---

## Phase 4: Client extensions

### Task 8: Extend `AuthClient` type and add `passkeyClient()`

**Spec:** Client (`src/client/index.ts`).

**Files:**
- Modify: `src/client/index.ts`
- Test: `tests/create-auth-client.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/create-auth-client.test.ts`:

```ts
import type { AuthClient } from "../src/client/index.js"

describe("AuthClient passkey surface", () => {
  it("statically exposes passkey methods", () => {
    type C = AuthClient
    // type-level assertion: these accesses must compile
    type _list = C["passkey"]["listUserPasskeys"]
    type _add = C["passkey"]["addPasskey"]
    type _delete = C["passkey"]["deletePasskey"]
    type _signIn = C["signIn"]["passkey"]
    // runtime smoke
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/create-auth-client.test.ts`
Expected: FAIL (TypeScript) — `passkey` is not a property of `AuthClient`.

- [ ] **Step 3: Implement minimal code**

Edit `src/client/index.ts`. Add the structural type + plugin:

```ts
"use client"

import { createAuthClient as betterAuthCreateClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"

import type { MagicLinkAuthClient } from "../pages/sign-in/sign-in-form.js"

export interface PasskeyAuthClient {
  signIn: {
    passkey: (opts?: { callbackURL?: string }) => Promise<{ error: { message?: string | null } | null | undefined }>
  }
  passkey: {
    listUserPasskeys: () => Promise<{ data: Array<{ id: string; name?: string | null; deviceType?: string | null; createdAt: string }>; error: { message?: string | null } | null | undefined }>
    addPasskey: (opts?: { name?: string }) => Promise<{ data?: { id: string } | null; error: { message?: string | null } | null | undefined }>
    deletePasskey: (opts: { id: string }) => Promise<{ error: { message?: string | null } | null | undefined }>
  }
}

export interface CreateAuthClientOptions {
  baseURL?: string
}

export type AuthClient =
  ReturnType<typeof betterAuthCreateClient>
  & MagicLinkAuthClient
  & PasskeyAuthClient

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuthClient(
  opts: CreateAuthClientOptions = {}
  // @ts-expect-error TS2883: return type references better-auth internal mjs types
): AuthClient {
  const baseURL =
    opts.baseURL ??
    (typeof process !== "undefined" ? process?.env?.NEXT_PUBLIC_BETTER_AUTH_URL : undefined)
  return betterAuthCreateClient({
    baseURL,
    plugins: [magicLinkClient(), passkeyClient()],
  }) as AuthClient
}
```

Note: this also addresses the open follow-up to swap `@ts-ignore` for `@ts-expect-error` per the 0.2.0 review. If the build fails with "Unused '@ts-expect-error' directive" (meaning the underlying TS2883 no longer fires because the `AuthClient` type breaks the chain), drop the directive entirely rather than reverting to `@ts-ignore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/create-auth-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/index.ts tests/create-auth-client.test.ts
git commit -m "feat(client): expose passkey methods on AuthClient; load passkeyClient()"
```

---

## Phase 5: UI — `<SignInForm/>` extensions

### Task 9: Refactor SignInForm to per-method status state (internal only)

**Spec:** Per-method status.

**Files:**
- Modify: `src/pages/sign-in/sign-in-form.tsx`
- Test: `tests/sign-in-form.test.tsx` (existing — must still pass)

- [ ] **Step 1: Confirm existing tests pass before refactor**

Run: `npx vitest run tests/sign-in-form.test.tsx`
Expected: PASS (existing tests).

- [ ] **Step 2: Refactor internal state shape (no API change)**

Edit `src/pages/sign-in/sign-in-form.tsx`. Replace the single `status` state with a `methodStatus` object:

```tsx
type Status = "idle" | "sending" | "sent" | "error"
type MethodStatus = { magicLink: Status; google: Status; passkey: Status }

const [methodStatus, setMethodStatus] = useState<MethodStatus>({
  magicLink: "idle",
  google: "idle",
  passkey: "idle",
})
const [email, setEmail] = useState("")
const [errorMessage, setErrorMessage] = useState("")

// helper
function setStatus(method: keyof MethodStatus, s: Status) {
  setMethodStatus((prev) => ({ ...prev, [method]: s }))
}

// in onSubmit, replace setStatus("sending") with setStatus("magicLink", "sending"), etc.
// in render, replace `status === "sent"` with `methodStatus.magicLink === "sent"`.
// the disabled prop on the email input uses `methodStatus.magicLink === "sending"`.
```

The public `SignInFormProps` shape does NOT change yet.

- [ ] **Step 3: Re-run existing tests**

Run: `npx vitest run tests/sign-in-form.test.tsx`
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/pages/sign-in/sign-in-form.tsx
git commit -m "refactor(sign-in): track status per method (internal-only, no API change)"
```

---

### Task 10: Add `google` prop and "Continue with Google" button

**Spec:** UI: SignInForm changes — render order; new props.

**Files:**
- Modify: `src/pages/sign-in/sign-in-form.tsx`
- Test: `tests/sign-in-form-google.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/sign-in-form-google.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form.js"

function makeAuthClient(overrides: Partial<{ social: (o: { provider: string; callbackURL: string }) => Promise<{ error: { message?: string } | null }> }> = {}) {
  return {
    signIn: {
      magicLink: vi.fn(async () => ({ error: null })),
      social: overrides.social ?? vi.fn(async () => ({ error: null })),
      passkey: vi.fn(async () => ({ error: null })),
    },
    passkey: { listUserPasskeys: vi.fn(), addPasskey: vi.fn(), deletePasskey: vi.fn() },
  } as never
}

describe("<SignInForm google/>", () => {
  it("does not render a Google button by default", () => {
    render(<SignInForm authClient={makeAuthClient()} />)
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull()
  })

  it("renders a 'Continue with Google' button when google prop is set", () => {
    render(<SignInForm authClient={makeAuthClient()} google />)
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument()
  })

  it("calls authClient.signIn.social({ provider: 'google' }) on click", async () => {
    const social = vi.fn(async () => ({ error: null }))
    const client = makeAuthClient({ social })
    render(<SignInForm authClient={client} google callbackUrl="/dashboard" />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/dashboard" })
  })

  it("displays an inline error if google sign-in fails", async () => {
    const social = vi.fn(async () => ({ error: { message: "google denied" } }))
    render(<SignInForm authClient={makeAuthClient({ social })} google />)
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))
    expect(await screen.findByText(/google denied/i)).toBeInTheDocument()
  })

  it("accepts a custom label via google={{ label }}", () => {
    render(<SignInForm authClient={makeAuthClient()} google={{ label: "Use my Workspace account" }} />)
    expect(screen.getByRole("button", { name: /use my workspace account/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sign-in-form-google.test.tsx`
Expected: FAIL — `google` prop ignored.

- [ ] **Step 3: Implement minimal code**

Edit `src/pages/sign-in/sign-in-form.tsx`. Add to `SignInFormProps`:

```ts
google?: boolean | { label?: ReactNode }
onSignedIn?: () => void
```

In the component body, after the existing state hooks, add:

```tsx
async function onGoogleClick() {
  if (!props.google) return
  setStatus("google", "sending")
  setErrorMessage("")
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: callbackUrl,
  })
  if (error) {
    setStatus("google", "error")
    setErrorMessage(error.message ?? "Unknown error")
    return
  }
  setStatus("google", "sent")
  props.onSignedIn?.()
}
```

In the JSX (render branch, before the email form), conditionally render:

```tsx
{props.google && (
  <>
    <button
      type="button"
      onClick={onGoogleClick}
      disabled={methodStatus.google === "sending"}
      style={{ padding: "8px 12px", width: "100%", marginBottom: 8 }}
    >
      {methodStatus.google === "sending"
        ? "Signing in…"
        : typeof props.google === "object" && props.google.label
          ? props.google.label
          : "Continue with Google"}
    </button>
    {methodStatus.google === "error" && (
      <p style={{ color: "#b00", marginTop: 4, marginBottom: 8, fontSize: 13 }}>
        {errorCopy(errorMessage)}
      </p>
    )}
  </>
)}
```

You also need to widen `authClient` to allow `signIn.social`. Update the `MagicLinkAuthClient` interface OR add a separate `SocialAuthClient` and intersect. Cleanest: introduce a `SignInAuthClient` covering the methods this component uses:

```ts
export interface SignInAuthClient {
  signIn: {
    magicLink: (opts: { email: string; callbackURL: string }) => Promise<{ error: { message?: string | null } | null | undefined }>
    social: (opts: { provider: string; callbackURL: string }) => Promise<{ error: { message?: string | null } | null | undefined }>
    passkey: (opts?: { callbackURL?: string }) => Promise<{ error: { message?: string | null } | null | undefined }>
  }
}
export type MagicLinkAuthClient = SignInAuthClient  // backwards-compatible alias
```

Change `SignInFormProps.authClient: SignInAuthClient`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/sign-in-form-google.test.tsx tests/sign-in-form.test.tsx`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/pages/sign-in/sign-in-form.tsx tests/sign-in-form-google.test.tsx
git commit -m "feat(sign-in): add google prop with 'Continue with Google' button"
```

---

### Task 11: Add `passkey` prop, button, and browser capability guard

**Spec:** Passkey UX flow + browser-capability guard.

**Files:**
- Modify: `src/pages/sign-in/sign-in-form.tsx`
- Test: `tests/sign-in-form-passkey.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/sign-in-form-passkey.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form.js"

const makeAuthClient = (overrides: Partial<{ passkey: (opts: { callbackURL?: string }) => Promise<{ error: { message?: string } | null }> }> = {}) =>
  ({
    signIn: {
      magicLink: vi.fn(async () => ({ error: null })),
      social: vi.fn(async () => ({ error: null })),
      passkey: overrides.passkey ?? vi.fn(async () => ({ error: null })),
    },
    passkey: { listUserPasskeys: vi.fn(), addPasskey: vi.fn(), deletePasskey: vi.fn() },
  }) as never

describe("<SignInForm passkey/>", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PublicKeyCredential", { value: function () {}, configurable: true })
  })
  afterEach(() => {
    Reflect.deleteProperty(window, "PublicKeyCredential")
  })

  it("renders a passkey button when passkey is set AND PublicKeyCredential exists", async () => {
    render(<SignInForm authClient={makeAuthClient()} passkey />)
    expect(await screen.findByRole("button", { name: /sign in with passkey/i })).toBeInTheDocument()
  })

  it("hides the passkey button when window.PublicKeyCredential is undefined", () => {
    Reflect.deleteProperty(window, "PublicKeyCredential")
    render(<SignInForm authClient={makeAuthClient()} passkey />)
    expect(screen.queryByRole("button", { name: /sign in with passkey/i })).toBeNull()
  })

  it("calls authClient.signIn.passkey({ callbackURL }) on click", async () => {
    const fn = vi.fn(async () => ({ error: null }))
    render(<SignInForm authClient={makeAuthClient({ passkey: fn })} passkey callbackUrl="/dashboard" />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    expect(fn).toHaveBeenCalledWith({ callbackURL: "/dashboard" })
  })

  it("displays an inline error if passkey sign-in fails", async () => {
    const fn = vi.fn(async () => ({ error: { message: "no creds" } }))
    render(<SignInForm authClient={makeAuthClient({ passkey: fn })} passkey />)
    fireEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }))
    expect(await screen.findByText(/no creds/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sign-in-form-passkey.test.tsx`
Expected: FAIL — no passkey button.

- [ ] **Step 3: Implement minimal code**

Edit `src/pages/sign-in/sign-in-form.tsx`. Add to `SignInFormProps`:

```ts
passkey?: boolean | { label?: ReactNode }
```

Add an effect + state for capability detection (top of component body, after existing hooks):

```tsx
import { useEffect } from "react"
// ...
const [isPasskeySupported, setIsPasskeySupported] = useState(false)
useEffect(() => {
  setIsPasskeySupported(
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined"
  )
}, [])
```

Add the click handler:

```tsx
async function onPasskeyClick() {
  if (!props.passkey) return
  setStatus("passkey", "sending")
  setErrorMessage("")
  const { error } = await authClient.signIn.passkey({ callbackURL: callbackUrl })
  if (error) {
    setStatus("passkey", "error")
    setErrorMessage(error.message ?? "Unknown error")
    return
  }
  setStatus("passkey", "sent")
  props.onSignedIn?.()
}
```

Add the conditional render below the google button (inside the form render branch):

```tsx
{props.passkey && isPasskeySupported && (
  <>
    <button
      type="button"
      onClick={onPasskeyClick}
      disabled={methodStatus.passkey === "sending"}
      style={{ padding: "8px 12px", width: "100%", marginBottom: 8 }}
    >
      {methodStatus.passkey === "sending"
        ? "Signing in…"
        : typeof props.passkey === "object" && props.passkey.label
          ? props.passkey.label
          : "Sign in with passkey"}
    </button>
    {methodStatus.passkey === "error" && (
      <p style={{ color: "#b00", marginTop: 4, marginBottom: 8, fontSize: 13 }}>
        {errorCopy(errorMessage)}
      </p>
    )}
  </>
)}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/sign-in-form-passkey.test.tsx tests/sign-in-form-google.test.tsx tests/sign-in-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/sign-in/sign-in-form.tsx tests/sign-in-form-passkey.test.tsx
git commit -m "feat(sign-in): add passkey prop with browser-capability guard"
```

---

### Task 12: Add `magicLink: false` toggle and `dividerLabel`

**Spec:** Render order — divider; new props.

**Files:**
- Modify: `src/pages/sign-in/sign-in-form.tsx`
- Test: `tests/sign-in-form-magic-link-toggle.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/sign-in-form-magic-link-toggle.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { SignInForm } from "../src/pages/sign-in/sign-in-form.js"

const makeAuthClient = () => ({
  signIn: {
    magicLink: vi.fn(async () => ({ error: null })),
    social: vi.fn(async () => ({ error: null })),
    passkey: vi.fn(async () => ({ error: null })),
  },
  passkey: { listUserPasskeys: vi.fn(), addPasskey: vi.fn(), deletePasskey: vi.fn() },
}) as never

describe("<SignInForm magicLink toggle/>", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PublicKeyCredential", { value: function () {}, configurable: true })
  })
  afterEach(() => { Reflect.deleteProperty(window, "PublicKeyCredential") })

  it("renders the email form by default", () => {
    render(<SignInForm authClient={makeAuthClient()} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it("hides the email form when magicLink={false}", () => {
    render(<SignInForm authClient={makeAuthClient()} google passkey magicLink={false} />)
    expect(screen.queryByLabelText(/email/i)).toBeNull()
  })

  it("renders 'or' divider only when both social/passkey AND magicLink are present", () => {
    render(<SignInForm authClient={makeAuthClient()} google />)
    expect(screen.getByText(/or/i)).toBeInTheDocument()
  })

  it("does NOT render divider when only magicLink is present", () => {
    render(<SignInForm authClient={makeAuthClient()} />)
    expect(screen.queryByText(/^or$/i)).toBeNull()
  })

  it("does NOT render divider when only google is present", () => {
    render(<SignInForm authClient={makeAuthClient()} google magicLink={false} />)
    expect(screen.queryByText(/^or$/i)).toBeNull()
  })

  it("accepts a custom dividerLabel", () => {
    render(<SignInForm authClient={makeAuthClient()} google dividerLabel="OR USE EMAIL" />)
    expect(screen.getByText("OR USE EMAIL")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sign-in-form-magic-link-toggle.test.tsx`
Expected: FAIL — no toggle, no divider.

- [ ] **Step 3: Implement minimal code**

Edit `src/pages/sign-in/sign-in-form.tsx`. Add to `SignInFormProps`:

```ts
magicLink?: boolean
dividerLabel?: ReactNode
```

In the component body, destructure with defaults: `const { magicLink = true, dividerLabel = "or" } = props`.

In the JSX, gate the email form on `magicLink`. Insert a divider between social/passkey and the email form:

```tsx
const showDivider = magicLink && (props.google || (props.passkey && isPasskeySupported))

// inside the render branch, between the social/passkey buttons and the email form:
{showDivider && (
  <div style={{ display: "flex", alignItems: "center", margin: "12px 0", gap: 8, fontSize: 13, color: "#888" }}>
    <span style={{ flex: 1, height: 1, background: "#ddd" }} />
    <span>{dividerLabel}</span>
    <span style={{ flex: 1, height: 1, background: "#ddd" }} />
  </div>
)}

{magicLink && (
  // the existing email + button + error markup
)}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/sign-in-form-magic-link-toggle.test.tsx tests/sign-in-form-passkey.test.tsx tests/sign-in-form-google.test.tsx tests/sign-in-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/sign-in/sign-in-form.tsx tests/sign-in-form-magic-link-toggle.test.tsx
git commit -m "feat(sign-in): add magicLink={false} toggle and dividerLabel"
```

---

## Phase 6: UI — `<PasskeyManager/>` + build

### Task 13: Create `<PasskeyManager/>` component

**Spec:** UI: new `<PasskeyManager/>`.

**Files:**
- Create: `src/pages/passkey-manager/index.tsx`
- Test: `tests/passkey-manager.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/passkey-manager.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PasskeyManager } from "../src/pages/passkey-manager/index.js"

function makeClient(opts: {
  list?: Array<{ id: string; name?: string; deviceType?: string; createdAt: string }>
  addResult?: { data?: { id: string } | null; error?: { message?: string } | null }
  deleteResult?: { error?: { message?: string } | null }
}) {
  return {
    signIn: { magicLink: vi.fn(), social: vi.fn(), passkey: vi.fn() },
    passkey: {
      listUserPasskeys: vi.fn(async () => ({ data: opts.list ?? [], error: null })),
      addPasskey: vi.fn(async () => opts.addResult ?? { data: { id: "new" }, error: null }),
      deletePasskey: vi.fn(async () => opts.deleteResult ?? { error: null }),
    },
  } as never
}

describe("<PasskeyManager/>", () => {
  it("renders the empty copy when there are no passkeys", async () => {
    render(<PasskeyManager authClient={makeClient({ list: [] })} />)
    expect(await screen.findByText(/no passkeys yet/i)).toBeInTheDocument()
  })

  it("renders the list of existing passkeys", async () => {
    const list = [
      { id: "p1", name: "MacBook Air", deviceType: "singleDevice", createdAt: new Date().toISOString() },
      { id: "p2", name: "iPhone", deviceType: "multiDevice", createdAt: new Date().toISOString() },
    ]
    render(<PasskeyManager authClient={makeClient({ list })} />)
    expect(await screen.findByText("MacBook Air")).toBeInTheDocument()
    expect(screen.getByText("iPhone")).toBeInTheDocument()
  })

  it("calls addPasskey() when 'Add a passkey' is clicked", async () => {
    const client = makeClient({ list: [] })
    render(<PasskeyManager authClient={client} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    await waitFor(() => expect(client.passkey.addPasskey).toHaveBeenCalled())
  })

  it("removes a row when its 'Remove' button succeeds", async () => {
    const list = [{ id: "p1", name: "MacBook", deviceType: "singleDevice", createdAt: new Date().toISOString() }]
    const client = makeClient({ list })
    render(<PasskeyManager authClient={client} />)
    const row = await screen.findByText("MacBook")
    const remove = (await screen.findAllByRole("button", { name: /remove/i }))[0]
    fireEvent.click(remove)
    await waitFor(() => expect(screen.queryByText("MacBook")).toBeNull())
  })

  it("shows an inline error if add fails", async () => {
    const client = makeClient({ list: [], addResult: { error: { message: "user cancelled" } } })
    render(<PasskeyManager authClient={client} />)
    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }))
    expect(await screen.findByText(/user cancelled/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/passkey-manager.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement minimal code**

Create `src/pages/passkey-manager/index.tsx`:

```tsx
"use client"

import { useEffect, useState, type ReactNode } from "react"
import type { AuthClient } from "../../client/index.js"

export interface PasskeyRowLite {
  id: string
  name?: string | null
  deviceType?: string | null
  createdAt: string | Date
}

export interface PasskeyManagerProps {
  authClient: AuthClient
  className?: string
  emptyCopy?: ReactNode
  addLabel?: ReactNode
  formatDevice?: (p: PasskeyRowLite) => ReactNode
  onAdded?: (id: string) => void
  onRemoved?: (id: string) => void
}

export function PasskeyManager(props: PasskeyManagerProps) {
  const {
    authClient,
    className,
    emptyCopy = "No passkeys yet.",
    addLabel = "Add a passkey",
    formatDevice = (p) => `${p.name ?? p.deviceType ?? "passkey"} · added ${new Date(p.createdAt).toLocaleDateString()}`,
    onAdded,
    onRemoved,
  } = props

  const [rows, setRows] = useState<PasskeyRowLite[] | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys()
      if (cancelled) return
      if (error) setError(error.message ?? "Failed to load passkeys")
      else setRows(data as PasskeyRowLite[])
    })()
    return () => { cancelled = true }
  }, [authClient])

  async function onAdd() {
    setPending(true)
    setError("")
    const { data, error } = await authClient.passkey.addPasskey()
    setPending(false)
    if (error) { setError(error.message ?? "Failed to add passkey"); return }
    if (data?.id) {
      onAdded?.(data.id)
      const refreshed = await authClient.passkey.listUserPasskeys()
      if (!refreshed.error) setRows(refreshed.data as PasskeyRowLite[])
    }
  }

  async function onRemove(id: string) {
    setError("")
    const { error } = await authClient.passkey.deletePasskey({ id })
    if (error) { setError(error.message ?? "Failed to remove passkey"); return }
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev)
    onRemoved?.(id)
  }

  return (
    <div className={className}>
      {rows && rows.length === 0 && <p style={{ fontSize: 13, color: "#666" }}>{emptyCopy}</p>}
      {rows && rows.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <span>{formatDevice(r)}</span>
              <button type="button" onClick={() => onRemove(r.id)} style={{ fontSize: 13 }}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onAdd} disabled={pending} style={{ marginTop: 12, padding: "8px 12px" }}>
        {pending ? "Adding…" : addLabel}
      </button>
      {error && <p style={{ color: "#b00", marginTop: 8, fontSize: 13 }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/passkey-manager.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/passkey-manager/index.tsx tests/passkey-manager.test.tsx
git commit -m "feat(passkey): add <PasskeyManager/> component for settings pages"
```

---

### Task 14: Add tsup entry and package.json export for `/pages/passkey-manager`

**Spec:** UI: new component, separate entry; build pattern from existing /pages/sign-in.

**Files:**
- Modify: `tsup.config.ts`, `package.json`

- [ ] **Step 1: Inspect existing pattern**

Read `tsup.config.ts` and the `exports` field in `package.json`. Find how `pages/sign-in` is wired — including any `onSuccess` "use client" patch.

- [ ] **Step 2: Add the new entry**

Edit `tsup.config.ts`. Add `"src/pages/passkey-manager/index.tsx"` to the `entry` array. In the `onSuccess` shell script that prepends `"use client"`, add the new file path (mirroring the sign-in one):

```ts
// inside onSuccess
'echo "\\"use client\\"\\n$(cat dist/pages/passkey-manager/index.js)" > dist/pages/passkey-manager/index.js',
```

Edit `package.json`. Under `"exports"`, add:

```json
"./pages/passkey-manager": {
  "types": "./dist/pages/passkey-manager/index.d.ts",
  "default": "./dist/pages/passkey-manager/index.js"
},
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: builds without error; `dist/pages/passkey-manager/index.js` exists and starts with `"use client"`.

Verify:

```bash
head -1 dist/pages/passkey-manager/index.js
```

Expected output: `"use client"`

- [ ] **Step 4: Commit**

```bash
git add tsup.config.ts package.json package-lock.json
git commit -m "build: ship /pages/passkey-manager as a client entry"
```

---

## Phase 7: Example app + migration

### Task 15: Update `examples/basic` to opt into google + passkey

**Files:**
- Modify: `examples/basic/lib/auth.ts`
- Modify: `examples/basic/.env.example`

- [ ] **Step 1: Update auth factory in example**

Edit `examples/basic/lib/auth.ts`:

```ts
import { createAuth } from "@naeemba/next-starter/auth"

const googleConfigured = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET

export const auth = createAuth({
  ...(googleConfigured && {
    google: {
      // clientId/clientSecret picked up from env automatically
    },
  }),
  passkey: {
    rpName: "Next Starter Example",
  },
})

export const googleEnabled = googleConfigured
```

Edit `examples/basic/.env.example`. Append:

```
# Optional: enable Google sign-in
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 2: Smoke check**

Run: `cd examples/basic && npx tsc --noEmit && cd ../..`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add examples/basic/lib/auth.ts examples/basic/.env.example
git commit -m "example: opt examples/basic into google (env-gated) + passkey"
```

---

### Task 16: Generate drizzle migration for the passkey table

**Files:**
- Add: `examples/basic/drizzle/<NNNN>_<name>.sql` (generated)
- Possibly add: `examples/basic/drizzle/meta/_journal.json` (regenerated)

- [ ] **Step 1: Run drizzle-kit generate from the example dir**

Run: `cd examples/basic && DATABASE_URL=postgres://u:p@h/d npx drizzle-kit generate && cd ../..`
Expected: a new file `examples/basic/drizzle/0001_*.sql` appears containing `CREATE TABLE "passkey" (...)`.

- [ ] **Step 2: Verify the SQL contains the expected columns**

```bash
grep -E "passkey|public_key|credential_id|backed_up" examples/basic/drizzle/0001_*.sql
```

Expected: matches show the table and key columns from Task 1's schema.

- [ ] **Step 3: Commit**

```bash
git add examples/basic/drizzle/
git commit -m "example(migration): add 0001 — passkey table"
```

---

### Task 17: Update example sign-in page to render google + passkey buttons

**Files:**
- Modify: `examples/basic/app/sign-in/page.tsx`

- [ ] **Step 1: Read current sign-in page**

Run: `cat examples/basic/app/sign-in/page.tsx`

- [ ] **Step 2: Update to pass new props**

Edit `examples/basic/app/sign-in/page.tsx`:

```tsx
"use client"

import { SignInForm } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "../../lib/auth-client"

const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1"

export default function SignInPage() {
  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Sign in</h1>
      <SignInForm
        authClient={authClient}
        callbackUrl="/"
        google={googleEnabled}
        passkey
      />
    </main>
  )
}
```

The page is a client component, so it can't import server-only `lib/auth.ts`. Gate the Google button on a `NEXT_PUBLIC_ENABLE_GOOGLE` env var that the consumer sets alongside `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Append to `examples/basic/.env.example`:

```
# Set to 1 alongside GOOGLE_CLIENT_ID/SECRET to render the Google button on the sign-in page.
# NEXT_PUBLIC_ENABLE_GOOGLE=1
```

- [ ] **Step 3: Smoke check**

Run: `cd examples/basic && npx tsc --noEmit && cd ../..`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add examples/basic/app/sign-in/page.tsx examples/basic/.env.example
git commit -m "example: render google + passkey buttons on sign-in page"
```

---

### Task 18: Add settings page with `<PasskeyManager/>`

**Files:**
- Create: `examples/basic/app/settings/passkeys/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client"

import { PasskeyManager } from "@naeemba/next-starter/pages/passkey-manager"
import { authClient } from "../../../lib/auth-client"

export default function PasskeysPage() {
  return (
    <main style={{ maxWidth: 520, margin: "10vh auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Your passkeys</h1>
      <PasskeyManager authClient={authClient} />
    </main>
  )
}
```

- [ ] **Step 2: Smoke check**

Run: `cd examples/basic && npx tsc --noEmit && cd ../..`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add examples/basic/app/settings/passkeys/page.tsx
git commit -m "example: add /settings/passkeys page with <PasskeyManager/>"
```

---

### Task 19: Add a passkey-sign-in path to the Playwright smoke test

**Files:**
- Modify: `examples/basic/e2e/magic-link.spec.ts` (or create `examples/basic/e2e/passkey.spec.ts`)

- [ ] **Step 1: Create a new e2e file using a virtual authenticator**

Create `examples/basic/e2e/passkey.spec.ts`:

```ts
import { test, expect, type CDPSession } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

let server: ChildProcess

test.beforeAll(async () => {
  server = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    env: { ...process.env, RESEND_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const ready = Date.now() + 60_000
  while (Date.now() < ready) {
    await sleep(300)
    // start condition matches existing magic-link spec; simplified here
    if (server.pid) break
  }
})

test.afterAll(async () => {
  server.kill("SIGTERM")
})

test("can register and sign in with a passkey", async ({ page, context }) => {
  // Enable virtual authenticator via CDP
  const cdp: CDPSession = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })

  // Sign in via magic link first to create a session (re-use existing helper if extracted)
  // ...for brevity, this test assumes the example's sign-in flow puts the user on / with a session.

  await page.goto("http://localhost:3000/settings/passkeys")
  await page.getByRole("button", { name: /add a passkey/i }).click()
  await expect(page.getByText(/added/i)).toBeVisible({ timeout: 10_000 })

  // Sign out and sign back in with passkey
  // ...sign-out helper TBD; if not yet shipped (out of scope for 0.3.0),
  // assert only the registration round-trip and leave the sign-in-by-passkey
  // smoke as a manual step documented in examples/basic/README.md.
})
```

Note: a full passkey sign-IN e2e requires an existing session and a sign-out path — the latter is out of scope for 0.3.0 per the spec's non-goals. For now, this test only asserts registration. Document the manual smoke step in `examples/basic/README.md` if it exists, or add a one-line README note.

- [ ] **Step 2: Verify it runs (or skips cleanly)**

Run: `cd examples/basic && npx playwright test e2e/passkey.spec.ts || echo "skipped — investigate"`
If it fails because Playwright/setup isn't configured for CI, mark the test as `test.skip` with a clear reason — DO NOT silently ignore the failure.

- [ ] **Step 3: Commit**

```bash
git add examples/basic/e2e/passkey.spec.ts
git commit -m "example(e2e): add passkey registration smoke test with virtual authenticator"
```

---

## Phase 8: Docs + release

### Task 20: Update README with features matrix

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

Run: `head -80 README.md`

- [ ] **Step 2: Add a 'Sign-in methods' section near the top**

Edit `README.md`. After the existing intro, insert:

```markdown
## Sign-in methods

| Method      | Enable via                                             | Required env                                |
| ----------- | ------------------------------------------------------ | ------------------------------------------- |
| Magic link  | Default (or `createAuth({ magicLink: {...} })`)        | `RESEND_API_KEY` in production              |
| Google      | `createAuth({ google: {} })`                           | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`  |
| Passkey     | `createAuth({ passkey: { rpName: 'Your App' } })`      | none (uses `BETTER_AUTH_URL`)               |

Each method is opt-in. Enabling one does not require the others.

### Google

```ts
export const auth = createAuth({
  google: {
    // clientId/clientSecret default to env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
    allowlist: (profile) => profile.email.endsWith("@acme.com"),
  },
})
```

`createAuth({ google })` auto-enables account linking with Google as a trusted provider. Pass `accountLinking: false` to opt out.

### Passkey

```ts
export const auth = createAuth({
  passkey: {
    rpName: "Your App",
    // rpID and origin default from BETTER_AUTH_URL
  },
})
```

Add a settings page:

```tsx
import { PasskeyManager } from "@naeemba/next-starter/pages/passkey-manager"
import { authClient } from "../lib/auth-client"

export default function PasskeysPage() {
  return <PasskeyManager authClient={authClient} />
}
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): add sign-in methods matrix and setup snippets"
```

---

### Task 21: Append 0.2.x → 0.3.0 section to UPGRADING.md

**Files:**
- Modify: `UPGRADING.md`

- [ ] **Step 1: Append the section**

Edit `UPGRADING.md`. Append:

```markdown
## 0.2.x → 0.3.0

0.3.0 is fully additive. Existing 0.2.x consumers need no code changes unless they opt in to a new method.

### What's new

- `createAuth({ google: {...} })` — Google OAuth via better-auth `socialProviders`. Auto-enables account linking with Google as a trusted provider (verified-email gated).
- `createAuth({ passkey: {...} })` — WebAuthn passkey support via `@better-auth/passkey`.
- `<SignInForm/>` gains `google`, `passkey`, `magicLink`, `dividerLabel`, and `onSignedIn` props.
- New `@naeemba/next-starter/pages/passkey-manager` entry exporting `<PasskeyManager/>` for settings pages.
- `passkey` table added to `@naeemba/next-starter/schema` (unconditionally — empty if you don't use passkey).

### Migration steps (only if you enable passkey)

1. Pull the new schema export:

```ts
// db/schema.ts
export * from "@naeemba/next-starter/schema"  // already exports `passkey` in 0.3.0
```

2. Generate a migration (drizzle-kit):

```bash
DATABASE_URL=... npx drizzle-kit generate
```

3. Apply it:

```bash
DATABASE_URL=... npx drizzle-kit migrate
```

If you do not enable passkey, you can skip the migration; the empty table costs nothing.

### Migration steps (only if you enable Google)

1. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your env.
2. Update your auth factory:

```ts
export const auth = createAuth({
  // ...existing config
  google: {},
})
```

3. (Optional) Pass `allowlist` to gate sign-ups by email domain.

### Defaults to know

- When `google` is set and `accountLinking` is not explicitly disabled, the factory wires `accountLinking: { enabled: true, trustedProviders: ["google"] }`. Sign-ins with a verified Google email matching an existing user's email link to the same user.
- When `passkey` is enabled but `window.PublicKeyCredential` is undefined (older browsers), the passkey button is hidden silently. No console noise; no broken click.
```

- [ ] **Step 2: Commit**

```bash
git add UPGRADING.md
git commit -m "docs(upgrading): add 0.2.x → 0.3.0 migration section"
```

---

### Task 22: Bump version, run full test suite, push tag (release)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

Edit `package.json`. Change `"version": "0.2.0"` to `"version": "0.3.0"`.

- [ ] **Step 2: Run full local validation**

Run sequentially:

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all green. If anything fails, fix it before continuing — do NOT proceed to publish.

- [ ] **Step 3: Commit and tag**

```bash
git add package.json
git commit -m "chore: bump to 0.3.0"
```

The `preversion` and `postversion` hooks won't fire on a manual edit; create the tag manually:

```bash
git tag -a v0.3.0 -m "v0.3.0 — Google OAuth + Passkey login

Additive release: opt-in google and passkey factory options,
SignInForm prop extensions, new PasskeyManager component,
passkey table added to schema. See UPGRADING.md for details.
"
```

- [ ] **Step 4: Push the branch and tag**

```bash
git push -u origin feat/0.3.0-google-passkey
# After PR review + merge to main, switch to main and push the tag:
git checkout main && git pull --ff-only && git push origin v0.3.0
```

The Release workflow (`.github/workflows/release.yml`) handles `npm publish` on tag push.

---

## Post-implementation verification

Before declaring done:

- [ ] All tests pass: `npm test`
- [ ] Typecheck clean: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] `dist/pages/passkey-manager/index.js` starts with `"use client"`
- [ ] `dist/pages/sign-in/index.js` still starts with `"use client"` (no regression)
- [ ] Example app typechecks: `cd examples/basic && npx tsc --noEmit`
- [ ] `npm view @naeemba/next-starter@0.3.0 version` returns `0.3.0` after the Release workflow runs
