CREATE TABLE "FriendStreak" (
    "id" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendStreak_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FriendStreak_userLowId_userHighId_key" ON "FriendStreak"("userLowId", "userHighId");
CREATE INDEX "FriendStreak_status_updatedAt_idx" ON "FriendStreak"("status", "updatedAt");
CREATE INDEX "FriendStreak_userLowId_status_idx" ON "FriendStreak"("userLowId", "status");
CREATE INDEX "FriendStreak_userHighId_status_idx" ON "FriendStreak"("userHighId", "status");
CREATE INDEX "FriendStreak_initiatedByUserId_status_idx" ON "FriendStreak"("initiatedByUserId", "status");

ALTER TABLE "FriendStreak"
ADD CONSTRAINT "FriendStreak_userLowId_fkey"
FOREIGN KEY ("userLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FriendStreak"
ADD CONSTRAINT "FriendStreak_userHighId_fkey"
FOREIGN KEY ("userHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FriendStreak"
ADD CONSTRAINT "FriendStreak_initiatedByUserId_fkey"
FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
