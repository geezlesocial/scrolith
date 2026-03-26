-- Phase 1 control plane: Feature Control Center foundation

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'platform',
  "defaultValue" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "killSwitch" BOOLEAN NOT NULL DEFAULT false,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureAudience" (
  "id" TEXT NOT NULL,
  "flagId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "roleScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "countryScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "platformScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "appVersions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeatureAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureRule" (
  "id" TEXT NOT NULL,
  "flagId" TEXT NOT NULL,
  "audienceId" TEXT,
  "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
  "value" BOOLEAN NOT NULL DEFAULT false,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "conditions" JSONB,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeatureRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureExposure" (
  "id" TEXT NOT NULL,
  "flagId" TEXT NOT NULL,
  "userId" TEXT,
  "sessionKey" TEXT,
  "variant" TEXT,
  "value" BOOLEAN NOT NULL,
  "context" JSONB,
  "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeatureExposure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlagAuditLog" (
  "id" TEXT NOT NULL,
  "flagId" TEXT NOT NULL,
  "staffId" TEXT,
  "action" TEXT NOT NULL,
  "beforeState" JSONB,
  "afterState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeatureFlagAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
CREATE INDEX "FeatureFlag_category_isActive_idx" ON "FeatureFlag"("category", "isActive");
CREATE INDEX "FeatureFlag_killSwitch_idx" ON "FeatureFlag"("killSwitch");

CREATE UNIQUE INDEX "FeatureAudience_flagId_key_key" ON "FeatureAudience"("flagId", "key");
CREATE INDEX "FeatureAudience_flagId_isActive_idx" ON "FeatureAudience"("flagId", "isActive");

CREATE INDEX "FeatureRule_flagId_isActive_priority_idx" ON "FeatureRule"("flagId", "isActive", "priority");
CREATE INDEX "FeatureRule_audienceId_idx" ON "FeatureRule"("audienceId");

CREATE INDEX "FeatureExposure_flagId_exposedAt_idx" ON "FeatureExposure"("flagId", "exposedAt");
CREATE INDEX "FeatureExposure_userId_exposedAt_idx" ON "FeatureExposure"("userId", "exposedAt");
CREATE INDEX "FeatureExposure_sessionKey_exposedAt_idx" ON "FeatureExposure"("sessionKey", "exposedAt");

CREATE INDEX "FeatureFlagAuditLog_flagId_createdAt_idx" ON "FeatureFlagAuditLog"("flagId", "createdAt");
CREATE INDEX "FeatureFlagAuditLog_staffId_createdAt_idx" ON "FeatureFlagAuditLog"("staffId", "createdAt");

ALTER TABLE "FeatureAudience"
  ADD CONSTRAINT "FeatureAudience_flagId_fkey"
  FOREIGN KEY ("flagId") REFERENCES "FeatureFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeatureRule"
  ADD CONSTRAINT "FeatureRule_flagId_fkey"
  FOREIGN KEY ("flagId") REFERENCES "FeatureFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeatureRule"
  ADD CONSTRAINT "FeatureRule_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "FeatureAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeatureExposure"
  ADD CONSTRAINT "FeatureExposure_flagId_fkey"
  FOREIGN KEY ("flagId") REFERENCES "FeatureFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeatureFlagAuditLog"
  ADD CONSTRAINT "FeatureFlagAuditLog_flagId_fkey"
  FOREIGN KEY ("flagId") REFERENCES "FeatureFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
