import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FeedStreamEntry } from '../../utils/feedStream';

type FeedVirtualListProps = {
  items: FeedStreamEntry[];
  /** Render a single stream entry (post card or mixed card). */
  renderItem: (entry: FeedStreamEntry, index: number) => React.ReactNode;
  estimateSize?: number;
  overscan?: number;
  className?: string;
  /** Optional end-of-list slot (skeleton / caught-up / sentinel). */
  footer?: React.ReactNode;
  /** Use window scroll (default) or element scroll parent. */
  scrollElement?: HTMLElement | null;
  enabled?: boolean;
};

/**
 * Phase 21.0.2 — enterprise virtualization for mixed-height feed cards.
 * Default-on for longer streams (policy in feedVirtualPolicy).
 * Preserves scroll position; variable size via measureElement.
 * When disabled or short lists, renders full list (no visual difference).
 */
const FeedVirtualList: React.FC<FeedVirtualListProps> = ({
  items,
  renderItem,
  estimateSize = 360,
  overscan = 4,
  className = '',
  footer = null,
  scrollElement = null,
  enabled = true
}) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const count = Array.isArray(items) ? items.length : 0;
  // Phase 21.0.2 — default threshold aligned with shouldEnableFeedVirtualization (>=12).
  const useVirtual = enabled && count >= 12;

  const virtualizer = useVirtualizer({
    count: useVirtual ? count : 0,
    getScrollElement: () =>
      scrollElement ||
      (typeof document !== 'undefined' ? (document.scrollingElement as HTMLElement) : null) ||
      parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => items[index]?.key || index,
    enabled: useVirtual
  });

  if (!useVirtual) {
    return (
      <div ref={parentRef} className={className} data-feed-virtual="off" data-phase="21.0.1">
        <div className="space-y-3" role="feed" aria-busy="false">
          {items.map((entry, index) => (
            <div key={entry.key} data-index={index} data-feed-key={entry.key}>
              {renderItem(entry, index)}
            </div>
          ))}
        </div>
        {footer}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} className={className} data-feed-virtual="on" data-phase="21.0.1">
      <div
        role="feed"
        aria-busy="false"
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualItems.map((virtualRow) => {
          const entry = items[virtualRow.index];
          if (!entry) return null;
          return (
            <div
              key={entry.key}
              data-index={virtualRow.index}
              data-feed-key={entry.key}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 12
              }}
            >
              {renderItem(entry, virtualRow.index)}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
};

export default FeedVirtualList;
