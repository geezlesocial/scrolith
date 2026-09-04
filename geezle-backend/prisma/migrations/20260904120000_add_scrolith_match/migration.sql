-- Additive mutual opportunity matching state. Existing hiring and recommendation
-- tables are intentionally unchanged.
CREATE TABLE "ScrolithMatchInteraction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScrolithMatchInteraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrolithMatchInteraction_actorId_targetId_key"
  ON "ScrolithMatchInteraction"("actorId", "targetId");
CREATE INDEX "ScrolithMatchInteraction_actorId_action_updatedAt_idx"
  ON "ScrolithMatchInteraction"("actorId", "action", "updatedAt");
CREATE INDEX "ScrolithMatchInteraction_targetId_action_updatedAt_idx"
  ON "ScrolithMatchInteraction"("targetId", "action", "updatedAt");

ALTER TABLE "ScrolithMatchInteraction"
  ADD CONSTRAINT "ScrolithMatchInteraction_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrolithMatchInteraction"
  ADD CONSTRAINT "ScrolithMatchInteraction_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
