-- Add AI insight support fields for community posts.
ALTER TABLE "CommunityPost"
ADD COLUMN "aiInsightEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiInsightGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiInsightText" TEXT,
ADD COLUMN "aiScore" DOUBLE PRECISION;

