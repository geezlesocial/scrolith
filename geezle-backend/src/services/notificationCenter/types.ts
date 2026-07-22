import type { NotificationCenterCategory, NotificationPriorityLevel } from './taxonomy';
import { NOTIFICATION_SCHEMA_VERSION } from './taxonomy';

export type NotificationEmitInput = {
  /** Explicit event id; generated if omitted */
  eventId?: string;
  /** Stable event type, e.g. messaging.message.created or legacy engagement type */
  eventType?: string;
  /** Legacy notification type (stored on Notification.type) */
  type: string;
  category?: NotificationCenterCategory | string | null;
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'service' | string | null;
  /** One or many recipients */
  recipientId?: string | null;
  recipientIds?: string[] | null;
  entityType?: string | null;
  entityId?: string | null;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  deepLink?: string | null;
  actionUrl?: string | null;
  priority?: NotificationPriorityLevel | string | null;
  idempotencyKey?: string | null;
  source?: string | null;
  correlationId?: string | null;
  schemaVersion?: string | null;
  /** Skip in-app write (push-only path) — rare */
  skipInApp?: boolean;
  /** Skip realtime/push fanout */
  skipRealtime?: boolean;
  skipPush?: boolean;
  /** Soft preference evaluation via NI when available */
  respectPreferences?: boolean;
  /** Time-window dedupe seconds (in addition to idempotency key) */
  dedupeWindowSeconds?: number;
};

export type NotificationEmitResultItem = {
  userId: string;
  notificationId: string | null;
  status: 'created' | 'duplicate' | 'suppressed' | 'failed';
  reason?: string | null;
};

export type NotificationEmitResult = {
  eventId: string;
  schemaVersion: string;
  items: NotificationEmitResultItem[];
  createdCount: number;
  duplicateCount: number;
  suppressedCount: number;
  failedCount: number;
};

export type InboxListQuery = {
  userId: string;
  limit?: unknown;
  cursor?: unknown;
  category?: string | null;
  unreadOnly?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
};

export type BulkInboxUpdateInput = {
  userId: string;
  ids: string[];
  action: 'read' | 'unread' | 'archive' | 'unarchive' | 'delete' | 'restore';
};

export { NOTIFICATION_SCHEMA_VERSION };
