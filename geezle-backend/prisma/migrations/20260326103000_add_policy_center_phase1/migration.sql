-- Phase 1 control plane: Policy Center foundation

CREATE TABLE "PolicyNamespace" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isSystemNamespace" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyNamespace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PolicyResource" (
    "id" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "resourceId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "permissionKey" TEXT NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'ALLOW',
    "conditions" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isSystemRule" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT,
    "updatedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "effect" TEXT NOT NULL DEFAULT 'ALLOW',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT,
    "updatedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PermissionDecisionLog" (
    "id" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "staffUserId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "decision" TEXT NOT NULL,
    "source" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionDecisionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyNamespace_key_key" ON "PolicyNamespace"("key");
CREATE INDEX "PolicyNamespace_isActive_idx" ON "PolicyNamespace"("isActive");

CREATE UNIQUE INDEX "PolicyResource_namespaceId_key_key" ON "PolicyResource"("namespaceId", "key");
CREATE INDEX "PolicyResource_namespaceId_isActive_idx" ON "PolicyResource"("namespaceId", "isActive");

CREATE UNIQUE INDEX "PolicyRule_key_key" ON "PolicyRule"("key");
CREATE INDEX "PolicyRule_namespaceId_isActive_idx" ON "PolicyRule"("namespaceId", "isActive");
CREATE INDEX "PolicyRule_resourceId_isActive_idx" ON "PolicyRule"("resourceId", "isActive");
CREATE INDEX "PolicyRule_permissionKey_isActive_idx" ON "PolicyRule"("permissionKey", "isActive");
CREATE INDEX "PolicyRule_priority_createdAt_idx" ON "PolicyRule"("priority", "createdAt");

CREATE INDEX "UserPermissionOverride_userId_isActive_idx" ON "UserPermissionOverride"("userId", "isActive");
CREATE INDEX "UserPermissionOverride_permissionKey_isActive_idx" ON "UserPermissionOverride"("permissionKey", "isActive");
CREATE INDEX "UserPermissionOverride_resourceType_resourceId_idx" ON "UserPermissionOverride"("resourceType", "resourceId");
CREATE INDEX "UserPermissionOverride_expiresAt_idx" ON "UserPermissionOverride"("expiresAt");

CREATE INDEX "PermissionDecisionLog_permissionKey_createdAt_idx" ON "PermissionDecisionLog"("permissionKey", "createdAt");
CREATE INDEX "PermissionDecisionLog_subjectUserId_createdAt_idx" ON "PermissionDecisionLog"("subjectUserId", "createdAt");
CREATE INDEX "PermissionDecisionLog_staffUserId_createdAt_idx" ON "PermissionDecisionLog"("staffUserId", "createdAt");
CREATE INDEX "PermissionDecisionLog_resourceType_resourceId_createdAt_idx" ON "PermissionDecisionLog"("resourceType", "resourceId", "createdAt");

ALTER TABLE "PolicyResource"
    ADD CONSTRAINT "PolicyResource_namespaceId_fkey"
    FOREIGN KEY ("namespaceId") REFERENCES "PolicyNamespace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyRule"
    ADD CONSTRAINT "PolicyRule_namespaceId_fkey"
    FOREIGN KEY ("namespaceId") REFERENCES "PolicyNamespace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyRule"
    ADD CONSTRAINT "PolicyRule_resourceId_fkey"
    FOREIGN KEY ("resourceId") REFERENCES "PolicyResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
