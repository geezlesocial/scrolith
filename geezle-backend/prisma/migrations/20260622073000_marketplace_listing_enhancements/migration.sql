ALTER TABLE "MarketplaceListing"
  ADD COLUMN IF NOT EXISTS "brand" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT[],
  ADD COLUMN IF NOT EXISTS "meetupPreferences" TEXT[],
  ADD COLUMN IF NOT EXISTS "hideFromFriendsAndFollowers" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "contactPreference" TEXT;

UPDATE "MarketplaceListing"
SET
  "tags" = COALESCE("tags", ARRAY[]::TEXT[]),
  "meetupPreferences" = COALESCE("meetupPreferences", ARRAY[]::TEXT[]),
  "hideFromFriendsAndFollowers" = COALESCE("hideFromFriendsAndFollowers", false)
WHERE
  "tags" IS NULL
  OR "meetupPreferences" IS NULL
  OR "hideFromFriendsAndFollowers" IS NULL;

ALTER TABLE "MarketplaceListing"
  ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "tags" SET NOT NULL,
  ALTER COLUMN "meetupPreferences" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "meetupPreferences" SET NOT NULL,
  ALTER COLUMN "hideFromFriendsAndFollowers" SET DEFAULT false,
  ALTER COLUMN "hideFromFriendsAndFollowers" SET NOT NULL,
  ALTER COLUMN "contactPreference" SET DEFAULT 'message';
