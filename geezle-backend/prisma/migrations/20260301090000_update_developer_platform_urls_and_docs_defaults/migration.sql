-- Ensure developer app supports multiple restricted platform URLs
ALTER TABLE "DeveloperApp"
  ADD COLUMN IF NOT EXISTS "platformUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Move legacy developer base URL defaults to first-party developer path
ALTER TABLE "DeveloperPlatformConfig"
  ALTER COLUMN "developerBaseUrl" SET DEFAULT 'https://scrolith.com/developer';

UPDATE "DeveloperPlatformConfig"
SET "developerBaseUrl" = 'https://scrolith.com/developer'
WHERE LOWER(COALESCE("developerBaseUrl", '')) LIKE '%developer.scrolith.com%';
