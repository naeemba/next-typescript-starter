import { describe, it, expect } from "vitest"
import { getTableConfig } from "drizzle-orm/pg-core"
import { session, account, verification, passkey } from "../src/schema/index.js"

// Better-auth queries these tables on every session lookup, sign-in, and
// account-link. Without these indexes, every query is a sequential scan —
// invisible at zero users, painful past a few thousand. The names are stable
// and consumer-visible because they end up in migration files.

function indexNames(table: any): string[] {
  return getTableConfig(table).indexes.map((i: any) => i.config.name).sort()
}

function indexColumns(table: any, name: string): string[] {
  const cfg = getTableConfig(table)
  const idx = cfg.indexes.find((i: any) => i.config.name === name)
  if (!idx) throw new Error(`index "${name}" not found on ${cfg.name}`)
  return (idx as any).config.columns.map((c: any) => c.name)
}

describe("auth schema indexes", () => {
  it("ships an index on session.userId", () => {
    expect(indexNames(session)).toContain("session_user_id_idx")
    expect(indexColumns(session, "session_user_id_idx")).toEqual(["user_id"])
  })

  it("ships an index on account.userId", () => {
    expect(indexNames(account)).toContain("account_user_id_idx")
    expect(indexColumns(account, "account_user_id_idx")).toEqual(["user_id"])
  })

  it("ships an index on verification.identifier", () => {
    expect(indexNames(verification)).toContain("verification_identifier_idx")
    expect(indexColumns(verification, "verification_identifier_idx")).toEqual(["identifier"])
  })

  it("ships an index on passkey.userId", () => {
    expect(indexNames(passkey)).toContain("passkey_user_id_idx")
    expect(indexColumns(passkey, "passkey_user_id_idx")).toEqual(["user_id"])
  })
})
