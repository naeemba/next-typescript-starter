import { describe, it, expect, vi } from "vitest"

// Mock drizzle's migrator so this unit test needs no database.
const migrateSpy = vi.hoisted(() =>
  vi.fn(async (_db: unknown, _opts: { migrationsFolder: string; migrationsTable: string }) => {}),
)
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = migrateSpy.mock.calls[0]![1]!
    expect(existsSync(join(call.migrationsFolder, "meta", "_journal.json"))).toBe(true)
  })
})
