-- CreateTable
CREATE TABLE IF NOT EXISTS "PayoutProviderAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe_connect',
    "accountType" TEXT NOT NULL DEFAULT 'express',
    "stripeAccountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requirementsDue" JSONB,
    "country" TEXT,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_onboarding',
    "isDisabledByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "disabledReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutProviderAccount_stripeAccountId_key" ON "PayoutProviderAccount"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutProviderAccount_userId_provider_key" ON "PayoutProviderAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayoutProviderAccount_status_updatedAt_idx" ON "PayoutProviderAccount"("status", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayoutProviderAccount_userId_idx" ON "PayoutProviderAccount"("userId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "PayoutProviderAccount"
    ADD CONSTRAINT "PayoutProviderAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
