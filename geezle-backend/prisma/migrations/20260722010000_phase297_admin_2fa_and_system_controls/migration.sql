-- Phase 29.7+ — Admin Google 2FA + system control support (additive only)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnrolledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorWaivedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorWaivedById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorWaivedReason" TEXT;

CREATE INDEX IF NOT EXISTS "User_twoFactorEnabled_idx" ON "User" ("twoFactorEnabled");
