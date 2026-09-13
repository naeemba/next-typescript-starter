import { describe, it, expect } from "vitest"
import { getAuthTables } from "better-auth/db"
import { passkey } from "@better-auth/passkey"
import { magicLink } from "better-auth/plugins"
import { getTableColumns } from "drizzle-orm"
import * as schema from "../src/schema/index.js"

// `account.issuer` went missing on the 1.7 bump and nothing here noticed:
// every existing test asserted what the schema says, never what better-auth
// requires. The drizzle adapter resolves a field by its JS PROPERTY name, so
// `issuerUrl: text("issuer")` would keep the physical column name, keep the
// migration valid, and still break every account lookup. This asks better-auth
// itself, so the next required field it adds fails at `npm test` instead of at
// someone's sign-in.
//
// Both directions, because the reverse burned us too: 0.11.0 shipped an
// `account.issuer` column that 1.7.3 no longer writes, and better-auth's init
// validator refuses every authentication request over a column it does not
// know about. A green suite and a dead sign-in page. So a field on a
// better-auth-owned table has to be one better-auth declares, or listed below
// as ours.
//
// `id` is the primary key better-auth assumes on every model without listing
// it among the model's fields.
const PACKAGE_OWNED_FIELDS = new Set(["id"])

/** Column property names on one of our tables, which is what the drizzle
 *  adapter resolves a better-auth field by. */
function declaredFields(model: string): string[] {
  const table = schema[model as keyof typeof schema]
  expect(table, `src/schema exports no "${model}" table`).toBeDefined()
  return Object.keys(getTableColumns(table as never))
}

describe("auth schema vs better-auth", () => {
  // The plugin list `createAuth` ships: `magicLink` unconditionally, `passkey`
  // when the consumer asks for it. With no plugins better-auth returns only
  // user/session/account/verification, which would leave `passkey` — the one
  // table this package owns purely to mirror a plugin's schema — unguarded in
  // both directions.
  const tables = getAuthTables({
    plugins: [passkey(), magicLink({ sendMagicLink: async () => {} })],
  })

  for (const [model, table] of Object.entries(tables)) {
    it(`declares every field better-auth requires on "${model}"`, () => {
      expect(declaredFields(model)).toEqual(
        expect.arrayContaining(Object.keys(table.fields)),
      )
    })

    it(`declares no field better-auth does not know about on "${model}"`, () => {
      const known = new Set([...Object.keys(table.fields), ...PACKAGE_OWNED_FIELDS])
      expect(declaredFields(model).filter((field) => !known.has(field))).toEqual([])
    })
  }
})
