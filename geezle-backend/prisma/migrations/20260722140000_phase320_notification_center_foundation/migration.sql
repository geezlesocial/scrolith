-- Phase 32.0 — Enterprise Notification Center Foundation (additive only)
-- Extends Notification inbox; adds event log, delivery, preferences, audit.
-- Does NOT drop or rewrite existing notification rows.

-- Extend legacy Notification as durable inbox (backward compatible)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deepLink" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "eventId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "schemaVersion" TEXT NOT NULL DEFAULT '32.0';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Notification_userId_category_createdAt_idx"
  ON "Notification"("userId", "category", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_archivedAt_createdAt_idx"
  ON "Notification"("userId", "archivedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_deletedAt_createdAt_idx"
  ON "Notification"("userId", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_eventId_idx" ON "Notification"("eventId");
CREATE INDEX IF NOT EXISTS "Notification_entityType_entityId_idx"
  ON "Notification"("entityType", "entityId");

-- Partial unique: one idempotency key per recipient when set
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_idempotencyKey_uidx"
  ON "Notification"("userId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "NotificationEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT,
    "recipientIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "entityType" TEXT,
    "entityId" TEXT,
    "title" TEXT,
    "body" TEXT,
    "deepLink" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "metadata" JSONB,
    "idempotencyKey" TEXT,
    "schemaVersion" TEXT NOT NULL DEFAULT '32.0',
    "source" TEXT,
    "correlationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'emitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEvent_eventId_key" ON "NotificationEvent"("eventId");
CREATE INDEX IF NOT EXISTS "NotificationEvent_eventType_createdAt_idx" ON "NotificationEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationEvent_category_createdAt_idx" ON "NotificationEvent"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationEvent_idempotencyKey_idx" ON "NotificationEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");

CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "providerMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationDelivery_userId_createdAt_idx"
  ON "NotificationDelivery"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_notificationId_idx"
  ON "NotificationDelivery"("notificationId");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_eventId_idx"
  ON "NotificationDelivery"("eventId");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_createdAt_idx"
  ON "NotificationDelivery"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_channel_status_idx"
  ON "NotificationDelivery"("channel", "status");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "focusMode" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_category_key"
  ON "NotificationPreference"("userId", "category");
CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_idx"
  ON "NotificationPreference"("userId");

CREATE TABLE IF NOT EXISTS "NotificationAudit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventId" TEXT,
    "userId" TEXT,
    "actorId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationAudit_action_createdAt_idx"
  ON "NotificationAudit"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationAudit_userId_createdAt_idx"
  ON "NotificationAudit"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationAudit_notificationId_idx"
  ON "NotificationAudit"("notificationId");
CREATE INDEX IF NOT EXISTS "NotificationAudit_eventId_idx"
  ON "NotificationAudit"("eventId");
CREATE INDEX IF NOT EXISTS "NotificationAudit_createdAt_idx"
  ON "NotificationAudit"("createdAt");

CREATE TABLE IF NOT EXISTS "NotificationAnalyticsCounter" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationAnalyticsCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationAnalyticsCounter_date_category_metric_key"
  ON "NotificationAnalyticsCounter"("date", "category", "metric");
CREATE INDEX IF NOT EXISTS "NotificationAnalyticsCounter_date_idx"
  ON "NotificationAnalyticsCounter"("date");
