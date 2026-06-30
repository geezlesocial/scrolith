-- CreateTable
CREATE TABLE "ClubInvite" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ClubInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubInvite_clubId_status_invitedAt_idx" ON "ClubInvite"("clubId", "status", "invitedAt");

-- CreateIndex
CREATE INDEX "ClubInvite_inviteeId_status_invitedAt_idx" ON "ClubInvite"("inviteeId", "status", "invitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubInvite_clubId_inviteeId_status_key" ON "ClubInvite"("clubId", "inviteeId", "status");

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "CommunityClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvite" ADD CONSTRAINT "ClubInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
