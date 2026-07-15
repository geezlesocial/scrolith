/**
 * Delivery channel registry (Phase 10.5).
 * Describes capabilities only — no transport implementations.
 */
import type { DeliveryChannelCapability, DeliveryChannelKey } from './delivery.types';
import { ALL_DELIVERY_CHANNELS } from './delivery.types';

const CHANNEL_CAPABILITIES: Record<DeliveryChannelKey, DeliveryChannelCapability> = {
  in_app: {
    channel: 'in_app',
    implementationReady: true,
    placeholder: false,
    supportsRetry: true,
    supportsBatch: false,
    supportsSchedule: true,
    supportsQuietHours: false // in-app typically still recorded; push/email respect QH
  },
  push: {
    channel: 'push',
    implementationReady: false,
    placeholder: true,
    supportsRetry: true,
    supportsBatch: true,
    supportsSchedule: true,
    supportsQuietHours: true
  },
  email: {
    channel: 'email',
    implementationReady: false,
    placeholder: true,
    supportsRetry: true,
    supportsBatch: true,
    supportsSchedule: true,
    supportsQuietHours: true
  },
  sms: {
    channel: 'sms',
    implementationReady: false,
    placeholder: true,
    supportsRetry: true,
    supportsBatch: false,
    supportsSchedule: true,
    supportsQuietHours: true
  },
  webhook: {
    channel: 'webhook',
    implementationReady: false,
    placeholder: true,
    supportsRetry: true,
    supportsBatch: true,
    supportsSchedule: true,
    supportsQuietHours: false
  },
  future: {
    channel: 'future',
    implementationReady: false,
    placeholder: true,
    supportsRetry: false,
    supportsBatch: false,
    supportsSchedule: false,
    supportsQuietHours: false
  }
};

export const getChannelCapability = (channel: DeliveryChannelKey): DeliveryChannelCapability =>
  CHANNEL_CAPABILITIES[channel] || CHANNEL_CAPABILITIES.future;

export const listChannelCapabilities = (): DeliveryChannelCapability[] =>
  ALL_DELIVERY_CHANNELS.map((c) => getChannelCapability(c));

export const listPlaceholderChannels = (): DeliveryChannelKey[] =>
  ALL_DELIVERY_CHANNELS.filter((c) => getChannelCapability(c).placeholder);

export const isKnownDeliveryChannel = (value: unknown): value is DeliveryChannelKey =>
  ALL_DELIVERY_CHANNELS.includes(String(value || '') as DeliveryChannelKey);

/** Map preference channel keys → delivery channel keys */
export const preferenceChannelToDelivery = (
  key: 'inApp' | 'email' | 'push' | 'digest'
): DeliveryChannelKey | null => {
  switch (key) {
    case 'inApp':
      return 'in_app';
    case 'email':
      return 'email';
    case 'push':
      return 'push';
    case 'digest':
      return null; // digest is a future engine, not a delivery channel here
    default:
      return null;
  }
};
