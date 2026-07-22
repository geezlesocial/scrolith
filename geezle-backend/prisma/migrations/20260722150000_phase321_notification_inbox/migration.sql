-- Phase 32.1 — Notification Center inbox experience (additive only)

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Notification_userId_pinnedAt_createdAt_idx"
  ON "Notification"("userId", "pinnedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_userId_priority_createdAt_idx"
  ON "Notification"("userId", "priority", "createdAt");

-- Lightweight search support (title/body) — GIN optional; btree prefix indexes are safe additive fallbacks
CREATE INDEX IF NOT EXISTS "Notification_title_trgm_placeholder_idx"
  ON "Notification"("userId", "type");
