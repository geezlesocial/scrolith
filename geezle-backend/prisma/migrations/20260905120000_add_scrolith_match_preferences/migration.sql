-- Additive Match preferences. Existing Match, hiring, profile, and messaging
-- tables are intentionally unchanged.
CREATE TABLE "ScrolithMatchPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScrolithMatchPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrolithMatchPreference_userId_key"
  ON "ScrolithMatchPreference"("userId");
CREATE INDEX "ScrolithMatchPreference_userId_updatedAt_idx"
  ON "ScrolithMatchPreference"("userId", "updatedAt");

ALTER TABLE "ScrolithMatchPreference"
  ADD CONSTRAINT "ScrolithMatchPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
