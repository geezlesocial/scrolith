-- Add support for job cart items while preserving existing gig cart behavior.
DO $$
BEGIN
  CREATE TYPE "CartItemType" AS ENUM ('GIG', 'JOB');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CartItem"
  ADD COLUMN IF NOT EXISTS "itemType" "CartItemType" NOT NULL DEFAULT 'GIG',
  ADD COLUMN IF NOT EXISTS "jobId" TEXT;

ALTER TABLE "CartItem"
  ALTER COLUMN "gigId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_jobId_fkey'
  ) THEN
    ALTER TABLE "CartItem"
      ADD CONSTRAINT "CartItem_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_jobId_key" ON "CartItem"("cartId", "jobId");
CREATE INDEX IF NOT EXISTS "CartItem_jobId_idx" ON "CartItem"("jobId");
