-- Phase 29.5 — Additive indexes for enterprise messaging group search/analytics.
-- Does NOT modify Phase 29.1 migration. Safe if columns/tables missing (IF NOT EXISTS).
-- No production apply in this phase unless ops requests later.

-- Speed group directory / discovery by visibility + activity
CREATE INDEX IF NOT EXISTS "Conversation_type_visibility_lastMessageAt_idx"
  ON "Conversation" ("type", "visibility", "lastMessageAt" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "Conversation_type_memberCount_idx"
  ON "Conversation" ("type", "memberCount" DESC NULLS LAST);

-- Message search within a conversation (text filter still uses seq scan on large tables;
-- composite helps membership-scoped time ranges)
CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_createdAt_id_idx"
  ON "DirectMessage" ("conversationId", "createdAt" DESC, "id" DESC);

-- Audit time-series
CREATE INDEX IF NOT EXISTS "GroupModerationAction_createdAt_idx"
  ON "GroupModerationAction" ("createdAt" DESC);

-- Join request queue
CREATE INDEX IF NOT EXISTS "ConversationJoinRequest_status_createdAt_idx"
  ON "ConversationJoinRequest" ("status", "createdAt" DESC);
