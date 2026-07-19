-- Phase 22.1 — Additive clientMessageId for idempotent message sends.
-- Safe: nullable column; unique (senderId, clientMessageId) allows many legacy NULL rows in PostgreSQL.

ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DirectMessage_senderId_clientMessageId_key"
  ON "DirectMessage"("senderId", "clientMessageId");

CREATE INDEX IF NOT EXISTS "DirectMessage_clientMessageId_idx"
  ON "DirectMessage"("clientMessageId");
