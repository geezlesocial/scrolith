-- Migration: add_gcoin_ads (2026-01-28)
-- This migration adds Gcoin enums/tables and Community Ads tables.

-- Enum types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adstatus') THEN
        CREATE TYPE adstatus AS ENUM (
            'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gcoineventtype') THEN
        CREATE TYPE gcoineventtype AS ENUM ('VIEW','LIKE','REPOST','SHARE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gcoinconversionstatus') THEN
        CREATE TYPE gcoinconversionstatus AS ENUM ('PENDING','APPROVED','DENIED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gcointransactiondirection') THEN
        CREATE TYPE gcointransactiondirection AS ENUM ('CREDIT','DEBIT');
    END IF;
END$$;

-- GcoinWallet
CREATE TABLE IF NOT EXISTS "GcoinWallet" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "recipientId" TEXT UNIQUE NOT NULL,
  "balance" NUMERIC DEFAULT 0,
  "pending" NUMERIC DEFAULT 0,
  "frozen" BOOLEAN DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- Foreign key to User (assumes a "User" table with primary key "id")
ALTER TABLE IF EXISTS "GcoinWallet"
  ADD CONSTRAINT IF NOT EXISTS fk_gcoinwallet_user FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gcoinwallet_recipientId ON "GcoinWallet" ("recipientId");

-- GcoinTransaction
CREATE TABLE IF NOT EXISTS "GcoinTransaction" (
  "id" TEXT PRIMARY KEY,
  "walletId" TEXT NOT NULL,
  "actorId" TEXT,
  "direction" gcointransactiondirection NOT NULL,
  "amount" NUMERIC NOT NULL,
  "fee" NUMERIC DEFAULT 0,
  "netAmount" NUMERIC NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE IF EXISTS "GcoinTransaction"
  ADD CONSTRAINT IF NOT EXISTS fk_gcointransaction_wallet FOREIGN KEY ("walletId") REFERENCES "GcoinWallet"(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS "GcoinTransaction"
  ADD CONSTRAINT IF NOT EXISTS fk_gcointransaction_actor FOREIGN KEY ("actorId") REFERENCES "User"(id);

CREATE INDEX IF NOT EXISTS idx_gcointransaction_walletId ON "GcoinTransaction" ("walletId");
CREATE INDEX IF NOT EXISTS idx_gcointransaction_actorId ON "GcoinTransaction" ("actorId");

-- GcoinEarningEvent
CREATE TABLE IF NOT EXISTS "GcoinEarningEvent" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "eventType" gcoineventtype NOT NULL,
  "eventKey" TEXT UNIQUE NOT NULL,
  "value" INTEGER DEFAULT 1,
  "awarded" NUMERIC DEFAULT 0,
  "processed" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE IF EXISTS "GcoinEarningEvent"
  ADD CONSTRAINT IF NOT EXISTS fk_gcoinevent_actor FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gcoinevent_postId ON "GcoinEarningEvent" ("postId");
CREATE INDEX IF NOT EXISTS idx_gcoinevent_actorId ON "GcoinEarningEvent" ("actorId");

-- GcoinConversionRequest
CREATE TABLE IF NOT EXISTS "GcoinConversionRequest" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "amount" NUMERIC NOT NULL,
  "requestedRate" NUMERIC,
  "status" gcoinconversionstatus DEFAULT 'PENDING',
  "payoutMethodId" TEXT,
  "adminNote" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE IF EXISTS "GcoinConversionRequest"
  ADD CONSTRAINT IF NOT EXISTS fk_gcoinconversion_user FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS "GcoinConversionRequest"
  ADD CONSTRAINT IF NOT EXISTS fk_gcoinconversion_wallet FOREIGN KEY ("walletId") REFERENCES "GcoinWallet"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gcoinconversion_userId ON "GcoinConversionRequest" ("userId");
CREATE INDEX IF NOT EXISTS idx_gcoinconversion_status ON "GcoinConversionRequest" ("status");

-- GcoinConfig
CREATE TABLE IF NOT EXISTS "GcoinConfig" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT UNIQUE NOT NULL,
  "viewsUnit" INTEGER DEFAULT 10000,
  "coinPerViewsUnit" NUMERIC DEFAULT 1,
  "likesUnit" INTEGER DEFAULT 100,
  "coinPerLikesUnit" NUMERIC DEFAULT 1,
  "repostsUnit" INTEGER DEFAULT 50,
  "coinPerRepostsUnit" NUMERIC DEFAULT 1,
  "sharesUnit" INTEGER DEFAULT 200,
  "coinPerSharesUnit" NUMERIC DEFAULT 1,
  "adminFeePercent" NUMERIC DEFAULT 0.1,
  "transferFeeType" TEXT DEFAULT 'percentage',
  "transferFeeValue" NUMERIC DEFAULT 0,
  "conversionRate" NUMERIC DEFAULT 0.1,
  "minPayout" NUMERIC DEFAULT 10,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE IF EXISTS "GcoinConfig"
  ADD CONSTRAINT IF NOT EXISTS fk_gcoinconfig_createdBy FOREIGN KEY ("createdById") REFERENCES "User"(id);

-- CommunityAd
CREATE TABLE IF NOT EXISTS "CommunityAd" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "placement" TEXT NOT NULL,
  "targeting" JSONB,
  "mediaFiles" TEXT[] DEFAULT '{}',
  "budget" NUMERIC NOT NULL,
  "remainingBudget" NUMERIC DEFAULT 0,
  "cpm" NUMERIC NOT NULL,
  "currency" TEXT DEFAULT 'USD',
  "status" adstatus DEFAULT 'DRAFT',
  "impressions" INTEGER DEFAULT 0,
  "clicks" INTEGER DEFAULT 0,
  "startAt" TIMESTAMPTZ,
  "endAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE IF EXISTS "CommunityAd"
  ADD CONSTRAINT IF NOT EXISTS fk_communityad_user FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_communityad_userId ON "CommunityAd" ("userId");
CREATE INDEX IF NOT EXISTS idx_communityad_status ON "CommunityAd" ("status");

-- AdImpressionDaily
CREATE TABLE IF NOT EXISTS "AdImpressionDaily" (
  "id" TEXT PRIMARY KEY,
  "adId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "impressions" INTEGER DEFAULT 0,
  "clicks" INTEGER DEFAULT 0
);
ALTER TABLE IF EXISTS "AdImpressionDaily"
  ADD CONSTRAINT IF NOT EXISTS fk_adimpression_ad FOREIGN KEY ("adId") REFERENCES "CommunityAd"(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_adimpression_ad_day ON "AdImpressionDaily" ("adId", "day");

-- AdPayment
CREATE TABLE IF NOT EXISTS "AdPayment" (
  "id" TEXT PRIMARY KEY,
  "adId" TEXT NOT NULL,
  "transactionId" TEXT,
  "amount" NUMERIC NOT NULL,
  "currency" TEXT DEFAULT 'USD',
  "gateway" TEXT,
  "status" TEXT DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE IF EXISTS "AdPayment"
  ADD CONSTRAINT IF NOT EXISTS fk_adpayment_ad FOREIGN KEY ("adId") REFERENCES "CommunityAd"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_adpayment_adId ON "AdPayment" ("adId");

-- End of migration

COMMENT ON TABLE "GcoinWallet" IS 'Created by migration add_gcoin_ads';
COMMENT ON TABLE "CommunityAd" IS 'Community-scoped Ads table';
