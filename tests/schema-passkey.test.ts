import { describe, it, expect } from "vitest"
import { passkey, type PasskeyRow } from "../src/schema/index.js"

// drizzle-orm 0.45.x stores columns under a Symbol rather than a runtime `_` property
const DrizzleColumns = Symbol.for("drizzle:Columns")

describe("passkey schema", () => {
  it("defines a 'passkey' table with the required columns", () => {
    const cols = Object.keys(
      (passkey as unknown as Record<symbol, Record<string, unknown>>)[DrizzleColumns] ?? {}
    )
    expect(cols.sort()).toEqual(
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
        "createdAt",
      ].sort()
    )
  })

  it("exports a PasskeyRow inferred type", () => {
    const sample: PasskeyRow = {
      id: "p_1",
      userId: "u_1",
      name: "MacBook Air",
      publicKey: "pk",
      credentialID: "cid",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: "internal",
      createdAt: new Date(),
    }
    expect(sample.id).toBe("p_1")
  })
})
