ALTER TABLE "User"
ADD COLUMN "followOnboardingRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "followOnboardingCompletedAt" TIMESTAMP(3);
