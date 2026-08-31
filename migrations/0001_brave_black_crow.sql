-- better-auth >=1.7 keys an account on (issuer, accountId) instead of
-- (providerId, accountId). Adding the column as NOT NULL in one step would
-- fail on any database that already has account rows, so add it nullable,
-- backfill, then tighten.
ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint

-- Google is the only social provider this package configures, and better-auth
-- resolves it to Google's own OIDC issuer. Magic-link and passkey sign-ins
-- create no account row at all, so these are the only rows that can exist.
UPDATE "account" SET "issuer" = 'https://accounts.google.com' WHERE "provider_id" = 'google';--> statement-breakpoint

-- Any other provider_id was not written by this package, so its correct issuer
-- cannot be derived here: some providers use their own OIDC issuer, others a
-- synthetic 'local:oauth:<provider>' namespace, and a few (Cognito, Entra ID)
-- derive it per tenant at runtime. Guessing would silently orphan a returning
-- user's account instead of linking it, so stop and let the operator decide.
DO $$
DECLARE unknown_providers text;
BEGIN
  SELECT string_agg(DISTINCT "provider_id", ', ')
    INTO unknown_providers
    FROM "account"
   WHERE "issuer" IS NULL;

  IF unknown_providers IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot backfill account.issuer for provider_id(s): %. Set issuer on those rows before migrating — see https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-is-scoped-by-issuer',
      unknown_providers;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_idx" ON "account" USING btree ("issuer","account_id");
