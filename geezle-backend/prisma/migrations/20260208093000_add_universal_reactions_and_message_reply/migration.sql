-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReactionTargetType') THEN
    CREATE TYPE "ReactionTargetType" AS ENUM ('POST', 'COMMENT', 'MESSAGE');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "DirectMessage"
  ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "replyToSnapshot" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Reaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetType" "ReactionTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "reactionKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReactionSummary" (
  "id" TEXT NOT NULL,
  "targetType" "ReactionTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "counts" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReactionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_userId_targetType_targetId_key"
  ON "Reaction"("userId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "Reaction_targetType_targetId_idx"
  ON "Reaction"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "Reaction_targetType_targetId_reactionKey_idx"
  ON "Reaction"("targetType", "targetId", "reactionKey");
CREATE INDEX IF NOT EXISTS "Reaction_userId_idx"
  ON "Reaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReactionSummary_targetType_targetId_key"
  ON "ReactionSummary"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "ReactionSummary_targetType_targetId_idx"
  ON "ReactionSummary"("targetType", "targetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DirectMessage_replyToMessageId_idx"
  ON "DirectMessage"("replyToMessageId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Reaction_userId_fkey'
      AND table_name = 'Reaction'
  ) THEN
    ALTER TABLE "Reaction"
      ADD CONSTRAINT "Reaction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'DirectMessage_replyToMessageId_fkey'
      AND table_name = 'DirectMessage'
  ) THEN
    ALTER TABLE "DirectMessage"
      ADD CONSTRAINT "DirectMessage_replyToMessageId_fkey"
      FOREIGN KEY ("replyToMessageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
