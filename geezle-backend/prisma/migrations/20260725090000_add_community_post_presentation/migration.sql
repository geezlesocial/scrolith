-- Safe additive: optional presentation JSON for Facebook-style text backgrounds.
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "presentation" JSONB;
