/**
 * NI-CORE façade (Phase 10.2 dark launch).
 * Always delegates read/mark operations to legacy-compatible implementation.
 * Feature flags reserve future behavior; master OFF forces no new capabilities.
 */
import {
  legacyListNotifications,
  legacyMarkAllNotificationsRead,
  legacyMarkNotificationsRead
} from '../compatibility/legacyNotificationRead.service';
import {
  getNotificationIntelRolloutSummary,
  resolveNotificationIntelRolloutFlags
} from '../rollout/rollout';
import {
  logNotifIntelLifecycle,
  recordNotifIntelMetric,
  startNotifIntelTimer,
  getNotifIntelMetricsSnapshot
} from '../observability/observability';
import { notificationPreferenceService } from '../preferences/preference.service';
import { notificationPriorityService } from '../priority/priority.service';
import { notificationDeliveryService } from '../delivery/delivery.service';
import { notificationEventIntegrationService } from '../eventIntegration/event.service';

export class NotificationIntelligenceService {
  getRollout() {
    return getNotificationIntelRolloutSummary();
  }

  getMetrics() {
    return getNotifIntelMetricsSnapshot();
  }

  /** Preference layer (Phase 10.3) — read/evaluate only; producers unchanged */
  get preferences() {
    return notificationPreferenceService;
  }

  /** Priority engine (Phase 10.4) — evaluation only; does not reorder lists */
  get priority() {
    return notificationPriorityService;
  }

  /** Delivery engine (Phase 10.5) — DeliveryPlan only; never sends */
  get delivery() {
    return notificationDeliveryService;
  }

  /** Event integration (Phase 10.6) — EventEnvelope → NotificationEvaluationRequest only */
  get events() {
    return notificationEventIntegrationService;
  }

  /**
   * List notifications for the authenticated viewer.
   * Phase 10.2–10.4: identical to legacy controller query/response mapping.
   * Priority evaluation does not alter order (requires future priorityList flag).
   */
  async listForViewer(input: {
    viewerId: string;
    limit?: unknown;
    cursor?: unknown;
    requestId?: string | null;
  }) {
    const flags = resolveNotificationIntelRolloutFlags();
    const end = startNotifIntelTimer('list');
    recordNotifIntelMetric('list', 1);
    if (flags.diagnostics) {
      logNotifIntelLifecycle({
        requestId: input.requestId,
        phase: 'list',
        extra: {
          master: flags.master,
          priority: flags.priority,
          priorityList: flags.priorityList
        }
      });
    }
    try {
      // Phase 10.4: priority engine may evaluate elsewhere; list order stays legacy.
      // Future: when priorityList && master, apply ordering — not in 10.4.
      return await legacyListNotifications({
        userId: input.viewerId,
        limit: input.limit,
        cursor: input.cursor
      });
    } finally {
      end();
    }
  }

  /**
   * Admin list for arbitrary user — same mapping as legacy.
   */
  async listForUserAdmin(input: {
    userId: string;
    limit?: unknown;
    cursor?: unknown;
    requestId?: string | null;
  }) {
    const end = startNotifIntelTimer('list_admin');
    recordNotifIntelMetric('list_admin', 1);
    try {
      return await legacyListNotifications({
        userId: input.userId,
        limit: input.limit,
        cursor: input.cursor,
        defaultLimit: 80,
        maxLimit: 200
      });
    } finally {
      end();
    }
  }

  async markRead(input: { viewerId: string; ids: string[]; requestId?: string | null }) {
    const end = startNotifIntelTimer('mark_read');
    recordNotifIntelMetric('mark_read', 1);
    try {
      return await legacyMarkNotificationsRead(input.viewerId, input.ids);
    } finally {
      end();
    }
  }

  async markAllRead(input: { viewerId: string; requestId?: string | null }) {
    const end = startNotifIntelTimer('mark_all_read');
    recordNotifIntelMetric('mark_all_read', 1);
    try {
      return await legacyMarkAllNotificationsRead(input.viewerId);
    } finally {
      end();
    }
  }
}

export const notificationIntelligenceService = new NotificationIntelligenceService();
