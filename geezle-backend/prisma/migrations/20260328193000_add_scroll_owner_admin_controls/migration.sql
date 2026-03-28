-- Add scroll moderation controls, posting restrictions, and preview settings

CREATE TABLE "ScrollPostingRestriction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT,
  "liftedAt" TIMESTAMP(3),
  "liftedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrollPostingRestriction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScrollConfig"
ADD COLUMN "headlinePreviewCharacters" INTEGER NOT NULL DEFAULT 72,
ADD COLUMN "descriptionPreviewCharacters" INTEGER NOT NULL DEFAULT 120;

CREATE INDEX "ScrollPostingRestriction_userId_endsAt_idx"
ON "ScrollPostingRestriction"("userId", "endsAt");

CREATE INDEX "ScrollPostingRestriction_userId_liftedAt_endsAt_idx"
ON "ScrollPostingRestriction"("userId", "liftedAt", "endsAt");

CREATE INDEX "ScrollPostingRestriction_createdByAdminId_createdAt_idx"
ON "ScrollPostingRestriction"("createdByAdminId", "createdAt");
