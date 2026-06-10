# next-typescript-starter

An opinionated Next.js + Drizzle + Better Auth + shadcn-style stack, shipped as **an installable npm package** rather than a clone-and-fork template. Consumers add it as a dependency, set env vars, and get email login working out of the box. Bumping the package version propagates fixes and improvements to every consumer.

## Why a package, not a template?

Template repos (`create-t3-app`, `create-better-t-stack`, etc.) solve the scaffolding problem but not the **update problem** — once a project is generated, fixes in the upstream template never reach it. This repo takes the opposite trade: ship as much as possible as a versioned dependency so `npm update @you/starter` actually means something.

## Core architecture: re-export shims

Some files physically have to exist in the consumer's repo (Next.js route handlers, Drizzle schema entrypoint, etc.). Those become **one-line re-exports** of code that lives in this package:

```ts
// consumer: app/api/auth/[...all]/route.ts
export { GET, POST } from "@you/starter/auth-route"

// consumer: db/schema.ts
export * from "@you/starter/schema"

// consumer: lib/auth.ts
export { auth } from "@you/starter/auth"

// consumer: app/(auth)/sign-in/page.tsx
export { default } from "@you/starter/pages/sign-in"
```

Everything else — Better Auth config, Drizzle schema definitions, email templates, React components, server helpers — lives here and updates via version bump.

## What ships in the package

- **`@you/starter/auth`** — preconfigured Better Auth instance reading `DATABASE_URL`, `BETTER_AUTH_SECRET`, email provider creds from env.
- **`@you/starter/auth-route`** — the Next.js route handler (`GET`, `POST`) for `/api/auth/[...all]`.
- **`@you/starter/schema`** — Drizzle table definitions for `users`, `sessions`, `accounts`, `verification_tokens`.
- **`@you/starter/ui`** — opinionated component library built on Radix primitives (the shadcn trade — see below).
- **`@you/starter/pages/sign-in`**, **`/sign-up`**, **`/verify-email`** — drop-in Next.js page components.
- **`@you/starter/email`** — Resend-based email sender + React Email templates for magic links / verification.
- **`@you/starter/server`** — `getSession()`, `requireAuth()`, middleware helpers.

## What env vars the consumer sets

```bash
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://app.example.com
RESEND_API_KEY=...
EMAIL_FROM=auth@example.com
```

## Known tradeoffs (decided)

1. **shadcn becomes "ours, not theirs."** shadcn is copy-paste by design so consumers can edit components freely. Shipping components from a package trades per-project customization for upgradability. We accept this — components are built on Radix primitives and exposed with enough variants/slots to handle 90% of styling needs without forking.

2. **Drizzle migrations live in the consumer's repo.** Schema definitions come from the package, but `drizzle-kit generate` writes migration SQL into the consumer project. This is fine — migrations are forward-only artifacts, not source. Consumers run their own `drizzle-kit generate` after a schema-changing version bump.

3. **Next.js version is a peer dependency.** Consumers control the Next version. The package declares a peer range and is tested against the latest.

## Open questions to resolve next session

- [ ] **Package name / scope** — `@<scope>/starter`? Something more specific?
- [ ] **Monorepo or single package?** — Splitting into `@you/auth`, `@you/ui`, `@you/db` gives finer-grained versioning but more overhead. Lean: start as one package, split later if needed.
- [ ] **How does the consumer initialize the DB?** — Migration files vs. `drizzle-kit push` vs. a packaged `init` CLI command (`npx @you/starter init`).
- [ ] **Customization escape hatches** — what's the story when a consumer needs a non-default Better Auth plugin, a custom email template, or a tweaked sign-in page? Options: render-prop components, config overrides, "eject" CLI.
- [ ] **Versioning policy** — how do we communicate breaking changes (schema migrations, auth config shape) vs. additive ones?
- [ ] **Testing strategy** — example consumer app in this repo that exercises the full flow on every PR.

## Context from the design discussion

The conversation that produced this README was about whether you can have "a repository that has Next, Drizzle, Better Auth, shadcn etc. and I just add it as a dependency, it preconfigures login with email and get some variables to do so."

First-pass answer was "not as a single dependency, use a template." The follow-up — "but then I have to update every fork manually" — made it clear the update story is the actual requirement, and the re-export-shim pattern above is the way to honor it. This README captures the resulting design so a fresh session can pick up and start implementing.

## Suggested first session

1. Decide package name and whether monorepo.
2. Set up `package.json` with proper `exports` map (subpath exports are essential to this design).
3. Stand up the Better Auth + Drizzle wiring as the first exported subpath.
4. Build a minimal example consumer app in `examples/` that imports from the package via workspace protocol and exercises email sign-in end to end.
5. Iterate on the shim ergonomics — every shim file the consumer has to create is friction; minimize the count.

## Note on the current repo state

The directory currently contains a Create React App scaffold (`src/`, `public/`, the CRA-flavored `package.json` and `yarn.lock`). Plan is to force-push over it — none of those files belong in the eventual package shape.
