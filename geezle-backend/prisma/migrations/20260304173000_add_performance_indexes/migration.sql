-- Enterprise performance indexes for low-latency feed/messaging/notification queries.
-- Additive only; no destructive schema operations.

CREATE INDEX IF NOT EXISTS "ConversationParticipant_userId_deletedAt_conversationId_idx"
  ON "ConversationParticipant" ("userId", "deletedAt", "conversationId");

CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_createdAt_idx"
  ON "DirectMessage" ("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "UserFollow_followerId_createdAt_idx"
  ON "UserFollow" ("followerId", "createdAt");

CREATE INDEX IF NOT EXISTS "UserFollow_followeeId_createdAt_idx"
  ON "UserFollow" ("followeeId", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx"
  ON "Notification" ("userId", "isRead", "createdAt");
