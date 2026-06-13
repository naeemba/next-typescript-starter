import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CLI = join(process.cwd(), "bin", "cli.mjs")

function runCli(args: string[]): { code: number | null; stdout: string; stderr: string } {
  const res = spawnSync("node", [CLI, ...args], { encoding: "utf8" })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ns-cli-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("next-starter init", () => {
  it("writes all seven shim files + .env.example", () => {
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    expect(existsSync(join(dir, "lib/auth.ts"))).toBe(true)
    expect(existsSync(join(dir, "lib/auth-client.ts"))).toBe(true)
    expect(existsSync(join(dir, "lib/auth-server.ts"))).toBe(true)
    expect(existsSync(join(dir, "db/schema.ts"))).toBe(true)
    expect(existsSync(join(dir, "drizzle.config.ts"))).toBe(true)
    expect(existsSync(join(dir, "app/api/auth/[...all]/route.ts"))).toBe(true)
    expect(existsSync(join(dir, "app/sign-in/page.tsx"))).toBe(true)
    expect(existsSync(join(dir, ".env.example"))).toBe(true)

    // Generated content must reference the actual exported names, not
    // hallucinated ones. A bare existsSync/regex pair would let typos
    // through (e.g. the toNextJsHandler vs createAuthRoute bug fixed
    // in this release).
    const route = readFileSync(join(dir, "app/api/auth/[...all]/route.ts"), "utf8")
    expect(route).toMatch(/createAuthRoute/)
    expect(route).not.toMatch(/toNextJsHandler/)

    const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
    expect(authFile).toMatch(/from "@naeemba\/next-starter\/auth"/)
    expect(authFile).toMatch(/createAuth\(/)

    const authClient = readFileSync(join(dir, "lib/auth-client.ts"), "utf8")
    expect(authClient).toMatch(/from "@naeemba\/next-starter\/client"/)
    expect(authClient).toMatch(/createAuthClient/)

    const authServer = readFileSync(join(dir, "lib/auth-server.ts"), "utf8")
    expect(authServer).toMatch(/from "@naeemba\/next-starter\/server"/)
    expect(authServer).toMatch(/createServer\(auth\)/)

    expect(stdout).toMatch(/Next steps:/)
  })

  it("skips existing files without --force", () => {
    runCli(["init", dir])
    writeFileSync(join(dir, "lib/auth.ts"), "// custom\n")
    const before = readFileSync(join(dir, "lib/auth.ts"), "utf8")
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    expect(readFileSync(join(dir, "lib/auth.ts"), "utf8")).toBe(before)
    expect(stdout).toMatch(/lib\/auth\.ts.*exists/)
  })

  it("overwrites with --force", () => {
    runCli(["init", dir])
    writeFileSync(join(dir, "lib/auth.ts"), "// custom\n")
    const { code } = runCli(["init", dir, "--force"])
    expect(code).toBe(0)
    expect(readFileSync(join(dir, "lib/auth.ts"), "utf8")).toMatch(/createAuth/)
  })

  it("--no-google omits the google block", () => {
    runCli(["init", dir, "--no-google"])
    const contents = readFileSync(join(dir, "lib/auth.ts"), "utf8")
    expect(contents).not.toMatch(/google:/)
    expect(contents).toMatch(/passkey:/)
  })

  it("--no-passkey omits the passkey block", () => {
    runCli(["init", dir, "--no-passkey"])
    const contents = readFileSync(join(dir, "lib/auth.ts"), "utf8")
    expect(contents).toMatch(/google:/)
    expect(contents).not.toMatch(/passkey:/)
  })

  // The `--no-passkey` flag must propagate to every template that names
  // the passkey peer — not just lib/auth.ts. Each missed template
  // re-introduces the dependency: db/schema.ts re-exporting `passkey`
  // creates a migration for a table the user opted out of, and
  // lib/auth-client.ts importing `passkeyClient` from
  // `@better-auth/passkey/client` keeps that peer in the consumer's bundle.
  it("--no-passkey drops `passkey` from db/schema.ts re-exports", () => {
    runCli(["init", dir, "--no-passkey"])
    const schema = readFileSync(join(dir, "db/schema.ts"), "utf8")
    expect(schema).not.toMatch(/\bpasskey\b/)
    expect(schema).toMatch(/user, session, account, verification/)
  })

  it("--no-passkey omits the @better-auth/passkey/client import in lib/auth-client.ts", () => {
    runCli(["init", dir, "--no-passkey"])
    const client = readFileSync(join(dir, "lib/auth-client.ts"), "utf8")
    expect(client).not.toMatch(/@better-auth\/passkey/)
    expect(client).not.toMatch(/passkeyClient/)
  })

  it("default init emits the passkey re-export and passkeyClient factory injection", () => {
    runCli(["init", dir])
    const schema = readFileSync(join(dir, "db/schema.ts"), "utf8")
    expect(schema).toMatch(/\bpasskey\b/)
    const client = readFileSync(join(dir, "lib/auth-client.ts"), "utf8")
    expect(client).toMatch(/import \{ passkeyClient \} from "@better-auth\/passkey\/client"/)
    expect(client).toMatch(/passkey:\s*passkeyClient/)
  })

  // The sign-in page must propagate `google` / `passkey` props or
  // <SignInForm> hides both buttons (showGoogle / showPasskey only
  // render when the prop is truthy). A default init with both providers
  // enabled would otherwise render a magic-link-only UI.
  it("default init's sign-in page passes `google` and `passkey` props", () => {
    runCli(["init", dir])
    const page = readFileSync(join(dir, "app/sign-in/page.tsx"), "utf8")
    expect(page).toMatch(/<SignInPage[^>]*\bgoogle\b/)
    expect(page).toMatch(/<SignInPage[^>]*\bpasskey\b/)
  })

  it("--no-google drops the `google` prop from the sign-in page", () => {
    runCli(["init", dir, "--no-google"])
    const page = readFileSync(join(dir, "app/sign-in/page.tsx"), "utf8")
    expect(page).not.toMatch(/<SignInPage[^>]*\bgoogle\b/)
    expect(page).toMatch(/<SignInPage[^>]*\bpasskey\b/)
  })

  it("--no-passkey drops the `passkey` prop from the sign-in page", () => {
    runCli(["init", dir, "--no-passkey"])
    const page = readFileSync(join(dir, "app/sign-in/page.tsx"), "utf8")
    expect(page).toMatch(/<SignInPage[^>]*\bgoogle\b/)
    expect(page).not.toMatch(/<SignInPage[^>]*\bpasskey\b/)
  })

  it("--skip-env omits .env.example", () => {
    runCli(["init", dir, "--skip-env"])
    expect(existsSync(join(dir, ".env.example"))).toBe(false)
  })

  it("--src forces src/ layout", () => {
    runCli(["init", dir, "--src"])
    expect(existsSync(join(dir, "src/lib/auth.ts"))).toBe(true)
    expect(existsSync(join(dir, "lib/auth.ts"))).toBe(false)
  })

  // Regression: `drizzleConfig` used to be a static string with
  // `schema: "./db/schema.ts"`, but under `--src` the CLI writes the
  // schema at `src/db/schema.ts`. The mismatch made the very next step
  // (`npm run db:generate` / `db:migrate`) fail with
  // "Could not find schema file at './db/schema.ts'". The drizzle config's
  // schema path MUST track the same prefix used for db/schema.ts.
  it("--src writes drizzle.config.ts pointing at src/db/schema.ts", () => {
    runCli(["init", dir, "--src"])
    const cfg = readFileSync(join(dir, "drizzle.config.ts"), "utf8")
    expect(cfg).toMatch(/schema:\s*"\.\/src\/db\/schema\.ts"/)
    expect(cfg).not.toMatch(/schema:\s*"\.\/db\/schema\.ts"/)
    // Sanity: the path it points at is the file the same run wrote.
    expect(existsSync(join(dir, "src/db/schema.ts"))).toBe(true)
  })

  it("--no-src writes drizzle.config.ts pointing at db/schema.ts", () => {
    runCli(["init", dir, "--no-src"])
    const cfg = readFileSync(join(dir, "drizzle.config.ts"), "utf8")
    expect(cfg).toMatch(/schema:\s*"\.\/db\/schema\.ts"/)
    expect(cfg).not.toMatch(/schema:\s*"\.\/src\/db\/schema\.ts"/)
    expect(existsSync(join(dir, "db/schema.ts"))).toBe(true)
  })

  it("auto-detects src/ layout when src/app/ pre-exists", () => {
    writeFileSync(join(dir, "package.json"), "{}\n") // ensure dir not empty
    mkdirSync(join(dir, "src/app"), { recursive: true })
    runCli(["init", dir])
    expect(existsSync(join(dir, "src/lib/auth.ts"))).toBe(true)
  })

  it("exits non-zero on unknown flag", () => {
    const { code, stdout } = runCli(["init", dir, "--bogus"])
    expect(code).toBe(1)
    expect(stdout).toMatch(/Unknown flag/)
  })

  it("prints help for --help", () => {
    const { code, stdout } = runCli(["init", "--help"])
    expect(code).toBe(0)
    expect(stdout).toMatch(/next-starter init/)
  })

  // Regression: `next-starter --help` (no subcommand) used to fall through
  // the unknown-subcommand branch and exit 1, breaking shell idioms like
  // `next-starter --help && echo ok`. Both bare-flag forms and no args at
  // all should print help and exit 0.
  it("prints help and exits 0 for top-level --help / -h / no args", () => {
    for (const args of [["--help"], ["-h"], []]) {
      const { code, stdout } = runCli(args)
      expect(code).toBe(0)
      expect(stdout).toMatch(/next-starter init/)
    }
  })

  it("exits non-zero on an unknown subcommand", () => {
    const { code, stdout } = runCli(["bogus"])
    expect(code).toBe(1)
    expect(stdout).toMatch(/Unknown subcommand/)
  })

  // Regression: the old line-comment regex stripped `//` even when it
  // appeared inside JSON string values, breaking JSON.parse and making
  // detectSrcLayout fall through to the false-positive warning path.
  // A real-world failure shape is a path value that contains `//`.
  it("preserves `//` inside JSONC string values when parsing tsconfig", () => {
    writeFileSync(
      join(dir, "tsconfig.json"),
      `{
  "compilerOptions": {
    "baseUrl": ".",
    // a comment we DO want stripped
    "paths": { "@/*": ["./src/*"] }
  },
  "scratch": "http://example.com/with//double"
}
`,
    )
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    // The src/ layout would only resolve if the JSONC parse succeeded.
    expect(existsSync(join(dir, "src/lib/auth.ts"))).toBe(true)
    expect(stdout).not.toMatch(/paths.*"@\/\*"/)
  })

  // create-next-app writes tsconfig.json with line comments + trailing commas.
  // Strict JSON.parse would fall through and src/ layout would mis-detect.
  it("detects src/ layout from a JSONC tsconfig with comments and trailing commas", () => {
    writeFileSync(
      join(dir, "tsconfig.json"),
      `{
  // Set by create-next-app
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"], // <- src layout
    },
  },
}
`,
    )
    runCli(["init", dir])
    expect(existsSync(join(dir, "src/lib/auth.ts"))).toBe(true)
    expect(existsSync(join(dir, "lib/auth.ts"))).toBe(false)
  })

  // Regression: a post-walk regex stripped `,}` / `,]` even inside string
  // values, so a path value containing `,}` failed JSON.parse and made
  // detectSrcLayout fall through to the false-positive warning path. The
  // trailing-comma cleanup now happens inside the same string-aware walk.
  it("preserves `,}` / `,]` inside JSONC string values when parsing tsconfig", () => {
    writeFileSync(
      join(dir, "tsconfig.json"),
      `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "scratch1": "value-with-,}-inside",
  "scratch2": "value-with-, ]-inside"
}
`,
    )
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    // The src/ layout would only resolve if the JSONC parse succeeded.
    expect(existsSync(join(dir, "src/lib/auth.ts"))).toBe(true)
    expect(stdout).not.toMatch(/paths.*"@\/\*"/)
  })

  // Turborepo / Nx / create-turbo emit `"paths": { "@/*": ["src/*"] }` with
  // no leading `./`. The bare-segment branch in detectSrcLayout has to accept
  // that shape or the CLI writes lib/auth.ts at the project root in a real
  // src/-layout monorepo.
  it("detects src/ layout when @/* uses bare `src/*` with baseUrl '.'", () => {
    writeFileSync(
      join(dir, "tsconfig.json"),
      `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }\n`,
    )
    runCli(["init", dir])
    expect(existsSync(join(dir, "src/lib/auth.ts"))).toBe(true)
    expect(existsSync(join(dir, "lib/auth.ts"))).toBe(false)
  })

  // Monorepos commonly put the alias in `tsconfig.base.json` and have the
  // package-level `tsconfig.json` only carry `"extends"`. A false-negative
  // warning here pushes consumers to duplicate the alias and break their
  // monorepo conventions.
  it("does NOT warn about @/* when the alias lives in an extended base config", () => {
    writeFileSync(
      join(dir, "tsconfig.base.json"),
      `{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n`,
    )
    writeFileSync(
      join(dir, "tsconfig.json"),
      `{ "extends": "./tsconfig.base.json" }\n`,
    )
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    expect(stdout).not.toMatch(/paths.*"@\/\*"/)
  })

  it("warns when tsconfig.json is missing the @/* path alias", () => {
    writeFileSync(
      join(dir, "tsconfig.json"),
      `{ "compilerOptions": { "baseUrl": "." } }\n`,
    )
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    expect(stdout).toMatch(/paths.*"@\/\*"/)
  })

  it("does NOT warn about @/* when the alias is configured", () => {
    writeFileSync(
      join(dir,  "tsconfig.json"),
      `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./*"] } } }\n`,
    )
    const { code, stdout } = runCli(["init", dir])
    expect(code).toBe(0)
    expect(stdout).not.toMatch(/paths.*"@\/\*"/)
  })

  it("install hint frames peers as optional, not required", () => {
    const { stdout } = runCli(["init", dir])
    expect(stdout).toMatch(/Install only the peers you actually use/)
    // The old all-in-one line that contradicted optional-peers should be gone.
    expect(stdout).not.toMatch(/npm install @naeemba\/next-starter@latest postgres @react-email/)
  })

  it("install hint includes @better-auth/passkey when passkey is enabled (default)", () => {
    const { stdout } = runCli(["init", dir])
    expect(stdout).toMatch(/npm install @better-auth\/passkey/)
  })

  it("install hint omits @better-auth/passkey under --no-passkey", () => {
    const { stdout } = runCli(["init", dir, "--no-passkey"])
    expect(stdout).not.toMatch(/@better-auth\/passkey/)
  })

  // 0.5.0 — consumer-owned file safety.
  //
  // Regression: under 0.4.0, `init --force` overwrote db/schema.ts wholesale,
  // destroying any consumer-defined tables (blog_posts, inquiries, ...). The
  // re-export line is the only thing the CLI owns in that file; the rest is
  // the consumer's surface. New behavior: classify db/schema.ts as
  // "schema-merge" — if the re-export is missing, PREPEND it; otherwise
  // leave the file alone. --force does NOT replace this file.
  describe("db/schema.ts is consumer-owned (merge, not overwrite)", () => {
    it("prepends the re-export line when the consumer's schema is missing it", () => {
      const existing =
        `import { pgTable, serial, text } from "drizzle-orm/pg-core"\n\n` +
        `export const blogPosts = pgTable("blog_posts", {\n` +
        `  id: serial("id").primaryKey(),\n` +
        `  title: text("title").notNull(),\n` +
        `})\n`
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(join(dir, "db/schema.ts"), existing)
      const { code, stdout } = runCli(["init", dir, "--no-src"])
      expect(code).toBe(0)
      const merged = readFileSync(join(dir, "db/schema.ts"), "utf8")
      // The re-export line is now present
      expect(merged).toMatch(/@naeemba\/next-starter\/schema/)
      expect(merged).toMatch(/user, session, account, verification/)
      // The consumer's table is still there
      expect(merged).toMatch(/export const blogPosts = pgTable/)
      expect(merged).toMatch(/blog_posts/)
      // And the output flagged the merge, not a destructive overwrite
      expect(stdout).toMatch(/db\/schema\.ts.*merged/)
      expect(stdout).not.toMatch(/db\/schema\.ts.*overwritten/)
    })

    it("leaves an idempotent re-run alone when the re-export is already present", () => {
      const existing =
        `export { user, session, account, verification, passkey } from "@naeemba/next-starter/schema"\n\n` +
        `import { pgTable, serial, text } from "drizzle-orm/pg-core"\n` +
        `export const blogPosts = pgTable("blog_posts", {\n` +
        `  id: serial("id").primaryKey(),\n` +
        `  title: text("title").notNull(),\n` +
        `})\n`
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(join(dir, "db/schema.ts"), existing)
      const before = readFileSync(join(dir, "db/schema.ts"), "utf8")
      runCli(["init", dir, "--no-src"])
      const after = readFileSync(join(dir, "db/schema.ts"), "utf8")
      expect(after).toBe(before)
    })

    // The critical safety property: --force is for starter-owned shims only.
    // db/schema.ts is consumer-owned regardless of the flag — destroying
    // table definitions to "force-refresh" a one-line re-export is never
    // the right call.
    it("does NOT overwrite the consumer's schema even with --force", () => {
      const existing =
        `import { pgTable, serial, text } from "drizzle-orm/pg-core"\n` +
        `export const blogPosts = pgTable("blog_posts", { id: serial("id").primaryKey() })\n`
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(join(dir, "db/schema.ts"), existing)
      runCli(["init", dir, "--no-src", "--force"])
      const after = readFileSync(join(dir, "db/schema.ts"), "utf8")
      expect(after).toMatch(/export const blogPosts = pgTable/)
      expect(after).toMatch(/@naeemba\/next-starter\/schema/)
    })

    // When no existing schema file, scaffold the one-line shim. This is
    // the path the docs show consumers without a db/schema.ts file yet.
    it("scaffolds the one-line shim when no db/schema.ts exists", () => {
      runCli(["init", dir, "--no-src"])
      const schema = readFileSync(join(dir, "db/schema.ts"), "utf8")
      expect(schema).toMatch(/export \{[^}]*\} from "@naeemba\/next-starter\/schema"/)
    })
  })

  // 0.5.0 — drizzle.config.ts is consumer-owned (e.g. verbose, casing,
  // schemaFilter customizations). Never overwrite, even with --force.
  describe("drizzle.config.ts is consumer-owned (preserved)", () => {
    it("preserves an existing drizzle.config.ts even with --force", () => {
      const custom =
        `import { defineConfig } from "drizzle-kit"\n` +
        `export default defineConfig({\n` +
        `  schema: "./db/schema.ts",\n` +
        `  out: "./drizzle",\n` +
        `  dialect: "postgresql",\n` +
        `  verbose: true,\n` +
        `  strict: true,\n` +
        `  dbCredentials: { url: process.env.DATABASE_URL! },\n` +
        `})\n`
      writeFileSync(join(dir, "drizzle.config.ts"), custom)
      const { stdout } = runCli(["init", dir, "--no-src", "--force"])
      const after = readFileSync(join(dir, "drizzle.config.ts"), "utf8")
      expect(after).toBe(custom)
      expect(stdout).toMatch(/drizzle\.config\.ts.*consumer-owned/)
    })

    // When no drizzle.config.ts exists, scaffold the env-loading template.
    // The template must load env files so `pnpm db:push` works locally
    // without a separate manual dotenv install.
    it("scaffolds drizzle.config.ts with @next/env loading when none exists", () => {
      runCli(["init", dir, "--no-src"])
      const cfg = readFileSync(join(dir, "drizzle.config.ts"), "utf8")
      expect(cfg).toMatch(/loadEnvConfig/)
      expect(cfg).toMatch(/from "@next\/env"/)
      // Non-null assertion satisfies TS — process.env.DATABASE_URL is string | undefined
      expect(cfg).toMatch(/process\.env\.DATABASE_URL!/)
    })
  })

  // 0.5.0 — when the consumer already has a `db/index.ts` exporting `db`,
  // wire it into createAuth({ db }) instead of letting the lazy proxy
  // spin up a second postgres pool to the same database.
  describe("detects existing db/index.ts and wires it into createAuth", () => {
    it("generates lib/auth.ts with `import { db } from '@/db'` when db/index.ts exports db", () => {
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(
        join(dir, "db/index.ts"),
        `import { drizzle } from "drizzle-orm/postgres-js"\n` +
          `import postgres from "postgres"\n` +
          `const queryClient = postgres(process.env.DATABASE_URL!)\n` +
          `export const db = drizzle(queryClient)\n`,
      )
      const { stdout } = runCli(["init", dir, "--no-src"])
      const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
      expect(authFile).toMatch(/import \{ db \} from "@\/db"/)
      expect(authFile).toMatch(/createAuth\(\{[\s\S]*\bdb,[\s\S]*\}\)/)
      expect(stdout).toMatch(/Detected.*db\/index\.ts.*createAuth/s)
    })

    it("matches `export { db }` named re-exports", () => {
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(
        join(dir, "db/index.ts"),
        `import { drizzle } from "drizzle-orm/postgres-js"\n` +
          `const _db = drizzle(process.env.DATABASE_URL!)\n` +
          `export { _db as db }\n`,
      )
      runCli(["init", dir, "--no-src"])
      const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
      expect(authFile).toMatch(/import \{ db \} from "@\/db"/)
    })

    it("falls back to the no-db template when db/index.ts is absent", () => {
      runCli(["init", dir, "--no-src"])
      const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
      expect(authFile).not.toMatch(/import \{ db \} from/)
    })

    it("falls back to the no-db template when db/index.ts exists but doesn't export `db`", () => {
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(
        join(dir, "db/index.ts"),
        `import { drizzle } from "drizzle-orm/postgres-js"\n` +
          `export const queryClient = drizzle(process.env.DATABASE_URL!)\n`,
      )
      runCli(["init", dir, "--no-src"])
      const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
      expect(authFile).not.toMatch(/import \{ db \} from/)
    })

    // Type-only re-exports erase at runtime — `import { db }` would
    // resolve to undefined and silently break the wired-db path. The
    // detector must NOT treat `export { type db }` or
    // `export { type Database as db }` as a runtime value export.
    it("ignores inline type-only `export { type Database as db }` re-export", () => {
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(
        join(dir, "db/index.ts"),
        `import type { Database } from "drizzle-orm"\n` +
          `export { type Database as db } from "./types"\n`,
      )
      runCli(["init", dir, "--no-src"])
      const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
      expect(authFile).not.toMatch(/import \{ db \} from/)
    })

    it("ignores `export { type db } from \"./drizzle\"` re-export", () => {
      mkdirSync(join(dir, "db"), { recursive: true })
      writeFileSync(
        join(dir, "db/index.ts"),
        `export { type db } from "./drizzle"\n`,
      )
      runCli(["init", dir, "--no-src"])
      const authFile = readFileSync(join(dir, "lib/auth.ts"), "utf8")
      expect(authFile).not.toMatch(/import \{ db \} from/)
    })

    // Under src/ layout, the import alias still resolves to "@/db" — the
    // `@/*` alias maps to `src/*`, so `@/db` is `src/db/index.ts`.
    it("detects src/db/index.ts under src/ layout", () => {
      mkdirSync(join(dir, "src/db"), { recursive: true })
      writeFileSync(
        join(dir, "src/db/index.ts"),
        `import { drizzle } from "drizzle-orm/postgres-js"\n` +
          `export const db = drizzle(process.env.DATABASE_URL!)\n`,
      )
      runCli(["init", dir, "--src"])
      const authFile = readFileSync(join(dir, "src/lib/auth.ts"), "utf8")
      expect(authFile).toMatch(/import \{ db \} from "@\/db"/)
    })
  })

  // 0.5.0 — the old README told consumers to add an `auth:generate` script.
  // That script is now dead code (schema ships from
  // @naeemba/next-starter/schema). Detect and report; opt-in remove via
  // --clean-scripts so the CLI never mutates package.json by surprise.
  describe("obsolete package.json scripts", () => {
    it("warns about `auth:generate` scripts that run `better-auth generate`", () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: "test-app",
            scripts: {
              dev: "next dev",
              "auth:generate": "better-auth generate --output db/auth-schema.ts",
            },
          },
          null,
          2,
        ) + "\n",
      )
      const { stdout } = runCli(["init", dir, "--no-src"])
      expect(stdout).toMatch(/obsolete package\.json script/)
      expect(stdout).toMatch(/auth:generate/)
      expect(stdout).toMatch(/--clean-scripts/)
      // Without --clean-scripts, package.json is left alone
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
      expect(pkg.scripts["auth:generate"]).toBeDefined()
    })

    it("removes obsolete scripts under --clean-scripts", () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: "test-app",
            scripts: {
              dev: "next dev",
              "auth:generate": "better-auth generate --output db/auth-schema.ts",
              build: "next build",
            },
          },
          null,
          2,
        ) + "\n",
      )
      const { stdout } = runCli(["init", dir, "--no-src", "--clean-scripts"])
      expect(stdout).toMatch(/removed obsolete script/)
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
      expect(pkg.scripts["auth:generate"]).toBeUndefined()
      // Untouched scripts survive
      expect(pkg.scripts.dev).toBe("next dev")
      expect(pkg.scripts.build).toBe("next build")
    })

    it("doesn't warn when no obsolete scripts are present", () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "test-app", scripts: { dev: "next dev" } }, null, 2) + "\n",
      )
      const { stdout } = runCli(["init", dir, "--no-src"])
      expect(stdout).not.toMatch(/obsolete package\.json script/)
    })

    it("doesn't crash when package.json is absent", () => {
      const { code, stdout } = runCli(["init", dir, "--no-src"])
      expect(code).toBe(0)
      expect(stdout).not.toMatch(/obsolete package\.json script/)
    })
  })
})
