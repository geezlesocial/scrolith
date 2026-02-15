-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "FavoriteEntityType" ADD VALUE 'POST';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
CREATE TYPE "CommunityPostFeedbackSignal" AS ENUM ('INTERESTED', 'NOT_INTERESTED');

-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "repostsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CommunityPostHidden" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPostHidden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostFeedback" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signal" "CommunityPostFeedbackSignal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPostFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPostReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityNotificationSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityNotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostHidden_postId_userId_key" ON "CommunityPostHidden"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPostHidden_userId_idx" ON "CommunityPostHidden"("userId");

-- CreateIndex
CREATE INDEX "CommunityPostHidden_postId_idx" ON "CommunityPostHidden"("postId");

-- CreateIndex
CREATE INDEX "CommunityPostHidden_createdAt_idx" ON "CommunityPostHidden"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostFeedback_postId_userId_key" ON "CommunityPostFeedback"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPostFeedback_userId_idx" ON "CommunityPostFeedback"("userId");

-- CreateIndex
CREATE INDEX "CommunityPostFeedback_postId_idx" ON "CommunityPostFeedback"("postId");

-- CreateIndex
CREATE INDEX "CommunityPostFeedback_signal_idx" ON "CommunityPostFeedback"("signal");

-- CreateIndex
CREATE INDEX "CommunityPostFeedback_updatedAt_idx" ON "CommunityPostFeedback"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostReport_postId_reporterId_key" ON "CommunityPostReport"("postId", "reporterId");

-- CreateIndex
CREATE INDEX "CommunityPostReport_reporterId_idx" ON "CommunityPostReport"("reporterId");

-- CreateIndex
CREATE INDEX "CommunityPostReport_postId_idx" ON "CommunityPostReport"("postId");

-- CreateIndex
CREATE INDEX "CommunityPostReport_status_idx" ON "CommunityPostReport"("status");

-- CreateIndex
CREATE INDEX "CommunityPostReport_createdAt_idx" ON "CommunityPostReport"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityPostReport_updatedAt_idx" ON "CommunityPostReport"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityNotificationSubscription_userId_targetType_targetId_key" ON "CommunityNotificationSubscription"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "CommunityNotificationSubscription_userId_idx" ON "CommunityNotificationSubscription"("userId");

-- CreateIndex
CREATE INDEX "CommunityNotificationSubscription_targetType_targetId_idx" ON "CommunityNotificationSubscription"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "CommunityNotificationSubscription_updatedAt_idx" ON "CommunityNotificationSubscription"("updatedAt");

-- AddForeignKey
ALTER TABLE "CommunityPostHidden" ADD CONSTRAINT "CommunityPostHidden_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostHidden" ADD CONSTRAINT "CommunityPostHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostFeedback" ADD CONSTRAINT "CommunityPostFeedback_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostFeedback" ADD CONSTRAINT "CommunityPostFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityNotificationSubscription" ADD CONSTRAINT "CommunityNotificationSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
