# Postal Email Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Postal as a first-class built-in email provider alongside Resend and console, selected via an explicit `EMAIL_TRANSPORT` env var, backward-compatible when unset.

**Architecture:** A single `resolveProvider(env)` maps env → one of `'resend' | 'postal' | 'console'`; `sendEmail` switches on it. A new `sendViaPostal` posts to the Postal HTTPS API via `fetch` (no new dependency). Env validation in `auth/config.ts` requires a provider's vars only when that provider is explicitly selected.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod v4, Vitest, native `fetch`.

## Global Constraints

- ESM only; relative imports use `.js` specifiers (e.g. `./provider.js`).
- No new runtime dependency — Postal uses native `fetch`.
- No abbreviations in identifiers; spell names out in full.
- No "Claude"/"Anthropic"/AI attribution anywhere (code, comments, commits).
- Backward compatible: `EMAIL_TRANSPORT` unset → identical current behavior.
- All error messages prefixed `[@naeemba/next-starter]`.
- Transport arg shape is `EmailArgs` from `src/email/console.ts`:
  `{ to: string; from: string; subject: string; html: string | undefined; text: string }`.
- Run tests with `npx vitest run <file>`; full suite `npm test`; types `npm run typecheck`.

---

### Task 1: Provider resolver

**Files:**
- Create: `src/email/provider.ts`
- Test: `tests/email-provider.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type EmailProvider = "resend" | "postal" | "console"`
  - `export function resolveProvider(env: { EMAIL_TRANSPORT?: string; RESEND_API_KEY?: string }): EmailProvider`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/email-provider.test.ts
import { describe, it, expect } from "vitest"
import { resolveProvider } from "../src/email/provider"

describe("resolveProvider", () => {
  it("returns the explicit EMAIL_TRANSPORT when valid", () => {
    expect(resolveProvider({ EMAIL_TRANSPORT: "postal" })).toBe("postal")
    expect(resolveProvider({ EMAIL_TRANSPORT: "resend" })).toBe("resend")
    expect(resolveProvider({ EMAIL_TRANSPORT: "console" })).toBe("console")
  })

  it("explicit value wins even when RESEND_API_KEY is present", () => {
    expect(resolveProvider({ EMAIL_TRANSPORT: "console", RESEND_API_KEY: "re_x" })).toBe("console")
  })

  it("falls back to resend when unset and RESEND_API_KEY present", () => {
    expect(resolveProvider({ RESEND_API_KEY: "re_x" })).toBe("resend")
  })

  it("falls back to console when unset and no RESEND_API_KEY", () => {
    expect(resolveProvider({})).toBe("console")
  })

  it("ignores an unrecognized EMAIL_TRANSPORT and uses the auto heuristic", () => {
    expect(resolveProvider({ EMAIL_TRANSPORT: "sendgrid", RESEND_API_KEY: "re_x" })).toBe("resend")
    expect(resolveProvider({ EMAIL_TRANSPORT: "sendgrid" })).toBe("console")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email-provider.test.ts`
Expected: FAIL — cannot resolve `../src/email/provider`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/email/provider.ts

/** Built-in email delivery providers, selected by EMAIL_TRANSPORT. */
export type EmailProvider = "resend" | "postal" | "console"

/**
 * Resolve which built-in provider `sendEmail` should use.
 *
 * - An explicit, recognized `EMAIL_TRANSPORT` always wins.
 * - When unset (or unrecognized), fall back to the historical heuristic:
 *   a present `RESEND_API_KEY` selects Resend, otherwise console. This keeps
 *   existing consumers — who never set `EMAIL_TRANSPORT` — behaving exactly
 *   as before.
 *
 * A custom `transport` passed to `sendEmail` bypasses this entirely; it is
 * resolved by the caller before this function is consulted.
 */
export function resolveProvider(env: {
  EMAIL_TRANSPORT?: string
  RESEND_API_KEY?: string
}): EmailProvider {
  const explicit = env.EMAIL_TRANSPORT
  if (explicit === "resend" || explicit === "postal" || explicit === "console") {
    return explicit
  }
  return env.RESEND_API_KEY ? "resend" : "console"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email-provider.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/email/provider.ts tests/email-provider.test.ts
git commit -m "feat(email): add provider resolver for EMAIL_TRANSPORT selection"
```

---

### Task 2: Postal transport

**Files:**
- Create: `src/email/postal.ts`
- Test: `tests/postal.test.ts`

**Interfaces:**
- Consumes: `EmailArgs` from `src/email/console.ts`.
- Produces: `export function sendViaPostal(args: EmailArgs): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/postal.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { sendViaPostal } from "../src/email/postal"

const ARGS = {
  to: "user@example.com",
  from: "auth@example.com",
  subject: "Sign in",
  html: "<p>link</p>",
  text: "link",
}

describe("sendViaPostal", () => {
  let originalUrl: string | undefined
  let originalKey: string | undefined
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalUrl = process.env.POSTAL_API_URL
    originalKey = process.env.POSTAL_API_KEY
    process.env.POSTAL_API_URL = "https://postal.example.com"
    process.env.POSTAL_API_KEY = "postal_key_123"
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "success" }),
    }))
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalUrl === undefined) delete process.env.POSTAL_API_URL
    else process.env.POSTAL_API_URL = originalUrl
    if (originalKey === undefined) delete process.env.POSTAL_API_KEY
    else process.env.POSTAL_API_KEY = originalKey
  })

  it("posts to the Postal send endpoint with the API key header and mapped body", async () => {
    await sendViaPostal(ARGS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://postal.example.com/api/v1/send/message")
    expect(init.method).toBe("POST")
    expect(init.headers["X-Server-API-Key"]).toBe("postal_key_123")
    expect(JSON.parse(init.body)).toEqual({
      to: ["user@example.com"],
      from: "auth@example.com",
      subject: "Sign in",
      html_body: "<p>link</p>",
      plain_body: "link",
    })
  })

  it("throws when Postal returns a non-success status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "error" }),
    })
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/Postal send failed/)
  })

  it("throws when the HTTP response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => null,
    })
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/HTTP 500/)
  })

  it("throws when POSTAL_API_URL is missing", async () => {
    delete process.env.POSTAL_API_URL
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/POSTAL_API_URL is required/)
  })

  it("throws when POSTAL_API_KEY is missing", async () => {
    delete process.env.POSTAL_API_KEY
    await expect(sendViaPostal(ARGS)).rejects.toThrow(/POSTAL_API_KEY is required/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/postal.test.ts`
Expected: FAIL — cannot resolve `../src/email/postal`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/email/postal.ts
import type { EmailArgs } from "./console.js"

/**
 * Deliver a rendered email through a self-hosted Postal server's HTTPS API.
 * Dependency-free (native fetch), mirroring the Resend transport's no-SMTP
 * posture. Selected when EMAIL_TRANSPORT=postal (or a custom transport is not
 * supplied and this provider is resolved).
 *
 * Env:
 *   POSTAL_API_URL  e.g. https://postal.example.com
 *   POSTAL_API_KEY  a Postal server API credential key
 */
export async function sendViaPostal(args: EmailArgs): Promise<void> {
  const url = process.env.POSTAL_API_URL
  const key = process.env.POSTAL_API_KEY
  if (!url) {
    throw new Error("[@naeemba/next-starter] POSTAL_API_URL is required to use the Postal transport.")
  }
  if (!key) {
    throw new Error("[@naeemba/next-starter] POSTAL_API_KEY is required to use the Postal transport.")
  }

  const res = await fetch(`${url}/api/v1/send/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Server-API-Key": key,
    },
    body: JSON.stringify({
      to: [args.to],
      from: args.from,
      subject: args.subject,
      html_body: args.html,
      plain_body: args.text,
    }),
  })

  // Postal answers HTTP 200 even on failure, distinguishing outcomes via a
  // JSON `status` field ('success' | 'error' | 'parameter-error').
  const body = (await res.json().catch(() => null)) as { status?: string } | null
  if (!res.ok || body?.status !== "success") {
    throw new Error(
      `[@naeemba/next-starter] Postal send failed (HTTP ${res.status}): ${JSON.stringify(body)}`
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/postal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/email/postal.ts tests/postal.test.ts
git commit -m "feat(email): add Postal HTTPS API transport"
```

---

### Task 3: Wire Postal into sendEmail dispatch

**Files:**
- Modify: `src/email/index.ts` (dispatch block lines 40–45 and 71–77)
- Test: `tests/send-email.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveProvider` (Task 1), `sendViaPostal` (Task 2), existing `sendViaResend`, `sendViaConsole`.
- Produces: no new export; `sendEmail` now honors `EMAIL_TRANSPORT`.

- [ ] **Step 1: Write the failing test** — append these cases inside the existing `describe("sendEmail transport selection", ...)` block in `tests/send-email.test.ts`. Add a Postal mock at the top of the file alongside the console/resend mocks, and extend teardown to reset the Postal env vars.

Add near the other `vi.mock` lines:

```typescript
const postalSpy = vi.fn<(args: any) => Promise<void>>(async () => {})
vi.mock("../src/email/postal", () => ({ sendViaPostal: postalSpy }))
```

In `beforeEach`, add `postalSpy.mockClear()` and capture Postal env:

```typescript
const originalTransport = process.env.EMAIL_TRANSPORT
```

(store/restore `EMAIL_TRANSPORT`, `POSTAL_API_URL`, `POSTAL_API_KEY` in the same
save/restore style the file already uses for `RESEND_API_KEY`).

New test cases:

```typescript
it("uses Postal when EMAIL_TRANSPORT=postal", async () => {
  process.env.EMAIL_TRANSPORT = "postal"
  process.env.EMAIL_FROM = "auth@example.com"
  const { sendEmail } = await import("../src/email/index")
  await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
  expect(postalSpy).toHaveBeenCalledTimes(1)
  expect(resendSpy).not.toHaveBeenCalled()
  expect(consoleSpy).not.toHaveBeenCalled()
})

it("uses Resend when EMAIL_TRANSPORT=resend even without an API key env heuristic", async () => {
  process.env.EMAIL_TRANSPORT = "resend"
  process.env.EMAIL_FROM = "auth@example.com"
  const { sendEmail } = await import("../src/email/index")
  await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
  expect(resendSpy).toHaveBeenCalledTimes(1)
  expect(postalSpy).not.toHaveBeenCalled()
})

it("uses console when EMAIL_TRANSPORT=console even with RESEND_API_KEY present", async () => {
  process.env.EMAIL_TRANSPORT = "console"
  process.env.RESEND_API_KEY = "re_x"
  process.env.EMAIL_FROM = "auth@example.com"
  const { sendEmail } = await import("../src/email/index")
  await sendEmail({ to: "a@example.com", subject: "Hi", text: "plain" })
  expect(consoleSpy).toHaveBeenCalledTimes(1)
  expect(resendSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/send-email.test.ts`
Expected: FAIL — `EMAIL_TRANSPORT=postal` currently routes to console/resend, so `postalSpy` is not called.

- [ ] **Step 3: Write minimal implementation** — edit `src/email/index.ts`.

Add imports near the top (after the existing email imports):

```typescript
import { sendViaPostal } from "./postal.js"
import { resolveProvider } from "./provider.js"
```

Replace the production-warning block (currently lines 40–45) with a version that
resolves the provider once and warns whenever the resolved built-in provider is
`console` in production:

```typescript
  const provider = args.transport ? null : resolveProvider(process.env)

  // Only the built-in dispatch path falls back to console-logging in
  // production. A custom transport is the consumer's surface — they handle
  // their own provider config and shouldn't see this warning.
  if (!args.transport && process.env.NODE_ENV === "production" && provider === "console") {
    console.warn(
      "[@naeemba/next-starter] WARNING: NODE_ENV=production but the resolved email " +
        "provider is 'console'. Emails will be written to server logs instead of sent."
    )
  }
```

Replace the terminal dispatch block (currently lines 71–77) with:

```typescript
  if (args.transport) {
    await args.transport(transportArgs)
  } else if (provider === "resend") {
    await sendViaResend(transportArgs)
  } else if (provider === "postal") {
    await sendViaPostal(transportArgs)
  } else {
    await sendViaConsole(transportArgs)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/send-email.test.ts`
Expected: PASS (existing cases + 3 new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/email/index.ts tests/send-email.test.ts
git commit -m "feat(email): dispatch Postal via EMAIL_TRANSPORT in sendEmail"
```

---

### Task 4: Validate Postal env at auth startup

**Files:**
- Modify: `src/auth/config.ts` (`EnvSchema`, lines 64–76; add an `optionalUrl` helper near the other helpers)
- Test: `tests/auth-config.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Env` now includes `EMAIL_TRANSPORT?`, `POSTAL_API_URL?`, `POSTAL_API_KEY?`.

- [ ] **Step 1: Write the failing test** — append to `describe("parseEnv", ...)` in `tests/auth-config.test.ts`:

```typescript
it("accepts EMAIL_TRANSPORT=postal when both POSTAL_* vars are set", () => {
  const env = parseEnv({
    ...BASE_ENV,
    EMAIL_TRANSPORT: "postal",
    POSTAL_API_URL: "https://postal.example.com",
    POSTAL_API_KEY: "postal_key_123",
  })
  expect(env.EMAIL_TRANSPORT).toBe("postal")
  expect(env.POSTAL_API_URL).toBe("https://postal.example.com")
})

it("rejects EMAIL_TRANSPORT=postal when POSTAL_API_KEY is missing", () => {
  expect(() =>
    parseEnv({
      ...BASE_ENV,
      EMAIL_TRANSPORT: "postal",
      POSTAL_API_URL: "https://postal.example.com",
    })
  ).toThrow(/POSTAL_API_KEY is required when EMAIL_TRANSPORT=postal/)
})

it("rejects EMAIL_TRANSPORT=resend when RESEND_API_KEY is missing", () => {
  expect(() =>
    parseEnv({ ...BASE_ENV, EMAIL_TRANSPORT: "resend" })
  ).toThrow(/RESEND_API_KEY is required when EMAIL_TRANSPORT=resend/)
})

it("does not require POSTAL_* when EMAIL_TRANSPORT is unset", () => {
  const env = parseEnv({ ...BASE_ENV })
  expect(env.EMAIL_TRANSPORT).toBeUndefined()
})

it("rejects an unknown EMAIL_TRANSPORT value", () => {
  expect(() =>
    parseEnv({ ...BASE_ENV, EMAIL_TRANSPORT: "sendgrid" })
  ).toThrow(/EMAIL_TRANSPORT/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-config.test.ts`
Expected: FAIL — `EMAIL_TRANSPORT` not in schema; no refine.

- [ ] **Step 3: Write minimal implementation** — edit `src/auth/config.ts`.

Add an `optionalUrl` helper next to `optionalEmail` (after line 20):

```typescript
const optionalUrl = () =>
  z.preprocess(emptyToUndefined, z.string().url().optional())
```

Add three fields inside `z.object({ ... })` (alongside `RESEND_API_KEY`):

```typescript
  EMAIL_TRANSPORT: z.preprocess(
    emptyToUndefined,
    z.enum(["resend", "postal", "console"]).optional()
  ),
  POSTAL_API_URL: optionalUrl(),
  POSTAL_API_KEY: optionalString(),
```

Attach a `superRefine` to the object schema (change `const EnvSchema = z.object({...})`
to `const EnvSchema = z.object({...}).superRefine((val, ctx) => { ... })`):

```typescript
.superRefine((val, ctx) => {
  // A provider's credentials are required only when that provider is
  // explicitly selected. When EMAIL_TRANSPORT is unset the auto heuristic
  // applies and nothing here is enforced — preserving prior behavior.
  if (val.EMAIL_TRANSPORT === "postal") {
    for (const key of ["POSTAL_API_URL", "POSTAL_API_KEY"] as const) {
      if (!val[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when EMAIL_TRANSPORT=postal`,
        })
      }
    }
  } else if (val.EMAIL_TRANSPORT === "resend") {
    if (!val.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend",
      })
    }
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-config.test.ts`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/auth/config.ts tests/auth-config.test.ts
git commit -m "feat(auth): validate Postal env vars for EMAIL_TRANSPORT=postal"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md` (email/provider section)
- Modify: `UPGRADING.md`
- Modify: `.env.example` if it exists (check first with `ls .env.example`)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update README email section**

Find the email/Resend section in `README.md` and document the three providers +
selector. Add a table and the Postal env vars:

```markdown
### Email delivery

`EMAIL_TRANSPORT` selects the built-in provider:

| `EMAIL_TRANSPORT` | Delivery | Required env |
| ----------------- | -------- | ------------ |
| _(unset)_         | Auto: Resend if `RESEND_API_KEY` is set, else console | — |
| `resend`          | Resend HTTPS API | `RESEND_API_KEY` |
| `postal`          | Self-hosted Postal HTTPS API | `POSTAL_API_URL`, `POSTAL_API_KEY` |
| `console`         | Logs to the server console (dev) | — |

All providers use `EMAIL_FROM` as the sender. A custom `transport` passed to
`createAuth` / `sendEmail` overrides this selection entirely.

**Postal:** point `POSTAL_API_URL` at your Postal server (e.g.
`https://postal.example.com`) and set `POSTAL_API_KEY` to a server API
credential. Delivery uses the Postal HTTPS API — no SMTP client is added.
```

- [ ] **Step 2: Update `.env.example` (only if it exists)**

Run: `ls .env.example` — if present, add:

```bash
# Email provider: resend | postal | console (unset = auto-detect)
EMAIL_TRANSPORT=
EMAIL_FROM=auth@example.com
# RESEND_API_KEY=
# POSTAL_API_URL=https://postal.example.com
# POSTAL_API_KEY=
```

- [ ] **Step 3: Add an UPGRADING.md note**

Add an entry flagged additive / non-breaking:

```markdown
### Postal email provider (additive, non-breaking)

`EMAIL_TRANSPORT` now selects the built-in email provider: `resend`, `postal`,
or `console`. Leaving it unset preserves the previous behavior exactly (Resend
when `RESEND_API_KEY` is set, otherwise console) — no action required. To use a
self-hosted Postal server, set `EMAIL_TRANSPORT=postal` with `POSTAL_API_URL`
and `POSTAL_API_KEY`.
```

- [ ] **Step 4: Verify docs build / no broken references**

Run: `npm run typecheck`
Expected: pass (docs don't affect types, but confirms nothing was left half-edited).

- [ ] **Step 5: Commit**

```bash
git add README.md UPGRADING.md .env.example
git commit -m "docs(email): document EMAIL_TRANSPORT and Postal provider"
```

---

## Final verification

- [ ] Run `npm test` — all suites pass.
- [ ] Run `npm run typecheck` — clean.
- [ ] Run `npm run build` — succeeds.
- [ ] Confirm `git status` clean and branch `feat/postal-email-provider` holds all commits.

Version bump (`npm run release:minor` → 0.10.0) happens on `main` after merge — **not** in this branch.
