/**
 * Phase 10.2 — Notification Intelligence contracts (dark foundation).
 * Placeholders for later engines; no runtime ranking/delivery yet.
 */

export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'DIGEST' | 'ALL';

export type NotificationCategory =
  | 'social'
  | 'messaging'
  | 'jobs'
  | 'marketplace'
  | 'commerce'
  | 'community'
  | 'system'
  | 'moderation'
  | 'journey'
  | 'security'
  | 'unknown';

/** Priority bands (Phase 10.4 engine; list reordering still gated by priorityList) */
export type NotificationPriorityBand = 'critical' | 'high' | 'normal' | 'low' | 'background';

export type NotificationPriority = {
  band: NotificationPriorityBand;
  /** 0..1 importance score from priority engine when active */
  score?: number | null;
};

export type NotificationSource = {
  system: string;
  service?: string;
  eventId?: string | null;
  idempotencyKey?: string | null;
};

export type NotificationReason = {
  code: string;
  headline?: string;
};

export type NotificationContract = {
  id: string;
  type: string;
  category?: NotificationCategory;
  title: string | null;
  body: string | null;
  message: string;
  actorId: string | null;
  actorName?: string | null;
  actorAvatar?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  parentId?: string | null;
  isRead: boolean;
  meta: Record<string, unknown>;
  actionUrl?: string | null;
  priority?: NotificationPriority | null;
  source?: NotificationSource | null;
  reasons?: NotificationReason[];
  createdAt: Date | string;
};

export type NotificationListContext = {
  viewerId: string;
  limit?: number;
  cursor?: string | null;
  requestId?: string | null;
};

/** API-compatible notification row shape (existing clients) */
export type NotificationApiShape = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  message: string;
  actor_id: string | null;
  actorId: string | null;
  actor_name: string | null;
  actorName: string | null;
  actor_avatar: string | null;
  actorAvatar: string | null;
  entity_type: string | null;
  entityType: string | null;
  entity_id: string | null;
  entityId: string | null;
  parent_id: string | null;
  parentId: string | null;
  is_read: boolean;
  isRead: boolean;
  meta: Record<string, unknown>;
  metadata: Record<string, unknown>;
  action_url: string | null;
  actionUrl: string | null;
  created_at: Date | string;
  createdAt: Date | string;
};

export type NotificationListResult = {
  items: NotificationApiShape[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type NotificationCategoryMap = Record<string, NotificationCategory>;
