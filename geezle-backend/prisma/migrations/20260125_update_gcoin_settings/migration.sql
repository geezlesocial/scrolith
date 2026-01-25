-- Migration: add admin-configurable earning rule fields to GcoinSettings
BEGIN;

ALTER TABLE "GcoinSettings"
  ADD COLUMN IF NOT EXISTS "viewsUnit" integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS "likesUnit" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "repostsUnit" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "sharesUnit" integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "coinPerViewsUnit" double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "coinPerLikesUnit" double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "coinPerRepostsUnit" double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "coinPerSharesUnit" double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "adminFeePercent" double precision NOT NULL DEFAULT 0.1;

COMMIT;
