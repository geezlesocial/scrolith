
-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "project_code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthly_budget" DOUBLE PRECISION,
    "quarterly_budget" DOUBLE PRECISION,
    "spend_cap" DOUBLE PRECISION,
    "approval_threshold" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetRule" (
    "id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "department" TEXT,
    "project_code" TEXT,
    "interval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "limit_amount" DOUBLE PRECISION NOT NULL,
    "alert_threshold_percent" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "hard_stop" BOOLEAN NOT NULL DEFAULT true,
    "approval_threshold" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "requester_user_id" TEXT,
    "requester_staff_id" TEXT,
    "cost_center_id" TEXT,
    "department" TEXT,
    "project_code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entity_type" TEXT NOT NULL DEFAULT 'generic',
    "entity_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "budget_status" TEXT NOT NULL DEFAULT 'WITHIN_BUDGET',
    "finance_status" TEXT NOT NULL DEFAULT 'PENDING',
    "approval_threshold_amount" DOUBLE PRECISION,
    "spend_cap_at_request" DOUBLE PRECISION,
    "required_by" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseApproval" (
    "id" TEXT NOT NULL,
    "purchase_request_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_staff_id" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "purchase_request_id" TEXT,
    "vendor_user_id" TEXT,
    "supplier_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "total_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "external_ref" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendAuthorization" (
    "id" TEXT NOT NULL,
    "authorization_number" TEXT NOT NULL,
    "purchase_request_id" TEXT,
    "approved_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "approved_by_staff_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRecord" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "purchase_request_id" TEXT,
    "purchase_order_id" TEXT,
    "contract_id" TEXT,
    "order_id" TEXT,
    "escrow_id" TEXT,
    "transaction_id" TEXT,
    "seller_user_id" TEXT,
    "buyer_user_id" TEXT,
    "cost_center_id" TEXT,
    "invoice_type" TEXT NOT NULL DEFAULT 'PLATFORM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reconciliation_status" TEXT NOT NULL DEFAULT 'PENDING',
    "department" TEXT,
    "project_code" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tax_id" TEXT,
    "vat_number" TEXT,
    "gst_number" TEXT,
    "billing_period_start" TIMESTAMP(3),
    "billing_period_end" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "reconciled_at" TIMESTAMP(3),
    "document_payload" JSONB,
    "split_breakdown" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "department" TEXT,
    "project_code" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "metadata" JSONB,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCase" (
    "id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "case_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "subject_user_id" TEXT,
    "assigned_staff_id" TEXT,
    "risk_score" DOUBLE PRECISION,
    "hold_state" TEXT NOT NULL DEFAULT 'NONE',
    "sla_due_at" TIMESTAMP(3),
    "summary" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvidence" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "file_url" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDecisionLog" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_staff_id" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAppeal" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "requester_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "statement" TEXT NOT NULL,
    "resolution_note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SHADOW',
    "threshold" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskScoreSnapshot" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "subject_user_id" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL,
    "signals" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldAction" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "hold_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "released_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentPool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentPoolMember" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "membership_type" TEXT NOT NULL DEFAULT 'APPROVED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invited_by_staff_id" TEXT,
    "tags" JSONB,
    "scorecard" JSONB,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentPoolMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateOpportunityAccess" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "visibility_scope" TEXT NOT NULL DEFAULT 'POOL_ONLY',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateOpportunityAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRequirement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required_documents" JSONB,
    "required_kyc_tier" TEXT,
    "required_compliance_checks" JSONB,
    "require_contract_acceptance" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEndpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "target_url" TEXT,
    "event_types" JSONB,
    "secret_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "retry_policy" JSONB,
    "dead_letter_enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDeliveryLog" (
    "id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTaskOutput" (
    "id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "actor_user_id" TEXT,
    "actor_staff_id" TEXT,
    "prompt_version" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "explanation" TEXT,
    "output" JSONB,
    "human_override_state" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTaskOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "coordinator_staff_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sla_status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "risk_level" TEXT NOT NULL DEFAULT 'LOW',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedMilestone" (
    "id" TEXT NOT NULL,
    "managed_project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "due_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "qa_status" TEXT NOT NULL DEFAULT 'PENDING',
    "risk_flag" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedAssignment" (
    "id" TEXT NOT NULL,
    "managed_project_id" TEXT NOT NULL,
    "assignee_staff_id" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedEscalationRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "threshold" JSONB,
    "target_role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedEscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE INDEX "CostCenter_department_project_code_idx" ON "CostCenter"("department", "project_code");

-- CreateIndex
CREATE INDEX "CostCenter_is_active_created_at_idx" ON "CostCenter"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "BudgetRule_cost_center_id_idx" ON "BudgetRule"("cost_center_id");

-- CreateIndex
CREATE INDEX "BudgetRule_department_project_code_idx" ON "BudgetRule"("department", "project_code");

-- CreateIndex
CREATE INDEX "BudgetRule_interval_is_active_idx" ON "BudgetRule"("interval", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_request_number_key" ON "PurchaseRequest"("request_number");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requester_user_id_created_at_idx" ON "PurchaseRequest"("requester_user_id", "created_at");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requester_staff_id_created_at_idx" ON "PurchaseRequest"("requester_staff_id", "created_at");

-- CreateIndex
CREATE INDEX "PurchaseRequest_cost_center_id_created_at_idx" ON "PurchaseRequest"("cost_center_id", "created_at");

-- CreateIndex
CREATE INDEX "PurchaseRequest_department_project_code_idx" ON "PurchaseRequest"("department", "project_code");

-- CreateIndex
CREATE INDEX "PurchaseRequest_entity_type_entity_id_idx" ON "PurchaseRequest"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_finance_status_idx" ON "PurchaseRequest"("status", "finance_status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseApproval_idempotency_key_key" ON "PurchaseApproval"("idempotency_key");

-- CreateIndex
CREATE INDEX "PurchaseApproval_purchase_request_id_created_at_idx" ON "PurchaseApproval"("purchase_request_id", "created_at");

-- CreateIndex
CREATE INDEX "PurchaseApproval_action_created_at_idx" ON "PurchaseApproval"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_po_number_key" ON "PurchaseOrder"("po_number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_purchase_request_id_idx" ON "PurchaseOrder"("purchase_request_id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendor_user_id_issued_at_idx" ON "PurchaseOrder"("vendor_user_id", "issued_at");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_issued_at_idx" ON "PurchaseOrder"("status", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "SpendAuthorization_authorization_number_key" ON "SpendAuthorization"("authorization_number");

-- CreateIndex
CREATE INDEX "SpendAuthorization_purchase_request_id_idx" ON "SpendAuthorization"("purchase_request_id");

-- CreateIndex
CREATE INDEX "SpendAuthorization_status_expires_at_idx" ON "SpendAuthorization"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRecord_invoice_number_key" ON "InvoiceRecord"("invoice_number");

-- CreateIndex
CREATE INDEX "InvoiceRecord_purchase_request_id_idx" ON "InvoiceRecord"("purchase_request_id");

-- CreateIndex
CREATE INDEX "InvoiceRecord_purchase_order_id_idx" ON "InvoiceRecord"("purchase_order_id");

-- CreateIndex
CREATE INDEX "InvoiceRecord_cost_center_id_created_at_idx" ON "InvoiceRecord"("cost_center_id", "created_at");

-- CreateIndex
CREATE INDEX "InvoiceRecord_department_project_code_idx" ON "InvoiceRecord"("department", "project_code");

-- CreateIndex
CREATE INDEX "InvoiceRecord_invoice_type_status_idx" ON "InvoiceRecord"("invoice_type", "status");

-- CreateIndex
CREATE INDEX "InvoiceRecord_reconciliation_status_created_at_idx" ON "InvoiceRecord"("reconciliation_status", "created_at");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoice_id_created_at_idx" ON "InvoiceLineItem"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_department_project_code_idx" ON "InvoiceLineItem"("department", "project_code");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_credit_note_number_key" ON "CreditNote"("credit_note_number");

-- CreateIndex
CREATE INDEX "CreditNote_invoice_id_issued_at_idx" ON "CreditNote"("invoice_id", "issued_at");

-- CreateIndex
CREATE INDEX "CreditNote_status_issued_at_idx" ON "CreditNote"("status", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCase_case_number_key" ON "ComplianceCase"("case_number");

-- CreateIndex
CREATE INDEX "ComplianceCase_case_type_status_idx" ON "ComplianceCase"("case_type", "status");

-- CreateIndex
CREATE INDEX "ComplianceCase_entity_type_entity_id_idx" ON "ComplianceCase"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ComplianceCase_subject_user_id_created_at_idx" ON "ComplianceCase"("subject_user_id", "created_at");

-- CreateIndex
CREATE INDEX "ComplianceCase_assigned_staff_id_status_idx" ON "ComplianceCase"("assigned_staff_id", "status");

-- CreateIndex
CREATE INDEX "ComplianceEvidence_case_id_created_at_idx" ON "ComplianceEvidence"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "ComplianceDecisionLog_case_id_created_at_idx" ON "ComplianceDecisionLog"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "ComplianceDecisionLog_action_created_at_idx" ON "ComplianceDecisionLog"("action", "created_at");

-- CreateIndex
CREATE INDEX "ComplianceAppeal_case_id_status_idx" ON "ComplianceAppeal"("case_id", "status");

-- CreateIndex
CREATE INDEX "ComplianceAppeal_requester_user_id_created_at_idx" ON "ComplianceAppeal"("requester_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "RiskRule_code_key" ON "RiskRule"("code");

-- CreateIndex
CREATE INDEX "RiskRule_entity_type_is_active_idx" ON "RiskRule"("entity_type", "is_active");

-- CreateIndex
CREATE INDEX "RiskRule_signal_type_mode_idx" ON "RiskRule"("signal_type", "mode");

-- CreateIndex
CREATE INDEX "RiskScoreSnapshot_entity_type_entity_id_created_at_idx" ON "RiskScoreSnapshot"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "RiskScoreSnapshot_subject_user_id_created_at_idx" ON "RiskScoreSnapshot"("subject_user_id", "created_at");

-- CreateIndex
CREATE INDEX "RiskScoreSnapshot_level_created_at_idx" ON "RiskScoreSnapshot"("level", "created_at");

-- CreateIndex
CREATE INDEX "HoldAction_case_id_idx" ON "HoldAction"("case_id");

-- CreateIndex
CREATE INDEX "HoldAction_entity_type_entity_id_status_idx" ON "HoldAction"("entity_type", "entity_id", "status");

-- CreateIndex
CREATE INDEX "HoldAction_hold_type_status_idx" ON "HoldAction"("hold_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TalentPool_slug_key" ON "TalentPool"("slug");

-- CreateIndex
CREATE INDEX "TalentPool_visibility_is_active_idx" ON "TalentPool"("visibility", "is_active");

-- CreateIndex
CREATE INDEX "TalentPoolMember_pool_id_membership_type_status_idx" ON "TalentPoolMember"("pool_id", "membership_type", "status");

-- CreateIndex
CREATE INDEX "TalentPoolMember_user_id_status_idx" ON "TalentPoolMember"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TalentPoolMember_pool_id_user_id_key" ON "TalentPoolMember"("pool_id", "user_id");

-- CreateIndex
CREATE INDEX "PrivateOpportunityAccess_entity_type_entity_id_idx" ON "PrivateOpportunityAccess"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "PrivateOpportunityAccess_pool_id_visibility_scope_idx" ON "PrivateOpportunityAccess"("pool_id", "visibility_scope");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRequirement_code_key" ON "VendorRequirement"("code");

-- CreateIndex
CREATE INDEX "VendorRequirement_is_active_created_at_idx" ON "VendorRequirement"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "IntegrationEndpoint_type_status_idx" ON "IntegrationEndpoint"("type", "status");

-- CreateIndex
CREATE INDEX "WebhookDeliveryLog_endpoint_id_created_at_idx" ON "WebhookDeliveryLog"("endpoint_id", "created_at");

-- CreateIndex
CREATE INDEX "WebhookDeliveryLog_status_next_attempt_at_idx" ON "WebhookDeliveryLog"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "WebhookDeliveryLog_event_type_created_at_idx" ON "WebhookDeliveryLog"("event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_key_prefix_key" ON "ApiCredential"("key_prefix");

-- CreateIndex
CREATE INDEX "ApiCredential_status_created_at_idx" ON "ApiCredential"("status", "created_at");

-- CreateIndex
CREATE INDEX "AiTaskOutput_module_key_created_at_idx" ON "AiTaskOutput"("module_key", "created_at");

-- CreateIndex
CREATE INDEX "AiTaskOutput_entity_type_entity_id_idx" ON "AiTaskOutput"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "AiTaskOutput_human_override_state_created_at_idx" ON "AiTaskOutput"("human_override_state", "created_at");

-- CreateIndex
CREATE INDEX "ManagedProject_entity_type_entity_id_idx" ON "ManagedProject"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ManagedProject_coordinator_staff_id_status_idx" ON "ManagedProject"("coordinator_staff_id", "status");

-- CreateIndex
CREATE INDEX "ManagedMilestone_managed_project_id_status_idx" ON "ManagedMilestone"("managed_project_id", "status");

-- CreateIndex
CREATE INDEX "ManagedMilestone_due_at_qa_status_idx" ON "ManagedMilestone"("due_at", "qa_status");

-- CreateIndex
CREATE INDEX "ManagedAssignment_managed_project_id_status_idx" ON "ManagedAssignment"("managed_project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedEscalationRule_code_key" ON "ManagedEscalationRule"("code");

-- CreateIndex
CREATE INDEX "ManagedEscalationRule_trigger_type_is_active_idx" ON "ManagedEscalationRule"("trigger_type", "is_active");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "BudgetRule" ADD CONSTRAINT "BudgetRule_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseApproval" ADD CONSTRAINT "PurchaseApproval_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendAuthorization" ADD CONSTRAINT "SpendAuthorization_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "InvoiceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "InvoiceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ComplianceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDecisionLog" ADD CONSTRAINT "ComplianceDecisionLog_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ComplianceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAppeal" ADD CONSTRAINT "ComplianceAppeal_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ComplianceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldAction" ADD CONSTRAINT "HoldAction_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ComplianceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPoolMember" ADD CONSTRAINT "TalentPoolMember_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "TalentPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateOpportunityAccess" ADD CONSTRAINT "PrivateOpportunityAccess_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "TalentPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryLog" ADD CONSTRAINT "WebhookDeliveryLog_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "IntegrationEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedMilestone" ADD CONSTRAINT "ManagedMilestone_managed_project_id_fkey" FOREIGN KEY ("managed_project_id") REFERENCES "ManagedProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedAssignment" ADD CONSTRAINT "ManagedAssignment_managed_project_id_fkey" FOREIGN KEY ("managed_project_id") REFERENCES "ManagedProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;



