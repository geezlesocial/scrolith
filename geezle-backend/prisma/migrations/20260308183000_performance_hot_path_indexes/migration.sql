CREATE INDEX IF NOT EXISTS "Conversation_updatedAt_id_idx"
ON "Conversation"("updatedAt", "id");

CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_createdAt_id_idx"
ON "DirectMessage"("conversationId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_userId_idx"
ON "MessageReaction"("messageId", "userId");

CREATE INDEX IF NOT EXISTS "DirectMessageRecord_actorUserId_action_conversationId_idx"
ON "DirectMessageRecord"("actorUserId", "action", "conversationId");

CREATE INDEX IF NOT EXISTS "CommunityPost_status_isPinned_createdAt_idx"
ON "CommunityPost"("status", "isPinned", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunityPost_businessPageId_status_isPinned_createdAt_idx"
ON "CommunityPost"("businessPageId", "status", "isPinned", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunityPost_authorId_status_createdAt_idx"
ON "CommunityPost"("authorId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunityPost_visibility_status_createdAt_idx"
ON "CommunityPost"("visibility", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunityPostComment_postId_status_createdAt_idx"
ON "CommunityPostComment"("postId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "CommunityPostReaction_postId_type_idx"
ON "CommunityPostReaction"("postId", "type");

CREATE INDEX IF NOT EXISTS "ScrollVideo_status_createdAt_idx"
ON "ScrollVideo"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "ScrollVideo_status_visibility_createdAt_idx"
ON "ScrollVideo"("status", "visibility", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_id_idx"
ON "Notification"("userId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_id_idx"
ON "Notification"("userId", "isRead", "createdAt", "id");
