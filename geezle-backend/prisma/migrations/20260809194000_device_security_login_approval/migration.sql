-- Additive device trust and login approval tables.
CREATE TABLE IF NOT EXISTS "TrustedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "publicKey" TEXT,
  "label" TEXT,
  "platform" TEXT,
  "deviceType" TEXT,
  "deviceModel" TEXT,
  "osVersion" TEXT,
  "appVersion" TEXT,
  "browserName" TEXT,
  "trustStatus" TEXT NOT NULL DEFAULT 'TRUSTED',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trustedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastIp" TEXT,
  "lastUserAgent" TEXT,
  "lastApproxLocation" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LoginApprovalAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "newDeviceId" TEXT NOT NULL,
  "approvalTokenHash" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "consumedDeviceId" TEXT,
  "requestIp" TEXT,
  "userAgent" TEXT,
  "platform" TEXT,
  "deviceModel" TEXT,
  "appVersion" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginApprovalAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDevice_userId_deviceId_key" ON "TrustedDevice"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "TrustedDevice_userId_trustStatus_idx" ON "TrustedDevice"("userId", "trustStatus");
CREATE INDEX IF NOT EXISTS "TrustedDevice_userId_lastSeenAt_idx" ON "TrustedDevice"("userId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "TrustedDevice_deviceId_idx" ON "TrustedDevice"("deviceId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoginApprovalAttempt_approvalTokenHash_key" ON "LoginApprovalAttempt"("approvalTokenHash");
CREATE INDEX IF NOT EXISTS "LoginApprovalAttempt_userId_status_expiresAt_idx" ON "LoginApprovalAttempt"("userId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "LoginApprovalAttempt_newDeviceId_idx" ON "LoginApprovalAttempt"("newDeviceId");
CREATE INDEX IF NOT EXISTS "LoginApprovalAttempt_createdAt_idx" ON "LoginApprovalAttempt"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TrustedDevice_userId_fkey'
  ) THEN
    ALTER TABLE "TrustedDevice"
      ADD CONSTRAINT "TrustedDevice_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoginApprovalAttempt_userId_fkey'
  ) THEN
    ALTER TABLE "LoginApprovalAttempt"
      ADD CONSTRAINT "LoginApprovalAttempt_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoginApprovalAttempt_approvedById_fkey'
  ) THEN
    ALTER TABLE "LoginApprovalAttempt"
      ADD CONSTRAINT "LoginApprovalAttempt_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
