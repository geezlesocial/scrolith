/**
 * Phase 22.3 — rich delivery ticks (sent / delivered / read).
 */
import React from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';
import {
  deliveryStatusLabel,
  normalizeDeliveryStatus,
  type DeliveryStatus
} from '../../utils/messageReceipts';

type Props = {
  message: any;
  isOutgoing: boolean;
  /** When true, use light-on-blue bubble colors */
  onOutgoingBubble?: boolean;
  className?: string;
};

const MessageDeliveryTicks: React.FC<Props> = ({
  message,
  isOutgoing,
  onOutgoingBubble = false,
  className = ''
}) => {
  if (!isOutgoing) return null;
  const status: DeliveryStatus = normalizeDeliveryStatus(message, true);
  const label = deliveryStatusLabel(status);
  const tone =
    status === 'read'
      ? onOutgoingBubble
        ? 'text-sky-100'
        : 'text-sky-600'
      : onOutgoingBubble
        ? 'text-blue-100'
        : 'text-slate-400';

  return (
    <span
      className={`inline-flex items-center ${tone} ${className}`}
      title={label}
      aria-label={label}
      data-testid="message-delivery-ticks"
      data-delivery-status={status}
    >
      {status === 'sending' ? (
        <Clock className="h-3 w-3" aria-hidden />
      ) : status === 'sent' ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <CheckCheck className="h-3.5 w-3.5" aria-hidden />
      )}
    </span>
  );
};

export default React.memo(MessageDeliveryTicks);
