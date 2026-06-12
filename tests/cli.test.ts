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
})
