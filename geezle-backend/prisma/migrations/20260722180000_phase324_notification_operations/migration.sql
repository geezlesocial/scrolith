-- Phase 32.4 — Enterprise Notification Operations (additive only)

-- Versioned notification templates (email / push / in-app)
CREATE TABLE IF NOT EXISTS "NotificationOpsTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "htmlBody" TEXT,
    "variables" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "previousVersionId" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationOpsTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOpsTemplate_key_channel_locale_version_key"
  ON "NotificationOpsTemplate"("key", "channel", "locale", "version");
CREATE INDEX IF NOT EXISTS "NotificationOpsTemplate_status_channel_idx"
  ON "NotificationOpsTemplate"("status", "channel");
CREATE INDEX IF NOT EXISTS "NotificationOpsTemplate_key_idx"
  ON "NotificationOpsTemplate"("key");

-- Announcement / emergency campaigns
CREATE TABLE IF NOT EXISTS "NotificationCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'platform_announcement',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "channels" TEXT[] DEFAULT ARRAY['IN_APP']::TEXT[],
    "targeting" JSONB,
    "templateId" TEXT,
    "scheduleType" TEXT NOT NULL DEFAULT 'immediate',
    "scheduledAt" TIMESTAMP(3),
    "recurrence" JSONB,
    "reason" TEXT,
    "requiresConfirm" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "stats" JSONB,
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationCampaign_status_scheduledAt_idx"
  ON "NotificationCampaign"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "NotificationCampaign_type_createdAt_idx"
  ON "NotificationCampaign"("type", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationCampaignDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notificationId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationCampaignDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationCampaignDelivery_campaignId_status_idx"
  ON "NotificationCampaignDelivery"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "NotificationCampaignDelivery_userId_idx"
  ON "NotificationCampaignDelivery"("userId");

-- Retry queue for failed deliveries
CREATE TABLE IF NOT EXISTS "NotificationRetryJob" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "deliveryId" TEXT,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCode" TEXT,
    "payload" JSONB,
    "history" JSONB,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRetryJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationRetryJob_status_nextAttemptAt_idx"
  ON "NotificationRetryJob"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "NotificationRetryJob_channel_status_idx"
  ON "NotificationRetryJob"("channel", "status");
CREATE INDEX IF NOT EXISTS "NotificationRetryJob_notificationId_idx"
  ON "NotificationRetryJob"("notificationId");

-- Ops config: feature flags, retention, settings (singleton rows by key)
CREATE TABLE IF NOT EXISTS "NotificationOpsConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationOpsConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOpsConfig_key_key"
  ON "NotificationOpsConfig"("key");
