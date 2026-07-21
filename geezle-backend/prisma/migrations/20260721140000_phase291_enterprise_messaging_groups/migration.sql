-- Phase 29.1 — Enterprise Messaging Groups foundation (additive only)
-- SECRET is a new ConversationVisibility value (not mapped solely to UNLISTED).
-- Does not rewrite message history. Safe to leave unused if app rolls back.

-- Enums (additive)
DO $$ BEGIN
  ALTER TYPE "ConversationVisibility" ADD VALUE IF NOT EXISTS 'SECRET';
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "ConversationInviteStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationJoinPolicy" AS ENUM ('OPEN', 'REQUEST', 'INVITE_ONLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationMessagingMode" AS ENUM (
    'EVERYONE', 'ADMINS_ONLY', 'MODS_PLUS', 'ANNOUNCEMENT', 'READ_ONLY', 'LOCKED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationRestrictionKind" AS ENUM ('MUTE', 'SHADOW_MUTE', 'TEMP_BAN', 'BAN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Conversation policy + identity columns
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "bannerFileId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "emoji" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "accentColor" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "joinPolicy" "ConversationJoinPolicy" DEFAULT 'INVITE_ONLY';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "messagingMode" "ConversationMessagingMode" DEFAULT 'EVERYONE';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "maxMembers" INTEGER;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "memberCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "settingsVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lockedReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lockedById" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lockExpiresAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "permissionOverrides" JSONB;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "orgVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Conversation_type_joinPolicy_idx" ON "Conversation"("type", "joinPolicy");
CREATE INDEX IF NOT EXISTS "Conversation_type_messagingMode_idx" ON "Conversation"("type", "messagingMode");
CREATE INDEX IF NOT EXISTS "Conversation_type_lastActivityAt_idx" ON "Conversation"("type", "lastActivityAt");
CREATE INDEX IF NOT EXISTS "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");

-- Participant overlays
ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "profileKey" TEXT;
ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "permissionOverrides" JSONB;
CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_profileKey_idx"
  ON "ConversationParticipant"("conversationId", "profileKey");

-- Invite lifecycle extensions
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "maxUses" INTEGER;
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "useCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "oneTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "requireApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "previewDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "ConversationInvite" ADD COLUMN IF NOT EXISTS "qrTokenHash" TEXT;
CREATE INDEX IF NOT EXISTS "ConversationInvite_qrTokenHash_idx" ON "ConversationInvite"("qrTokenHash");

-- ConversationSettings (1:1)
CREATE TABLE IF NOT EXISTS "ConversationSettings" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "allowImages" BOOLEAN NOT NULL DEFAULT true,
  "allowVideos" BOOLEAN NOT NULL DEFAULT true,
  "allowFiles" BOOLEAN NOT NULL DEFAULT true,
  "allowAudio" BOOLEAN NOT NULL DEFAULT true,
  "allowVoice" BOOLEAN NOT NULL DEFAULT true,
  "allowGifs" BOOLEAN NOT NULL DEFAULT true,
  "allowStickers" BOOLEAN NOT NULL DEFAULT true,
  "allowPolls" BOOLEAN NOT NULL DEFAULT true,
  "allowEvents" BOOLEAN NOT NULL DEFAULT true,
  "allowLocation" BOOLEAN NOT NULL DEFAULT false,
  "allowContacts" BOOLEAN NOT NULL DEFAULT false,
  "allowReactions" BOOLEAN NOT NULL DEFAULT true,
  "allowEditing" BOOLEAN NOT NULL DEFAULT true,
  "allowDelete" BOOLEAN NOT NULL DEFAULT true,
  "allowForward" BOOLEAN NOT NULL DEFAULT true,
  "allowCopy" BOOLEAN NOT NULL DEFAULT true,
  "allowExternalLinks" BOOLEAN NOT NULL DEFAULT true,
  "maxMentionsPerMessage" INTEGER NOT NULL DEFAULT 20,
  "messageApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  "mediaApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  "policyJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationSettings_conversationId_key" ON "ConversationSettings"("conversationId");
DO $$ BEGIN
  ALTER TABLE "ConversationSettings"
    ADD CONSTRAINT "ConversationSettings_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Join requests
CREATE TABLE IF NOT EXISTS "ConversationJoinRequest" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT,
  "status" "ConversationJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationJoinRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConversationJoinRequest_conversationId_status_idx"
  ON "ConversationJoinRequest"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "ConversationJoinRequest_userId_status_idx"
  ON "ConversationJoinRequest"("userId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationJoinRequest_conversationId_userId_status_key"
  ON "ConversationJoinRequest"("conversationId", "userId", "status");
DO $$ BEGIN
  ALTER TABLE "ConversationJoinRequest"
    ADD CONSTRAINT "ConversationJoinRequest_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Member restrictions
CREATE TABLE IF NOT EXISTS "ConversationMemberRestriction" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "ConversationRestrictionKind" NOT NULL,
  "reason" TEXT,
  "actorId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationMemberRestriction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConversationMemberRestriction_conversationId_userId_active_idx"
  ON "ConversationMemberRestriction"("conversationId", "userId", "active");
CREATE INDEX IF NOT EXISTS "ConversationMemberRestriction_conversationId_kind_active_idx"
  ON "ConversationMemberRestriction"("conversationId", "kind", "active");
CREATE INDEX IF NOT EXISTS "ConversationMemberRestriction_userId_active_idx"
  ON "ConversationMemberRestriction"("userId", "active");
DO $$ BEGIN
  ALTER TABLE "ConversationMemberRestriction"
    ADD CONSTRAINT "ConversationMemberRestriction_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Group moderation audit
CREATE TABLE IF NOT EXISTS "GroupModerationAction" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetUserId" TEXT,
  "targetId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupModerationAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GroupModerationAction_conversationId_createdAt_idx"
  ON "GroupModerationAction"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "GroupModerationAction_actorId_createdAt_idx"
  ON "GroupModerationAction"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "GroupModerationAction_action_createdAt_idx"
  ON "GroupModerationAction"("action", "createdAt");
DO $$ BEGIN
  ALTER TABLE "GroupModerationAction"
    ADD CONSTRAINT "GroupModerationAction_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Pinned messages
CREATE TABLE IF NOT EXISTS "ConversationPinnedMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "pinnedById" TEXT,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationPinnedMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationPinnedMessage_conversationId_messageId_key"
  ON "ConversationPinnedMessage"("conversationId", "messageId");
CREATE INDEX IF NOT EXISTS "ConversationPinnedMessage_conversationId_rank_idx"
  ON "ConversationPinnedMessage"("conversationId", "rank");
DO $$ BEGIN
  ALTER TABLE "ConversationPinnedMessage"
    ADD CONSTRAINT "ConversationPinnedMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Backfill memberCount for existing GROUP conversations
UPDATE "Conversation" c
SET "memberCount" = sub.cnt
FROM (
  SELECT "conversationId", COUNT(*)::int AS cnt
  FROM "ConversationParticipant"
  WHERE "deletedAt" IS NULL
  GROUP BY "conversationId"
) sub
WHERE c."id" = sub."conversationId"
  AND c."type" = 'GROUP'
  AND (c."memberCount" IS NULL OR c."memberCount" = 0);
