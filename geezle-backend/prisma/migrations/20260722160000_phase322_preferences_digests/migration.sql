-- Phase 32.2 — Notification Preferences, Quiet Hours extensions, Focus Mode, Digests (additive only)

-- Extend NotificationPreference with delivery mode + minimum priority
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "deliveryMode" TEXT NOT NULL DEFAULT 'immediate';
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "minPriority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "soundEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "vibrationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "previewEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Per-event overrides
CREATE TABLE IF NOT EXISTS "NotificationEventPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "category" TEXT,
    "inAppEnabled" BOOLEAN,
    "pushEnabled" BOOLEAN,
    "emailEnabled" BOOLEAN,
    "deliveryMode" TEXT,
    "minPriority" TEXT,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationEventPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEventPreference_userId_eventType_key"
  ON "NotificationEventPreference"("userId", "eventType");
CREATE INDEX IF NOT EXISTS "NotificationEventPreference_userId_idx"
  ON "NotificationEventPreference"("userId");

-- Global user notification settings (one row per user)
CREATE TABLE IF NOT EXISTS "NotificationGlobalPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pauseOptional" BOOLEAN NOT NULL DEFAULT false,
    "allowMandatorySecurity" BOOLEAN NOT NULL DEFAULT true,
    "allowEmergencySystem" BOOLEAN NOT NULL DEFAULT true,
    "showPreviews" BOOLEAN NOT NULL DEFAULT true,
    "playSounds" BOOLEAN NOT NULL DEFAULT true,
    "enableVibration" BOOLEAN NOT NULL DEFAULT true,
    "syncReadState" BOOLEAN NOT NULL DEFAULT true,
    "groupSimilar" BOOLEAN NOT NULL DEFAULT true,
    "badgeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "productUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationGlobalPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationGlobalPreference_userId_key"
  ON "NotificationGlobalPreference"("userId");

-- Focus mode sessions
CREATE TABLE IF NOT EXISTS "NotificationFocusSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "indefinite" BOOLEAN NOT NULL DEFAULT false,
    "silencePush" BOOLEAN NOT NULL DEFAULT true,
    "silenceEmail" BOOLEAN NOT NULL DEFAULT false,
    "allowCritical" BOOLEAN NOT NULL DEFAULT true,
    "allowSecurity" BOOLEAN NOT NULL DEFAULT true,
    "allowedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedConversationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationFocusSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationFocusSession_userId_active_idx"
  ON "NotificationFocusSession"("userId", "active");
CREATE INDEX IF NOT EXISTS "NotificationFocusSession_endsAt_idx"
  ON "NotificationFocusSession"("endsAt");

-- Digest schedules
CREATE TABLE IF NOT EXISTS "NotificationDigestSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'off',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "morningHour" INTEGER NOT NULL DEFAULT 8,
    "morningMinute" INTEGER NOT NULL DEFAULT 0,
    "eveningHour" INTEGER NOT NULL DEFAULT 19,
    "eveningMinute" INTEGER NOT NULL DEFAULT 0,
    "dailyHour" INTEGER NOT NULL DEFAULT 9,
    "dailyMinute" INTEGER NOT NULL DEFAULT 0,
    "weeklyDay" INTEGER NOT NULL DEFAULT 1,
    "weeklyHour" INTEGER NOT NULL DEFAULT 9,
    "weeklyMinute" INTEGER NOT NULL DEFAULT 0,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushReadyAlert" BOOLEAN NOT NULL DEFAULT false,
    "includeRead" BOOLEAN NOT NULL DEFAULT false,
    "lastRunKey" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDigestSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDigestSchedule_userId_key"
  ON "NotificationDigestSchedule"("userId");
CREATE INDEX IF NOT EXISTS "NotificationDigestSchedule_enabled_mode_idx"
  ON "NotificationDigestSchedule"("enabled", "mode");

-- Generated digests
CREATE TABLE IF NOT EXISTS "NotificationDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "mode" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "highCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "emailStatus" TEXT,
    "inAppNotificationId" TEXT,
    "errorMessage" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDigest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDigest_idempotencyKey_key"
  ON "NotificationDigest"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NotificationDigest_userId_createdAt_idx"
  ON "NotificationDigest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDigest_status_createdAt_idx"
  ON "NotificationDigest"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationDigestItem" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventId" TEXT,
    "category" TEXT,
    "priority" TEXT,
    "title" TEXT,
    "body" TEXT,
    "deepLink" TEXT,
    "groupKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDigestItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationDigestItem_digestId_idx"
  ON "NotificationDigestItem"("digestId");
CREATE INDEX IF NOT EXISTS "NotificationDigestItem_notificationId_idx"
  ON "NotificationDigestItem"("notificationId");

-- Suppressions (quiet hours / focus deferred)
CREATE TABLE IF NOT EXISTS "NotificationSuppression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventId" TEXT,
    "channel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "nextEligibleAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationSuppression_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationSuppression_userId_createdAt_idx"
  ON "NotificationSuppression"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationSuppression_nextEligibleAt_idx"
  ON "NotificationSuppression"("nextEligibleAt");
