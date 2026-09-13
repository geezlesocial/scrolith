-- Phase 33.4 — Recommendation quality telemetry (additive, privacy-minimized).
CREATE TABLE IF NOT EXISTS "AIRecommendationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "position" INTEGER,
    "relevanceScore" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "surface" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIRecommendationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AIRecommendationEvent_eventType_createdAt_idx" ON "AIRecommendationEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRecommendationEvent_userId_createdAt_idx" ON "AIRecommendationEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AIRecommendationEvent_entityType_entityId_createdAt_idx" ON "AIRecommendationEvent"("entityType", "entityId", "createdAt");
