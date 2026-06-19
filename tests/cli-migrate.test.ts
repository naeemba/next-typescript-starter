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
