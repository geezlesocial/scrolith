-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DevLinkStatus" AS ENUM ('UNLINKED', 'PENDING_VERIFICATION', 'LINKED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DevLookupType" AS ENUM ('EMAIL', 'USERNAME');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DevVerificationMethod" AS ENUM ('SCROLITH_LOGIN_CONFIRM', 'EMAIL_OTP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DevLinkRequestStatus" AS ENUM ('CREATED', 'OTP_SENT', 'VERIFIED', 'EXPIRED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DevPlatformType" AS ENUM ('WEB', 'MOBILE', 'SERVER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DevAppStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'DISABLED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeveloperPlatformConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "developerBaseUrl" TEXT NOT NULL DEFAULT 'https://developer.scrolith.com',
  "autoApproveEnabled" BOOLEAN NOT NULL DEFAULT false,
  "autoApproveRules" JSONB,
  "authorizationCodeTtlSeconds" INTEGER NOT NULL DEFAULT 300,
  "accessTokenTtlSeconds" INTEGER NOT NULL DEFAULT 3600,
  "refreshTokenTtlSeconds" INTEGER NOT NULL DEFAULT 2592000,
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
  "sensitiveScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requireManualApprovalForSensitiveScope" BOOLEAN NOT NULL DEFAULT true,
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeveloperPlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeveloperUser" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "developerEmail" TEXT NOT NULL,
  "developerUsername" TEXT,
  "linkStatus" "DevLinkStatus" NOT NULL DEFAULT 'UNLINKED',
  "linkedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "syncSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeveloperUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeveloperLinkRequest" (
  "id" TEXT NOT NULL,
  "developerUserId" TEXT NOT NULL,
  "lookupType" "DevLookupType" NOT NULL,
  "lookupValue" TEXT NOT NULL,
  "resolvedUserId" TEXT,
  "verificationMethod" "DevVerificationMethod" NOT NULL DEFAULT 'SCROLITH_LOGIN_CONFIRM',
  "otpHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "status" "DevLinkRequestStatus" NOT NULL DEFAULT 'CREATED',
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeveloperLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeveloperApp" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "developerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tagline" TEXT,
  "description" TEXT,
  "appUrl" TEXT,
  "termsUrl" TEXT,
  "privacyUrl" TEXT,
  "logoFileId" TEXT,
  "clientId" TEXT NOT NULL,
  "clientSecretHash" TEXT NOT NULL,
  "platformType" "DevPlatformType" NOT NULL DEFAULT 'WEB',
  "requestedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "DevAppStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedByAdminId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "lastSecretRotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeveloperApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeveloperAppRedirectUri" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "uri" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeveloperAppRedirectUri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OAuthAuthorizationCode" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" TEXT,
  "codeChallengeMethod" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "state" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OAuthToken" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "ip" TEXT,
  "userAgent" TEXT,

  CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OAuthConsent" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OAuthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeveloperAuditLog" (
  "id" TEXT NOT NULL,
  "developerUserId" TEXT,
  "appId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT,
  "metadata" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeveloperAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeveloperUser_userId_key" ON "DeveloperUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeveloperUser_developerEmail_key" ON "DeveloperUser"("developerEmail");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperUser_developerUsername_idx" ON "DeveloperUser"("developerUsername");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperUser_linkStatus_idx" ON "DeveloperUser"("linkStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperLinkRequest_developerUserId_status_idx" ON "DeveloperLinkRequest"("developerUserId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperLinkRequest_resolvedUserId_idx" ON "DeveloperLinkRequest"("resolvedUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperLinkRequest_expiresAt_idx" ON "DeveloperLinkRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeveloperApp_clientId_key" ON "DeveloperApp"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperApp_ownerUserId_status_idx" ON "DeveloperApp"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperApp_developerUserId_status_idx" ON "DeveloperApp"("developerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DeveloperAppRedirectUri_appId_uri_key" ON "DeveloperAppRedirectUri"("appId", "uri");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperAppRedirectUri_appId_isActive_idx" ON "DeveloperAppRedirectUri"("appId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAuthorizationCode_codeHash_key" ON "OAuthAuthorizationCode"("codeHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthAuthorizationCode_appId_userId_idx" ON "OAuthAuthorizationCode"("appId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthToken_accessTokenHash_key" ON "OAuthToken"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthToken_refreshTokenHash_key" ON "OAuthToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthToken_appId_userId_idx" ON "OAuthToken"("appId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthToken_accessTokenExpiresAt_idx" ON "OAuthToken"("accessTokenExpiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthToken_refreshTokenExpiresAt_idx" ON "OAuthToken"("refreshTokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthConsent_appId_userId_key" ON "OAuthConsent"("appId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperAuditLog_developerUserId_createdAt_idx" ON "DeveloperAuditLog"("developerUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperAuditLog_appId_createdAt_idx" ON "DeveloperAuditLog"("appId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeveloperAuditLog_action_createdAt_idx" ON "DeveloperAuditLog"("action", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperUser"
    ADD CONSTRAINT "DeveloperUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperLinkRequest"
    ADD CONSTRAINT "DeveloperLinkRequest_developerUserId_fkey"
    FOREIGN KEY ("developerUserId") REFERENCES "DeveloperUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperApp"
    ADD CONSTRAINT "DeveloperApp_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperApp"
    ADD CONSTRAINT "DeveloperApp_developerUserId_fkey"
    FOREIGN KEY ("developerUserId") REFERENCES "DeveloperUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperAppRedirectUri"
    ADD CONSTRAINT "DeveloperAppRedirectUri_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OAuthAuthorizationCode"
    ADD CONSTRAINT "OAuthAuthorizationCode_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OAuthToken"
    ADD CONSTRAINT "OAuthToken_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OAuthConsent"
    ADD CONSTRAINT "OAuthConsent_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperAuditLog"
    ADD CONSTRAINT "DeveloperAuditLog_developerUserId_fkey"
    FOREIGN KEY ("developerUserId") REFERENCES "DeveloperUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DeveloperAuditLog"
    ADD CONSTRAINT "DeveloperAuditLog_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
