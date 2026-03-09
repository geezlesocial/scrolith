ALTER TABLE "files"
ADD COLUMN IF NOT EXISTS "videoPerceptualHash" TEXT,
ADD COLUMN IF NOT EXISTS "videoPerceptualHashVersion" INTEGER;

ALTER TABLE "CommunityPost"
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchMethod" TEXT,
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchScore" DOUBLE PRECISION;

ALTER TABLE "ScrollVideo"
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchMethod" TEXT,
ADD COLUMN IF NOT EXISTS "videoIntegrityMatchScore" DOUBLE PRECISION;
