CREATE TABLE "DeviceApprovalWaiver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByAdminId" TEXT,
    "updatedByAdminId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "consumedByDeviceId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceApprovalWaiver_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceApprovalWaiver_userId_status_idx" ON "DeviceApprovalWaiver"("userId", "status");
CREATE INDEX "DeviceApprovalWaiver_status_idx" ON "DeviceApprovalWaiver"("status");
CREATE INDEX "DeviceApprovalWaiver_createdAt_idx" ON "DeviceApprovalWaiver"("createdAt");
CREATE UNIQUE INDEX "DeviceApprovalWaiver_active_user_unique"
  ON "DeviceApprovalWaiver"("userId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "DeviceApprovalWaiver"
  ADD CONSTRAINT "DeviceApprovalWaiver_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
