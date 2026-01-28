/*
  Warnings:

  - You are about to alter the column `amount` on the `GcoinTransaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `feeAmount` on the `GcoinTransaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `netAmount` on the `GcoinTransaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - Made the column `createdAt` on table `GcoinConfig` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `GcoinConfig` required. This step will fail if there are existing NULL values in that column.
  - Made the column `transferFeeType` on table `GcoinSettings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `transferFeeValue` on table `GcoinSettings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `feeAmount` on table `GcoinTransaction` required. This step will fail if there are existing NULL values in that column.
  - Made the column `netAmount` on table `GcoinTransaction` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "GcoinConversionRequest" DROP CONSTRAINT "gcoin_conversion_wallet_fkey";

-- DropForeignKey
ALTER TABLE "GcoinTransaction" DROP CONSTRAINT "gcoin_transaction_wallet_fkey";

-- AlterTable
ALTER TABLE "GcoinConfig" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET NOT NULL,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GcoinSettings" ALTER COLUMN "transferFeeType" SET NOT NULL,
ALTER COLUMN "transferFeeValue" SET NOT NULL;

-- AlterTable
ALTER TABLE "GcoinTransaction" ALTER COLUMN "amount" SET DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "feeAmount" SET NOT NULL,
ALTER COLUMN "feeAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "netAmount" SET NOT NULL,
ALTER COLUMN "netAmount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "transferFeeType" TEXT NOT NULL DEFAULT 'percentage',
ADD COLUMN     "transferFeeValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "GcoinConfig_key_idx" ON "GcoinConfig"("key");

-- CreateIndex
CREATE INDEX "GcoinConfig_createdById_idx" ON "GcoinConfig"("createdById");

-- AddForeignKey
ALTER TABLE "GcoinTransaction" ADD CONSTRAINT "gcoin_transaction_wallet_fkey" FOREIGN KEY ("walletId") REFERENCES "GcoinWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GcoinConfig" ADD CONSTRAINT "GcoinConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GcoinConversionRequest" ADD CONSTRAINT "gcoin_conversion_wallet_fkey" FOREIGN KEY ("walletId") REFERENCES "GcoinWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "gcoin_conversion_walletid_idx" RENAME TO "GcoinConversionRequest_walletId_idx";

-- RenameIndex
ALTER INDEX "gcoin_transaction_fromUserId_idx" RENAME TO "GcoinTransaction_fromUserId_idx";

-- RenameIndex
ALTER INDEX "gcoin_transaction_toUserId_idx" RENAME TO "GcoinTransaction_toUserId_idx";
