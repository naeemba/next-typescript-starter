import { test, expect } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

let server: ChildProcess
const logBuf: string[] = []

test.beforeAll(async () => {
  server = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    env: { ...process.env, RESEND_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout!.on("data", (b) => logBuf.push(b.toString()))
  server.stderr!.on("data", (b) => logBuf.push(b.toString()))

  const ready = Date.now() + 60_000
  while (Date.now() < ready) {
    if (logBuf.some((l) => l.includes("Ready in") || l.includes("started server"))) return
    await sleep(500)
  }
  throw new Error("Next dev server did not become ready within 60s")
})

test.afterAll(async () => {
  if (!server) return
  server.kill()
  await new Promise<void>((r) => server.on("exit", () => r()))
})

async function findMagicLink(email: string): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const haystack = logBuf.join("\n")
    const re = new RegExp(
      `\\[magic-link-log\\] email=${email.replace(/[.+*?^$()[\]{}|\\]/g, "\\$&")} url=(https?:\\/\\/\\S+)`
    )
    const m = haystack.match(re)
    if (m && m[1]) return m[1]
    await sleep(250)
  }
  throw new Error(`Magic link for ${email} not found in server logs within 15s`)
}

test("magic-link sign-in works end to end", async ({ page }) => {
  const email = `test+${Date.now()}@example.com`

  await page.goto("/sign-in")
  await page.getByLabel(/email/i).fill(email)
  await page.getByRole("button", { name: /sign in/i }).click()

  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible({
    timeout: 10_000,
  })

  const magicUrl = await findMagicLink(email)

  await page.goto(magicUrl)
  await expect(page).toHaveURL("http://localhost:3000/")
  await expect(page.getByTestId("user-email")).toHaveText(new RegExp(email.replace(/[.+]/g, "\\$&")))
})
