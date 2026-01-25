-- Migration: Add Community Gcoin & Ads models
-- NOTE: This is a hand-crafted migration representing the Prisma schema updates already present in schema.prisma.

BEGIN;

-- GcoinConfig
CREATE TABLE IF NOT EXISTS "GcoinConfig" (
  "id" text PRIMARY KEY,
  "key" text UNIQUE NOT NULL,
  "data" jsonb NOT NULL,
  "description" text,
  "createdById" text,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- Add Decimal-capable columns requires numeric type (safe checks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='GcoinTransaction') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='amount') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "amount" numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='walletId') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "walletId" text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='fromUserId') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "fromUserId" text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='toUserId') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "toUserId" text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='feeAmount') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "feeAmount" numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='netAmount') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "netAmount" numeric DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GcoinTransaction' AND column_name='metadata') THEN
      ALTER TABLE "GcoinTransaction" ADD COLUMN "metadata" jsonb;
    END IF;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "gcoin_transaction_fromUserId_idx" ON "GcoinTransaction" ("fromUserId");
CREATE INDEX IF NOT EXISTS "gcoin_transaction_toUserId_idx" ON "GcoinTransaction" ("toUserId");

-- Ensure conversion requests reference wallet id
ALTER TABLE IF EXISTS "GcoinConversionRequest"
  ADD COLUMN IF NOT EXISTS "walletId" text;
CREATE INDEX IF NOT EXISTS "gcoin_conversion_walletid_idx" ON "GcoinConversionRequest" ("walletId");
-- Add FK constraint if not present (some PG versions don't support ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gcoin_conversion_wallet_fkey') THEN
    ALTER TABLE "GcoinConversionRequest" ADD CONSTRAINT "gcoin_conversion_wallet_fkey" FOREIGN KEY ("walletId") REFERENCES "GcoinWallet" ("id") ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
