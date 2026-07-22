-- Phase 32.3 — Android excellence & cross-device sync (additive only)

-- Extend DeviceToken with device metadata and sync fields
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "deviceName" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "pushStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "notificationCapable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "capabilities" JSONB;
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "DeviceToken_userId_lastSeenAt_idx"
  ON "DeviceToken"("userId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "DeviceToken_userId_pushStatus_idx"
  ON "DeviceToken"("userId", "pushStatus");

-- Lifecycle / delivery receipts (analytics; not user-facing "seen")
CREATE TABLE IF NOT EXISTS "NotificationLifecycleEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventId" TEXT,
    "deviceId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'push',
    "lifecycle" TEXT NOT NULL,
    "clientTimestamp" TIMESTAMP(3),
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLifecycleEvent_idempotencyKey_key"
  ON "NotificationLifecycleEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NotificationLifecycleEvent_userId_createdAt_idx"
  ON "NotificationLifecycleEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLifecycleEvent_notificationId_lifecycle_idx"
  ON "NotificationLifecycleEvent"("notificationId", "lifecycle");
CREATE INDEX IF NOT EXISTS "NotificationLifecycleEvent_lifecycle_createdAt_idx"
  ON "NotificationLifecycleEvent"("lifecycle", "createdAt");

-- Lightweight per-user sync cursor (badge recovery / conflict resolution)
CREATE TABLE IF NOT EXISTS "NotificationSyncState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastDeviceId" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationSyncState_userId_key"
  ON "NotificationSyncState"("userId");
