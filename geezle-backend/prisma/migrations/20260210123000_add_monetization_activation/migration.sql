DO $$
BEGIN
  CREATE TYPE "MonetizationApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "MonetizationApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "MonetizationApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "fullName" TEXT NOT NULL,
  "tinNumber" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "age" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "adminNote" TEXT,
  "reviewedByAdminId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reapplyAllowedAt" TIMESTAMP(3),
  "eligibilitySnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonetizationApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MonetizationProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "enabledAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "disabledReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonetizationProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountViolation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AccountViolation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonetizationProfile_userId_key"
  ON "MonetizationProfile"("userId");

CREATE INDEX IF NOT EXISTS "MonetizationApplication_userId_createdAt_idx"
  ON "MonetizationApplication"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "MonetizationApplication_status_createdAt_idx"
  ON "MonetizationApplication"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MonetizationApplication_reviewedByAdminId_idx"
  ON "MonetizationApplication"("reviewedByAdminId");

CREATE INDEX IF NOT EXISTS "AccountViolation_userId_createdAt_idx"
  ON "AccountViolation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccountViolation_type_createdAt_idx"
  ON "AccountViolation"("type", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonetizationApplication_userId_fkey'
  ) THEN
    ALTER TABLE "MonetizationApplication"
      ADD CONSTRAINT "MonetizationApplication_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonetizationApplication_reviewedByAdminId_fkey'
  ) THEN
    ALTER TABLE "MonetizationApplication"
      ADD CONSTRAINT "MonetizationApplication_reviewedByAdminId_fkey"
      FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonetizationProfile_userId_fkey'
  ) THEN
    ALTER TABLE "MonetizationProfile"
      ADD CONSTRAINT "MonetizationProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountViolation_userId_fkey'
  ) THEN
    ALTER TABLE "AccountViolation"
      ADD CONSTRAINT "AccountViolation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
