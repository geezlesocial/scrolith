-- Phase 22.3 — Presence privacy + delivery watermarks (additive only)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "presenceVisibility" TEXT DEFAULT 'EVERYONE';

ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "lastDeliveredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_lastReadAt_idx"
  ON "ConversationParticipant"("conversationId", "lastReadAt");

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_lastDeliveredAt_idx"
  ON "ConversationParticipant"("conversationId", "lastDeliveredAt");
