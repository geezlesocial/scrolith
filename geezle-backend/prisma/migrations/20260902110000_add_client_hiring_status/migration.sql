-- Additive client/employer hiring status. Existing users remain inactive by default.
CREATE TYPE "ClientHiringStatusState" AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE');
CREATE TYPE "ClientHiringTiming" AS ENUM ('AVAILABLE_NOW', 'WITHIN_ONE_WEEK', 'WITHIN_ONE_MONTH', 'FLEXIBLE');
CREATE TYPE "ClientHiringVisibility" AS ENUM ('PUBLIC', 'HIDDEN');

CREATE TABLE "ClientHiringStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ClientHiringStatusState" NOT NULL DEFAULT 'INACTIVE',
    "hiringTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "focusAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "timing" "ClientHiringTiming" NOT NULL DEFAULT 'FLEXIBLE',
    "visibility" "ClientHiringVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientHiringStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientHiringStatus_userId_key" ON "ClientHiringStatus"("userId");
CREATE INDEX "ClientHiringStatus_status_isActive_visibility_idx" ON "ClientHiringStatus"("status", "isActive", "visibility");
CREATE INDEX "ClientHiringStatus_updatedAt_idx" ON "ClientHiringStatus"("updatedAt");

ALTER TABLE "ClientHiringStatus"
  ADD CONSTRAINT "ClientHiringStatus_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
