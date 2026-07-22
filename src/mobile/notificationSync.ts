/**
 * Phase 32.3 — Cross-device notification sync, badge recovery, offline action flush.
 * Extends existing offlineActionQueue + socket realtime without replacing them.
 */
import { Capacitor } from '@capacitor/core';
import api from '../services/api';
import { NotificationService } from '../services/notifications';
import { createOfflineActionQueue } from './runtime/offlineActionQueue';
import { trackMobileRuntimeEvent } from './mobileTelemetry';

const BADGE_KEY = 'scrolith:notification-badge:v1';
const SYNC_VERSION_KEY = 'scrolith:notification-sync-version:v1';
const QUEUE_KEY = 'scrolith:notification-offline-queue:v1';

export type NotificationSyncSnapshot = {
  userId?: string;
  serverTime: string;
  version: number;
  badgeCount: number;
  unreadCount: number;
  total?: number;
  archived?: number;
  pinned?: number;
  focusActive?: boolean;
  focus?: unknown;
  preferenceVersion?: number | null;
  quietHoursActive?: boolean;
  reason?: string;
  ids?: string[];
};

type BadgeListener = (count: number) => void;

const badgeListeners = new Set<BadgeListener>();
let lastVersion = 0;
let lastBadge = 0;
let flushing = false;

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readNum = (key: string, fallback = 0) => {
  const s = storage();
  if (!s) return fallback;
  const n = Number(s.getItem(key));
  return Number.isFinite(n) ? n : fallback;
};

const writeNum = (key: string, value: number) => {
  const s = storage();
  if (!s) return;
  s.setItem(key, String(value));
};

export const notificationOfflineQueue = createOfflineActionQueue({ key: QUEUE_KEY });

export const getLocalBadgeCount = () => {
  lastBadge = readNum(BADGE_KEY, lastBadge);
  return lastBadge;
};

export const getLocalSyncVersion = () => {
  lastVersion = readNum(SYNC_VERSION_KEY, lastVersion);
  return lastVersion;
};

export const subscribeBadge = (listener: BadgeListener) => {
  badgeListeners.add(listener);
  listener(getLocalBadgeCount());
  return () => {
    badgeListeners.delete(listener);
  };
};

const notifyBadgeListeners = (count: number) => {
  lastBadge = Math.max(0, count);
  writeNum(BADGE_KEY, lastBadge);
  badgeListeners.forEach((fn) => {
    try {
      fn(lastBadge);
    } catch {
      /* ignore */
    }
  });
  void applyNativeBadge(lastBadge);
};

/**
 * Apply badge on Android when a global Badge bridge is present.
 * Does not hard-depend on a Capacitor plugin (FCM notificationCount covers push badges).
 */
const applyNativeBadge = async (count: number) => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const bridge = (globalThis as any)?.ScrolithBadge || (window as any)?.ScrolithBadge;
    if (bridge && typeof bridge.set === 'function') {
      if (count <= 0 && typeof bridge.clear === 'function') await bridge.clear();
      else await bridge.set(count);
    }
  } catch {
    /* optional native bridge */
  }
};

/**
 * Deterministic conflict resolution:
 * - Accept remote if remote.version > local version
 * - Else if versions equal, accept remote if serverTime is newer
 * - Always accept force=true (full refresh / reconnect recovery)
 */
export const applyRemoteSync = (
  snapshot: Partial<NotificationSyncSnapshot> | null | undefined,
  opts?: { force?: boolean }
) => {
  if (!snapshot) return false;
  const remoteVersion = Number(snapshot.version || 0);
  const localVersion = getLocalSyncVersion();
  const remoteTime = snapshot.serverTime ? Date.parse(snapshot.serverTime) : 0;
  const localTime = readNum('scrolith:notification-sync-time:v1', 0);

  if (!opts?.force) {
    if (remoteVersion < localVersion) return false;
    if (remoteVersion === localVersion && remoteTime && remoteTime < localTime) return false;
  }

  if (remoteVersion) {
    lastVersion = remoteVersion;
    writeNum(SYNC_VERSION_KEY, remoteVersion);
  }
  if (remoteTime) writeNum('scrolith:notification-sync-time:v1', remoteTime);

  const badge =
    typeof snapshot.badgeCount === 'number'
      ? snapshot.badgeCount
      : typeof snapshot.unreadCount === 'number'
        ? snapshot.unreadCount
        : lastBadge;
  notifyBadgeListeners(badge);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('notifications:sync-applied', {
        detail: { ...snapshot, badgeCount: badge }
      })
    );
  }
  return true;
};

export const incrementLocalBadge = (delta = 1) => {
  notifyBadgeListeners(getLocalBadgeCount() + delta);
};

export const decrementLocalBadge = (delta = 1) => {
  notifyBadgeListeners(getLocalBadgeCount() - Math.abs(delta));
};

export const fetchAndApplySyncState = async (deviceId?: string | null) => {
  try {
    const res = await api.get('/notifications/sync-state', {
      params: deviceId ? { deviceId } : undefined
    });
    const data = res.data?.data as NotificationSyncSnapshot | undefined;
    if (data) applyRemoteSync(data, { force: true });
    return data || null;
  } catch (error: any) {
    // Fallback to summary counters if sync-state not deployed yet
    try {
      const summary = await NotificationService.getSummary();
      applyRemoteSync(
        {
          serverTime: new Date().toISOString(),
          version: getLocalSyncVersion() + 1,
          badgeCount: summary.unread || 0,
          unreadCount: summary.unread || 0
        },
        { force: true }
      );
      return null;
    } catch {
      void trackMobileRuntimeEvent(
        'notification_sync_failed',
        { message: error?.message || 'sync_failed' },
        { dedupeMs: 10_000, sourcePath: '/mobile/notificationSync' }
      );
      return null;
    }
  }
};

export const postSyncHeartbeat = async (deviceId?: string | null) => {
  try {
    const res = await api.post('/notifications/sync/heartbeat', { deviceId: deviceId || undefined });
    const data = res.data?.data as NotificationSyncSnapshot | undefined;
    if (data) applyRemoteSync(data, { force: true });
    return data || null;
  } catch {
    return fetchAndApplySyncState(deviceId);
  }
};

export const recordLifecycleReceipt = async (input: {
  notificationId?: string | null;
  lifecycle: 'delivered' | 'displayed' | 'opened' | 'read';
  deviceId?: string | null;
  channel?: string;
  clientTimestamp?: string;
}) => {
  try {
    await api.post('/notifications/receipts', {
      ...input,
      channel: input.channel || (Capacitor.isNativePlatform() ? 'push' : 'in_app'),
      clientTimestamp: input.clientTimestamp || new Date().toISOString()
    });
  } catch {
    notificationOfflineQueue.enqueue({
      type: 'lifecycle_receipt',
      payload: input
    });
  }
};

export const enqueueNotificationAction = (action: string, ids: string[], extra?: Record<string, unknown>) => {
  return notificationOfflineQueue.enqueue({
    type: 'notification_action',
    payload: { action, ids, ...extra, clientTimestamp: new Date().toISOString() }
  });
};

export const runNotificationAction = async (
  action: string,
  ids: string[],
  opts?: { offlineQueue?: boolean; deviceId?: string | null }
) => {
  try {
    const res = await api.post('/notifications/actions', {
      action,
      ids,
      deviceId: opts?.deviceId || undefined,
      clientVersion: getLocalSyncVersion()
    });
    const sync = res.data?.data?.sync as NotificationSyncSnapshot | undefined;
    if (sync) applyRemoteSync(sync, { force: true });
    return res.data?.data;
  } catch (error: any) {
    if (opts?.offlineQueue !== false) {
      enqueueNotificationAction(action, ids, { deviceId: opts?.deviceId });
      // Optimistic local badge for read
      if (action === 'read' || action === 'mark_read') {
        decrementLocalBadge(ids.length || 1);
      }
    }
    throw error;
  }
};

export const flushNotificationOfflineQueue = async (deviceId?: string | null) => {
  if (flushing) return { flushed: 0 };
  flushing = true;
  let flushed = 0;
  try {
    const pending = notificationOfflineQueue
      .read()
      .filter((a) => a.status === 'queued' || a.status === 'failed')
      .slice(0, 40);
    for (const item of pending) {
      notificationOfflineQueue.update(item.id, { status: 'sending', attempts: item.attempts + 1 });
      try {
        if (item.type === 'lifecycle_receipt') {
          await api.post('/notifications/receipts', item.payload);
        } else if (item.type === 'notification_action') {
          const payload = item.payload as { action: string; ids: string[] };
          await api.post('/notifications/actions', {
            ...payload,
            deviceId: deviceId || undefined,
            clientVersion: getLocalSyncVersion()
          });
        } else if (item.type === 'preference_patch') {
          await api.patch('/notifications/preferences', item.payload);
        } else {
          notificationOfflineQueue.remove(item.id);
          continue;
        }
        notificationOfflineQueue.remove(item.id);
        flushed += 1;
      } catch (err: any) {
        notificationOfflineQueue.update(item.id, {
          status: 'failed',
          lastError: err?.message || 'flush_failed'
        });
      }
    }
    if (flushed) await fetchAndApplySyncState(deviceId);
  } finally {
    flushing = false;
  }
  return { flushed };
};

/** Bind socket events for multi-session sync */
export const bindNotificationSyncSocket = (socket: any) => {
  if (!socket?.on) return () => {};

  const onSync = (payload: NotificationSyncSnapshot) => {
    applyRemoteSync(payload);
  };
  const onBadge = (payload: { badgeCount?: number; unreadCount?: number; version?: number; serverTime?: string }) => {
    applyRemoteSync({
      badgeCount: payload.badgeCount ?? payload.unreadCount ?? 0,
      unreadCount: payload.unreadCount ?? payload.badgeCount ?? 0,
      version: payload.version ?? getLocalSyncVersion(),
      serverTime: payload.serverTime || new Date().toISOString()
    });
  };
  const onNew = () => {
    incrementLocalBadge(1);
  };
  const onRead = (payload?: { count?: number }) => {
    if (payload?.count) decrementLocalBadge(payload.count);
    else void fetchAndApplySyncState();
  };

  socket.on('notifications:sync', onSync);
  socket.on('notifications:badge', onBadge);
  socket.on('notifications:new', onNew);
  socket.on('notifications:read', onRead);

  return () => {
    socket.off?.('notifications:sync', onSync);
    socket.off?.('notifications:badge', onBadge);
    socket.off?.('notifications:new', onNew);
    socket.off?.('notifications:read', onRead);
  };
};

export const listRegisteredDevices = async () => {
  const res = await api.get('/notifications/devices');
  return Array.isArray(res.data?.data) ? res.data.data : [];
};

export const removeRegisteredDevice = async (deviceId: string) => {
  await api.delete(`/notifications/devices/${encodeURIComponent(deviceId)}`);
};
