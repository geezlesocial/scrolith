-- Additive, time-limited emergency waiver for new-device login approval.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "loginApprovalWaivedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "loginApprovalWaivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "loginApprovalWaivedReason" TEXT;

CREATE INDEX IF NOT EXISTS "User_loginApprovalWaivedUntil_idx"
  ON "User"("loginApprovalWaivedUntil");
