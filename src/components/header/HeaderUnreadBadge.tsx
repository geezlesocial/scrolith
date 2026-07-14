import React from 'react';
import { formatMessagingBadgeCount } from '../../services/messagingSurfaces';

type HeaderUnreadBadgeProps = {
  count: number;
  color?: string;
  className?: string;
};

/**
 * Stable-size unread badge: always reserves corner space so icon layout
 * does not shift when the count transitions between 0 and non-zero.
 */
const HeaderUnreadBadge: React.FC<HeaderUnreadBadgeProps> = ({
  count,
  color = '#EF4444',
  className = ''
}) => {
  const label = formatMessagingBadgeCount(count);
  const hasCount = Boolean(label);
  return (
    <span
      className={[
        'scrolith-header-badge',
        hasCount ? '' : 'is-empty',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      style={hasCount ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    >
      {label || '0'}
    </span>
  );
};

export default HeaderUnreadBadge;
