-- CreateTable
CREATE TABLE IF NOT EXISTS "FxLock" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "sourceAmount" DECIMAL(20,8) NOT NULL,
    "convertedAmount" DECIMAL(20,8) NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "rateSource" TEXT NOT NULL DEFAULT 'identity',
    "snapshotId" TEXT,
    "overrideId" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "isFrozenSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "markupBps" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxLock_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WalletFundingIntent" ADD COLUMN IF NOT EXISTS "fxLockId" TEXT;

-- AlterTable
ALTER TABLE "OrderPaymentIntent" ADD COLUMN IF NOT EXISTS "fxLockId" TEXT;

-- AlterTable
ALTER TABLE "WithdrawalRequest" ADD COLUMN IF NOT EXISTS "fxLockId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FxLock_entityType_entityId_key" ON "FxLock"("entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FxLock_fromCurrency_toCurrency_createdAt_idx" ON "FxLock"("fromCurrency", "toCurrency", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FxLock_createdAt_idx" ON "FxLock"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WalletFundingIntent_fxLockId_key" ON "WalletFundingIntent"("fxLockId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrderPaymentIntent_fxLockId_key" ON "OrderPaymentIntent"("fxLockId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WithdrawalRequest_fxLockId_key" ON "WithdrawalRequest"("fxLockId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'WalletFundingIntent_fxLockId_fkey'
    ) THEN
        ALTER TABLE "WalletFundingIntent"
        ADD CONSTRAINT "WalletFundingIntent_fxLockId_fkey"
        FOREIGN KEY ("fxLockId") REFERENCES "FxLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'OrderPaymentIntent_fxLockId_fkey'
    ) THEN
        ALTER TABLE "OrderPaymentIntent"
        ADD CONSTRAINT "OrderPaymentIntent_fxLockId_fkey"
        FOREIGN KEY ("fxLockId") REFERENCES "FxLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'WithdrawalRequest_fxLockId_fkey'
    ) THEN
        ALTER TABLE "WithdrawalRequest"
        ADD CONSTRAINT "WithdrawalRequest_fxLockId_fkey"
        FOREIGN KEY ("fxLockId") REFERENCES "FxLock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
