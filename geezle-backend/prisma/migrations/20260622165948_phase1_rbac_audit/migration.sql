-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_staff_id" TEXT,
    "actor_role" TEXT,
    "module_key" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'success',
    "message" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'AUDIT_ONLY',
    "min_approvals" INTEGER NOT NULL DEFAULT 1,
    "is_system_policy" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB,
    "created_by_staff_id" TEXT,
    "updated_by_staff_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT,
    "module_key" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OBSERVED',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "requested_by_user_id" TEXT,
    "requested_by_staff_id" TEXT,
    "decided_by_staff_id" TEXT,
    "decision_reason" TEXT,
    "observed_only" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB,
    "metadata" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'system',
    "actor_user_id" TEXT,
    "actor_staff_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "dismissed_by_staff_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditEvent_actor_user_id_created_at_idx" ON "AdminAuditEvent"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_actor_staff_id_created_at_idx" ON "AdminAuditEvent"("actor_staff_id", "created_at");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_module_key_created_at_idx" ON "AdminAuditEvent"("module_key", "created_at");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_action_key_created_at_idx" ON "AdminAuditEvent"("action_key", "created_at");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_entity_type_entity_id_idx" ON "AdminAuditEvent"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_severity_created_at_idx" ON "AdminAuditEvent"("severity", "created_at");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_status_created_at_idx" ON "AdminAuditEvent"("status", "created_at");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_mode_is_active_idx" ON "ApprovalPolicy"("mode", "is_active");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_module_key_is_active_idx" ON "ApprovalPolicy"("module_key", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalPolicy_module_key_action_key_entity_type_key" ON "ApprovalPolicy"("module_key", "action_key", "entity_type");

-- CreateIndex
CREATE INDEX "ApprovalRequest_policy_id_idx" ON "ApprovalRequest"("policy_id");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_created_at_idx" ON "ApprovalRequest"("status", "created_at");

-- CreateIndex
CREATE INDEX "ApprovalRequest_module_key_created_at_idx" ON "ApprovalRequest"("module_key", "created_at");

-- CreateIndex
CREATE INDEX "ApprovalRequest_action_key_created_at_idx" ON "ApprovalRequest"("action_key", "created_at");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entity_type_entity_id_idx" ON "ApprovalRequest"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requested_by_user_id_created_at_idx" ON "ApprovalRequest"("requested_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requested_by_staff_id_created_at_idx" ON "ApprovalRequest"("requested_by_staff_id", "created_at");

-- CreateIndex
CREATE INDEX "SecurityAlert_code_created_at_idx" ON "SecurityAlert"("code", "created_at");

-- CreateIndex
CREATE INDEX "SecurityAlert_severity_status_created_at_idx" ON "SecurityAlert"("severity", "status", "created_at");

-- CreateIndex
CREATE INDEX "SecurityAlert_actor_user_id_created_at_idx" ON "SecurityAlert"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "SecurityAlert_actor_staff_id_created_at_idx" ON "SecurityAlert"("actor_staff_id", "created_at");

-- CreateIndex
CREATE INDEX "SecurityAlert_entity_type_entity_id_idx" ON "SecurityAlert"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "ApprovalPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

