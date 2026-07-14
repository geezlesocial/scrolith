/**
 * Shared enterprise messaging event bus.
 * Surfaces subscribe without owning independent socket listeners.
 */
import type { MessagingEngineEvent, MessagingEngineEventType } from './types';

type Handler = (event: MessagingEngineEvent) => void;

const handlersByType = new Map<MessagingEngineEventType | '*', Set<Handler>>();
let sequenceCounter = 0;

export const nextMessagingSequence = (): number => {
  sequenceCounter += 1;
  return sequenceCounter;
};

export const subscribeMessagingEvent = (
  type: MessagingEngineEventType | '*',
  handler: Handler
): (() => void) => {
  const set = handlersByType.get(type) || new Set<Handler>();
  set.add(handler);
  handlersByType.set(type, set);
  return () => {
    const current = handlersByType.get(type);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) handlersByType.delete(type);
  };
};

export const publishMessagingEvent = <T = unknown>(
  type: MessagingEngineEventType,
  payload: T,
  meta?: Partial<Omit<MessagingEngineEvent<T>, 'type' | 'payload' | 'timestamp' | 'sequence'>>
): MessagingEngineEvent<T> => {
  const event: MessagingEngineEvent<T> = {
    type,
    payload,
    conversationId: meta?.conversationId,
    messageId: meta?.messageId,
    clientSendId: meta?.clientSendId,
    sequence: nextMessagingSequence(),
    timestamp: Date.now(),
    source: meta?.source || 'local'
  };

  const typed = handlersByType.get(type);
  if (typed) {
    typed.forEach((handler) => {
      try {
        handler(event as MessagingEngineEvent);
      } catch {
        // Never let a bad subscriber break the bus.
      }
    });
  }
  const wildcard = handlersByType.get('*');
  if (wildcard) {
    wildcard.forEach((handler) => {
      try {
        handler(event as MessagingEngineEvent);
      } catch {
        // ignore
      }
    });
  }
  return event;
};

/** Test helper: clear all subscribers. */
export const __resetMessagingEventBusForTests = () => {
  handlersByType.clear();
  sequenceCounter = 0;
};
