-- Migration: add social UserFollow and Notification tables
-- Generated: 2026-01-24

CREATE TABLE IF NOT EXISTS "UserFollow" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
  "followerId" text NOT NULL,
  "followeeId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserFollow_follower_followee_unique" ON "UserFollow" ("followerId", "followeeId");
CREATE INDEX IF NOT EXISTS "UserFollow_follower_idx" ON "UserFollow" ("followerId");
CREATE INDEX IF NOT EXISTS "UserFollow_followee_idx" ON "UserFollow" ("followeeId");

ALTER TABLE IF EXISTS "UserFollow"
  ADD CONSTRAINT IF NOT EXISTS "UserFollow_follower_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE IF EXISTS "UserFollow"
  ADD CONSTRAINT IF NOT EXISTS "UserFollow_followee_fkey" FOREIGN KEY ("followeeId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Notifications
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "actorId" text,
  "type" text NOT NULL,
  "title" text,
  "body" text,
  "meta" jsonb,
  "isRead" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Notification_user_idx" ON "Notification" ("userId");
CREATE INDEX IF NOT EXISTS "Notification_actor_idx" ON "Notification" ("actorId");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification" ("isRead");

ALTER TABLE IF EXISTS "Notification"
  ADD CONSTRAINT IF NOT EXISTS "Notification_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE IF EXISTS "Notification"
  ADD CONSTRAINT IF NOT EXISTS "Notification_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL;

-- Note: gen_random_uuid() requires the pgcrypto extension. If not available, replace defaults with appropriate uuid generation or use prisma client to set ids.
