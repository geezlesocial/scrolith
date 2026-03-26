-- Phase 2: Notification and Journey Center foundation

CREATE TABLE "NotificationTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'system',
  "category" TEXT NOT NULL DEFAULT 'journey',
  "titleTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "pushTitleTemplate" TEXT,
  "pushBodyTemplate" TEXT,
  "emailSubjectTemplate" TEXT,
  "emailTextTemplate" TEXT,
  "actionUrlTemplate" TEXT,
  "defaultMeta" JSONB,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByStaffId" TEXT,
  "updatedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneyFlow" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
  "audienceType" TEXT NOT NULL DEFAULT 'USER',
  "audienceConfig" JSONB,
  "metadata" JSONB,
  "isSystemFlow" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByStaffId" TEXT,
  "updatedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JourneyFlow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneyStep" (
  "id" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'IN_APP',
  "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "actionUrl" TEXT,
  "conditionConfig" JSONB,
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JourneyStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneyRun" (
  "id" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "initiatedByStaffId" TEXT,
  "triggerSource" TEXT NOT NULL DEFAULT 'admin',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "context" JSONB,
  "results" JSONB,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JourneyRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneyStepRun" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JourneyStepRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuietHourRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'PUSH',
  "timezone" TEXT,
  "daysOfWeek" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "QuietHourRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationTemplate_key_key" ON "NotificationTemplate"("key");
CREATE INDEX "NotificationTemplate_category_isActive_idx" ON "NotificationTemplate"("category", "isActive");
CREATE INDEX "NotificationTemplate_type_isActive_idx" ON "NotificationTemplate"("type", "isActive");

CREATE UNIQUE INDEX "JourneyFlow_key_key" ON "JourneyFlow"("key");
CREATE INDEX "JourneyFlow_triggerType_isActive_idx" ON "JourneyFlow"("triggerType", "isActive");
CREATE INDEX "JourneyFlow_audienceType_isActive_idx" ON "JourneyFlow"("audienceType", "isActive");

CREATE UNIQUE INDEX "JourneyStep_flowId_key_key" ON "JourneyStep"("flowId", "key");
CREATE INDEX "JourneyStep_flowId_isActive_orderIndex_idx" ON "JourneyStep"("flowId", "isActive", "orderIndex");
CREATE INDEX "JourneyStep_templateId_isActive_idx" ON "JourneyStep"("templateId", "isActive");

CREATE INDEX "JourneyRun_flowId_createdAt_idx" ON "JourneyRun"("flowId", "createdAt");
CREATE INDEX "JourneyRun_targetUserId_createdAt_idx" ON "JourneyRun"("targetUserId", "createdAt");
CREATE INDEX "JourneyRun_status_createdAt_idx" ON "JourneyRun"("status", "createdAt");

CREATE INDEX "JourneyStepRun_status_scheduledFor_idx" ON "JourneyStepRun"("status", "scheduledFor");
CREATE INDEX "JourneyStepRun_runId_scheduledFor_idx" ON "JourneyStepRun"("runId", "scheduledFor");
CREATE INDEX "JourneyStepRun_targetUserId_scheduledFor_idx" ON "JourneyStepRun"("targetUserId", "scheduledFor");

CREATE INDEX "QuietHourRule_userId_isActive_idx" ON "QuietHourRule"("userId", "isActive");
CREATE INDEX "QuietHourRule_channel_isActive_idx" ON "QuietHourRule"("channel", "isActive");

ALTER TABLE "JourneyStep"
  ADD CONSTRAINT "JourneyStep_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "JourneyFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JourneyStep"
  ADD CONSTRAINT "JourneyStep_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JourneyRun"
  ADD CONSTRAINT "JourneyRun_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "JourneyFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JourneyStepRun"
  ADD CONSTRAINT "JourneyStepRun_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "JourneyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JourneyStepRun"
  ADD CONSTRAINT "JourneyStepRun_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "JourneyStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
