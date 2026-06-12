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
})
