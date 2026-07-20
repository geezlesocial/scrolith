-- Phase 26 — Multilingual intelligence (additive only)
-- User understood-language preferences + post language detection metadata.

-- User language preferences (not nationality / locale)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "understoodLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredTranslationLanguage" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "languageSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "autoTranslateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "languagePreferencesUpdatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "languagePreferencesConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- Community post language detection metadata (preserves existing sourceLanguage*)
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "languageDetectionStatus" TEXT;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "isMixedLanguage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "detectedLanguageCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "languageManuallySet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "languageDetectedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_languagePreferencesConfirmed_idx" ON "User"("languagePreferencesConfirmed");
CREATE INDEX IF NOT EXISTS "CommunityPost_languageDetectionStatus_idx" ON "CommunityPost"("languageDetectionStatus");
CREATE INDEX IF NOT EXISTS "CommunityPost_isMixedLanguage_idx" ON "CommunityPost"("isMixedLanguage");
