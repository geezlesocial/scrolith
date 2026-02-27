-- Add image background support for preloader configs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PreloaderBackgroundType'
      AND e.enumlabel = 'IMAGE'
  ) THEN
    ALTER TYPE "PreloaderBackgroundType" ADD VALUE 'IMAGE';
  END IF;
END $$;

ALTER TABLE "PreloaderConfig"
ADD COLUMN IF NOT EXISTS "backgroundFileId" TEXT;
