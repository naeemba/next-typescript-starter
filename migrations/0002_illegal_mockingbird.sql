-- better-auth 1.7.3 reverted the account identity change that 1.7.0 introduced:
-- an account is keyed by (providerId, accountId) again, and `issuer` is no
-- longer part of better-auth's account schema. 1.7.3 also validates the schema
-- at init and refuses authentication requests on a mismatch, so a database
-- still carrying a NOT NULL `issuer` better-auth never writes blocks sign-in
-- outright. Undo migration 0001.
DROP INDEX "account_issuer_account_id_idx";--> statement-breakpoint

-- The uniqueness that index guaranteed has to land somewhere, and it moves
-- back to the key better-auth actually looks up on. Creating the index on a
-- database that already has duplicate (provider_id, account_id) rows would
-- fail with a bare constraint-violation error naming neither the rows nor the
-- fix, so find them first and say what to do about them.
DO $$
DECLARE duplicates text;
BEGIN
  SELECT string_agg(format('(%s, %s)', "provider_id", "account_id"), ', ')
    INTO duplicates
    FROM (
      SELECT "provider_id", "account_id"
        FROM "account"
       GROUP BY 1, 2
      HAVING count(*) > 1
    ) d;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION
      'Duplicate (provider_id, account_id) rows block this migration: %. better-auth rejects an account lookup that matches more than one row, so these are already broken. If two issuers share a provider_id, give each its own provider_id and update the matching rows, keeping different users separate — see https://better-auth.com/docs/guides/1-7-upgrade-guide#check-for-duplicate-account-keys',
      duplicates;
  END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX "account_provider_id_account_id_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint

-- Dropping the column discards the backfilled issuer values. They are
-- reconstructible (every row this package wrote is Google's own OIDC issuer)
-- and better-auth no longer reads them.
ALTER TABLE "account" DROP COLUMN "issuer";
