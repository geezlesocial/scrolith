-- Add transfer fee columns to GcoinSettings
BEGIN;

ALTER TABLE IF EXISTS "GcoinSettings"
  ADD COLUMN IF NOT EXISTS "transferFeeType" text DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS "transferFeeValue" double precision DEFAULT 0;

COMMIT;
