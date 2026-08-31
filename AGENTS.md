# Working in this repo

## Naming

Spell identifiers out. No `cols`, `cfg`, `idx`, `btn`, `msg`, `repo`. The
exceptions are the established spellings — `id`, `url`, `json`, `uuid` — and
whatever an external library already exports (`credentialID` mirrors
`@better-auth/passkey`, so it stays).

## Auth migrations

Every migration after `0000` needs an entry in `BASELINE_EFFECT_CHECKS`
(`src/db/migrate.ts`), or an explicit comment saying why it needs none.
`baselineAuth` records a migration as already-applied without running its DDL,
so an unchecked migration is recorded blind and the skipped DDL only shows up
as a failed sign-in in a consumer's app. `tests/baseline-auth.test.ts` fails
when an entry is missing.

An entry must describe the migration's whole effect — the column *and* its
nullability *and* any index — not just one part of it.

## Schema

`src/schema/index.ts` must declare every field better-auth requires. The
drizzle adapter resolves fields by JS property name, not column name, so
renaming a property breaks lookups even when the physical column is unchanged.
`tests/schema-better-auth-fields.test.ts` checks this against better-auth's own
`getAuthTables`.
