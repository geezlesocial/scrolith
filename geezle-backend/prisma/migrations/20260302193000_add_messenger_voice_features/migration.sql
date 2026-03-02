-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DirectMessageType" AS ENUM ('TEXT', 'FILE', 'VOICE_NOTE', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VoiceCallStatus" AS ENUM ('INITIATED', 'RINGING', 'ACTIVE', 'ENDED', 'REJECTED', 'MISSED', 'CANCELLED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VoiceCallType" AS ENUM ('DIRECT', 'CONFERENCE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VoiceCallParticipantStatus" AS ENUM ('INVITED', 'JOINED', 'LEFT', 'REJECTED', 'MISSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "DirectMessage"
  ADD COLUMN IF NOT EXISTS "messageType" "DirectMessageType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "VoiceCall" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "initiatorId" TEXT NOT NULL,
  "status" "VoiceCallStatus" NOT NULL DEFAULT 'INITIATED',
  "callType" "VoiceCallType" NOT NULL DEFAULT 'DIRECT',
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VoiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VoiceCallParticipant" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "VoiceCallParticipantStatus" NOT NULL DEFAULT 'INVITED',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VoiceCallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VoiceNote" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MessengerVoiceConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabledVoiceCalls" BOOLEAN NOT NULL DEFAULT true,
  "enabledConferenceCalls" BOOLEAN NOT NULL DEFAULT true,
  "enabledVoiceNotes" BOOLEAN NOT NULL DEFAULT true,
  "maxParticipants" INTEGER NOT NULL DEFAULT 8,
  "maxVoiceNoteDurationSeconds" INTEGER NOT NULL DEFAULT 180,
  "blockedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MessengerVoiceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DirectMessage_messageType_idx" ON "DirectMessage"("messageType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VoiceCall_conversationId_createdAt_idx" ON "VoiceCall"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "VoiceCall_initiatorId_createdAt_idx" ON "VoiceCall"("initiatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "VoiceCall_status_createdAt_idx" ON "VoiceCall"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceCallParticipant_callId_userId_key" ON "VoiceCallParticipant"("callId", "userId");
CREATE INDEX IF NOT EXISTS "VoiceCallParticipant_userId_createdAt_idx" ON "VoiceCallParticipant"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "VoiceCallParticipant_status_createdAt_idx" ON "VoiceCallParticipant"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceNote_messageId_key" ON "VoiceNote"("messageId");
CREATE INDEX IF NOT EXISTS "VoiceNote_conversationId_createdAt_idx" ON "VoiceNote"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "VoiceNote_senderId_createdAt_idx" ON "VoiceNote"("senderId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_initiatorId_fkey"
    FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceCallParticipant" ADD CONSTRAINT "VoiceCallParticipant_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "VoiceCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceCallParticipant" ADD CONSTRAINT "VoiceCallParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
