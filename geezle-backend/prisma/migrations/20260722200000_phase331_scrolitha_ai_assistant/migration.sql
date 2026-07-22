-- Phase 33.1 — Scrolitha AI Assistant (additive only)
-- Do NOT apply to production without explicit approval.

CREATE TABLE IF NOT EXISTS "AIConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIConversation_userId_updatedAt_idx" ON "AIConversation"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AIConversation_userId_pinned_idx" ON "AIConversation"("userId", "pinned");

CREATE TABLE IF NOT EXISTS "AIConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentPreview" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "content" TEXT,
    "disclosure" JSONB,
    "capability" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConversationMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIConversationMessage_conversationId_createdAt_idx" ON "AIConversationMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIConversationMessage_correlationId_idx" ON "AIConversationMessage"("correlationId");

CREATE TABLE IF NOT EXISTS "AIFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "capability" TEXT,
    "correlationId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIFeedback_userId_createdAt_idx" ON "AIFeedback"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIFeedback_rating_createdAt_idx" ON "AIFeedback"("rating", "createdAt");
