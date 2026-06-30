ALTER TABLE "CommunityPost"
ADD COLUMN "attachmentCaptions" JSONB;

ALTER TABLE "ClubJoinRequest"
ADD COLUMN "reviewNote" TEXT;
