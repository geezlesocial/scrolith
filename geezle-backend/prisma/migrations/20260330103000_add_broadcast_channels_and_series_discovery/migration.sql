-- Add broadcast-channel support on top of CommunityChannel.
-- Scroll series discovery reuses the existing ScrollSeries tables and requires no schema changes.

ALTER TABLE "CommunityChannel"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'chat',
ADD COLUMN "businessPageId" TEXT;

CREATE INDEX "CommunityChannel_businessPageId_idx"
ON "CommunityChannel"("businessPageId");

CREATE INDEX "CommunityChannel_purpose_isPublic_lastActivity_idx"
ON "CommunityChannel"("purpose", "isPublic", "lastActivity");

ALTER TABLE "CommunityChannel"
ADD CONSTRAINT "CommunityChannel_businessPageId_fkey"
FOREIGN KEY ("businessPageId") REFERENCES "CommunityBusinessPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
