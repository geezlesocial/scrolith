-- CreateTable
CREATE TABLE "CreatorChallenge" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'creator',
    "contentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rules" JSONB,
    "reward" JSONB,
    "entryLimitPerUser" INTEGER NOT NULL DEFAULT 1,
    "maxWinners" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "winningEntryIds" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorChallengeEntry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "titleSnapshot" TEXT,
    "descriptionSnapshot" TEXT,
    "coverUrl" TEXT,
    "destinationUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorChallengeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorChallengeVote" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorChallengeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorChallenge_weekKey_key_key" ON "CreatorChallenge"("weekKey", "key");

-- CreateIndex
CREATE INDEX "CreatorChallenge_weekKey_status_idx" ON "CreatorChallenge"("weekKey", "status");

-- CreateIndex
CREATE INDEX "CreatorChallenge_isActive_status_idx" ON "CreatorChallenge"("isActive", "status");

-- CreateIndex
CREATE INDEX "CreatorChallenge_startAt_endAt_idx" ON "CreatorChallenge"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "CreatorChallenge_createdById_idx" ON "CreatorChallenge"("createdById");

-- CreateIndex
CREATE INDEX "CreatorChallenge_updatedById_idx" ON "CreatorChallenge"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorChallengeEntry_challengeId_userId_key" ON "CreatorChallengeEntry"("challengeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorChallengeEntry_challengeId_contentType_contentId_key" ON "CreatorChallengeEntry"("challengeId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "CreatorChallengeEntry_challengeId_voteCount_idx" ON "CreatorChallengeEntry"("challengeId", "voteCount");

-- CreateIndex
CREATE INDEX "CreatorChallengeEntry_challengeId_status_createdAt_idx" ON "CreatorChallengeEntry"("challengeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CreatorChallengeEntry_userId_createdAt_idx" ON "CreatorChallengeEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorChallengeVote_challengeId_userId_key" ON "CreatorChallengeVote"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "CreatorChallengeVote_entryId_createdAt_idx" ON "CreatorChallengeVote"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "CreatorChallengeVote_userId_createdAt_idx" ON "CreatorChallengeVote"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreatorChallenge" ADD CONSTRAINT "CreatorChallenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorChallenge" ADD CONSTRAINT "CreatorChallenge_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorChallengeEntry" ADD CONSTRAINT "CreatorChallengeEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CreatorChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorChallengeEntry" ADD CONSTRAINT "CreatorChallengeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorChallengeVote" ADD CONSTRAINT "CreatorChallengeVote_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CreatorChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorChallengeVote" ADD CONSTRAINT "CreatorChallengeVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CreatorChallengeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorChallengeVote" ADD CONSTRAINT "CreatorChallengeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
