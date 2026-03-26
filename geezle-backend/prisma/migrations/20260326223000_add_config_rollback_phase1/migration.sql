-- Phase 1 control plane: Config and Rollback foundations

CREATE TABLE "ConfigSnapshot" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'default',
  "label" TEXT,
  "payload" JSONB NOT NULL,
  "version" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'admin',
  "reason" TEXT,
  "metadata" JSONB,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConfigSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConfigChange" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'default',
  "action" TEXT NOT NULL,
  "beforeSnapshotId" TEXT,
  "afterSnapshotId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConfigChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RollbackRun" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'default',
  "targetVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "beforeSnapshotId" TEXT,
  "afterSnapshotId" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "RollbackRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseRollout" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT,
  "releaseKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "notes" TEXT,
  "metadata" JSONB,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReleaseRollout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfigSnapshot_scope_key_version_key" ON "ConfigSnapshot"("scope", "key", "version");
CREATE INDEX "ConfigSnapshot_scope_key_createdAt_idx" ON "ConfigSnapshot"("scope", "key", "createdAt");
CREATE INDEX "ConfigSnapshot_createdByStaffId_createdAt_idx" ON "ConfigSnapshot"("createdByStaffId", "createdAt");

CREATE INDEX "ConfigChange_scope_key_createdAt_idx" ON "ConfigChange"("scope", "key", "createdAt");
CREATE INDEX "ConfigChange_action_createdAt_idx" ON "ConfigChange"("action", "createdAt");
CREATE INDEX "ConfigChange_createdByStaffId_createdAt_idx" ON "ConfigChange"("createdByStaffId", "createdAt");

CREATE INDEX "RollbackRun_scope_key_createdAt_idx" ON "RollbackRun"("scope", "key", "createdAt");
CREATE INDEX "RollbackRun_status_createdAt_idx" ON "RollbackRun"("status", "createdAt");
CREATE INDEX "RollbackRun_createdByStaffId_createdAt_idx" ON "RollbackRun"("createdByStaffId", "createdAt");

CREATE INDEX "ReleaseRollout_scope_createdAt_idx" ON "ReleaseRollout"("scope", "createdAt");
CREATE INDEX "ReleaseRollout_releaseKey_createdAt_idx" ON "ReleaseRollout"("releaseKey", "createdAt");
CREATE INDEX "ReleaseRollout_createdByStaffId_createdAt_idx" ON "ReleaseRollout"("createdByStaffId", "createdAt");

ALTER TABLE "ConfigChange"
  ADD CONSTRAINT "ConfigChange_beforeSnapshotId_fkey"
  FOREIGN KEY ("beforeSnapshotId") REFERENCES "ConfigSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConfigChange"
  ADD CONSTRAINT "ConfigChange_afterSnapshotId_fkey"
  FOREIGN KEY ("afterSnapshotId") REFERENCES "ConfigSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RollbackRun"
  ADD CONSTRAINT "RollbackRun_beforeSnapshotId_fkey"
  FOREIGN KEY ("beforeSnapshotId") REFERENCES "ConfigSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RollbackRun"
  ADD CONSTRAINT "RollbackRun_afterSnapshotId_fkey"
  FOREIGN KEY ("afterSnapshotId") REFERENCES "ConfigSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
