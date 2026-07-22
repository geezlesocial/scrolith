-- Phase 33.2 — Intelligent Feed, Recommendations & Personalized Discovery (additive)
-- Do NOT apply to production without explicit approval.

CREATE TABLE IF NOT EXISTS "AIUserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mutedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favoriteCommunities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mutedEntityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signalWeights" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIUserMemory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AIUserMemory_userId_key" ON "AIUserMemory"("userId");

CREATE TABLE IF NOT EXISTS "AIRecommendationFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "topic" TEXT,
    "recommendationId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIRecommendationFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIRecommendationFeedback_userId_createdAt_idx" ON "AIRecommendationFeedback"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRecommendationFeedback_action_createdAt_idx" ON "AIRecommendationFeedback"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRecommendationFeedback_entityType_entityId_idx" ON "AIRecommendationFeedback"("entityType", "entityId");

CREATE TABLE IF NOT EXISTS "AILearningSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "topic" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AILearningSignal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AILearningSignal_userId_createdAt_idx" ON "AILearningSignal"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AILearningSignal_type_createdAt_idx" ON "AILearningSignal"("type", "createdAt");
