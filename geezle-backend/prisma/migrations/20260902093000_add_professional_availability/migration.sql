-- Additive professional availability. Existing users remain inactive by default.
CREATE TYPE "ProfessionalAvailabilityStatus" AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE');
CREATE TYPE "ProfessionalWorkPreference" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID', 'FLEXIBLE');
CREATE TYPE "ProfessionalAvailabilityTiming" AS ENUM ('AVAILABLE_NOW', 'WITHIN_ONE_WEEK', 'WITHIN_ONE_MONTH', 'FLEXIBLE');
CREATE TYPE "ProfessionalAvailabilityVisibility" AS ENUM ('PUBLIC', 'HIDDEN');

CREATE TABLE "ProfessionalAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ProfessionalAvailabilityStatus" NOT NULL DEFAULT 'INACTIVE',
    "availabilityTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "workPreference" "ProfessionalWorkPreference" NOT NULL DEFAULT 'FLEXIBLE',
    "timing" "ProfessionalAvailabilityTiming" NOT NULL DEFAULT 'FLEXIBLE',
    "availableFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "visibility" "ProfessionalAvailabilityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfessionalAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfessionalAvailability_userId_key" ON "ProfessionalAvailability"("userId");
CREATE INDEX "ProfessionalAvailability_status_isActive_visibility_idx" ON "ProfessionalAvailability"("status", "isActive", "visibility");
CREATE INDEX "ProfessionalAvailability_updatedAt_idx" ON "ProfessionalAvailability"("updatedAt");

ALTER TABLE "ProfessionalAvailability"
  ADD CONSTRAINT "ProfessionalAvailability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
