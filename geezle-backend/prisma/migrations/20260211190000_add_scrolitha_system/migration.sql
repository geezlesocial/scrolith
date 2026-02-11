-- Scrolitha Conversations
CREATE TABLE "scrolitha_conversation" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_role" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'user',
  "status" TEXT NOT NULL DEFAULT 'open',
  "page_context" TEXT,
  "entity_context_id" TEXT,
  "summary" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scrolitha_conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_message" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scrolitha_message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_skill" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roleScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "description" TEXT NOT NULL,
  "inputs_schema" JSONB NOT NULL,
  "steps_schema" JSONB NOT NULL,
  "success_criteria" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scrolitha_skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_action_plan" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_role" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'user',
  "action_key" TEXT NOT NULL,
  "tool_key" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
  "confirmation_status" TEXT NOT NULL DEFAULT 'not_required',
  "status" TEXT NOT NULL DEFAULT 'planned',
  "params_preview" JSONB,
  "params_redacted" JSONB,
  "result_payload" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scrolitha_action_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_audit_log" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "actor_scope" TEXT NOT NULL,
  "conversation_id" TEXT,
  "action_plan_id" TEXT,
  "event_type" TEXT NOT NULL,
  "intent" TEXT,
  "tool_key" TEXT,
  "request_payload" JSONB,
  "redacted_payload" JSONB,
  "result_status" TEXT NOT NULL DEFAULT 'ok',
  "result_summary" TEXT,
  "confirmation_status" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scrolitha_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_config" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "safe_mode" BOOLEAN NOT NULL DEFAULT false,
  "require_confirmation_by_default" BOOLEAN NOT NULL DEFAULT true,
  "low_risk_auto_execute" BOOLEAN NOT NULL DEFAULT false,
  "deny_listed_tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "prompt_blocklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "user_rate_limit_per_minute" INTEGER NOT NULL DEFAULT 30,
  "admin_action_cap_per_minute" INTEGER NOT NULL DEFAULT 10,
  "metadata" JSONB,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scrolitha_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_user_preference" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "quick_actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "troubleshooting_mode" TEXT NOT NULL DEFAULT 'standard',
  "assistant_tone" TEXT NOT NULL DEFAULT 'concise',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scrolitha_user_preference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scrolitha_feedback" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT,
  "rating" INTEGER NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scrolitha_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scrolitha_skill_key_key" ON "scrolitha_skill"("key");
CREATE UNIQUE INDEX "scrolitha_config_scope_key" ON "scrolitha_config"("scope");
CREATE UNIQUE INDEX "scrolitha_user_preference_user_id_key" ON "scrolitha_user_preference"("user_id");

CREATE INDEX "scrolitha_conversation_user_id_created_at_idx" ON "scrolitha_conversation"("user_id", "created_at");
CREATE INDEX "scrolitha_conversation_scope_status_created_at_idx" ON "scrolitha_conversation"("scope", "status", "created_at");

CREATE INDEX "scrolitha_message_conversation_id_created_at_idx" ON "scrolitha_message"("conversation_id", "created_at");

CREATE INDEX "scrolitha_skill_is_active_updated_at_idx" ON "scrolitha_skill"("is_active", "updated_at");

CREATE INDEX "scrolitha_action_plan_conversation_id_created_at_idx" ON "scrolitha_action_plan"("conversation_id", "created_at");
CREATE INDEX "scrolitha_action_plan_user_id_status_created_at_idx" ON "scrolitha_action_plan"("user_id", "status", "created_at");
CREATE INDEX "scrolitha_action_plan_tool_key_status_created_at_idx" ON "scrolitha_action_plan"("tool_key", "status", "created_at");

CREATE INDEX "scrolitha_audit_log_actor_id_created_at_idx" ON "scrolitha_audit_log"("actor_id", "created_at");
CREATE INDEX "scrolitha_audit_log_actor_scope_event_type_created_at_idx" ON "scrolitha_audit_log"("actor_scope", "event_type", "created_at");
CREATE INDEX "scrolitha_audit_log_conversation_id_created_at_idx" ON "scrolitha_audit_log"("conversation_id", "created_at");
CREATE INDEX "scrolitha_audit_log_action_plan_id_created_at_idx" ON "scrolitha_audit_log"("action_plan_id", "created_at");

CREATE INDEX "scrolitha_config_scope_idx" ON "scrolitha_config"("scope");
CREATE INDEX "scrolitha_user_preference_user_id_idx" ON "scrolitha_user_preference"("user_id");
CREATE INDEX "scrolitha_feedback_conversation_id_created_at_idx" ON "scrolitha_feedback"("conversation_id", "created_at");
CREATE INDEX "scrolitha_feedback_user_id_created_at_idx" ON "scrolitha_feedback"("user_id", "created_at");

ALTER TABLE "scrolitha_message"
  ADD CONSTRAINT "scrolitha_message_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "scrolitha_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scrolitha_action_plan"
  ADD CONSTRAINT "scrolitha_action_plan_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "scrolitha_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scrolitha_audit_log"
  ADD CONSTRAINT "scrolitha_audit_log_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "scrolitha_conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scrolitha_audit_log"
  ADD CONSTRAINT "scrolitha_audit_log_action_plan_id_fkey"
  FOREIGN KEY ("action_plan_id") REFERENCES "scrolitha_action_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scrolitha_feedback"
  ADD CONSTRAINT "scrolitha_feedback_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "scrolitha_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
