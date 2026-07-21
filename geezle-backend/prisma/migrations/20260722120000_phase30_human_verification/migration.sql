-- Phase 30 — Scrolith Human Verification (additive only)

CREATE TABLE IF NOT EXISTS "HumanVerificationSettings" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanVerificationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HumanVerificationSettings_scope_key"
  ON "HumanVerificationSettings"("scope");

CREATE TABLE IF NOT EXISTS "HumanVerificationPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "endpoint" TEXT,
    "rules" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanVerificationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HumanVerificationPolicy_name_key"
  ON "HumanVerificationPolicy"("name");
CREATE INDEX IF NOT EXISTS "HumanVerificationPolicy_endpoint_enabled_idx"
  ON "HumanVerificationPolicy"("endpoint", "enabled");

CREATE TABLE IF NOT EXISTS "HumanVerificationChallenge" (
    "id" TEXT NOT NULL,
    "challengeToken" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "challengeType" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "answerHash" TEXT NOT NULL,
    "verificationTokenHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationConsumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "solvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "fingerprint" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "solveTimeMs" INTEGER,
    "country" TEXT,
    "browser" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HumanVerificationChallenge_challengeToken_key"
  ON "HumanVerificationChallenge"("challengeToken");
CREATE INDEX IF NOT EXISTS "HumanVerificationChallenge_expiresAt_idx"
  ON "HumanVerificationChallenge"("expiresAt");
CREATE INDEX IF NOT EXISTS "HumanVerificationChallenge_endpoint_createdAt_idx"
  ON "HumanVerificationChallenge"("endpoint", "createdAt");
CREATE INDEX IF NOT EXISTS "HumanVerificationChallenge_ipAddress_createdAt_idx"
  ON "HumanVerificationChallenge"("ipAddress", "createdAt");
CREATE INDEX IF NOT EXISTS "HumanVerificationChallenge_status_createdAt_idx"
  ON "HumanVerificationChallenge"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "HumanVerificationChallenge_verificationTokenHash_idx"
  ON "HumanVerificationChallenge"("verificationTokenHash");

CREATE TABLE IF NOT EXISTS "HumanVerificationAttempt" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "selectedValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "fingerprint" TEXT,
    "errorCode" TEXT,
    "solveTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanVerificationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HumanVerificationAttempt_challengeId_idx"
  ON "HumanVerificationAttempt"("challengeId");
CREATE INDEX IF NOT EXISTS "HumanVerificationAttempt_createdAt_idx"
  ON "HumanVerificationAttempt"("createdAt");
CREATE INDEX IF NOT EXISTS "HumanVerificationAttempt_success_createdAt_idx"
  ON "HumanVerificationAttempt"("success", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HumanVerificationAttempt_challengeId_fkey'
  ) THEN
    ALTER TABLE "HumanVerificationAttempt"
      ADD CONSTRAINT "HumanVerificationAttempt_challengeId_fkey"
      FOREIGN KEY ("challengeId") REFERENCES "HumanVerificationChallenge"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "HumanVerificationAnalytics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "endpoint" TEXT,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dimensions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanVerificationAnalytics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HumanVerificationAnalytics_date_endpoint_metric_key"
  ON "HumanVerificationAnalytics"("date", "endpoint", "metric");
CREATE INDEX IF NOT EXISTS "HumanVerificationAnalytics_date_idx"
  ON "HumanVerificationAnalytics"("date");

CREATE TABLE IF NOT EXISTS "HumanVerificationAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "endpoint" TEXT,
    "challengeId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HumanVerificationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HumanVerificationAuditLog_action_createdAt_idx"
  ON "HumanVerificationAuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "HumanVerificationAuditLog_createdAt_idx"
  ON "HumanVerificationAuditLog"("createdAt");
