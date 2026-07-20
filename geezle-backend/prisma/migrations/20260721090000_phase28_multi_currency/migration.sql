-- Phase 28: Enterprise multi-currency — user preference + FX quotes (additive, non-destructive)
-- Table name is Prisma "User" (not "users").

-- User preferred display currency (server-authoritative)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferred_currency" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currency_preference_updated_at" TIMESTAMP(3);

-- Immutable FX quotes for checkout / funding / withdrawal confirmation windows
CREATE TABLE IF NOT EXISTS "fx_quotes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "context_type" TEXT NOT NULL,
    "context_id" TEXT,
    "base_amount_minor" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "converted_amount_minor" TEXT NOT NULL,
    "display_currency" TEXT NOT NULL,
    "charge_amount_minor" TEXT,
    "charge_currency" TEXT,
    "rate_decimal" TEXT NOT NULL,
    "rate_source" TEXT NOT NULL,
    "snapshot_id" TEXT,
    "override_id" TEXT,
    "rounding_adjustment_minor" TEXT,
    "markup_bps" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fx_quotes_user_id_status_idx" ON "fx_quotes"("user_id", "status");
CREATE INDEX IF NOT EXISTS "fx_quotes_context_type_context_id_idx" ON "fx_quotes"("context_type", "context_id");
CREATE INDEX IF NOT EXISTS "fx_quotes_expires_at_status_idx" ON "fx_quotes"("expires_at", "status");
CREATE INDEX IF NOT EXISTS "fx_quotes_created_at_idx" ON "fx_quotes"("created_at");
