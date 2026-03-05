-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "roomName" TEXT,
    "streamUrl" TEXT,
    "hlsUrl" TEXT,
    "recordingFileId" TEXT,
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "peakViewerCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "lovesCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "micState" BOOLEAN NOT NULL DEFAULT true,
    "cameraState" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveInvite" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveGift" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amountGcoin" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveGift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveReactionCounter" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "reactionType" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveReactionCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveReport" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enableConference" BOOLEAN NOT NULL DEFAULT true,
    "maxParticipants" INTEGER NOT NULL DEFAULT 20,
    "maxGuests" INTEGER NOT NULL DEFAULT 6,
    "enableGifts" BOOLEAN NOT NULL DEFAULT true,
    "minGiftGcoin" INTEGER NOT NULL DEFAULT 1,
    "maxGiftGcoin" INTEGER NOT NULL DEFAULT 50000,
    "enableRecording" BOOLEAN NOT NULL DEFAULT true,
    "defaultVisibility" TEXT NOT NULL DEFAULT 'public',
    "rateLimitReactionsPerMinute" INTEGER NOT NULL DEFAULT 80,
    "rateLimitChatPerMinute" INTEGER NOT NULL DEFAULT 40,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSession_hostUserId_createdAt_idx" ON "LiveSession"("hostUserId", "createdAt");
CREATE INDEX "LiveSession_status_createdAt_idx" ON "LiveSession"("status", "createdAt");
CREATE INDEX "LiveSession_visibility_status_createdAt_idx" ON "LiveSession"("visibility", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveParticipant_sessionId_userId_key" ON "LiveParticipant"("sessionId", "userId");
CREATE INDEX "LiveParticipant_sessionId_status_createdAt_idx" ON "LiveParticipant"("sessionId", "status", "createdAt");
CREATE INDEX "LiveParticipant_userId_status_createdAt_idx" ON "LiveParticipant"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveInvite_sessionId_inviteeId_key" ON "LiveInvite"("sessionId", "inviteeId");
CREATE INDEX "LiveInvite_inviteeId_status_createdAt_idx" ON "LiveInvite"("inviteeId", "status", "createdAt");
CREATE INDEX "LiveInvite_sessionId_status_createdAt_idx" ON "LiveInvite"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LiveGift_sessionId_createdAt_idx" ON "LiveGift"("sessionId", "createdAt");
CREATE INDEX "LiveGift_fromUserId_createdAt_idx" ON "LiveGift"("fromUserId", "createdAt");
CREATE INDEX "LiveGift_toUserId_createdAt_idx" ON "LiveGift"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveReactionCounter_sessionId_reactionType_createdAt_idx" ON "LiveReactionCounter"("sessionId", "reactionType", "createdAt");
CREATE INDEX "LiveReactionCounter_userId_createdAt_idx" ON "LiveReactionCounter"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveReport_sessionId_status_createdAt_idx" ON "LiveReport"("sessionId", "status", "createdAt");
CREATE INDEX "LiveReport_reportedById_createdAt_idx" ON "LiveReport"("reportedById", "createdAt");
CREATE INDEX "LiveReport_status_createdAt_idx" ON "LiveReport"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveInvite" ADD CONSTRAINT "LiveInvite_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveGift" ADD CONSTRAINT "LiveGift_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveReactionCounter" ADD CONSTRAINT "LiveReactionCounter_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveReport" ADD CONSTRAINT "LiveReport_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
