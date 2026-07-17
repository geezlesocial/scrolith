-- Phase 20.2: Secure KYC foundation (additive only; no destructive changes)

-- KYCSubmission: consent, decision reason, retention placeholders
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "decisionReasonCode" TEXT;
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "consentPolicyVersion" TEXT;
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "consentAcceptedAt" TIMESTAMP(3);
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "resubmissionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "retentionPolicyKey" TEXT;
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "retainUntil" TIMESTAMP(3);
ALTER TABLE "KYCSubmission" ADD COLUMN IF NOT EXISTS "legalHold" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "KYCSubmission_retainUntil_idx" ON "KYCSubmission"("retainUntil");

-- KYCDocument: private storage + scan lifecycle fields
ALTER TABLE "KYCDocument" ALTER COLUMN "fileUrl" SET DEFAULT '';
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'kyc';
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "storageClass" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "objectKey" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "quarantineObjectKey" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "quarantineStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "scanStatus" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "scanEngine" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "scanDefinitionVersion" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3);
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "normalizedAt" TIMESTAMP(3);
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "contentType" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "sizeBytes" BIGINT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "originalFilenameSanitized" TEXT;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "metadataStripped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "promotedAt" TIMESTAMP(3);
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "retainUntil" TIMESTAMP(3);
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "KYCDocument_objectKey_idx" ON "KYCDocument"("objectKey");
CREATE INDEX IF NOT EXISTS "KYCDocument_sha256_idx" ON "KYCDocument"("sha256");
CREATE INDEX IF NOT EXISTS "KYCDocument_quarantineStatus_idx" ON "KYCDocument"("quarantineStatus");
CREATE INDEX IF NOT EXISTS "KYCDocument_purpose_idx" ON "KYCDocument"("purpose");

-- Consent evidence
CREATE TABLE IF NOT EXISTS "KYCConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submissionId" TEXT,
    "policyVersion" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'identity_verification_review',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSurface" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KYCConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KYCConsent_userId_idx" ON "KYCConsent"("userId");
CREATE INDEX IF NOT EXISTS "KYCConsent_submissionId_idx" ON "KYCConsent"("submissionId");
CREATE INDEX IF NOT EXISTS "KYCConsent_policyVersion_idx" ON "KYCConsent"("policyVersion");
CREATE INDEX IF NOT EXISTS "KYCConsent_acceptedAt_idx" ON "KYCConsent"("acceptedAt");

-- Append-only audit events
CREATE TABLE IF NOT EXISTS "KYCAuditEvent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "documentId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "reasonCode" TEXT,
    "priorState" TEXT,
    "resultingState" TEXT,
    "correlationId" TEXT,
    "serviceIdentity" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KYCAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KYCAuditEvent_submissionId_idx" ON "KYCAuditEvent"("submissionId");
CREATE INDEX IF NOT EXISTS "KYCAuditEvent_documentId_idx" ON "KYCAuditEvent"("documentId");
CREATE INDEX IF NOT EXISTS "KYCAuditEvent_action_idx" ON "KYCAuditEvent"("action");
CREATE INDEX IF NOT EXISTS "KYCAuditEvent_actorType_idx" ON "KYCAuditEvent"("actorType");
CREATE INDEX IF NOT EXISTS "KYCAuditEvent_createdAt_idx" ON "KYCAuditEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "KYCAuditEvent_correlationId_idx" ON "KYCAuditEvent"("correlationId");

-- FKs (safe if already present)
DO $$ BEGIN
  ALTER TABLE "KYCConsent" ADD CONSTRAINT "KYCConsent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KYCConsent" ADD CONSTRAINT "KYCConsent_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "KYCSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KYCAuditEvent" ADD CONSTRAINT "KYCAuditEvent_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "KYCSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KYCAuditEvent" ADD CONSTRAINT "KYCAuditEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
