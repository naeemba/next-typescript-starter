import { describe, it, expect } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
const run = promisify(execFile)

const TEST_DB_URL = "postgres://postgres:postgres@localhost:5433/starter_test"

describe("next-starter migrate CLI", () => {
  it("fails clearly when DATABASE_URL is unset", async () => {
    await expect(
      run("node", ["bin/cli.mjs", "migrate"], { env: { ...process.env, DATABASE_URL: "" } }),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("DATABASE_URL"),
    })
    // also assert the prefix is present
    await expect(
      run("node", ["bin/cli.mjs", "migrate"], { env: { ...process.env, DATABASE_URL: "" } }),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("[@naeemba/next-starter]"),
    })
  })

  it("rejects unknown migrate subcommand with exit 1 and error message", async () => {
    await expect(
      run("node", ["bin/cli.mjs", "migrate", "bogus"], {
        env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("bogus"),
    })
  })

  it("shows migrate in --help", async () => {
    const { stdout } = await run("node", ["bin/cli.mjs", "--help"])
    expect(stdout).toContain("migrate")
  })
})
