ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "videoCallsEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "videoCallsUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "videoCallsUpdatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "videoCallsAdminReason" TEXT;

CREATE INDEX IF NOT EXISTS "UserSettings_videoCallsEnabled_idx"
  ON "UserSettings"("videoCallsEnabled");
