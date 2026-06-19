# Package-owned auth migrations — design

**Date:** 2026-06-19
**Target release:** 0.8.0 (breaking)
**Status:** approved design, pending implementation plan

## Problem

Today the package ships the auth **schema definition** (`@naeemba/next-starter/schema`),
but migrations are generated and owned by the **consumer** via `drizzle-kit generate`.
drizzle-kit diffs the schema against the consumer's local snapshot — which also contains
the consumer's own app tables. Consequences:

- **No canonical migration.** Two apps on the same package version, adopted at different
  times, have different snapshots, so the same schema change generates different SQL for
  each. There is nothing the package author can test as "the" migration.
- **Cannot ship a migration.** drizzle-kit does not read migrations from `node_modules`,
  so the package can only ship the schema *definition*; the SQL that actually runs against
  production is synthesized downstream, in an environment the author never sees.
- **Uncontrolled destructive SQL.** A rename or type change makes drizzle-kit emit
  `DROP`/`ADD` for some consumers, against live data, outside the author's control. The
  package cannot ship a safe expand → backfill → contract migration.
- **Silent drift.** A `^` bump pulls new schema code, but nothing forces
  `drizzle-kit generate && migrate`; the build later crashes with
  `relation "…" does not exist`.

This is the deepest structural weakness of the dependency model for this package: the
**source of truth (schema, in the package) is split from the materialized state
(migrations + the live DB, owned by the consumer)**, and no package release can rejoin them.

## Goal

Move ownership of the auth-table DDL into the package as a **separate, package-owned
migration track**. The package ships canonical, curated SQL migrations generated *in this
repo* against the auth schema in isolation. Consumers apply them via `next-starter migrate`
(or `migrateAuth(db)`), recorded in a dedicated `__next_starter_migrations` table — fully
independent of the consumer's own `__drizzle_migrations`.

Result: one canonical, tested migration the author writes and proves; safe hand-authored
destructive changes; no silent drift between package version and applied DDL.

## Non-goals (YAGNI)

- **No down/rollback migrations.** drizzle does not do them cleanly; expand-contract covers
  the safe-change need.
- **No multi-dialect.** Postgres only, as today.
- **No legacy mode.** The old drizzle-kit-managed auth path is removed in 0.8.0 — a clean
  break, single code path. (Decision: clean break over "support both modes" to avoid a
  permanent double test matrix and double docs for a pre-1.0, author-first package.)
- **Not 1.0.0.** 1.0.0 is reserved for when both this migration model and the planned
  two-path user/backoffice auth have settled, so the stability signal is honest.

## Architecture — two independent migration tracks

| Track | Source of truth | Generated where | Journal table | Applied by |
|---|---|---|---|---|
| **Auth** (`user`, `session`, `account`, `verification`, `passkey`) | `src/schema` in this repo | `drizzle-kit generate` in *this* repo, then curated | `__next_starter_migrations` | `next-starter migrate` / `migrateAuth(db)` |
| **App** (consumer's own tables) | consumer's `db/schema.ts` | `drizzle-kit generate` in consumer app | `__drizzle_migrations` | `drizzle-kit migrate` |

The package still **exports the `pgTable` definitions** (`@naeemba/next-starter/schema`) —
the better-auth drizzle adapter needs them at runtime. What changes is *who emits the DDL*:
the package, not the consumer. Runtime schema objects and migration generation are decoupled.

drizzle's migrator supports this directly:

```ts
// drizzle-orm/postgres-js/migrator
migrate(db, {
  migrationsFolder: <path inside @naeemba/next-starter>,
  migrationsTable: "__next_starter_migrations",
})
```

## Components

- **`src/schema/` (unchanged)** — table defs, still exported for the runtime adapter and for
  consumer type/relation references.
- **`drizzle.auth.config.ts` (new, repo-internal, not shipped)** — drizzle-kit config pointing
  only at the auth schema, `out: ./migrations`. Run in this repo to generate the canonical
  lineage. Never used by consumers.
- **`migrations/` (new, added to `package.json` `files`)** — canonical SQL + `meta/_journal.json`.
  This is the artifact consumers apply.
- **`src/db/migrate.ts` (new)** — exports `migrateAuth(db)`. Calls drizzle's
  `postgres-js/migrator` (`drizzle-orm` is a direct dependency, always present — no optional
  peer needed here) with `migrationsFolder` resolved relative to the package install location
  and `migrationsTable: "__next_starter_migrations"`. Receives an already-built `db`, so it
  never touches the `postgres` peer itself.
- **`bin/cli.mjs` (extend)** — add a `migrate` subcommand that builds a `db` from
  `DATABASE_URL` (this is where the `postgres` optional peer is loaded, via the existing
  `loadOptionalPeer` path) and calls `migrateAuth`, plus a `migrate baseline` subcommand (below).
- **CI drift check (new)** — apply `migrations/` to an empty Postgres, introspect, assert it
  matches `src/schema`. Prevents the shipped SQL and the runtime schema objects from silently
  diverging. Doubles as the integration test.

## Migration delivery (decision: bin + exported function)

- `next-starter migrate` — for deploy/dev hooks. Primary path.
- `migrateAuth(db)` — exported from `@naeemba/next-starter/db` for programmatic use (custom
  migrate scripts, serverless init, tests).

The bin is a thin wrapper around the function, so shipping both costs ~10 lines.

## Consumer-facing changes (the 0.8.0 break)

- `drizzle.config.ts` `schema` points at the consumer's **app tables only** — no longer at the
  re-exported auth schema, so consumer `generate` never emits auth DDL. (A pure-auth app with
  no extra tables may not need a `drizzle.config.ts` at all.)
- `db/schema.ts` still re-exports `@naeemba/next-starter/schema` for the runtime adapter and
  for type/relation references, but it is excluded from the consumer's `drizzle.config`
  `schema` glob.
- Deploy hook: `"prestart": "next-starter migrate && drizzle-kit migrate"` — auth track first,
  then app track (ordering matters for cross-track FKs).
- `next-starter init` scaffolds the new wiring; obsolete `auth:generate`-style guidance is
  removed.

## Cutover for existing apps

Existing apps already have the auth tables applied via the old drizzle-kit path. We must not
re-run `CREATE TABLE`. `next-starter migrate baseline` inserts the already-shipped migration
rows into `__next_starter_migrations` **without executing them** (marks them applied); future
migrations then run normally. Idempotent: if rows already exist, it is a no-op with a notice.
Documented as a one-time step in UPGRADING.md (0.7.x → 0.8.0).

## FK ordering & cross-track references

Consumer tables that FK to `user(id)` work because (a) the `user` table def remains importable
for drizzle relations/types, and (b) the auth track runs **before** the app track in the deploy
hook, so `user` exists when the app migration adds its FK. UPGRADING documents the ordering
requirement.

## Error handling

- The CLI `migrate` command loads the `postgres` optional peer via the existing
  `loadOptionalPeer` path when building the `db` — instructional error if missing.
  `migrateAuth(db)` itself has no peer dependency.
- Missing `DATABASE_URL` in the bin → clear message naming the env var.
- Folder-resolution failure (unexpected package layout) → explicit error naming the resolved
  path, so a bad bundle is debuggable.
- `baseline` idempotent (see above).

## Testing

- **Unit:** `migrateAuth` resolves the bundled folder and calls the migrator with the correct
  `migrationsTable` (mock the migrator).
- **Integration (CI, real Postgres):** fresh DB → `migrateAuth` → introspect → equals
  `src/schema` (this is also the drift check). Then `baseline` on a DB that already has the
  tables → no destructive SQL, rows recorded.
- **CLI:** `next-starter migrate` and `migrate baseline` happy paths + missing-env path.
- Keep all existing tests green; update any that assume the old re-export-into-`drizzle.config`
  wiring.

## Release notes / docs

- `UPGRADING.md`: 0.7.x → 0.8.0 section — the break, the new wiring, the one-time `baseline`
  step, the deploy-hook ordering.
- `README.md`: replace the "First-time setup" / "Deploy ordering" sections with the
  package-owned migration flow.
