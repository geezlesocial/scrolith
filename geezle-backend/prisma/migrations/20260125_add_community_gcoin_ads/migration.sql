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

-- Add Decimal-capable columns requires numeric type
ALTER TABLE IF EXISTS "GcoinTransaction" 
  DROP COLUMN IF EXISTS "amount",
  ADD COLUMN IF NOT EXISTS "amount" numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "walletId" text,
  ADD COLUMN IF NOT EXISTS "fromUserId" text,
  ADD COLUMN IF NOT EXISTS "toUserId" text,
  ADD COLUMN IF NOT EXISTS "feeAmount" numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netAmount" numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

CREATE INDEX IF NOT EXISTS "gcoin_transaction_fromUserId_idx" ON "GcoinTransaction" ("fromUserId");
CREATE INDEX IF NOT EXISTS "gcoin_transaction_toUserId_idx" ON "GcoinTransaction" ("toUserId");

COMMIT;
