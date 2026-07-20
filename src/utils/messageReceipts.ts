/**
 * Phase 22.3 — delivery/read tick helpers (pure).
 */

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

export const normalizeDeliveryStatus = (message: any, isOutgoing: boolean): DeliveryStatus => {
  if (!isOutgoing) return 'sent';
  const raw = String(
    message?.deliveryStatus || message?.delivery_status || message?.status || ''
  )
    .trim()
    .toLowerCase();
  if (raw === 'sending' || raw === 'pending' || message?.optimistic || message?.pending) return 'sending';
  if (raw === 'read' || message?.isRead || message?.is_read) return 'read';
  if (raw === 'delivered' || message?.isDelivered || message?.is_delivered) return 'delivered';
  if (raw === 'sent') return 'sent';
  // Fallback: double-check classic flags
  if (message?.isRead || message?.is_read) return 'read';
  return 'sent';
};

export const deliveryStatusLabel = (status: DeliveryStatus): string => {
  if (status === 'sending') return 'Sending';
  if (status === 'delivered') return 'Delivered';
  if (status === 'read') return 'Read';
  return 'Sent';
};

export const MESSAGE_RECEIPTS_VERSION = '22.3';
