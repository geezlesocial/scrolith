-- Add deduped daily career actions for post, reply, apply, and learn streak tracking

CREATE TABLE "CareerDailyAction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "actionDate" TIMESTAMP(3) NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CareerDailyAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareerDailyAction_userId_actionType_actionDate_key"
ON "CareerDailyAction"("userId", "actionType", "actionDate");

CREATE INDEX "CareerDailyAction_userId_actionDate_idx"
ON "CareerDailyAction"("userId", "actionDate");

CREATE INDEX "CareerDailyAction_actionType_actionDate_idx"
ON "CareerDailyAction"("actionType", "actionDate");

ALTER TABLE "CareerDailyAction"
ADD CONSTRAINT "CareerDailyAction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
