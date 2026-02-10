-- Ensure DirectMessage supports edit metadata
ALTER TABLE "DirectMessage"
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

-- Message records/audit trail table for create/edit/delete/copy/reply events
CREATE TABLE IF NOT EXISTS "DirectMessageRecord" (
  "id" TEXT NOT NULL,
  "messageId" TEXT,
  "conversationId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "beforeText" TEXT,
  "afterText" TEXT,
  "beforeAttachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "afterAttachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DirectMessageRecord_messageId_idx"
  ON "DirectMessageRecord"("messageId");
CREATE INDEX IF NOT EXISTS "DirectMessageRecord_conversationId_createdAt_idx"
  ON "DirectMessageRecord"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "DirectMessageRecord_action_createdAt_idx"
  ON "DirectMessageRecord"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "DirectMessageRecord_actorUserId_idx"
  ON "DirectMessageRecord"("actorUserId");
CREATE INDEX IF NOT EXISTS "DirectMessageRecord_targetUserId_idx"
  ON "DirectMessageRecord"("targetUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectMessageRecord_messageId_fkey'
  ) THEN
    ALTER TABLE "DirectMessageRecord"
      ADD CONSTRAINT "DirectMessageRecord_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectMessageRecord_conversationId_fkey'
  ) THEN
    ALTER TABLE "DirectMessageRecord"
      ADD CONSTRAINT "DirectMessageRecord_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectMessageRecord_actorUserId_fkey'
  ) THEN
    ALTER TABLE "DirectMessageRecord"
      ADD CONSTRAINT "DirectMessageRecord_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectMessageRecord_targetUserId_fkey'
  ) THEN
    ALTER TABLE "DirectMessageRecord"
      ADD CONSTRAINT "DirectMessageRecord_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

