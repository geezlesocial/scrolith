-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'PAID', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_actor_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_user_fkey";

-- DropForeignKey
ALTER TABLE "UserFollow" DROP CONSTRAINT "UserFollow_followee_fkey";

-- DropForeignKey
ALTER TABLE "UserFollow" DROP CONSTRAINT "UserFollow_follower_fkey";

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserFollow" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "repostsCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GcoinEarningEvent" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GcoinEarningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityAd" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "targeting" JSONB,
    "mediaFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressionsBought" INTEGER NOT NULL DEFAULT 0,
    "impressionsLeft" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "paymentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdMetricsDaily" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdMetricsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPayment" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_idx" ON "CommunityPost"("authorId");

-- CreateIndex
CREATE INDEX "CommunityPost_status_idx" ON "CommunityPost"("status");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "GcoinEarningEvent_postId_idx" ON "GcoinEarningEvent"("postId");

-- CreateIndex
CREATE INDEX "GcoinEarningEvent_actorId_idx" ON "GcoinEarningEvent"("actorId");

-- CreateIndex
CREATE INDEX "GcoinEarningEvent_eventType_idx" ON "GcoinEarningEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "GcoinEarningEvent_eventKey_key" ON "GcoinEarningEvent"("eventKey");

-- CreateIndex
CREATE INDEX "CommunityAd_creatorId_idx" ON "CommunityAd"("creatorId");

-- CreateIndex
CREATE INDEX "CommunityAd_status_idx" ON "CommunityAd"("status");

-- CreateIndex
CREATE INDEX "CommunityAd_placement_idx" ON "CommunityAd"("placement");

-- CreateIndex
CREATE INDEX "AdMetricsDaily_adId_idx" ON "AdMetricsDaily"("adId");

-- CreateIndex
CREATE INDEX "AdMetricsDaily_date_idx" ON "AdMetricsDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdMetricsDaily_adId_date_key" ON "AdMetricsDaily"("adId", "date");

-- CreateIndex
CREATE INDEX "AdPayment_adId_idx" ON "AdPayment"("adId");

-- CreateIndex
CREATE INDEX "AdPayment_transactionId_idx" ON "AdPayment"("transactionId");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GcoinEarningEvent" ADD CONSTRAINT "GcoinEarningEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GcoinEarningEvent" ADD CONSTRAINT "GcoinEarningEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAd" ADD CONSTRAINT "CommunityAd_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdMetricsDaily" ADD CONSTRAINT "AdMetricsDaily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "CommunityAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPayment" ADD CONSTRAINT "AdPayment_adId_fkey" FOREIGN KEY ("adId") REFERENCES "CommunityAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Notification_actor_idx" RENAME TO "Notification_actorId_idx";

-- RenameIndex
ALTER INDEX "Notification_user_idx" RENAME TO "Notification_userId_idx";

-- RenameIndex
ALTER INDEX "UserFollow_followee_idx" RENAME TO "UserFollow_followeeId_idx";

-- RenameIndex
ALTER INDEX "UserFollow_follower_followee_unique" RENAME TO "UserFollow_followerId_followeeId_key";

-- RenameIndex
ALTER INDEX "UserFollow_follower_idx" RENAME TO "UserFollow_followerId_idx";
