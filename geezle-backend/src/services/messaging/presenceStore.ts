/**
 * Phase 22.3 — Redis-ready presence store (in-memory default).
 * Swap implementation later without changing call sites.
 */

export type PresenceState = 'online' | 'away' | 'offline';
export type PresenceVisibility = 'EVERYONE' | 'CONTACTS' | 'NOBODY';

export type PresenceRecord = {
  userId: string;
  state: PresenceState;
  isOnline: boolean;
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  visibility: PresenceVisibility;
  connectionCount: number;
  /** Ephemeral typing/recording are conversation-scoped elsewhere */
};

export type PresenceStore = {
  get(userId: string): PresenceRecord | null;
  set(userId: string, patch: Partial<PresenceRecord> & { userId: string }): PresenceRecord;
  delete(userId: string): void;
  list(userIds: string[]): PresenceRecord[];
  touchHeartbeat(userId: string, now?: Date): PresenceRecord;
  markConnect(userId: string, now?: Date): PresenceRecord;
  markDisconnect(userId: string, now?: Date): PresenceRecord;
};

const AWAY_AFTER_MS = Math.max(30_000, Number(process.env.PRESENCE_AWAY_AFTER_MS || 120_000));
const OFFLINE_AFTER_MS = Math.max(60_000, Number(process.env.PRESENCE_OFFLINE_AFTER_MS || 300_000));

const normalizeVisibility = (value: unknown): PresenceVisibility => {
  const v = String(value || 'EVERYONE').trim().toUpperCase();
  if (v === 'CONTACTS' || v === 'NOBODY' || v === 'EVERYONE') return v;
  return 'EVERYONE';
};

const computeState = (record: PresenceRecord, now = Date.now()): PresenceState => {
  if ((record.connectionCount || 0) <= 0) return 'offline';
  const hb = record.lastHeartbeatAt ? new Date(record.lastHeartbeatAt).getTime() : 0;
  if (!hb) return record.isOnline ? 'online' : 'offline';
  const age = now - hb;
  if (age > OFFLINE_AFTER_MS) return 'offline';
  if (age > AWAY_AFTER_MS) return 'away';
  return 'online';
};

class MemoryPresenceStore implements PresenceStore {
  private map = new Map<string, PresenceRecord>();

  get(userId: string): PresenceRecord | null {
    const id = String(userId || '').trim();
    if (!id) return null;
    const row = this.map.get(id);
    if (!row) return null;
    const state = computeState(row);
    return {
      ...row,
      state,
      isOnline: state === 'online' || state === 'away'
    };
  }

  set(userId: string, patch: Partial<PresenceRecord> & { userId: string }): PresenceRecord {
    const id = String(userId || patch.userId || '').trim();
    const prev = this.map.get(id) || {
      userId: id,
      state: 'offline' as PresenceState,
      isOnline: false,
      lastSeenAt: null,
      lastHeartbeatAt: null,
      visibility: 'EVERYONE' as PresenceVisibility,
      connectionCount: 0
    };
    const next: PresenceRecord = {
      ...prev,
      ...patch,
      userId: id,
      visibility: normalizeVisibility(patch.visibility ?? prev.visibility)
    };
    next.state = computeState(next);
    next.isOnline = next.state === 'online' || next.state === 'away';
    this.map.set(id, next);
    return next;
  }

  delete(userId: string): void {
    this.map.delete(String(userId || '').trim());
  }

  list(userIds: string[]): PresenceRecord[] {
    return (userIds || []).map((id) => this.get(id)).filter(Boolean) as PresenceRecord[];
  }

  touchHeartbeat(userId: string, now = new Date()): PresenceRecord {
    const iso = now.toISOString();
    return this.set(userId, {
      userId,
      lastHeartbeatAt: iso,
      lastSeenAt: iso,
      isOnline: true,
      state: 'online'
    });
  }

  markConnect(userId: string, now = new Date()): PresenceRecord {
    const prev = this.get(userId);
    const count = Math.max(0, Number(prev?.connectionCount || 0)) + 1;
    const iso = now.toISOString();
    return this.set(userId, {
      userId,
      connectionCount: count,
      lastHeartbeatAt: iso,
      lastSeenAt: iso,
      isOnline: true,
      state: 'online',
      visibility: prev?.visibility
    });
  }

  markDisconnect(userId: string, now = new Date()): PresenceRecord {
    const prev = this.get(userId);
    const count = Math.max(0, Number(prev?.connectionCount || 0) - 1);
    const iso = now.toISOString();
    return this.set(userId, {
      userId,
      connectionCount: count,
      lastSeenAt: iso,
      isOnline: count > 0,
      state: count > 0 ? 'online' : 'offline',
      lastHeartbeatAt: count > 0 ? prev?.lastHeartbeatAt || iso : prev?.lastHeartbeatAt || iso,
      visibility: prev?.visibility
    });
  }
}

/** Default process-local store. Replace with Redis adapter later. */
export const presenceStore: PresenceStore = new MemoryPresenceStore();

export const PRESENCE_STORE_VERSION = '22.3';
export const PRESENCE_THRESHOLDS = { AWAY_AFTER_MS, OFFLINE_AFTER_MS };

export const filterPresenceForViewer = (
  record: PresenceRecord | null,
  viewerId: string,
  /** optional: true if viewer may see CONTACTS-level presence */
  isContact = true
): Pick<PresenceRecord, 'userId' | 'state' | 'isOnline' | 'lastSeenAt'> | null => {
  if (!record) return null;
  const visibility = normalizeVisibility(record.visibility);
  if (visibility === 'NOBODY' && record.userId !== viewerId) {
    return {
      userId: record.userId,
      state: 'offline',
      isOnline: false,
      lastSeenAt: null
    };
  }
  if (visibility === 'CONTACTS' && record.userId !== viewerId && !isContact) {
    return {
      userId: record.userId,
      state: 'offline',
      isOnline: false,
      lastSeenAt: null
    };
  }
  return {
    userId: record.userId,
    state: record.state,
    isOnline: record.isOnline,
    lastSeenAt: record.lastSeenAt
  };
};
