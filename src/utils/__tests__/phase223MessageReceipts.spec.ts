import { describe, expect, it } from 'vitest';
import {
  deliveryStatusLabel,
  normalizeDeliveryStatus
} from '../messageReceipts';

describe('phase223 message receipts', () => {
  it('maps classic is_read to read', () => {
    expect(normalizeDeliveryStatus({ is_read: true }, true)).toBe('read');
  });

  it('maps deliveryStatus fields', () => {
    expect(normalizeDeliveryStatus({ deliveryStatus: 'delivered' }, true)).toBe('delivered');
    expect(normalizeDeliveryStatus({ delivery_status: 'sent' }, true)).toBe('sent');
    expect(normalizeDeliveryStatus({ pending: true }, true)).toBe('sending');
  });

  it('labels statuses', () => {
    expect(deliveryStatusLabel('read')).toBe('Read');
    expect(deliveryStatusLabel('delivered')).toBe('Delivered');
    expect(deliveryStatusLabel('sent')).toBe('Sent');
  });

  it('non-outgoing messages do not claim delivery', () => {
    expect(normalizeDeliveryStatus({ is_read: true }, false)).toBe('sent');
  });
});
