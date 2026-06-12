import { describe, it, expect, expectTypeOf } from "vitest"
import { passkey, type PasskeyRow } from "../src/schema/index.js"

// drizzle-orm 0.45.x stores columns under a Symbol rather than a runtime `_` property
const DrizzleColumns = Symbol.for("drizzle:Columns")
const DrizzleForeignKeys = Symbol.for("drizzle:PgInlineForeignKeys")
const DrizzleTableName = Symbol.for("drizzle:Name")

type DrizzleColumn = {
  name: string
  notNull: boolean
  isUnique?: boolean
}
type DrizzleForeignKey = {
  reference: () => {
    foreignTable: Record<symbol, unknown>
    foreignColumns: Array<{ name: string }>
    columns: Array<{ name: string }>
  }
  onDelete?: string
}

function cols() {
  return (
    (passkey as unknown as Record<symbol, Record<string, DrizzleColumn>>)[DrizzleColumns] ??
    {}
  )
}
function fks() {
  return (
    (passkey as unknown as Record<symbol, DrizzleForeignKey[]>)[DrizzleForeignKeys] ?? []
  )
}

describe("passkey schema", () => {
  // These names are dictated by @better-auth/passkey's plugin schema (drizzle
  // adapter looks up by JS property name). Pinning them here so an upstream
  // rename or a local rename breaks the test instead of silently producing
  // missing-column INSERTs at runtime.
  // Keep in sync with @better-auth/passkey ^1.6.x.
  it("declares every column the @better-auth/passkey adapter expects", () => {
    expect(Object.keys(cols()).sort()).toEqual(
      [
        "id",
        "userId",
        "name",
        "publicKey",
        "credentialID",
        "counter",
        "deviceType",
        "backedUp",
        "transports",
        "aaguid",
        "createdAt",
      ].sort()
    )
  })

  it("pins notNull on every plugin-required field", () => {
    const c = cols()
    expect(c.id.notNull).toBe(true)
    expect(c.userId.notNull).toBe(true)
    expect(c.publicKey.notNull).toBe(true)
    expect(c.credentialID.notNull).toBe(true)
    expect(c.counter.notNull).toBe(true)
    expect(c.backedUp.notNull).toBe(true)
    expect(c.createdAt.notNull).toBe(true)
  })

  it("leaves the plugin-optional fields nullable", () => {
    const c = cols()
    expect(c.name.notNull).toBe(false)
    expect(c.deviceType.notNull).toBe(false)
    expect(c.transports.notNull).toBe(false)
    expect(c.aaguid.notNull).toBe(false)
  })

  it("declares credential_id as unique (one credential → one row)", () => {
    expect(cols().credentialID.isUnique).toBe(true)
  })

  it("declares user_id as a cascade FK to user.id (ON DELETE cascade)", () => {
    const fk = fks()[0]
    expect(fk).toBeDefined()
    const ref = fk.reference()
    expect(ref.foreignTable[DrizzleTableName]).toBe("user")
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(["id"])
    expect(ref.columns.map((c) => c.name)).toEqual(["user_id"])
    expect(fk.onDelete).toBe("cascade")
  })

  it("widens PasskeyRow to the right notNull-aware types", () => {
    expectTypeOf<PasskeyRow["id"]>().toEqualTypeOf<string>()
    expectTypeOf<PasskeyRow["counter"]>().toEqualTypeOf<number>()
    expectTypeOf<PasskeyRow["backedUp"]>().toEqualTypeOf<boolean>()
    expectTypeOf<PasskeyRow["createdAt"]>().toEqualTypeOf<Date>()
    expectTypeOf<PasskeyRow["name"]>().toEqualTypeOf<string | null>()
    expectTypeOf<PasskeyRow["aaguid"]>().toEqualTypeOf<string | null>()
  })
})
