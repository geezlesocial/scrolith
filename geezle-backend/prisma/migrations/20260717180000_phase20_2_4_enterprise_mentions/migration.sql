-- Phase 20.2.4: Enterprise Mentions (additive only)

CREATE TABLE IF NOT EXISTS "Mention" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "clubId" TEXT,
    "kind" TEXT NOT NULL,
    "rawToken" TEXT NOT NULL,
    "targetUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Mention_authorId_createdAt_idx" ON "Mention"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Mention_sourceType_sourceId_idx" ON "Mention"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "Mention_postId_idx" ON "Mention"("postId");
CREATE INDEX IF NOT EXISTS "Mention_commentId_idx" ON "Mention"("commentId");
CREATE INDEX IF NOT EXISTS "Mention_kind_createdAt_idx" ON "Mention"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "Mention_targetUserId_idx" ON "Mention"("targetUserId");
CREATE INDEX IF NOT EXISTS "Mention_status_idx" ON "Mention"("status");

CREATE TABLE IF NOT EXISTS "MentionRecipient" (
    "id" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "notificationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MentionRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MentionRecipient_mentionId_recipientId_key"
  ON "MentionRecipient"("mentionId", "recipientId");
CREATE INDEX IF NOT EXISTS "MentionRecipient_recipientId_createdAt_idx"
  ON "MentionRecipient"("recipientId", "createdAt");
CREATE INDEX IF NOT EXISTS "MentionRecipient_status_idx" ON "MentionRecipient"("status");
CREATE INDEX IF NOT EXISTS "MentionRecipient_notificationId_idx" ON "MentionRecipient"("notificationId");

DO $$ BEGIN
  ALTER TABLE "MentionRecipient"
    ADD CONSTRAINT "MentionRecipient_mentionId_fkey"
    FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
