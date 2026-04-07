ALTER TABLE "CommunityPost"
ADD COLUMN "sourceLanguage" TEXT,
ADD COLUMN "sourceLanguageConfidence" DOUBLE PRECISION,
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "translationVersion" TEXT;

CREATE INDEX "CommunityPost_sourceLanguage_idx" ON "CommunityPost"("sourceLanguage");
CREATE INDEX "CommunityPost_contentHash_idx" ON "CommunityPost"("contentHash");

CREATE TABLE "ContentTranslationGlossaryEntry" (
  "id" TEXT NOT NULL,
  "sourceText" TEXT NOT NULL,
  "replacementText" TEXT NOT NULL,
  "locale" TEXT,
  "targetLocale" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentTranslationGlossaryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentTranslationGlossaryEntry_enabled_priority_idx" ON "ContentTranslationGlossaryEntry"("enabled", "priority");
CREATE INDEX "ContentTranslationGlossaryEntry_locale_enabled_idx" ON "ContentTranslationGlossaryEntry"("locale", "enabled");
CREATE INDEX "ContentTranslationGlossaryEntry_targetLocale_enabled_idx" ON "ContentTranslationGlossaryEntry"("targetLocale", "enabled");

CREATE TABLE "ContentLanguageDetection" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "sourceLocale" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "detectorKey" TEXT,
  "contentHash" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentLanguageDetection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentLanguageDetection_entityType_entityId_contentHash_key" ON "ContentLanguageDetection"("entityType", "entityId", "contentHash");
CREATE INDEX "ContentLanguageDetection_entityType_entityId_idx" ON "ContentLanguageDetection"("entityType", "entityId");
CREATE INDEX "ContentLanguageDetection_sourceLocale_idx" ON "ContentLanguageDetection"("sourceLocale");
CREATE INDEX "ContentLanguageDetection_updatedAt_idx" ON "ContentLanguageDetection"("updatedAt");

CREATE TABLE "ContentTranslation" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "sourceLocale" TEXT NOT NULL,
  "targetLocale" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "translatedTitle" TEXT,
  "translatedContent" TEXT NOT NULL,
  "engineKey" TEXT NOT NULL,
  "modelVersion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "glossaryApplied" BOOLEAN NOT NULL DEFAULT false,
  "latencyMs" INTEGER,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentTranslation_entityType_entityId_targetLocale_contentHash_key" ON "ContentTranslation"("entityType", "entityId", "targetLocale", "contentHash");
CREATE INDEX "ContentTranslation_entityType_entityId_targetLocale_idx" ON "ContentTranslation"("entityType", "entityId", "targetLocale");
CREATE INDEX "ContentTranslation_status_idx" ON "ContentTranslation"("status");
CREATE INDEX "ContentTranslation_updatedAt_idx" ON "ContentTranslation"("updatedAt");

CREATE TABLE "ContentTranslationAuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContentTranslationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentTranslationAuditLog_eventType_createdAt_idx" ON "ContentTranslationAuditLog"("eventType", "createdAt");
CREATE INDEX "ContentTranslationAuditLog_entityType_entityId_idx" ON "ContentTranslationAuditLog"("entityType", "entityId");
CREATE INDEX "ContentTranslationAuditLog_createdAt_idx" ON "ContentTranslationAuditLog"("createdAt");
