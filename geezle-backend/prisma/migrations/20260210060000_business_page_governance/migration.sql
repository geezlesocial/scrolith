ALTER TABLE "CommunityBusinessPage"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "statusReason" TEXT,
  ADD COLUMN IF NOT EXISTS "statusUpdatedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "statusUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CommunityBusinessPage_status_idx" ON "CommunityBusinessPage"("status");

ALTER TABLE "community_config"
  ADD COLUMN IF NOT EXISTS "businessPagesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "businessPageUserCreationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "businessPagePostingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "businessPageFollowEnabled" BOOLEAN NOT NULL DEFAULT true;