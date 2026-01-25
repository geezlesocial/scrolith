-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "walletFundingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "walletFundingLimits" JSONB,
ADD COLUMN     "walletFundingProviders" JSONB,
ADD COLUMN     "walletFundingRouting" JSONB;

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loginAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletFundingIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "country" TEXT,
    "status" TEXT NOT NULL,
    "providerReferenceId" TEXT,
    "providerCheckoutUrl" TEXT,
    "providerPayload" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletFundingIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSettlement" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReferenceId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "WalletFundingIntent_userId_idx" ON "WalletFundingIntent"("userId");

-- CreateIndex
CREATE INDEX "WalletFundingIntent_walletId_idx" ON "WalletFundingIntent"("walletId");

-- CreateIndex
CREATE INDEX "WalletFundingIntent_status_idx" ON "WalletFundingIntent"("status");

-- CreateIndex
CREATE INDEX "WalletFundingIntent_provider_idx" ON "WalletFundingIntent"("provider");

-- CreateIndex
CREATE INDEX "WalletFundingIntent_createdAt_idx" ON "WalletFundingIntent"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentSettlement_intentId_idx" ON "PaymentSettlement"("intentId");

-- CreateIndex
CREATE INDEX "PaymentSettlement_createdAt_idx" ON "PaymentSettlement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_provider_providerReferenceId_key" ON "PaymentSettlement"("provider", "providerReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_intentId_key" ON "PaymentSettlement"("intentId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletFundingIntent" ADD CONSTRAINT "WalletFundingIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletFundingIntent" ADD CONSTRAINT "WalletFundingIntent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSettlement" ADD CONSTRAINT "PaymentSettlement_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "WalletFundingIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
