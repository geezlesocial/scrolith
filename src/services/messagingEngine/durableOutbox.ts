/**
 * Phase 22.1 — durable messaging outbox (localStorage) with FIFO-per-conversation
 * and fair cross-conversation scheduling. Does not perform network I/O.
 */
import type { MessagingDeliveryState } from './types';
import { fairScheduleConversationQueues } from '../messagingSessionStability';

const STORAGE_KEY = 'scrolith.messaging.outbox.v1';
const MAX_ITEMS = 200;
const MAX_AUTO_RETRIES = 5;

export type DurableOutboxItem = {
  clientMessageId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToMessageId?: string | null;
  state: MessagingDeliveryState;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  lastError?: string;
  serverMessageId?: string;
  scrolitha?: boolean;
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readAll = (): DurableOutboxItem[] => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DurableOutboxItem[]) : [];
  } catch {
    return [];
  }
};

const writeAll = (items: DurableOutboxItem[]) => {
  if (!canUseStorage()) return;
  try {
    const trimmed = items.slice(-MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota / private mode — best effort in-memory only for this session.
  }
};

export const upsertDurableOutboxItem = (
  item: Omit<DurableOutboxItem, 'createdAt' | 'updatedAt' | 'retryCount' | 'state'> & {
    state?: MessagingDeliveryState;
    retryCount?: number;
    createdAt?: number;
  }
): DurableOutboxItem => {
  const clientMessageId = String(item.clientMessageId || '').trim();
  const conversationId = String(item.conversationId || '').trim();
  const now = Date.now();
  const all = readAll();
  const idx = all.findIndex((row) => row.clientMessageId === clientMessageId);
  const next: DurableOutboxItem = {
    clientMessageId,
    conversationId,
    text: String(item.text || ''),
    attachmentIds: Array.isArray(item.attachmentIds) ? item.attachmentIds : [],
    replyToMessageId: item.replyToMessageId ?? null,
    state: item.state || 'queued',
    createdAt: idx >= 0 ? all[idx].createdAt : item.createdAt || now,
    updatedAt: now,
    retryCount: item.retryCount ?? (idx >= 0 ? all[idx].retryCount : 0),
    lastError: item.lastError ?? (idx >= 0 ? all[idx].lastError : undefined),
    serverMessageId: item.serverMessageId ?? (idx >= 0 ? all[idx].serverMessageId : undefined),
    scrolitha: item.scrolitha ?? (idx >= 0 ? all[idx].scrolitha : false)
  };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  writeAll(all);
  return next;
};

export const markDurableOutboxState = (
  clientMessageId: string,
  state: MessagingDeliveryState,
  options?: { serverMessageId?: string; error?: string; bumpRetry?: boolean }
): DurableOutboxItem | null => {
  const id = String(clientMessageId || '').trim();
  if (!id) return null;
  const all = readAll();
  const idx = all.findIndex((row) => row.clientMessageId === id);
  if (idx < 0) return null;
  const row = { ...all[idx], state, updatedAt: Date.now() };
  if (options?.serverMessageId) row.serverMessageId = options.serverMessageId;
  if (options?.error) row.lastError = options.error;
  if (options?.bumpRetry) row.retryCount = (row.retryCount || 0) + 1;
  if (state === 'sent' || state === 'delivered' || state === 'read') {
    // Drop successful items from durable store
    all.splice(idx, 1);
    writeAll(all);
    return row;
  }
  all[idx] = row;
  writeAll(all);
  return row;
};

export const removeDurableOutboxItem = (clientMessageId: string) => {
  const id = String(clientMessageId || '').trim();
  if (!id) return;
  writeAll(readAll().filter((row) => row.clientMessageId !== id));
};

export const listDurableOutboxPending = (): DurableOutboxItem[] =>
  readAll().filter(
    (row) =>
      row.state === 'queued' ||
      row.state === 'sending' ||
      row.state === 'failed' ||
      row.state === 'retry'
  );

/** FIFO within conversation, fair round-robin across conversations. */
export const listDurableOutboxFlushOrder = (): DurableOutboxItem[] => {
  const pending = listDurableOutboxPending()
    .filter((row) => row.retryCount < MAX_AUTO_RETRIES)
    .sort((a, b) => a.createdAt - b.createdAt);
  return fairScheduleConversationQueues(pending);
};

export const clearDurableOutbox = () => writeAll([]);

export const MAX_DURABLE_OUTBOX_RETRIES = MAX_AUTO_RETRIES;
export const DURABLE_OUTBOX_STORAGE_KEY = STORAGE_KEY;
