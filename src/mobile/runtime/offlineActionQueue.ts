export type OfflineActionStatus = 'queued' | 'sending' | 'failed' | 'completed';

export type OfflineAction = {
  id: string;
  type: string;
  payload: unknown;
  status: OfflineActionStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

export type OfflineActionStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

const DEFAULT_QUEUE_KEY = 'scrolith:offline-action-queue:v1';
const MAX_QUEUE_SIZE = 150;

const nowIso = () => {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
};

const createId = () => `offline_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const defaultStorage = (): OfflineActionStorage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const normalizeOfflineAction = (
  input: Partial<OfflineAction> & Pick<OfflineAction, 'type' | 'payload'>,
  timestamp = nowIso()
): OfflineAction => ({
  id: String(input.id || createId()),
  type: String(input.type || 'unknown'),
  payload: input.payload,
  status: input.status || 'queued',
  attempts: Math.max(0, Number(input.attempts || 0)),
  createdAt: input.createdAt || timestamp,
  updatedAt: input.updatedAt || timestamp,
  lastError: input.lastError
});

export const createOfflineActionQueue = ({
  storage = defaultStorage(),
  key = DEFAULT_QUEUE_KEY
}: {
  storage?: OfflineActionStorage | null;
  key?: string;
} = {}) => {
  const read = (): OfflineAction[] => {
    if (!storage) return [];
    try {
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => normalizeOfflineAction(entry)).slice(-MAX_QUEUE_SIZE);
    } catch {
      return [];
    }
  };

  const write = (items: OfflineAction[]) => {
    if (!storage) return;
    storage.setItem(key, JSON.stringify(items.slice(-MAX_QUEUE_SIZE)));
  };

  const enqueue = (input: Pick<OfflineAction, 'type' | 'payload'> & Partial<OfflineAction>) => {
    const action = normalizeOfflineAction(input);
    write([...read().filter((item) => item.id !== action.id), action]);
    return action;
  };

  const update = (id: string, updateAction: Partial<OfflineAction>) => {
    let updated: OfflineAction | null = null;
    const next = read().map((item) => {
      if (item.id !== id) return item;
      updated = normalizeOfflineAction({
        ...item,
        ...updateAction,
        updatedAt: nowIso()
      });
      return updated;
    });
    write(next);
    return updated;
  };

  const remove = (id: string) => {
    const before = read();
    const next = before.filter((item) => item.id !== id);
    write(next);
    return before.length !== next.length;
  };

  const clear = () => {
    if (!storage) return;
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, '[]');
  };

  return {
    read,
    enqueue,
    update,
    remove,
    clear,
    pendingCount: () => read().filter((item) => item.status === 'queued' || item.status === 'failed').length
  };
};

const defaultQueue = createOfflineActionQueue();

export const getOfflineActionQueueSnapshot = () => defaultQueue.read();
export const enqueueOfflineAction = defaultQueue.enqueue;
export const updateOfflineAction = defaultQueue.update;
export const removeOfflineAction = defaultQueue.remove;
export const clearOfflineActionQueue = defaultQueue.clear;
export const getOfflineActionPendingCount = defaultQueue.pendingCount;
