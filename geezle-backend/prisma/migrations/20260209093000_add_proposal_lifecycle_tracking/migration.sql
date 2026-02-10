-- Add proposal lifecycle tracking fields
ALTER TABLE "Proposal"
  ADD COLUMN IF NOT EXISTS "clientViewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clientViewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "topApplicantAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "interviewScheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "interviewMode" TEXT,
  ADD COLUMN IF NOT EXISTS "interviewLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "interviewNotes" TEXT;

-- Add user notification preference fields for job lifecycle
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "notifyJobApplications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyApplicationUpdates" BOOLEAN NOT NULL DEFAULT true;