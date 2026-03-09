ALTER TABLE "CommunityPost"
ADD COLUMN IF NOT EXISTS "videoFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "videoIntegrityStatus" TEXT NOT NULL DEFAULT 'clear',
ADD COLUMN IF NOT EXISTS "videoMonetizationBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchedContentId" TEXT,
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchedOwnerId" TEXT;

ALTER TABLE "ScrollVideo"
ADD COLUMN IF NOT EXISTS "videoFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "videoIntegrityStatus" TEXT NOT NULL DEFAULT 'clear',
ADD COLUMN IF NOT EXISTS "videoMonetizationBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchedContentId" TEXT,
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchedOwnerId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunityPost_videoIntegrityStatus_idx"
ON "CommunityPost"("videoIntegrityStatus");

CREATE INDEX IF NOT EXISTS "CommunityPost_videoMonetizationBlocked_idx"
ON "CommunityPost"("videoMonetizationBlocked");

CREATE INDEX IF NOT EXISTS "ScrollVideo_videoIntegrityStatus_idx"
ON "ScrollVideo"("videoIntegrityStatus");

CREATE INDEX IF NOT EXISTS "ScrollVideo_videoMonetizationBlocked_idx"
ON "ScrollVideo"("videoMonetizationBlocked");
