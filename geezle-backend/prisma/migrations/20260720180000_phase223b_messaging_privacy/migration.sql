-- Phase 22.3B — Messaging privacy controls (additive only; defaults preserve current behavior)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenVisibility" TEXT DEFAULT 'EVERYONE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "readReceiptsEnabled" BOOLEAN DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "typingIndicatorsEnabled" BOOLEAN DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "recordingIndicatorsEnabled" BOOLEAN DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "directMessageAudience" TEXT DEFAULT 'EVERYONE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "groupInviteAudience" TEXT DEFAULT 'EVERYONE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationMessagePreviewEnabled" BOOLEAN DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "messagingPrivacyUpdatedAt" TIMESTAMP(3);

-- Ensure presenceVisibility remains (from 22.3); no rename — app maps it to onlineStatusVisibility
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "presenceVisibility" TEXT DEFAULT 'EVERYONE';
