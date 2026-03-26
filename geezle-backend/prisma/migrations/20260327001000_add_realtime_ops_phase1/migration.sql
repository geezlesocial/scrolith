-- Phase 1 control plane: Realtime Ops Center foundation

CREATE TABLE "SocketSession" (
  "id" TEXT NOT NULL,
  "socketId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "userId" TEXT,
  "role" TEXT,
  "transport" TEXT,
  "authSource" TEXT,
  "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
  "rooms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "handshakeQuery" JSONB,
  "metadata" JSONB,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnectedAt" TIMESTAMP(3),
  "disconnectReason" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SocketSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresenceLease" (
  "id" TEXT NOT NULL,
  "socketId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "rooms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PresenceLease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventDelivery" (
  "id" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "roomKey" TEXT,
  "eventName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "targetCount" INTEGER NOT NULL DEFAULT 0,
  "triggeredBy" TEXT NOT NULL DEFAULT 'system',
  "triggeredByStaffId" TEXT,
  "deliveryKey" TEXT,
  "payload" JSONB,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replayedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtimeIncident" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'ERROR',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "source" TEXT NOT NULL DEFAULT 'socket',
  "message" TEXT NOT NULL,
  "notes" TEXT,
  "details" JSONB,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RealtimeIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryReplayJob" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "roomKey" TEXT,
  "eventName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "payload" JSONB,
  "result" JSONB,
  "createdByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "DeliveryReplayJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocketSession_socketId_key" ON "SocketSession"("socketId");
CREATE INDEX "SocketSession_namespace_connectedAt_idx" ON "SocketSession"("namespace", "connectedAt");
CREATE INDEX "SocketSession_userId_connectedAt_idx" ON "SocketSession"("userId", "connectedAt");
CREATE INDEX "SocketSession_isAuthenticated_connectedAt_idx" ON "SocketSession"("isAuthenticated", "connectedAt");
CREATE INDEX "SocketSession_disconnectedAt_connectedAt_idx" ON "SocketSession"("disconnectedAt", "connectedAt");

CREATE UNIQUE INDEX "PresenceLease_socketId_key" ON "PresenceLease"("socketId");
CREATE INDEX "PresenceLease_userId_status_lastSeenAt_idx" ON "PresenceLease"("userId", "status", "lastSeenAt");
CREATE INDEX "PresenceLease_namespace_status_lastSeenAt_idx" ON "PresenceLease"("namespace", "status", "lastSeenAt");
CREATE INDEX "PresenceLease_releasedAt_idx" ON "PresenceLease"("releasedAt");

CREATE INDEX "EventDelivery_namespace_occurredAt_idx" ON "EventDelivery"("namespace", "occurredAt");
CREATE INDEX "EventDelivery_eventName_occurredAt_idx" ON "EventDelivery"("eventName", "occurredAt");
CREATE INDEX "EventDelivery_roomKey_occurredAt_idx" ON "EventDelivery"("roomKey", "occurredAt");
CREATE INDEX "EventDelivery_status_occurredAt_idx" ON "EventDelivery"("status", "occurredAt");
CREATE INDEX "EventDelivery_triggeredByStaffId_occurredAt_idx" ON "EventDelivery"("triggeredByStaffId", "occurredAt");

CREATE INDEX "RealtimeIncident_status_lastSeenAt_idx" ON "RealtimeIncident"("status", "lastSeenAt");
CREATE INDEX "RealtimeIncident_source_status_lastSeenAt_idx" ON "RealtimeIncident"("source", "status", "lastSeenAt");
CREATE INDEX "RealtimeIncident_severity_status_lastSeenAt_idx" ON "RealtimeIncident"("severity", "status", "lastSeenAt");
CREATE INDEX "RealtimeIncident_resolvedByStaffId_resolvedAt_idx" ON "RealtimeIncident"("resolvedByStaffId", "resolvedAt");

CREATE INDEX "DeliveryReplayJob_deliveryId_createdAt_idx" ON "DeliveryReplayJob"("deliveryId", "createdAt");
CREATE INDEX "DeliveryReplayJob_status_createdAt_idx" ON "DeliveryReplayJob"("status", "createdAt");
CREATE INDEX "DeliveryReplayJob_createdByStaffId_createdAt_idx" ON "DeliveryReplayJob"("createdByStaffId", "createdAt");

ALTER TABLE "DeliveryReplayJob"
  ADD CONSTRAINT "DeliveryReplayJob_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "EventDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
