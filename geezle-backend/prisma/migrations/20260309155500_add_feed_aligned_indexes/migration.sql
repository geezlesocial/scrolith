CREATE INDEX "ForumThread_isPinned_createdAt_idx"
ON "ForumThread" ("isPinned", "createdAt");

CREATE INDEX "ForumThread_categoryId_isPinned_createdAt_idx"
ON "ForumThread" ("categoryId", "isPinned", "createdAt");

CREATE INDEX "CommunityPost_status_visibility_isPinned_createdAt_idx"
ON "CommunityPost" ("status", "visibility", "isPinned", "createdAt");
