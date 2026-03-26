-- Phase 2 Discovery Studio foundations

CREATE TABLE "search_ranking_rule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'all',
  "target_type" TEXT NOT NULL DEFAULT 'all',
  "target_id" TEXT,
  "query_pattern" TEXT,
  "action" TEXT NOT NULL,
  "value" DOUBLE PRECISION DEFAULT 1,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_staff_id" TEXT,
  "updated_by_staff_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "search_ranking_rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feed_recipe" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "mode" TEXT NOT NULL,
  "weights" JSONB NOT NULL,
  "query_take_multiplier" INTEGER NOT NULL DEFAULT 4,
  "query_take_cap" INTEGER NOT NULL DEFAULT 120,
  "is_system_recipe" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_staff_id" TEXT,
  "updated_by_staff_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "feed_recipe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_ranking_rule_key_key" ON "search_ranking_rule"("key");
CREATE INDEX "search_ranking_rule_scope_is_active_priority_idx" ON "search_ranking_rule"("scope", "is_active", "priority");
CREATE INDEX "search_ranking_rule_target_type_target_id_idx" ON "search_ranking_rule"("target_type", "target_id");
CREATE INDEX "search_ranking_rule_query_pattern_idx" ON "search_ranking_rule"("query_pattern");

CREATE UNIQUE INDEX "feed_recipe_key_key" ON "feed_recipe"("key");
CREATE UNIQUE INDEX "feed_recipe_mode_key" ON "feed_recipe"("mode");
CREATE INDEX "feed_recipe_is_active_mode_idx" ON "feed_recipe"("is_active", "mode");
