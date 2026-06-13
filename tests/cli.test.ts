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
})
