-- Keep the legacy required challenge column compatible with the new approval flow.
ALTER TABLE "LoginApprovalAttempt"
  ADD COLUMN IF NOT EXISTS "challenge" TEXT NOT NULL DEFAULT '';
