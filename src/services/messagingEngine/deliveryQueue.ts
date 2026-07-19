/**
 * Outgoing message delivery tracker with client-send IDs and retry metadata.
 * Does not own network I/O — MessageContext / MessagingService execute sends.
 * Phase 22.1 — mirrors durable outbox for cross-reload retries.
 */
import type { MessagingDeliveryState, OutgoingDeliveryRecord } from './types';
import { nextMessagingSequence } from './eventBus';
import {
  listDurableOutboxFlushOrder,
  markDurableOutboxState,
  upsertDurableOutboxItem
} from './durableOutbox';
import { fairScheduleConversationQueues } from '../messagingSessionStability';

const records = new Map<string, OutgoingDeliveryRecord>();
const MAX_RECORDS = 400;
const MAX_AUTO_RETRIES = 5;

const touch = (record: OutgoingDeliveryRecord) => {
  record.updatedAt = Date.now();
  return record;
};

const evictOldest = () => {
  if (records.size <= MAX_RECORDS) return;
  const sorted = Array.from(records.values()).sort((a, b) => a.updatedAt - b.updatedAt);
  const dropCount = records.size - MAX_RECORDS;
  for (let i = 0; i < dropCount; i += 1) {
    records.delete(sorted[i].clientSendId);
  }
};

export const trackOutgoingMessage = (input: {
  clientSendId: string;
  conversationId: string;
  text: string;
  attachmentIds?: string[];
  replyToMessageId?: string | null;
  state?: MessagingDeliveryState;
}): OutgoingDeliveryRecord => {
  const clientSendId = String(input.clientSendId || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  const existing = records.get(clientSendId);
  if (existing) {
    existing.state = input.state || existing.state;
    existing.text = input.text ?? existing.text;
    existing.attachmentIds = input.attachmentIds || existing.attachmentIds;
    existing.replyToMessageId = input.replyToMessageId ?? existing.replyToMessageId;
    return touch(existing);
  }
  const record: OutgoingDeliveryRecord = {
    clientSendId,
    conversationId,
    text: String(input.text || ''),
    attachmentIds: Array.isArray(input.attachmentIds) ? input.attachmentIds : [],
    replyToMessageId: input.replyToMessageId ?? null,
    state: input.state || 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    retryCount: 0,
    sequence: nextMessagingSequence()
  };
  records.set(clientSendId, record);
  evictOldest();
  upsertDurableOutboxItem({
    clientMessageId: clientSendId,
    conversationId,
    text: record.text,
    attachmentIds: record.attachmentIds,
    replyToMessageId: record.replyToMessageId,
    state: record.state
  });
  return record;
};

export const markOutgoingState = (
  clientSendId: string,
  state: MessagingDeliveryState,
  options?: { serverMessageId?: string; error?: string }
): OutgoingDeliveryRecord | null => {
  const key = String(clientSendId || '').trim();
  const record = records.get(key);
  if (!record) return null;
  record.state = state;
  if (options?.serverMessageId) record.serverMessageId = options.serverMessageId;
  if (options?.error) record.lastError = options.error;
  if (state === 'sent' || state === 'delivered' || state === 'read') {
    record.ackAt = Date.now();
  }
  if (state === 'retry') {
    record.retryCount += 1;
  }
  markDurableOutboxState(key, state, {
    serverMessageId: options?.serverMessageId,
    error: options?.error,
    bumpRetry: state === 'retry' || state === 'failed'
  });
  return touch(record);
};

export const getOutgoingRecord = (clientSendId: string): OutgoingDeliveryRecord | null => {
  const key = String(clientSendId || '').trim();
  return records.get(key) || null;
};

export const findOutgoingByServerId = (serverMessageId: string): OutgoingDeliveryRecord | null => {
  const id = String(serverMessageId || '').trim();
  if (!id) return null;
  for (const record of records.values()) {
    if (record.serverMessageId === id) return record;
  }
  return null;
};

export const listRetryableOutgoing = (): OutgoingDeliveryRecord[] => {
  const memory = Array.from(records.values()).filter(
    (record) =>
      (record.state === 'failed' || record.state === 'queued' || record.state === 'retry') &&
      record.retryCount < MAX_AUTO_RETRIES &&
      Boolean(record.conversationId)
  );
  // Fair FIFO: memory first, then durable pending not already in memory.
  const memoryIds = new Set(memory.map((r) => r.clientSendId));
  const durable = listDurableOutboxFlushOrder()
    .filter((row) => !memoryIds.has(row.clientMessageId))
    .map(
      (row): OutgoingDeliveryRecord => ({
        clientSendId: row.clientMessageId,
        conversationId: row.conversationId,
        text: row.text,
        attachmentIds: row.attachmentIds,
        replyToMessageId: row.replyToMessageId,
        state: row.state,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        retryCount: row.retryCount,
        sequence: 0,
        lastError: row.lastError,
        serverMessageId: row.serverMessageId
      })
    );
  return fairScheduleConversationQueues([...memory, ...durable].map((r) => ({ ...r })));
};

export const canAutoRetryOutgoing = (clientSendId: string): boolean => {
  const record = getOutgoingRecord(clientSendId);
  if (!record) return false;
  return record.state === 'failed' && record.retryCount < MAX_AUTO_RETRIES;
};

export const clearOutgoingDeliveryQueue = () => {
  records.clear();
};

export const getOutgoingDeliveryDebugSnapshot = () =>
  Array.from(records.values()).map((record) => ({ ...record }));

export const MAX_OUTGOING_AUTO_RETRIES = MAX_AUTO_RETRIES;
