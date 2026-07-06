# Postal Email Provider — Design

**Date:** 2026-07-07
**Status:** Approved
**Scope:** Add Postal as a first-class built-in email provider alongside Resend and console, selected via an explicit `EMAIL_TRANSPORT` env var. Backward-compatible.

## Motivation

The starter ships two built-in email paths (Resend for production, console for
dev), dispatched implicitly by the presence of `RESEND_API_KEY`. Consumers
running a self-hosted [Postal](https://github.com/postalserver/postal) mail
server currently have to wire it themselves through the `transport` injection
hook. This makes Postal a first-class, zero-config provider — set env vars and
it works — the same way Resend already does.

Reference wiring (existing consumer): `ledger-cli-ui/lib/email-transport.ts`
sends magic links via the Postal HTTPS API. This design lifts that pattern into
the package.

## Goals

- Postal delivery selectable via `EMAIL_TRANSPORT=postal`, driven by
  `POSTAL_API_URL` + `POSTAL_API_KEY`.
- Unify all three built-in providers (`resend`, `postal`, `console`) under one
  explicit selector, replacing the implicit key-presence heuristic — while
  keeping that heuristic as the default when the selector is unset.
- Dependency-free: Postal uses the Postal HTTPS API via `fetch`, matching the
  Resend transport's no-SMTP posture. **No `nodemailer`, no new runtime dep.**

## Non-Goals (YAGNI)

- No SMTP transport (would add `nodemailer`).
- No Postal attachments, tags, or custom headers — only the magic-link send path.
- No retry / backoff logic (matches the existing Resend transport).
- No change to `EMAIL_FROM` handling or defaults.

## Architecture

### Dispatch model

Resolution order inside `sendEmail` (`src/email/index.ts`):

1. `args.transport` set → call it, skip all built-ins. **Unchanged; wins.**
2. Else resolve a provider **name**:
   - `EMAIL_TRANSPORT` set → its value (`'resend' | 'postal' | 'console'`).
   - Unset → **auto** (current behavior): `RESEND_API_KEY` present ? `'resend'`
     : `'console'`.
3. `switch` on the name → `sendViaResend` / `sendViaPostal` / `sendViaConsole`.

The provider-name enum and the `resolveProvider(env)` function live in a single
new module `src/email/provider.ts`, imported by both the runtime dispatch
(`index.ts`) and the env validation (`auth/config.ts`), so the two cannot drift.

### Components

| File | Change | Purpose |
|------|--------|---------|
| `src/email/provider.ts` | **new** | `EmailProvider` enum type + `resolveProvider(env)` — single source of truth for name resolution. |
| `src/email/postal.ts` | **new** | `sendViaPostal(args)` — Postal HTTPS API send via `fetch`. |
| `src/email/index.ts` | change | Replace `if/else if/else` dispatch with resolver + switch. Generalize the production warning. |
| `src/auth/config.ts` | change | Add `EMAIL_TRANSPORT`, `POSTAL_API_URL`, `POSTAL_API_KEY` to `EnvSchema` + `superRefine` for per-provider required vars. |

### `src/email/postal.ts`

Mirrors `resend.ts`'s guard + error style and the reference transport's request
shape:

- Reads `POSTAL_API_URL` and `POSTAL_API_KEY` from `process.env`. Throws a
  clear `[@naeemba/next-starter] POSTAL_API_URL is required ...` style error if
  either is missing (parallels `resend.ts` `getClient()`).
- `POST ${POSTAL_API_URL}/api/v1/send/message`
  - Header: `X-Server-API-Key: <POSTAL_API_KEY>`, `Content-Type: application/json`
  - Body: `{ to: [to], from, subject, html_body: html, plain_body: text }`
- Postal returns HTTP 200 even on failure, with a JSON `status` field
  (`'success' | 'error' | 'parameter-error'`). Success requires
  `res.ok && body.status === 'success'`; otherwise throw with the HTTP status
  and parsed body.

Accepts the shared `EmailArgs` transport shape from `console.ts`
(`{ to, from, subject, html, text }`).

### `src/email/index.ts`

- Replace the terminal dispatch block with:
  1. if `args.transport` → call it.
  2. else `switch (resolveProvider(process.env))`.
- Generalize the production warning: warn when the **resolved provider is
  `console`** while `NODE_ENV=production` (covers both unset-`RESEND_API_KEY`
  and explicit `EMAIL_TRANSPORT=console`). Skip the warning when a custom
  `transport` is supplied (unchanged rationale).

### `src/auth/config.ts`

Add to `EnvSchema`:

- `EMAIL_TRANSPORT: z.enum(['resend', 'postal', 'console']).optional()`
- `POSTAL_API_URL: optionalString()`  (URL-shaped; reuse existing helper style)
- `POSTAL_API_KEY: optionalString()`

Add a `superRefine` that runs **only when `EMAIL_TRANSPORT` is explicitly set**:

- `=== 'postal'` → require both `POSTAL_API_URL` and `POSTAL_API_KEY`; emit a
  per-field issue (`"<VAR> is required when EMAIL_TRANSPORT=postal"`).
- `=== 'resend'` → require `RESEND_API_KEY`.
- `=== 'console'` → no required vars.

When `EMAIL_TRANSPORT` is unset, the refine is a no-op — the auto path stays
lenient, preserving today's behavior.

## Error Handling

- Postal send failure (`!res.ok || status !== 'success'`) → throw
  `[@naeemba/next-starter] Postal send failed (HTTP <status>): <body>`.
- Missing Postal env when the postal path is chosen → throw at call time
  (guard in `postal.ts`), plus fail-fast at auth startup via the `superRefine`.
- JSON parse of the Postal response is defensive (`.catch(() => null)`).

## Backward Compatibility

`EMAIL_TRANSPORT` unset → behavior is byte-identical to today: `RESEND_API_KEY`
present picks Resend, else console. Existing consumers change nothing. The
change is purely **additive**.

Versioning: adds a feature → **minor** bump (`0.9.x` → `0.10.0`). No breaking
change. Bump happens via `npm run release:minor` on `main` (not in this PR).

## Testing

- `tests/postal.test.ts` (**new**): `fetch` mocked via `vi.fn`.
  - success (`status: 'success'`) resolves.
  - `status: 'error'` throws.
  - non-`ok` HTTP throws.
  - missing `POSTAL_API_URL` / `POSTAL_API_KEY` throws.
  - asserts request URL, `X-Server-API-Key` header, and body shape
    (`to: [to]`, `html_body`, `plain_body`).
- `tests/send-email.test.ts` (**extend**): selection matrix —
  - unset + `RESEND_API_KEY` → resend
  - unset + no key → console
  - `=postal` → postal
  - `=resend` → resend
  - `=console` → console (even with a Resend key present)
- Existing `tests/transport-injection.test.ts` unchanged: custom `transport`
  still overrides the selector.

## Documentation

- README email section: three-provider table + `EMAIL_TRANSPORT` selector +
  Postal env vars.
- `.env.example` (if present) — Postal snippet.
- `UPGRADING.md` — note flagged **additive / non-breaking**.
