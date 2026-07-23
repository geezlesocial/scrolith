-- Enterprise messaging: per-user chat appearance + pin policy (additive, non-destructive)

ALTER TABLE "ConversationParticipant"
  ADD COLUMN IF NOT EXISTS "chatAppearanceJson" JSONB;

ALTER TABLE "ConversationSettings"
  ADD COLUMN IF NOT EXISTS "pinPolicy" TEXT NOT NULL DEFAULT 'OWNER_ADMIN';
