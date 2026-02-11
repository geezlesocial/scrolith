-- Create recommendation configuration table
CREATE TABLE "reco_config" (
  "id" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'hybrid',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "weights" JSONB NOT NULL,
  "gating" JSONB NOT NULL,
  "penalties" JSONB NOT NULL,
  "diversity" JSONB NOT NULL,
  "cold_start" JSONB NOT NULL,
  "notes" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reco_config_pkey" PRIMARY KEY ("id")
);

-- Create manual recommendation rules table
CREATE TABLE "reco_manual_rule" (
  "id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL DEFAULT '*',
  "action" TEXT NOT NULL,
  "value" DOUBLE PRECISION,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "surface" TEXT NOT NULL DEFAULT '*',
  "start_at" TIMESTAMP(3),
  "end_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "note" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reco_manual_rule_pkey" PRIMARY KEY ("id")
);

-- Create recommendation impression aggregate table
CREATE TABLE "reco_impression_log" (
  "id" TEXT NOT NULL,
  "viewer_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "shown_at_day" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reco_impression_log_pkey" PRIMARY KEY ("id")
);

-- Create recommendation feedback events table
CREATE TABLE "reco_feedback_log" (
  "id" TEXT NOT NULL,
  "viewer_id" TEXT,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reco_feedback_log_pkey" PRIMARY KEY ("id")
);

-- Unique and lookup indexes
CREATE UNIQUE INDEX "reco_config_surface_entity_type_key" ON "reco_config"("surface", "entity_type");
CREATE INDEX "reco_config_surface_idx" ON "reco_config"("surface");
CREATE INDEX "reco_config_entity_type_idx" ON "reco_config"("entity_type");

CREATE INDEX "reco_manual_rule_entity_type_entity_id_idx" ON "reco_manual_rule"("entity_type", "entity_id");
CREATE INDEX "reco_manual_rule_surface_is_active_idx" ON "reco_manual_rule"("surface", "is_active");
CREATE INDEX "reco_manual_rule_start_at_end_at_idx" ON "reco_manual_rule"("start_at", "end_at");

CREATE UNIQUE INDEX "reco_impression_log_unique_key" ON "reco_impression_log"("viewer_id", "entity_type", "entity_id", "surface", "shown_at_day");
CREATE INDEX "reco_impression_log_entity_surface_day_idx" ON "reco_impression_log"("entity_type", "entity_id", "surface", "shown_at_day");
CREATE INDEX "reco_impression_log_viewer_day_idx" ON "reco_impression_log"("viewer_id", "shown_at_day");

CREATE INDEX "reco_feedback_log_entity_surface_action_created_at_idx" ON "reco_feedback_log"("entity_type", "entity_id", "surface", "action", "created_at");
CREATE INDEX "reco_feedback_log_viewer_created_at_idx" ON "reco_feedback_log"("viewer_id", "created_at");