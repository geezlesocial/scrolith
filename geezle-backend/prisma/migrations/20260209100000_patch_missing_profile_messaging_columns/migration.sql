-- Patch missing columns for messaging/profile features in existing dev DBs
ALTER TABLE "ConversationParticipant"
  ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ConversationParticipant_deletedAt_idx" ON "ConversationParticipant"("deletedAt");
CREATE INDEX IF NOT EXISTS "ConversationParticipant_isStarred_idx" ON "ConversationParticipant"("isStarred");

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "showBirthMonthDayPublic" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "messageRequestsNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowInMail" BOOLEAN NOT NULL DEFAULT true;
