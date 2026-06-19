# Package-owned auth migrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ownership of the auth-table DDL from the consumer's drizzle-kit into a package-owned migration track: canonical SQL generated in this repo, shipped in the package, applied via `next-starter migrate` / `migrateAuth(db)` into a dedicated `__next_starter_migrations` journal.

**Architecture:** A repo-internal drizzle-kit config (`drizzle.auth.config.ts`) generates canonical migrations from `src/schema` into a shipped `migrations/` folder. A new `src/db/migrate.ts` exposes `migrateAuth(db)` (apply) and `baselineAuth(db)` (adopt an already-migrated DB without re-running DDL), both pointed at the bundled folder via drizzle's `postgres-js/migrator` with `migrationsTable: "__next_starter_migrations"`. The CLI gains `migrate` and `migrate baseline` subcommands. The consumer's own drizzle-kit no longer manages auth tables.

**Tech Stack:** TypeScript (ESM), drizzle-orm `^0.45.2` (`drizzle-orm/postgres-js/migrator`, `drizzle-orm/migrator`), postgres.js (optional peer), tsup, vitest, drizzle-kit (devDep / repo-internal only).

## Global Constraints

- **Postgres only.** Single dialect, as today.
- **drizzle-orm is a direct dependency** (`^0.45.2`) — always present at runtime; the migrator needs no optional-peer guard.
- **Journal table name is exactly `__next_starter_migrations`** (drizzle default schema `drizzle`), distinct from the consumer's `__drizzle_migrations`.
- **Clean break, target 0.8.0.** No legacy drizzle-kit-managed auth path. No support for "both modes".
- **No down/rollback migrations.** Expand-contract only.
- **Delivery is both** a `next-starter migrate` bin command and an exported `migrateAuth(db)` from `@naeemba/next-starter/db`.
- **Package errors are prefixed** `[@naeemba/next-starter]` (match existing convention in `src/internal/optional-peer.ts` and `src/db/index.ts`).
- **Commit frequently** — one commit per task minimum.

---

### Task 1: Repo-internal auth drizzle config + generate canonical migrations

Generate the canonical migration lineage from `src/schema` in isolation and ship it in `migrations/`.

**Files:**
- Create: `drizzle.auth.config.ts` (repo root, NOT shipped — used only for generation in this repo)
- Create: `migrations/` (generated output — `0000_*.sql` + `meta/_journal.json` + `meta/0000_snapshot.json`)
- Modify: `package.json` (add `db:generate:auth` script; add `"migrations"` to `files`)

**Interfaces:**
- Produces: a `migrations/` folder with a drizzle journal — consumed by Tasks 2, 3, 7.

- [ ] **Step 1: Write `drizzle.auth.config.ts`**

```ts
import { defineConfig } from "drizzle-kit"

// Repo-internal ONLY. Generates the canonical auth migration lineage from
// src/schema in isolation (no consumer tables). The output `migrations/`
// folder is what ships in the npm package and what `migrateAuth` applies.
// Consumers never run this config.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
})
```

- [ ] **Step 2: Add scripts and `files` entry to `package.json`**

In `"scripts"`, add:

```json
"db:generate:auth": "drizzle-kit generate --config=drizzle.auth.config.ts",
```

In `"files"` (currently `["bin", "dist", "README.md", "UPGRADING.md", "CHANGELOG.md", "LICENSE"]`), add `"migrations"`:

```json
"files": ["bin", "dist", "migrations", "README.md", "UPGRADING.md", "CHANGELOG.md", "LICENSE"],
```

- [ ] **Step 3: Add `drizzle-kit` as a devDependency (repo-level)**

Run:

```bash
npm install -D drizzle-kit@^0.31.10
```

Expected: `drizzle-kit` appears in root `devDependencies` (the example already uses `^0.31.10`).

- [ ] **Step 4: Generate the canonical migration**

Run:

```bash
npm run db:generate:auth
```

Expected: creates `migrations/0000_<name>.sql` containing `CREATE TABLE` for `user`, `session`, `account`, `verification`, `passkey`, the four indexes (`session_user_id_idx`, `account_user_id_idx`, `verification_identifier_idx`, `passkey_user_id_idx`), the FK constraints, and `migrations/meta/_journal.json` + `migrations/meta/0000_snapshot.json`.

- [ ] **Step 5: Verify the generated SQL covers the full schema**

Run:

```bash
grep -c "CREATE TABLE" migrations/0000_*.sql && grep -c "CREATE INDEX" migrations/0000_*.sql
```

Expected: `5` tables and `4` indexes. If passkey/indexes are missing, the wrong schema path was used — re-check `drizzle.auth.config.ts`.

- [ ] **Step 6: Commit**

```bash
git add drizzle.auth.config.ts migrations package.json package-lock.json
git commit -m "feat(db): generate canonical auth migration lineage"
```

---

### Task 2: `migrateAuth(db)` — apply the package-owned migrations

**Files:**
- Create: `src/db/migrate.ts`
- Modify: `src/db/index.ts` (re-export `migrateAuth`, `baselineAuth`, `resolveMigrationsFolder`)
- Test: `tests/migrate-auth.test.ts`

**Interfaces:**
- Consumes: `migrations/` folder from Task 1; the `Db` type from `src/db/index.ts`.
- Produces:
  - `resolveMigrationsFolder(): string` — absolute path to the shipped `migrations/` folder.
  - `migrateAuth(db: Db, opts?: { migrationsFolder?: string }): Promise<void>` — applies pending auth migrations into `__next_starter_migrations`.
  - (`baselineAuth` is added in Task 3.)

- [ ] **Step 1: Write the failing test**

`tests/migrate-auth.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"

// Mock drizzle's migrator so this unit test needs no database.
const migrateSpy = vi.fn(async () => {})
vi.mock("drizzle-orm/postgres-js/migrator", () => ({ migrate: migrateSpy }))

import { migrateAuth, resolveMigrationsFolder } from "../src/db/migrate.js"
import { existsSync } from "node:fs"
import { join } from "node:path"

describe("resolveMigrationsFolder", () => {
  it("points at a folder containing meta/_journal.json", () => {
    const folder = resolveMigrationsFolder()
    expect(existsSync(join(folder, "meta", "_journal.json"))).toBe(true)
  })
})

describe("migrateAuth", () => {
  it("calls drizzle migrate with the dedicated journal table", async () => {
    const fakeDb = {} as never
    await migrateAuth(fakeDb)
    expect(migrateSpy).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ migrationsTable: "__next_starter_migrations" }),
    )
    const call = migrateSpy.mock.calls[0][1]
    expect(existsSync(join(call.migrationsFolder, "meta", "_journal.json"))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/migrate-auth.test.ts`
Expected: FAIL — `Cannot find module '../src/db/migrate.js'`.

- [ ] **Step 3: Write `src/db/migrate.ts`**

```ts
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type { drizzle } from "drizzle-orm/postgres-js"
import type * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

/** Name of the journal table for the package-owned auth migration track.
 *  Distinct from the consumer's `__drizzle_migrations` so the two tracks
 *  never collide. */
export const AUTH_MIGRATIONS_TABLE = "__next_starter_migrations"

/**
 * Absolute path to the `migrations/` folder shipped in the package.
 *
 * This module bundles to `dist/db/index.js`; the shipped folder is the
 * package-root sibling `migrations/`, i.e. two levels up. Migrations run in
 * Node (the CLI or a deploy hook), never inside the Next bundle, so
 * `import.meta.url` resolution is reliable here (unlike the optional-peer
 * loader, which works around Turbopack-virtualized URLs).
 */
export function resolveMigrationsFolder(): string {
  const folder = fileURLToPath(new URL("../../migrations", import.meta.url))
  if (!existsSync(folder)) {
    throw new Error(
      `[@naeemba/next-starter] Could not locate the bundled migrations folder.\n` +
        `  Resolved to: ${folder}\n` +
        `  This indicates a broken package install or an unexpected bundle layout.`,
    )
  }
  return folder
}

export interface MigrateAuthOptions {
  /** Override the migrations folder (tests, monorepo layouts). Defaults to
   *  the package's shipped `migrations/`. */
  migrationsFolder?: string
}

/**
 * Apply pending package-owned auth migrations against `db`. Idempotent:
 * migrations already recorded in `__next_starter_migrations` are skipped.
 */
export async function migrateAuth(db: Db, opts: MigrateAuthOptions = {}): Promise<void> {
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder()
  await migrate(db, { migrationsFolder, migrationsTable: AUTH_MIGRATIONS_TABLE })
}
```

- [ ] **Step 4: Re-export from `src/db/index.ts`**

Append to `src/db/index.ts`:

```ts
export { migrateAuth, baselineAuth, resolveMigrationsFolder, AUTH_MIGRATIONS_TABLE } from "./migrate.js"
export type { MigrateAuthOptions } from "./migrate.js"
```

(Note: `baselineAuth` is added in Task 3 — if running tasks strictly in order, add only `migrateAuth, resolveMigrationsFolder, AUTH_MIGRATIONS_TABLE` and `MigrateAuthOptions` here now, then add `baselineAuth` to this export line in Task 3.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/migrate-auth.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrate.ts src/db/index.ts tests/migrate-auth.test.ts
git commit -m "feat(db): add migrateAuth + resolveMigrationsFolder"
```

---

### Task 3: `baselineAuth(db)` — adopt an already-migrated database

For existing apps whose auth tables were created by the old drizzle-kit path. Records the shipped migrations as applied **without executing their DDL**, so a subsequent `migrateAuth` does not try to re-`CREATE TABLE`.

**Files:**
- Modify: `src/db/migrate.ts` (add `baselineAuth`)
- Modify: `src/db/index.ts` (add `baselineAuth` to the re-export line from Task 2)
- Test: `tests/baseline-auth.test.ts` (integration — requires `DATABASE_URL`)

**Interfaces:**
- Consumes: `resolveMigrationsFolder` (Task 2); `readMigrationFiles` from `drizzle-orm/migrator`.
- Produces: `baselineAuth(db: Db, opts?: MigrateAuthOptions): Promise<{ inserted: number; skipped: number }>`.

- [ ] **Step 1: Write the failing test**

`tests/baseline-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import { baselineAuth, migrateAuth, AUTH_MIGRATIONS_TABLE } from "../src/db/migrate.js"
import * as schema from "../src/schema/index.js"

const url = process.env.DATABASE_URL
const d = url ? describe : describe.skip

d("baselineAuth (integration)", () => {
  let client: ReturnType<typeof postgres>
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeAll(async () => {
    client = postgres(url!, { max: 1 })
    db = drizzle(client, { schema })
    // Simulate an app that already created the auth tables the OLD way and
    // has NO package journal yet.
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
    await db.execute(sql.raw(
      `DROP TABLE IF EXISTS "passkey","verification","account","session","user" CASCADE`,
    ))
    await migrateAuth(db) // create tables + journal as a real fresh install would
    // Now wipe ONLY the journal to mimic a pre-0.8.0 app (tables exist, no journal).
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  })

  afterAll(async () => {
    await client.end({ timeout: 5 })
  })

  it("records all shipped migrations without re-running DDL", async () => {
    const result = await baselineAuth(db)
    expect(result.inserted).toBeGreaterThan(0)
    const rows = await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM "drizzle"."${AUTH_MIGRATIONS_TABLE}"`),
    )
    expect((rows as unknown as { n: number }[])[0].n).toBe(result.inserted)
  })

  it("is idempotent — a second baseline inserts nothing", async () => {
    const result = await baselineAuth(db)
    expect(result.inserted).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
  })

  it("leaves migrateAuth as a clean no-op afterward", async () => {
    await expect(migrateAuth(db)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/starter_test npx vitest run tests/baseline-auth.test.ts`
Expected: FAIL — `baselineAuth` is not exported. (If no local Postgres, the suite is skipped — run in CI; do not mark the task done on a skip.)

- [ ] **Step 3: Implement `baselineAuth` in `src/db/migrate.ts`**

Add the imports at the top:

```ts
import { readMigrationFiles } from "drizzle-orm/migrator"
import { sql } from "drizzle-orm"
```

Add the function:

```ts
/**
 * Mark the shipped auth migrations as already-applied WITHOUT running their
 * DDL. For existing apps (pre-0.8.0) whose auth tables were created by the
 * old consumer-owned drizzle-kit path: this writes the same journal rows a
 * fresh `migrateAuth` would have written, so future `migrateAuth` calls skip
 * everything up to this point and apply only genuinely-new migrations.
 *
 * Idempotent: rows whose hash is already present are left untouched.
 *
 * Mirrors the drizzle postgres-js migrator's own bookkeeping: schema
 * `drizzle`, table `__next_starter_migrations(id serial pk, hash text,
 * created_at bigint)`, one row per migration with created_at = folderMillis.
 */
export async function baselineAuth(
  db: Db,
  opts: MigrateAuthOptions = {},
): Promise<{ inserted: number; skipped: number }> {
  const migrationsFolder = opts.migrationsFolder ?? resolveMigrationsFolder()
  const migrations = readMigrationFiles({ migrationsFolder })

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS "drizzle"."${AUTH_MIGRATIONS_TABLE}" ` +
        `(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    ),
  )

  let inserted = 0
  let skipped = 0
  for (const m of migrations) {
    const existing = await db.execute(
      sql.raw(
        `SELECT 1 FROM "drizzle"."${AUTH_MIGRATIONS_TABLE}" WHERE hash = '${m.hash}' LIMIT 1`,
      ),
    )
    if ((existing as unknown as unknown[]).length > 0) {
      skipped++
      continue
    }
    await db.execute(
      sql.raw(
        `INSERT INTO "drizzle"."${AUTH_MIGRATIONS_TABLE}" (hash, created_at) ` +
          `VALUES ('${m.hash}', ${m.folderMillis})`,
      ),
    )
    inserted++
  }
  return { inserted, skipped }
}
```

(`m.hash` is a hex SHA-256 string and `m.folderMillis` an integer — both safe to inline; no user input is involved.)

- [ ] **Step 4: Add `baselineAuth` to the `src/db/index.ts` re-export**

Ensure the re-export line includes it:

```ts
export { migrateAuth, baselineAuth, resolveMigrationsFolder, AUTH_MIGRATIONS_TABLE } from "./migrate.js"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/starter_test npx vitest run tests/baseline-auth.test.ts`
Expected: PASS (3 tests). If skipped locally, it must pass in CI.

- [ ] **Step 6: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass (DB suites pass in CI / when `DATABASE_URL` is set).

- [ ] **Step 7: Commit**

```bash
git add src/db/migrate.ts src/db/index.ts tests/baseline-auth.test.ts
git commit -m "feat(db): add baselineAuth for adopting pre-0.8.0 databases"
```

---

### Task 4: CLI `migrate` and `migrate baseline` subcommands

**Files:**
- Modify: `bin/cli.mjs` (add subcommand routing + handlers)
- Test: `tests/cli-migrate.test.ts`

**Interfaces:**
- Consumes: built `dist/db/index.js` exports `migrateAuth`, `baselineAuth`; `postgres` peer for the client; `DATABASE_URL` env.
- Produces: `next-starter migrate` and `next-starter migrate baseline` CLI behaviors.

- [ ] **Step 1: Write the failing test**

`tests/cli-migrate.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
const run = promisify(execFile)

describe("next-starter migrate CLI", () => {
  it("fails clearly when DATABASE_URL is unset", async () => {
    await expect(
      run("node", ["bin/cli.mjs", "migrate"], { env: { ...process.env, DATABASE_URL: "" } }),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("DATABASE_URL"),
    })
  })

  it("shows migrate in --help", async () => {
    const { stdout } = await run("node", ["bin/cli.mjs", "--help"])
    expect(stdout).toContain("migrate")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli-migrate.test.ts`
Expected: FAIL — `--help` has no `migrate` line; the missing-env path does not yet produce a `DATABASE_URL` message from the `migrate` subcommand.

- [ ] **Step 3: Add a `runMigrate` handler near the top of `bin/cli.mjs`**

After the existing imports, add:

```js
// `next-starter migrate` / `next-starter migrate baseline`
// Applies the package-owned auth migration track. Loaded from the built
// dist entry so the bin and the library share one implementation.
async function runMigrate(rest) {
  const baseline = rest[0] === "baseline"
  const url = process.env.DATABASE_URL
  if (!url || !url.trim()) {
    stdout.write(
      "[@naeemba/next-starter] DATABASE_URL is required to run migrations but is not set.\n",
    )
    exit(1)
  }
  // postgres is an optional peer; import lazily so `init` works without it.
  const { default: postgres } = await import("postgres")
  const { drizzle } = await import("drizzle-orm/postgres-js")
  const { migrateAuth, baselineAuth } = await import("../dist/db/index.js")
  const client = postgres(url, { max: 1 })
  try {
    const db = drizzle(client)
    if (baseline) {
      const { inserted, skipped } = await baselineAuth(db)
      stdout.write(`  baseline: recorded ${inserted} migration(s), ${skipped} already present\n`)
    } else {
      await migrateAuth(db)
      stdout.write(`  auth migrations applied\n`)
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}
```

- [ ] **Step 4: Route the subcommand in `run()`**

In `run()`, after the `subcommand === "--help"` block and BEFORE the `subcommand !== "init"` guard, add:

```js
  if (subcommand === "migrate") {
    await runMigrate(argv.slice(3))
    return
  }
```

- [ ] **Step 5: Document it in `helpText()`**

Add to the help string (after the `init` usage block, before `Options:`):

```
  next-starter migrate [baseline]

  Apply the package-owned auth migrations (user/session/account/verification/
  passkey) against DATABASE_URL, recorded in __next_starter_migrations.
  Use `migrate baseline` ONCE on a pre-0.8.0 app to adopt already-created
  auth tables without re-running their DDL.

```

- [ ] **Step 6: Build, then run the test**

Run: `npm run build && npx vitest run tests/cli-migrate.test.ts`
Expected: PASS. (The `migrate` import resolves `../dist/db/index.js`, so the build must run first.)

- [ ] **Step 7: Commit**

```bash
git add bin/cli.mjs tests/cli-migrate.test.ts
git commit -m "feat(cli): add migrate and migrate baseline subcommands"
```

---

### Task 5: Drift check — generated migrations stay in sync with `src/schema`

The shipped `migrations/` and the runtime `src/schema` objects must never silently diverge. The check: running `db:generate:auth` produces no new/changed files when in sync.

**Files:**
- Modify: `package.json` (add `db:check:auth` script)
- Test: `tests/migrations-drift.test.ts`

**Interfaces:**
- Consumes: `drizzle.auth.config.ts`, `migrations/` (Task 1).
- Produces: a `db:check:auth` script and a test that fails if the schema changed without regenerating migrations.

- [ ] **Step 1: Add the `db:check:auth` script to `package.json`**

```json
"db:check:auth": "drizzle-kit generate --config=drizzle.auth.config.ts && git diff --quiet --exit-code migrations",
```

(If `generate` emits a new migration because `src/schema` changed, `git diff --exit-code` returns non-zero.)

- [ ] **Step 2: Write the failing test**

`tests/migrations-drift.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"

describe("auth migrations drift", () => {
  it("src/schema matches the shipped migrations (db:check:auth is clean)", () => {
    // Throws if drizzle-kit emits a new migration or leaves migrations/ dirty.
    expect(() =>
      execFileSync("npm", ["run", "db:check:auth"], { stdio: "pipe" }),
    ).not.toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it passes (it should already be in sync)**

Run: `npx vitest run tests/migrations-drift.test.ts`
Expected: PASS — Task 1 generated `migrations/` from the current `src/schema`, so regeneration is a no-op. If it FAILS now, `git status migrations/` reveals an uncommitted regeneration; commit it.

- [ ] **Step 4: Sanity-check the guard actually catches drift**

Temporarily append a throwaway column to `src/schema/index.ts` (e.g. `note: text("note")` on `user`), run `npx vitest run tests/migrations-drift.test.ts`, confirm it FAILS, then revert the edit and `git checkout migrations` to discard any regenerated file. Confirm the test PASSES again.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/migrations-drift.test.ts
git commit -m "test(db): drift check keeps src/schema and migrations in sync"
```

---

### Task 6: Stop scaffolding auth drizzle wiring; add migrate guidance to `init`

**Decision (governs this task):** the 0.8.0 break means auth is 100% package-owned. `init` NO LONGER scaffolds `drizzle.config.ts` or `db/schema.ts` for auth. A consumer who later adds their OWN app tables creates their own `drizzle.config.ts` then, and imports `user` etc. directly from `@naeemba/next-starter/schema` for FK/type references. This supersedes any spec wording that says `db/schema.ts` is "needed by the runtime adapter" — verified false: `createAuth()` wires the adapter to the package's internal schema (see `examples/basic/lib/auth.ts`, which passes no `db` and works).

**Files:**
- Modify: `bin/cli.mjs` (remove the `db/schema.ts` and `drizzle.config.ts` entries from the `files` array; remove the now-unused `drizzleConfig` / `dbSchemaReExport` imports; remove the now-dead `schema-merge` write strategy in `writeFileSafe` and its helpers `parseSymbolList` / `sameSymbolSet` and the `merged` status array + its output loop; update the "Next steps" text)
- Modify: `bin/templates.mjs` (delete the now-unused `drizzleConfig` and `dbSchemaReExport` exports and their comment blocks)
- Test: `tests/cli.test.ts` (remove assertions about scaffolding `db/schema.ts` / `drizzle.config.ts` and the schema-merge behavior; add an assertion for the new migrate guidance)

**Interfaces:**
- Consumes: nothing new.
- Produces: an `init` that scaffolds only the shim files (`lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts`, the route handler, sign-in pages, proxy, passkey page, `.env.example`) — no auth drizzle wiring — and prints `next-starter migrate` guidance.

- [ ] **Step 1: Remove the two file entries and unused imports in `bin/cli.mjs`**

In the import from `./templates.mjs` (top of file), drop `dbSchemaReExport` and `drizzleConfig` from the named imports.

In the `files` array inside `run()`, delete these two lines:

```js
    ["schema-merge",  join(target, `${prefix}db/schema.ts`),                      dbSchemaReExport({ passkey: args.passkey })],
    ["consumer-skip", join(target, `drizzle.config.ts`),                          drizzleConfig({ src: useSrc })],
```

(Leave the `proxy.ts` `consumer-skip` push intact — `consumer-skip` is still used by proxy.)

- [ ] **Step 2: Remove the now-dead `schema-merge` strategy and helpers**

In `bin/cli.mjs`, delete: the entire `if (kind === "schema-merge") { ... }` block inside `writeFileSafe`; the helper functions `parseSymbolList` and `sameSymbolSet`; the `merged: []` entry in the `status` object; and the `for (const entry of status.merged) { ... }` output loop. (These existed only to merge the auth re-export into a consumer's `db/schema.ts`, which is no longer scaffolded.)

- [ ] **Step 3: Update the "Next steps" output in `bin/cli.mjs`**

Replace lines 3-4 of the `Next steps:` template (currently "3. Run your drizzle migrations against the better-auth schema" / "4. npm run dev …") with:

```
  3. Apply the package-owned auth schema:
       npx next-starter migrate
     Add it to your deploy hooks so it runs before start (and before build if a
     static route reads the DB):
       "prestart": "next-starter migrate",
       "prebuild": "next-starter migrate"
     When you add your OWN tables later, create a drizzle.config.ts for them and
     chain your migrate after the auth one: "next-starter migrate && drizzle-kit migrate".
  4. npm run dev — visit /sign-in
```

- [ ] **Step 4: Delete the unused templates in `bin/templates.mjs`**

Remove the `export const dbSchemaReExport = ...` and `export const drizzleConfig = ...` blocks (and their preceding comment blocks) entirely. Nothing imports them after Step 1.

- [ ] **Step 5: Update `tests/cli.test.ts`**

Read the file first. Remove or rewrite any test asserting that `init` creates/merges `db/schema.ts` or creates `drizzle.config.ts`, and any test exercising schema-merge symbol-set behavior (`re-export already present`, `rewrote re-export line`, etc.) — these behaviors are gone. Add:

```ts
it("tells the user to run next-starter migrate, not drizzle-kit, for auth", async () => {
  // Reuse this file's existing init-into-temp-dir helper and stdout capture.
  const { stdout } = await /* existing init invocation */
  expect(stdout).toContain("next-starter migrate")
  expect(stdout).not.toContain("drizzle migrations against the better-auth schema")
})

it("does not scaffold db/schema.ts or drizzle.config.ts", async () => {
  const { dir } = await /* existing init invocation */
  expect(existsSync(join(dir, "db/schema.ts"))).toBe(false)
  expect(existsSync(join(dir, "drizzle.config.ts"))).toBe(false)
})
```

(Match the file's existing helper names and import `existsSync`/`join` as that file already does, or add them.)

- [ ] **Step 6: Run the CLI tests**

Run: `npx vitest run tests/cli.test.ts tests/cli-migrate.test.ts`
Expected: PASS. Then `npm run typecheck` — no unused-import or undefined-symbol errors.

- [ ] **Step 7: Commit**

```bash
git add bin/cli.mjs bin/templates.mjs tests/cli.test.ts
git commit -m "feat(cli)!: stop scaffolding auth drizzle wiring; package owns migrations"
```

---

### Task 7: Migrate the example app + CI to the new track

The example currently owns auth migrations in `examples/basic/drizzle/` via drizzle-kit. Switch it to `next-starter migrate`, and update CI to run the new step plus the drift check.

**Files:**
- Modify: `examples/basic/package.json` (`db:migrate` script; remove `db:generate`; drop the `drizzle-kit` devDependency)
- Delete: `examples/basic/drizzle/` (generated auth SQL), `examples/basic/db/schema.ts` (auth re-export — no longer used; `lib/auth.ts` passes no `db` and the adapter uses the package schema), `examples/basic/drizzle.config.ts`
- Modify: `.github/workflows/ci.yml` (add drift check; change the "Apply migrations" step)

**Interfaces:**
- Consumes: built `dist/` + `migrations/` (CI builds the package before this step).
- Produces: a CI pipeline that applies auth migrations via the package and verifies drift.

- [ ] **Step 1: Point the example's migrate script at the package CLI**

In `examples/basic/package.json` `scripts`, change `db:migrate` to:

```json
"db:migrate": "next-starter migrate",
```

Remove the `db:generate` script entirely, and remove `"drizzle-kit": "^0.31.10"` from the example's `devDependencies` (the consumer no longer runs drizzle-kit for auth, and the example has no app tables of its own).

- [ ] **Step 2: Remove the example's now-unused auth drizzle files**

Run:

```bash
git rm -r examples/basic/drizzle
git rm examples/basic/db/schema.ts examples/basic/drizzle.config.ts
```

Expected: the old consumer-generated auth SQL, the auth re-export, and the consumer drizzle config are gone; the package now supplies the canonical migrations and the adapter uses the package schema directly. Confirm nothing imports the deleted `db/schema.ts`:

```bash
grep -rn "db/schema" examples/basic --include=*.ts --include=*.tsx || echo "no references — safe"
```

Expected: `no references — safe`.

- [ ] **Step 3: Add the drift check + update the migrate step in `.github/workflows/ci.yml`**

After the `Test (package)` step, add:

```yaml
      - name: Check migrations are in sync with schema
        run: npm run db:check:auth
```

Change the existing `Apply migrations` step from:

```yaml
      - name: Apply migrations
        run: npm --workspace examples/basic run db:migrate
```

to (it now runs the package CLI, which needs the build to have run — it already does, the Build step precedes this):

```yaml
      - name: Apply auth migrations (package-owned track)
        run: npm --workspace examples/basic run db:migrate
```

(The command text is unchanged; the script behind it now calls `next-starter migrate`. The rename clarifies intent.)

- [ ] **Step 4: Verify the example e2e path locally if Postgres is available**

Run:

```bash
npm run build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/starter_test npm --workspace examples/basic run db:migrate
```

Expected: `auth migrations applied`. The 5 tables exist in `starter_test`. (Skip if no local Postgres — CI covers it.)

- [ ] **Step 5: Commit**

```bash
npm install   # refresh the lockfile after dropping the example's drizzle-kit devDep
git add -A examples/basic .github/workflows/ci.yml package-lock.json
git commit -m "ci: apply auth migrations via package track + drift check"
```

---

### Task 8: Documentation — UPGRADING + README

**Files:**
- Modify: `UPGRADING.md` (add `0.7.x → 0.8.0` section at the top)
- Modify: `README.md` (replace "First-time setup" and "Deploy ordering" sections)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the `0.7.x → 0.8.0` section to the top of `UPGRADING.md`**

Insert before the existing `## 0.6.x → 0.7.0` section:

```markdown
## 0.7.x → 0.8.0

**BREAKING — auth tables are now migrated by the package, not your drizzle-kit.**

Before 0.8.0 you ran `drizzle-kit generate && drizzle-kit migrate` against the
re-exported `@naeemba/next-starter/schema` to create the auth tables. The
package now ships canonical migrations and applies them itself.

`init` no longer scaffolds `drizzle.config.ts` or `db/schema.ts` for auth —
auth is fully package-owned now.

### New apps

After install:

```bash
npx next-starter migrate          # creates user/session/account/verification/passkey
```

Add to your deploy hooks:

```json
{ "scripts": {
  "prestart": "next-starter migrate",
  "prebuild": "next-starter migrate"
} }
```

If you later add your OWN tables, create a `drizzle.config.ts` for them and
chain your migrate AFTER the auth one (auth track first, so a FK to `user`
resolves): `"prestart": "next-starter migrate && drizzle-kit migrate"`.

### Existing apps — one-time baseline

Your auth tables already exist (drizzle-kit created them). Adopt them into the
package journal so `next-starter migrate` doesn't try to re-create them:

```bash
npx next-starter migrate baseline   # records shipped migrations as applied, runs NO DDL
npx next-starter migrate            # applies anything genuinely new (no-op the first time)
```

Then stop managing the auth tables with your own drizzle-kit: delete the
`@naeemba/next-starter/schema` re-export from `db/schema.ts` (and the file
entirely if it held nothing else), drop the auth tables from your
`drizzle.config.ts` scope, and delete any previously-generated auth migration
files from your `drizzle/` folder. If your `drizzle.config.ts` only ever served
the auth tables, remove it.

### Cross-track foreign keys

App tables that reference `user(id)` import the table directly from the
package: `import { user } from "@naeemba/next-starter/schema"`. Run the auth
track before your app track (`next-starter migrate && drizzle-kit migrate`) so
`user` exists when your migration adds the FK.
```

- [ ] **Step 2: Replace the README "First-time setup" section**

Replace the current `## First-time setup` block with:

```markdown
## First-time setup

The package owns the auth-table migrations. Apply them with:

```bash
npx next-starter migrate
```

That creates the `user`, `session`, `account`, `verification`, and `passkey`
tables and their indexes, recorded in a `__next_starter_migrations` journal.
Re-run after a package update whose release notes mention a schema change — it
is idempotent.

The package owns the auth tables; you do not manage them with your own
drizzle-kit. When you add your own tables, set up `drizzle.config.ts` +
`drizzle-kit` for those — a fully independent track with its own
`__drizzle_migrations` journal. For an FK to `user`, import it from the package:
`import { user } from "@naeemba/next-starter/schema"`.
```

- [ ] **Step 3: Replace the README "Deploy ordering" section**

Replace the `## Deploy ordering` block with:

```markdown
## Deploy ordering

Run the package's auth migrations before start, and before a build that reads
the DB during static rendering:

```json
{
  "scripts": {
    "prebuild": "next-starter migrate",
    "build": "next build",
    "prestart": "next-starter migrate",
    "start": "next start"
  }
}
```

`next-starter migrate` is idempotent, so steady-state deploys take a no-op hit.
The build/start container needs `DATABASE_URL`. If nothing on a static route
touches the DB, `prestart` alone is enough.

Once you add your own tables, chain your app migrate after the auth one so a FK
to `user(id)` resolves: `"prestart": "next-starter migrate && drizzle-kit migrate"`.
```

- [ ] **Step 4: Verify no stale references remain**

Run:

```bash
grep -n "drizzle-kit generate" README.md
```

Expected: any remaining hit refers to the consumer's OWN app tables, not the auth schema. Fix wording if a hit still implies generating auth tables.

- [ ] **Step 5: Commit**

```bash
git add UPGRADING.md README.md
git commit -m "docs: package-owned migration track (0.8.0)"
```

---

## Self-Review

**Spec coverage:**
- Two independent migration tracks → Tasks 1, 2, 6, 7 ✓
- Canonical generation in-repo → Task 1 ✓
- `migrations/` shipped in `files` → Task 1 ✓
- `migrateAuth(db)` + `__next_starter_migrations` → Task 2 ✓
- `next-starter migrate` bin + `migrate baseline` → Task 4 ✓
- Cutover/baseline for existing apps → Task 3 (lib) + Task 4 (CLI) + Task 8 (docs) ✓
- Drift check (CI) → Task 5 + Task 7 ✓
- FK ordering documented → Task 8 ✓
- Error handling (missing DATABASE_URL, folder resolution) → Task 2 (resolve error), Task 4 (env error) ✓
- Testing (unit + integration + CLI + drift) → Tasks 2, 3, 4, 5 ✓
- Consumer-facing 0.8.0 changes + docs → Tasks 6, 8 ✓

**Type consistency:** `migrateAuth(db, opts?)`, `baselineAuth(db, opts?)`, `resolveMigrationsFolder()`, `AUTH_MIGRATIONS_TABLE`, `MigrateAuthOptions` are used identically across Tasks 2–4 and the re-export in `src/db/index.ts`. `Db` type matches the existing alias in `src/db/index.ts`.

**Placeholder scan:** No TBD/TODO. Task 6 Step 5 references the existing `tests/cli.test.ts` init-into-temp-dir helper rather than inventing one — the implementer must read the file and match the existing fixture; this is intentional ("follow the existing pattern"), not a placeholder.

**Design decision applied:** auth is 100% package-owned — `init` scaffolds NO `drizzle.config.ts` / `db/schema.ts` (Task 6), the example drops both (Task 7), and docs route FK references through `import { user } from "@naeemba/next-starter/schema"` (Task 8). This supersedes the spec's "db/schema.ts needed by the runtime adapter" wording (verified false: the adapter uses the package's internal schema).

**Open implementation note for the executor:** confirm `readMigrationFiles` is exported from `drizzle-orm/migrator` in the installed `drizzle-orm@^0.45.2` (it is in 0.45.x). If a future bump moves it, adjust the Task 3 import.
```
