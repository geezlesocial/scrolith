-- Upgrade community clubs into enterprise-ready groups without resetting existing data.

ALTER TABLE "CommunityClub"
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "avatarImage" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "location" TEXT,
  ADD COLUMN IF NOT EXISTS "joinMode" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "postPermission" TEXT NOT NULL DEFAULT 'members',
  ADD COLUMN IF NOT EXISTS "membersCanInvite" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "faqs" JSONB,
  ADD COLUMN IF NOT EXISTS "postingGuidelines" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

UPDATE "CommunityClub"
SET "slug" = lower(
  regexp_replace(
    coalesce(nullif(trim("name"), ''), 'group') || '-' || left("id", 8),
    '[^a-zA-Z0-9]+',
    '-',
    'g'
  )
)
WHERE "slug" IS NULL OR trim("slug") = '';

ALTER TABLE "CommunityClub"
  ALTER COLUMN "slug" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommunityClub_slug_key'
  ) THEN
    ALTER TABLE "CommunityClub"
      ADD CONSTRAINT "CommunityClub_slug_key" UNIQUE ("slug");
  END IF;
END $$;

ALTER TABLE "ClubMembership"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "invitedById" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "ClubJoinRequest" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answers" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "note" TEXT,
  CONSTRAINT "ClubJoinRequest_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ClubJoinRequest_clubId_userId_status_key'
  ) THEN
    ALTER TABLE "ClubJoinRequest"
      ADD CONSTRAINT "ClubJoinRequest_clubId_userId_status_key" UNIQUE ("clubId", "userId", "status");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ClubJoinRequest_clubId_fkey'
  ) THEN
    ALTER TABLE "ClubJoinRequest"
      ADD CONSTRAINT "ClubJoinRequest_clubId_fkey"
      FOREIGN KEY ("clubId") REFERENCES "CommunityClub"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ClubJoinRequest_userId_fkey'
  ) THEN
    ALTER TABLE "ClubJoinRequest"
      ADD CONSTRAINT "ClubJoinRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ClubJoinRequest_reviewedById_fkey'
  ) THEN
    ALTER TABLE "ClubJoinRequest"
      ADD CONSTRAINT "ClubJoinRequest_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "CommunityPost"
  ADD COLUMN IF NOT EXISTS "clubId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommunityPost_clubId_fkey'
  ) THEN
    ALTER TABLE "CommunityPost"
      ADD CONSTRAINT "CommunityPost_clubId_fkey"
      FOREIGN KEY ("clubId") REFERENCES "CommunityClub"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CommunityClub_status_idx" ON "CommunityClub"("status");
CREATE INDEX IF NOT EXISTS "CommunityClub_joinMode_idx" ON "CommunityClub"("joinMode");
CREATE INDEX IF NOT EXISTS "CommunityClub_createdAt_idx" ON "CommunityClub"("createdAt");
CREATE INDEX IF NOT EXISTS "ClubMembership_clubId_role_status_idx" ON "ClubMembership"("clubId", "role", "status");
CREATE INDEX IF NOT EXISTS "ClubJoinRequest_clubId_status_requestedAt_idx" ON "ClubJoinRequest"("clubId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "ClubJoinRequest_userId_status_requestedAt_idx" ON "ClubJoinRequest"("userId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "CommunityPost_clubId_idx" ON "CommunityPost"("clubId");
CREATE INDEX IF NOT EXISTS "CommunityPost_clubId_status_isPinned_createdAt_idx"
  ON "CommunityPost"("clubId", "status", "isPinned", "createdAt");
