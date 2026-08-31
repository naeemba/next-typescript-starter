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

function indexConfig(table: any, name: string): any {
  const tableConfig = getTableConfig(table)
  const found = tableConfig.indexes.find((i: any) => i.config.name === name)
  if (!found) throw new Error(`index "${name}" not found on ${tableConfig.name}`)
  return (found as any).config
}

function indexColumns(table: any, name: string): string[] {
  return indexConfig(table, name).columns.map((c: any) => c.name)
}

function indexIsUnique(table: any, name: string): boolean {
  return indexConfig(table, name).unique === true
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

  // better-auth >=1.7 looks an account up by (issuer, accountId) and relies on
  // the pair being unique — two rows sharing it would let one identity resolve
  // to two users.
  it("ships a unique index on account.(issuer, accountId)", () => {
    expect(indexNames(account)).toContain("account_issuer_account_id_idx")
    expect(indexColumns(account, "account_issuer_account_id_idx")).toEqual([
      "issuer",
      "account_id",
    ])
    // Uniqueness is the whole point: without it the index is a plain lookup
    // index and two rows may share one (issuer, accountId). `index(...)` in
    // place of `uniqueIndex(...)` passes every other assertion here.
    expect(indexIsUnique(account, "account_issuer_account_id_idx")).toBe(true)
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
