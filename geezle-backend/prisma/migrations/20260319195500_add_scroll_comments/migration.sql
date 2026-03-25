CREATE TABLE IF NOT EXISTS "ScrollComment" (
  "id" TEXT NOT NULL,
  "scrollId" TEXT NOT NULL,
  "parentId" TEXT,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrollComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScrollComment_scrollId_createdAt_idx"
ON "ScrollComment"("scrollId", "createdAt");

CREATE INDEX IF NOT EXISTS "ScrollComment_scrollId_parentId_createdAt_idx"
ON "ScrollComment"("scrollId", "parentId", "createdAt");

CREATE INDEX IF NOT EXISTS "ScrollComment_authorId_createdAt_idx"
ON "ScrollComment"("authorId", "createdAt");

CREATE INDEX IF NOT EXISTS "ScrollComment_status_createdAt_idx"
ON "ScrollComment"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ScrollComment_scrollId_fkey'
  ) THEN
    ALTER TABLE "ScrollComment"
    ADD CONSTRAINT "ScrollComment_scrollId_fkey"
    FOREIGN KEY ("scrollId") REFERENCES "ScrollVideo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
