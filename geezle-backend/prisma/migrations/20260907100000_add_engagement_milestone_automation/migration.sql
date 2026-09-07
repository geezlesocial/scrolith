-- Phase 1: durable admin-controlled engagement milestone automation.
CREATE TABLE "engagement_notification_rule" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "thresholds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    "frequency_window_seconds" INTEGER NOT NULL DEFAULT 86400,
    "max_notifications_per_window" INTEGER NOT NULL DEFAULT 1,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "ai_assistance_enabled" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT 'engagement',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "template_key" TEXT,
    "title_template" TEXT,
    "body_template" TEXT,
    "deep_link_template" TEXT,
    "metadata" JSONB,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "engagement_notification_rule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "engagement_notification_rule_event_type_name_key"
  ON "engagement_notification_rule"("event_type", "name");
CREATE INDEX "engagement_notification_rule_event_type_is_enabled_idx"
  ON "engagement_notification_rule"("event_type", "is_enabled");
CREATE INDEX "engagement_notification_rule_is_enabled_updated_at_idx"
  ON "engagement_notification_rule"("is_enabled", "updated_at");

CREATE TABLE "engagement_signal" (
    "id" TEXT NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "aggregate_count" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "engagement_signal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "engagement_signal_source_event_id_key"
  ON "engagement_signal"("source_event_id");
CREATE INDEX "engagement_signal_event_lookup_idx"
  ON "engagement_signal"("event_type", "entity_type", "entity_id", "occurred_at");
CREATE INDEX "engagement_signal_owner_lookup_idx"
  ON "engagement_signal"("owner_id", "event_type", "occurred_at");

CREATE TABLE "engagement_milestone_state" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "notification_id" TEXT,
    "suppressed_reason" TEXT,
    "emitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "engagement_milestone_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "engagement_milestone_state_claim_key"
  ON "engagement_milestone_state"("rule_id", "entity_type", "entity_id", "owner_id", "threshold");
CREATE INDEX "engagement_milestone_state_owner_lookup_idx"
  ON "engagement_milestone_state"("owner_id", "event_type", "created_at");
CREATE INDEX "engagement_milestone_state_status_lookup_idx"
  ON "engagement_milestone_state"("status", "created_at");

-- Safe defaults: every approved event type is visible to admins but disabled
-- and at 0% rollout until explicitly activated.
INSERT INTO "engagement_notification_rule"
  ("id", "event_type", "name", "thresholds", "updated_at")
VALUES
  ('eng_rule_post_impression', 'engagement.post.impression', 'Post impression milestones', ARRAY[50,100,250,500,1000], CURRENT_TIMESTAMP),
  ('eng_rule_profile_search', 'engagement.profile.search_appearance', 'Profile search appearance milestones', ARRAY[40,100,250,500,1000], CURRENT_TIMESTAMP),
  ('eng_rule_listing_impression', 'engagement.marketplace.listing.impression', 'Marketplace listing impression milestones', ARRAY[50,100,250,500,1000], CURRENT_TIMESTAMP),
  ('eng_rule_scroll_impression', 'engagement.scroll.impression', 'Scroll impression milestones', ARRAY[50,100,250,500,1000], CURRENT_TIMESTAMP),
  ('eng_rule_profile_view', 'engagement.profile.direct_view', 'Profile direct-view milestones', ARRAY[25,50,100,250,500], CURRENT_TIMESTAMP),
  ('eng_rule_content_reach', 'engagement.content.reach', 'Content reach milestones', ARRAY[50,100,250,500,1000], CURRENT_TIMESTAMP),
  ('eng_rule_listing_save', 'engagement.marketplace.listing.save', 'Listing save milestones', ARRAY[5,10,25,50,100], CURRENT_TIMESTAMP),
  ('eng_rule_listing_inquiry', 'engagement.marketplace.listing.inquiry', 'Listing inquiry milestones', ARRAY[1,5,10,25,50], CURRENT_TIMESTAMP),
  ('eng_rule_opportunity', 'engagement.opportunity.qualified', 'Qualified opportunity milestones', ARRAY[1,5,10,25,50], CURRENT_TIMESTAMP)
ON CONFLICT ("event_type", "name") DO NOTHING;
