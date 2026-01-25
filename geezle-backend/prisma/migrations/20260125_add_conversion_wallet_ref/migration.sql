-- Manual migration: add walletId to GcoinConversionRequest and FK to GcoinWallet
BEGIN;

ALTER TABLE IF EXISTS "GcoinConversionRequest"
  ADD COLUMN IF NOT EXISTS "walletId" text;

CREATE INDEX IF NOT EXISTS "gcoin_conversion_walletid_idx" ON "GcoinConversionRequest" ("walletId");

-- Add FK constraint referencing GcoinWallet(id) (safe check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gcoin_conversion_wallet_fkey') THEN
    ALTER TABLE "GcoinConversionRequest" ADD CONSTRAINT "gcoin_conversion_wallet_fkey" FOREIGN KEY ("walletId") REFERENCES "GcoinWallet" ("id") ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
