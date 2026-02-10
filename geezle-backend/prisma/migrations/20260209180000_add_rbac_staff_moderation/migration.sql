DO $$
BEGIN
  CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "StaffRole" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffPermission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "group_name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffRolePermission" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffUser" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT,
  "roleId" TEXT NOT NULL,
  "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false,
  "require2FA" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ModerationAuditLog" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffRole_name_key" ON "StaffRole"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffPermission_key_key" ON "StaffPermission"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffRolePermission_roleId_permissionId_key" ON "StaffRolePermission"("roleId", "permissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_userId_key" ON "StaffUser"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffUser_username_key" ON "StaffUser"("username");

CREATE INDEX IF NOT EXISTS "StaffRolePermission_roleId_idx" ON "StaffRolePermission"("roleId");
CREATE INDEX IF NOT EXISTS "StaffRolePermission_permissionId_idx" ON "StaffRolePermission"("permissionId");
CREATE INDEX IF NOT EXISTS "StaffUser_roleId_idx" ON "StaffUser"("roleId");
CREATE INDEX IF NOT EXISTS "StaffUser_status_idx" ON "StaffUser"("status");
CREATE INDEX IF NOT EXISTS "StaffUser_email_idx" ON "StaffUser"("email");
CREATE INDEX IF NOT EXISTS "ModerationAuditLog_staffId_idx" ON "ModerationAuditLog"("staffId");
CREATE INDEX IF NOT EXISTS "ModerationAuditLog_action_idx" ON "ModerationAuditLog"("action");
CREATE INDEX IF NOT EXISTS "ModerationAuditLog_targetType_idx" ON "ModerationAuditLog"("targetType");
CREATE INDEX IF NOT EXISTS "ModerationAuditLog_createdAt_idx" ON "ModerationAuditLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffRolePermission_roleId_fkey'
  ) THEN
    ALTER TABLE "StaffRolePermission"
      ADD CONSTRAINT "StaffRolePermission_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffRolePermission_permissionId_fkey'
  ) THEN
    ALTER TABLE "StaffRolePermission"
      ADD CONSTRAINT "StaffRolePermission_permissionId_fkey"
      FOREIGN KEY ("permissionId") REFERENCES "StaffPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffUser_userId_fkey'
  ) THEN
    ALTER TABLE "StaffUser"
      ADD CONSTRAINT "StaffUser_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffUser_roleId_fkey'
  ) THEN
    ALTER TABLE "StaffUser"
      ADD CONSTRAINT "StaffUser_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModerationAuditLog_staffId_fkey'
  ) THEN
    ALTER TABLE "ModerationAuditLog"
      ADD CONSTRAINT "ModerationAuditLog_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
