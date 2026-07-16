/**
 * Multi-tab messaging synchronization via BroadcastChannel + localStorage fallback.
 */
import type { MultiTabEnvelope, MessagingEngineEventType } from './types';

const CHANNEL_NAME = 'scrolith-messaging-v1';
const STORAGE_KEY = 'scrolith:messaging:tab-sync';
const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type MultiTabHandler = (envelope: MultiTabEnvelope) => void;

let channel: BroadcastChannel | null = null;
let storageListenerAttached = false;
const handlers = new Set<MultiTabHandler>();

const canUseBrowserApis = () => typeof window !== 'undefined';

const ensureChannel = (): BroadcastChannel | null => {
  if (!canUseBrowserApis()) return null;
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      const data = event?.data as MultiTabEnvelope | undefined;
      if (!data || data.channel !== CHANNEL_NAME) return;
      if (data.originTabId === TAB_ID) return;
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch {
          // ignore
        }
      });
    };
  } catch {
    channel = null;
  }
  return channel;
};

const ensureStorageFallback = () => {
  if (!canUseBrowserApis() || storageListenerAttached) return;
  storageListenerAttached = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue) as MultiTabEnvelope;
      if (!data || data.channel !== CHANNEL_NAME) return;
      if (data.originTabId === TAB_ID) return;
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore malformed
    }
  });
};

export const getMessagingTabId = () => TAB_ID;

export const subscribeMultiTabMessaging = (handler: MultiTabHandler): (() => void) => {
  handlers.add(handler);
  ensureChannel();
  ensureStorageFallback();
  return () => {
    handlers.delete(handler);
  };
};

export const broadcastMultiTabMessaging = (
  type: MultiTabEnvelope['type'],
  payload: unknown
): void => {
  if (!canUseBrowserApis()) return;
  const envelope: MultiTabEnvelope = {
    channel: CHANNEL_NAME,
    type,
    payload,
    originTabId: TAB_ID,
    timestamp: Date.now()
  };

  const bc = ensureChannel();
  if (bc) {
    try {
      bc.postMessage(envelope);
      return;
    } catch {
      // fall through to storage
    }
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    // Clear quickly so repeated identical payloads still fire storage events later.
    window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(STORAGE_KEY)) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // ignore
      }
    }, 50);
  } catch {
    // private mode / disabled storage
  }
};

export const isMultiTabSyncEvent = (type: string): type is MessagingEngineEventType => {
  return [
    'MESSAGE_CREATED',
    'MESSAGE_UPDATED',
    'MESSAGE_DELETED',
    'MESSAGE_READ',
    'CONVERSATION_UPDATED',
    'CONVERSATION_CREATED',
    'CONVERSATION_DELETED',
    'UNREAD_CHANGED',
    'USER_TYPING',
    'USER_STOPPED_TYPING'
  ].includes(type);
};
