-- Phase 33.0 — Scrolitha AI Platform Foundation (additive only)
-- Do NOT apply to production without explicit approval.
-- No secrets stored in this migration.

-- Provider configuration (secrets remain in Secret Manager / env)
CREATE TABLE IF NOT EXISTS "AIProviderConfiguration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIProviderConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AIProviderConfiguration_provider_key" ON "AIProviderConfiguration"("provider");

CREATE TABLE IF NOT EXISTS "AIModelConfiguration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "costTier" TEXT NOT NULL DEFAULT 'low',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIModelConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AIModelConfiguration_provider_modelId_key" ON "AIModelConfiguration"("provider", "modelId");
CREATE INDEX IF NOT EXISTS "AIModelConfiguration_provider_enabled_idx" ON "AIModelConfiguration"("provider", "enabled");

CREATE TABLE IF NOT EXISTS "AICapability" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AICapability_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AICapability_capability_key" ON "AICapability"("capability");

CREATE TABLE IF NOT EXISTS "AIPrompt" (
    "id" TEXT NOT NULL,
    "promptKey" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "systemInstructions" TEXT NOT NULL DEFAULT '',
    "inputTemplate" TEXT NOT NULL DEFAULT '{{content}}',
    "outputSchemaName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "maxContextChars" INTEGER NOT NULL DEFAULT 8000,
    "safetyPolicy" TEXT NOT NULL DEFAULT '33.0.0',
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIPrompt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AIPrompt_promptKey_version_locale_key" ON "AIPrompt"("promptKey", "version", "locale");
CREATE INDEX IF NOT EXISTS "AIPrompt_capability_status_idx" ON "AIPrompt"("capability", "status");

CREATE TABLE IF NOT EXISTS "AIPromptVersion" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIPromptVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIPromptVersion_promptId_version_idx" ON "AIPromptVersion"("promptId", "version");

-- Request metadata (no full sensitive prompts by default)
CREATE TABLE IF NOT EXISTS "AIRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "capability" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "privacyLevel" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "inputHash" TEXT,
    "correlationId" TEXT,
    "reason" TEXT,
    "latencyMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIRequest_userId_createdAt_idx" ON "AIRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRequest_capability_createdAt_idx" ON "AIRequest"("capability", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRequest_correlationId_idx" ON "AIRequest"("correlationId");
CREATE INDEX IF NOT EXISTS "AIRequest_lifecycle_createdAt_idx" ON "AIRequest"("lifecycle", "createdAt");

CREATE TABLE IF NOT EXISTS "AIResponseMetadata" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "outputHash" TEXT,
    "parseAttempts" INTEGER NOT NULL DEFAULT 1,
    "disclosure" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIResponseMetadata_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIResponseMetadata_requestId_idx" ON "AIResponseMetadata"("requestId");

CREATE TABLE IF NOT EXISTS "AIUsageLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "correlationId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIUsageLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIUsageLedger_userId_createdAt_idx" ON "AIUsageLedger"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIUsageLedger_provider_createdAt_idx" ON "AIUsageLedger"("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "AIUsageLedger_capability_createdAt_idx" ON "AIUsageLedger"("capability", "createdAt");

CREATE TABLE IF NOT EXISTS "AIConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiFeaturesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "privateMessageAnalysisAllowed" BOOLEAN NOT NULL DEFAULT false,
    "personalizationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "externalProviderProcessingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "aiSuggestionsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "aiActivityHistoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "productImprovementDataAllowed" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT NOT NULL DEFAULT '33.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AIConsent_userId_key" ON "AIConsent"("userId");

CREATE TABLE IF NOT EXISTS "AISafetyDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "stage" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "action" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policyVersion" TEXT NOT NULL DEFAULT '33.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AISafetyDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AISafetyDecision_requestId_idx" ON "AISafetyDecision"("requestId");
CREATE INDEX IF NOT EXISTS "AISafetyDecision_action_createdAt_idx" ON "AISafetyDecision"("action", "createdAt");

CREATE TABLE IF NOT EXISTS "AIFeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIFeatureFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AIFeatureFlag_key_key" ON "AIFeatureFlag"("key");

CREATE TABLE IF NOT EXISTS "AIAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "capability" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "privacyLevel" TEXT,
    "lifecycle" TEXT,
    "reason" TEXT,
    "correlationId" TEXT,
    "requestId" TEXT,
    "inputHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIAuditLog_action_createdAt_idx" ON "AIAuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AIAuditLog_actorUserId_createdAt_idx" ON "AIAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIAuditLog_correlationId_idx" ON "AIAuditLog"("correlationId");

CREATE TABLE IF NOT EXISTS "AIProviderHealthSnapshot" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIProviderHealthSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIProviderHealthSnapshot_provider_checkedAt_idx" ON "AIProviderHealthSnapshot"("provider", "checkedAt");
