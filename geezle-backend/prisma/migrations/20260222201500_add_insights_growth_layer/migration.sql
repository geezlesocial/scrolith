-- Add additive Insights + Growth + Scrolitha intelligence layer tables.

CREATE TABLE "ProfessionalScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "riskFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfessionalScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsightEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "rules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "meta" JSONB,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserStreak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStreakDays" INTEGER NOT NULL DEFAULT 0,
    "bestStreakDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpportunityMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpportunityMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyLeaderboard" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WeeklyLeaderboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostPrediction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toxicityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hashtagSuggestions" JSONB,
    "commentSuggestions" JSONB,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostPrediction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AICopilotLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "scope" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "riskLevel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AICopilotLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillGapReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'scrolitha',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SkillGapReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedModePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'growth',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedModePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfessionalScore_userId_key" ON "ProfessionalScore"("userId");
CREATE INDEX "ProfessionalScore_score_idx" ON "ProfessionalScore"("score");
CREATE INDEX "ProfessionalScore_updatedAt_idx" ON "ProfessionalScore"("updatedAt");

CREATE INDEX "InsightEvent_userId_createdAt_idx" ON "InsightEvent"("userId", "createdAt");
CREATE INDEX "InsightEvent_type_createdAt_idx" ON "InsightEvent"("type", "createdAt");
CREATE INDEX "InsightEvent_createdAt_idx" ON "InsightEvent"("createdAt");

CREATE UNIQUE INDEX "Achievement_key_key" ON "Achievement"("key");
CREATE INDEX "Achievement_isActive_idx" ON "Achievement"("isActive");
CREATE INDEX "Achievement_tier_idx" ON "Achievement"("tier");

CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");
CREATE INDEX "UserAchievement_userId_earnedAt_idx" ON "UserAchievement"("userId", "earnedAt");
CREATE INDEX "UserAchievement_achievementId_earnedAt_idx" ON "UserAchievement"("achievementId", "earnedAt");

CREATE UNIQUE INDEX "UserStreak_userId_key" ON "UserStreak"("userId");
CREATE INDEX "UserStreak_currentStreakDays_idx" ON "UserStreak"("currentStreakDays");
CREATE INDEX "UserStreak_updatedAt_idx" ON "UserStreak"("updatedAt");

CREATE UNIQUE INDEX "OpportunityMatch_userId_targetType_targetId_key" ON "OpportunityMatch"("userId", "targetType", "targetId");
CREATE INDEX "OpportunityMatch_userId_score_idx" ON "OpportunityMatch"("userId", "score");
CREATE INDEX "OpportunityMatch_targetType_targetId_idx" ON "OpportunityMatch"("targetType", "targetId");
CREATE INDEX "OpportunityMatch_createdAt_idx" ON "OpportunityMatch"("createdAt");

CREATE UNIQUE INDEX "WeeklyLeaderboard_weekKey_scope_key" ON "WeeklyLeaderboard"("weekKey", "scope");
CREATE INDEX "WeeklyLeaderboard_scope_weekKey_idx" ON "WeeklyLeaderboard"("scope", "weekKey");
CREATE INDEX "WeeklyLeaderboard_builtAt_idx" ON "WeeklyLeaderboard"("builtAt");

CREATE UNIQUE INDEX "PostPrediction_postId_key" ON "PostPrediction"("postId");
CREATE INDEX "PostPrediction_authorId_createdAt_idx" ON "PostPrediction"("authorId", "createdAt");
CREATE INDEX "PostPrediction_engagementScore_idx" ON "PostPrediction"("engagementScore");
CREATE INDEX "PostPrediction_toxicityScore_idx" ON "PostPrediction"("toxicityScore");

CREATE INDEX "AICopilotLog_userId_createdAt_idx" ON "AICopilotLog"("userId", "createdAt");
CREATE INDEX "AICopilotLog_scope_createdAt_idx" ON "AICopilotLog"("scope", "createdAt");
CREATE INDEX "AICopilotLog_promptHash_idx" ON "AICopilotLog"("promptHash");

CREATE INDEX "SkillGapReport_userId_createdAt_idx" ON "SkillGapReport"("userId", "createdAt");

CREATE UNIQUE INDEX "FeedModePreference_userId_key" ON "FeedModePreference"("userId");
CREATE INDEX "FeedModePreference_mode_idx" ON "FeedModePreference"("mode");

ALTER TABLE "ProfessionalScore"
  ADD CONSTRAINT "ProfessionalScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InsightEvent"
  ADD CONSTRAINT "InsightEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserAchievement"
  ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAchievement"
  ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserStreak"
  ADD CONSTRAINT "UserStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityMatch"
  ADD CONSTRAINT "OpportunityMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostPrediction"
  ADD CONSTRAINT "PostPrediction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostPrediction"
  ADD CONSTRAINT "PostPrediction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AICopilotLog"
  ADD CONSTRAINT "AICopilotLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SkillGapReport"
  ADD CONSTRAINT "SkillGapReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedModePreference"
  ADD CONSTRAINT "FeedModePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
