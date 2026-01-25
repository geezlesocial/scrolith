/*
  Warnings:

  - You are about to drop the column `adminFeePercent` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `coinPerLikesUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `coinPerRepostsUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `coinPerSharesUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `coinPerViewsUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `likesUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `repostsUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `sharesUnit` on the `GcoinSettings` table. All the data in the column will be lost.
  - You are about to drop the column `viewsUnit` on the `GcoinSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GcoinSettings"
  DROP COLUMN IF EXISTS "adminFeePercent",
  DROP COLUMN IF EXISTS "coinPerLikesUnit",
  DROP COLUMN IF EXISTS "coinPerRepostsUnit",
  DROP COLUMN IF EXISTS "coinPerSharesUnit",
  DROP COLUMN IF EXISTS "coinPerViewsUnit",
  DROP COLUMN IF EXISTS "likesUnit",
  DROP COLUMN IF EXISTS "repostsUnit",
  DROP COLUMN IF EXISTS "sharesUnit",
  DROP COLUMN IF EXISTS "viewsUnit";

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "adminFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN     "coinPerLikesUnit" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "coinPerRepostsUnit" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "coinPerSharesUnit" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "coinPerViewsUnit" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "likesUnit" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "repostsUnit" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "sharesUnit" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "viewsUnit" INTEGER NOT NULL DEFAULT 10000;
