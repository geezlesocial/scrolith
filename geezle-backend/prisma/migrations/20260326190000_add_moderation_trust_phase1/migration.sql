-- Phase 1 control plane: Moderation and Trust Center foundation

CREATE TABLE "ContentPolicy" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "contentType" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "action" TEXT NOT NULL DEFAULT 'REVIEW',
  "thresholds" JSONB,
  "metadata" JSONB,
  "isSystemPolicy" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByStaffId" TEXT,
  "updatedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationAppeal" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "submittedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "resolutionNotes" TEXT,
  "resolvedByStaffId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 100,
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "kycStatusSnapshot" TEXT,
  "isVerifiedSnapshot" BOOLEAN NOT NULL DEFAULT false,
  "activeViolationCount" INTEGER NOT NULL DEFAULT 0,
  "moderationCaseCount" INTEGER NOT NULL DEFAULT 0,
  "resolvedCaseCount" INTEGER NOT NULL DEFAULT 0,
  "fraudScoreSnapshot" INTEGER NOT NULL DEFAULT 0,
  "signalCount" INTEGER NOT NULL DEFAULT 0,
  "lastComputedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "updatedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TrustProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RiskSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "signalType" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3),
  "createdByStaffId" TEXT,
  "resolvedByStaffId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RiskSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPolicy_key_key" ON "ContentPolicy"("key");
CREATE INDEX "ContentPolicy_contentType_isActive_idx" ON "ContentPolicy"("contentType", "isActive");
CREATE INDEX "ContentPolicy_severity_isActive_idx" ON "ContentPolicy"("severity", "isActive");

CREATE INDEX "ModerationAppeal_caseId_status_createdAt_idx" ON "ModerationAppeal"("caseId", "status", "createdAt");
CREATE INDEX "ModerationAppeal_targetUserId_createdAt_idx" ON "ModerationAppeal"("targetUserId", "createdAt");
CREATE INDEX "ModerationAppeal_submittedByUserId_createdAt_idx" ON "ModerationAppeal"("submittedByUserId", "createdAt");

CREATE UNIQUE INDEX "TrustProfile_userId_key" ON "TrustProfile"("userId");
CREATE INDEX "TrustProfile_riskLevel_score_idx" ON "TrustProfile"("riskLevel", "score");
CREATE INDEX "TrustProfile_lastComputedAt_idx" ON "TrustProfile"("lastComputedAt");

CREATE INDEX "RiskSignal_userId_status_createdAt_idx" ON "RiskSignal"("userId", "status", "createdAt");
CREATE INDEX "RiskSignal_signalType_severity_status_idx" ON "RiskSignal"("signalType", "severity", "status");
CREATE INDEX "RiskSignal_expiresAt_idx" ON "RiskSignal"("expiresAt");
