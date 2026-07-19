-- Phase 22.2 — Enterprise group messaging (additive only)

-- Enums
DO $$ BEGIN
  CREATE TYPE "ConversationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationNotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'UNLISTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Conversation group metadata
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "avatarFileId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "visibility" "ConversationVisibility" DEFAULT 'PRIVATE';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

CREATE INDEX IF NOT EXISTS "Conversation_type_visibility_idx" ON "Conversation"("type", "visibility");
CREATE INDEX IF NOT EXISTS "Conversation_source_sourceId_idx" ON "Conversation"("source", "sourceId");

-- Participant role + notification level
ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "role" "ConversationMemberRole" DEFAULT 'MEMBER';
ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "notifications" "ConversationNotificationLevel" DEFAULT 'ALL';

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_role_idx"
  ON "ConversationParticipant"("conversationId", "role");

-- Invites
CREATE TABLE IF NOT EXISTS "ConversationInvite" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "inviteeUserId" TEXT,
  "invitedById" TEXT NOT NULL,
  "role" "ConversationMemberRole" NOT NULL DEFAULT 'MEMBER',
  "status" "ConversationInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "ConversationInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConversationInvite_code_key" ON "ConversationInvite"("code");
CREATE INDEX IF NOT EXISTS "ConversationInvite_conversationId_status_idx" ON "ConversationInvite"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "ConversationInvite_inviteeUserId_status_idx" ON "ConversationInvite"("inviteeUserId", "status");
CREATE INDEX IF NOT EXISTS "ConversationInvite_code_idx" ON "ConversationInvite"("code");

DO $$ BEGIN
  ALTER TABLE "ConversationInvite"
    ADD CONSTRAINT "ConversationInvite_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Promote first participant of existing GROUP rows to OWNER (best-effort)
UPDATE "ConversationParticipant" cp
SET "role" = 'OWNER'
FROM (
  SELECT DISTINCT ON ("conversationId") "id"
  FROM "ConversationParticipant"
  WHERE "deletedAt" IS NULL
  ORDER BY "conversationId", "joinedAt" ASC
) first_member
JOIN "Conversation" c ON c."id" = (
  SELECT "conversationId" FROM "ConversationParticipant" WHERE "id" = first_member."id"
)
WHERE cp."id" = first_member."id"
  AND c."type" = 'GROUP'
  AND (cp."role" IS NULL OR cp."role" = 'MEMBER');
