-- Additive trusted-device login approval flow.
CREATE TABLE IF NOT EXISTS "LoginTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT,
    "platform" TEXT,
    "deviceType" TEXT,
    "browserName" TEXT,
    "deviceModel" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "isTrusted" BOOLEAN NOT NULL DEFAULT TRUE,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginTrustedDevice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoginTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoginTrustedDevice_userId_deviceId_key" ON "LoginTrustedDevice"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "LoginTrustedDevice_userId_isTrusted_idx" ON "LoginTrustedDevice"("userId", "isTrusted");
CREATE INDEX IF NOT EXISTS "LoginTrustedDevice_deviceId_idx" ON "LoginTrustedDevice"("deviceId");

CREATE TABLE IF NOT EXISTS "LoginApprovalAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedDeviceId" TEXT NOT NULL,
    "approvalTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedIp" TEXT,
    "requestedUserAgent" TEXT,
    "deviceMetadata" JSONB,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginApprovalAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoginApprovalAttempt_approvalTokenHash_key" UNIQUE ("approvalTokenHash"),
    CONSTRAINT "LoginApprovalAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoginApprovalAttempt_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LoginApprovalAttempt_userId_status_expiresAt_idx" ON "LoginApprovalAttempt"("userId", "status", "expiresAt");
-- An earlier login-approval migration used the legacy column name newDeviceId.
-- Keep existing approval records and support fresh databases with the current name.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'LoginApprovalAttempt'
          AND column_name = 'requestedDeviceId'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS "LoginApprovalAttempt_requestedDeviceId_idx" ON "LoginApprovalAttempt"("requestedDeviceId")';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'LoginApprovalAttempt'
          AND column_name = 'newDeviceId'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS "LoginApprovalAttempt_requestedDeviceId_idx" ON "LoginApprovalAttempt"("newDeviceId")';
    ELSE
        RAISE EXCEPTION 'LoginApprovalAttempt is missing requested device column';
    END IF;
END $$;
