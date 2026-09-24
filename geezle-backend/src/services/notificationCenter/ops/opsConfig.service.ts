/**
 * Phase 32.4 — Durable ops config (feature flags, retention, settings).
 * Falls back to in-memory defaults when NotificationOpsConfig table is missing.
 */
import { randomUUID } from 'crypto';
import prisma from '../../../utils/prismaClient';
import { writeNotificationAudit } from '../analytics';
import { NotificationAdminDefaultsService } from '../adminDefaults.service';
import { isSafeObjectKey, setSafeObjectValue } from '../../../utils/security/safeObjectKey';

const isMissing = (err: any) =>
  err?.code === 'P2021' ||
  err?.code === 'P2022' ||
  err instanceof TypeError ||
  /does not exist|Cannot read properties of undefined|DATABASE_URL/i.test(String(err?.message || ''));

export type NotificationFeatureFlags = {
  notificationCenter: boolean;
  digests: boolean;
  focusMode: boolean;
  quietHours: boolean;
  richActions: boolean;
  deliveryReceipts: boolean;
  preferencesV2: boolean;
  eventOverrides: boolean;
  campaigns: boolean;
  emergencyBroadcasts: boolean;
  opsDashboard: boolean;
};

export type NotificationRetentionPolicies = {
  notificationEventsDays: number;
  deliveryLogsDays: number;
  auditLogsDays: number;
  analyticsSummariesDays: number;
  digestsDays: number;
  lifecycleEventsDays: number;
};

export type NotificationOpsSettings = {
  emailDigestEnabled: boolean;
  pushDigestAlertEnabled: boolean;
  maxRetryAttempts: number;
  retryBackoffSeconds: number;
  campaignBatchSize: number;
  emergencyRequiresReason: boolean;
  emergencyRequiresConfirm: boolean;
};

const DEFAULT_FLAGS: NotificationFeatureFlags = {
  notificationCenter: true,
  digests: true,
  focusMode: true,
  quietHours: true,
  richActions: true,
  deliveryReceipts: true,
  preferencesV2: true,
  eventOverrides: true,
  campaigns: true,
  emergencyBroadcasts: true,
  opsDashboard: true
};

const DEFAULT_RETENTION: NotificationRetentionPolicies = {
  notificationEventsDays: 90,
  deliveryLogsDays: 60,
  auditLogsDays: 180,
  analyticsSummariesDays: 365,
  digestsDays: 90,
  lifecycleEventsDays: 60
};

const DEFAULT_SETTINGS: NotificationOpsSettings = {
  emailDigestEnabled: true,
  pushDigestAlertEnabled: false,
  maxRetryAttempts: 5,
  retryBackoffSeconds: 60,
  campaignBatchSize: 100,
  emergencyRequiresReason: true,
  emergencyRequiresConfirm: true
};

const memory: Record<string, any> = {
  featureFlags: { ...DEFAULT_FLAGS },
  retention: { ...DEFAULT_RETENTION },
  settings: { ...DEFAULT_SETTINGS }
};

async function loadKey(key: string, fallback: any) {
  const model = (prisma as any).notificationOpsConfig;
  if (!model?.findUnique) {
    return { value: memory[key] || { ...fallback }, version: memory[`${key}_v`] || 1 };
  }
  try {
    const row = await model.findUnique({ where: { key } });
    if (row?.value) {
      memory[key] = { ...fallback, ...(row.value as object) };
      return { value: memory[key], version: row.version || 1 };
    }
  } catch (err) {
    if (!isMissing(err)) console.warn('[ops-config] load failed', key, (err as any)?.message);
  }
  return { value: memory[key] || { ...fallback }, version: memory[`${key}_v`] || 1 };
}

async function saveKey(key: string, value: any, actorId?: string | null) {
  memory[key] = value;
  const model = (prisma as any).notificationOpsConfig;
  if (!model?.findUnique || !model?.upsert) {
    const version = (memory[`${key}_v`] = (memory[`${key}_v`] || 1) + 1);
    try {
      await writeNotificationAudit({
        action: 'ops_config_updated_memory',
        actorId: actorId || undefined,
        details: { key, version }
      });
    } catch {
      /* */
    }
    return { value, version };
  }
  try {
    const existing = await model.findUnique({ where: { key } });
    const version = (existing?.version || 0) + 1;
    await model.upsert({
      where: { key },
      create: { id: randomUUID(), key, value, version, updatedBy: actorId || null },
      update: { value, version, updatedBy: actorId || null }
    });
    memory[`${key}_v`] = version;
    await writeNotificationAudit({
      action: 'ops_config_updated',
      actorId: actorId || undefined,
      details: { key, version }
    });
    return { value, version };
  } catch (err) {
    if (isMissing(err)) {
      const version = (memory[`${key}_v`] = (memory[`${key}_v`] || 1) + 1);
      await writeNotificationAudit({
        action: 'ops_config_updated_memory',
        actorId: actorId || undefined,
        details: { key, version }
      });
      return { value, version };
    }
    throw err;
  }
}

export class NotificationOpsConfigService {
  static async getFeatureFlags() {
    return loadKey('featureFlags', DEFAULT_FLAGS);
  }

  static async updateFeatureFlags(patch: Partial<NotificationFeatureFlags>, actorId?: string | null) {
    const current = await this.getFeatureFlags();
    const next = { ...current.value, ...patch };
    // Sync subset into Phase 32.2 admin defaults for consistency
    try {
      await NotificationAdminDefaultsService.update(
        {
          featureFlags: {
            preferencesV2: next.preferencesV2,
            focusMode: next.focusMode,
            digests: next.digests,
            quietHours: next.quietHours,
            eventOverrides: next.eventOverrides
          },
          emailDigestEnabled: undefined as any
        } as any,
        actorId
      );
    } catch {
      /* optional */
    }
    return saveKey('featureFlags', next, actorId);
  }

  static async getRetention() {
    return loadKey('retention', DEFAULT_RETENTION);
  }

  static async updateRetention(patch: Partial<NotificationRetentionPolicies>, actorId?: string | null) {
    const current = await this.getRetention();
    const next = { ...current.value, ...patch };
    // Clamp ranges
    for (const k of Object.keys(next) as (keyof NotificationRetentionPolicies)[]) {
      if (!isSafeObjectKey(k)) continue;
      setSafeObjectValue(next, k, Math.max(7, Math.min(3650, Number(next[k]) || DEFAULT_RETENTION[k])));
    }
    return saveKey('retention', next, actorId);
  }

  static async getSettings() {
    return loadKey('settings', DEFAULT_SETTINGS);
  }

  static async updateSettings(patch: Partial<NotificationOpsSettings>, actorId?: string | null) {
    const current = await this.getSettings();
    const next = { ...current.value, ...patch };
    return saveKey('settings', next, actorId);
  }

  static defaults() {
    return {
      featureFlags: DEFAULT_FLAGS,
      retention: DEFAULT_RETENTION,
      settings: DEFAULT_SETTINGS
    };
  }
}

export default NotificationOpsConfigService;
