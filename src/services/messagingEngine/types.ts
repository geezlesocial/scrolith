/**
 * Enterprise messaging engine types (Phase 5.3).
 * Shared event vocabulary for dock, header, /messages, and mobile.
 */

export type MessagingDeliveryState =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'retry';

export type MessagingPresenceState = 'online' | 'offline' | 'away' | 'idle';

export type MessagingEngineEventType =
  | 'MESSAGE_CREATED'
  | 'MESSAGE_UPDATED'
  | 'MESSAGE_DELETED'
  | 'MESSAGE_REACTION'
  | 'MESSAGE_READ'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_FAILED'
  | 'MESSAGE_RETRY'
  | 'CONVERSATION_UPDATED'
  | 'CONVERSATION_CREATED'
  | 'CONVERSATION_DELETED'
  | 'USER_TYPING'
  | 'USER_STOPPED_TYPING'
  | 'USER_ONLINE'
  | 'USER_OFFLINE'
  | 'UPLOAD_PROGRESS'
  | 'UPLOAD_COMPLETED'
  | 'VOICE_UPLOADED'
  | 'ATTACHMENT_READY'
  | 'NOTIFICATION_READ'
  | 'UNREAD_CHANGED'
  | 'SYNC_STATE'
  | 'SOCKET_HEALTH'
  | 'TAB_SYNC'
  | 'MISSED_EVENTS_RECOVERY';

export type MessagingEngineEvent<T = unknown> = {
  type: MessagingEngineEventType;
  payload: T;
  conversationId?: string;
  messageId?: string;
  clientSendId?: string;
  sequence?: number;
  timestamp: number;
  source: 'socket' | 'api' | 'local' | 'tab' | 'recovery' | 'system';
};

export type OutgoingDeliveryRecord = {
  clientSendId: string;
  conversationId: string;
  serverMessageId?: string;
  state: MessagingDeliveryState;
  text: string;
  attachmentIds: string[];
  replyToMessageId?: string | null;
  createdAt: number;
  updatedAt: number;
  ackAt?: number;
  retryCount: number;
  lastError?: string;
  sequence: number;
};

export type SocketHealthSnapshot = {
  connected: boolean;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  lastHeartbeatAt: number | null;
  reconnectCount: number;
  lastError: string | null;
  latencyMs: number | null;
};

export type MultiTabEnvelope = {
  channel: 'scrolith-messaging-v1';
  type: MessagingEngineEventType | 'DRAFT_CHANGED' | 'UNREAD_SNAPSHOT' | 'PING';
  payload: unknown;
  originTabId: string;
  timestamp: number;
};
