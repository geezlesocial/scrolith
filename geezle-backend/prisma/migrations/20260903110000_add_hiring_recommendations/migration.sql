-- Additive state for intelligent hiring recommendations. Existing hiring
-- status records are intentionally unchanged.
CREATE TABLE "HiringRecommendationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "lastShownAt" TIMESTAMP(3),
    "lastDismissedAt" TIMESTAMP(3),
    "dismissCount" INTEGER NOT NULL DEFAULT 0,
    "snoozeUntil" TIMESTAMP(3),
    "impressionCount" INTEGER NOT NULL DEFAULT 0,
    "sessionKey" TEXT,
    "sessionImpressionCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HiringRecommendationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HiringRecommendationState_userId_accountType_key"
  ON "HiringRecommendationState"("userId", "accountType");
CREATE INDEX "HiringRecommendationState_userId_accountType_updatedAt_idx"
  ON "HiringRecommendationState"("userId", "accountType", "updatedAt");
CREATE INDEX "HiringRecommendationState_accountType_lastShownAt_idx"
  ON "HiringRecommendationState"("accountType", "lastShownAt");

ALTER TABLE "HiringRecommendationState"
  ADD CONSTRAINT "HiringRecommendationState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
