import { describe, it, expect } from "vitest"
import { getAuthTables } from "better-auth/db"
import * as schema from "../src/schema/index.js"

// `account.issuer` went missing on the 1.7 bump and nothing here noticed:
// every existing test asserted what the schema says, never what better-auth
// requires. The drizzle adapter resolves a field by its JS PROPERTY name, so
// `issuerUrl: text("issuer")` would keep the physical column name, keep the
// migration valid, and still break every account lookup. This asks better-auth
// itself, so the next required field it adds fails at `npm test` instead of at
// someone's sign-in.
describe("auth schema vs better-auth", () => {
  const tables = getAuthTables({})

  for (const [model, table] of Object.entries(tables)) {
    it(`declares every field better-auth requires on "${model}"`, () => {
      const declared = schema[model as keyof typeof schema]
      expect(declared, `src/schema exports no "${model}" table`).toBeDefined()
      expect(Object.keys(declared)).toEqual(
        expect.arrayContaining(Object.keys(table.fields)),
      )
    })
  }
})
