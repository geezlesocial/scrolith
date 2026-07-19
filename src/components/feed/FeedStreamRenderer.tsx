import React from 'react';
import type { FeedStreamEntry } from '../../utils/feedStream';
import FeedMixedCard from './FeedMixedCard';
import FeedVirtualList from './FeedVirtualList';

type FeedStreamRendererProps = {
  entries: FeedStreamEntry[];
  /** Custom post renderer (desktop/mobile existing cards). */
  renderPost: (post: any, entry: FeedStreamEntry, index: number) => React.ReactNode;
  compact?: boolean;
  virtualize?: boolean;
  estimateSize?: number;
  footer?: React.ReactNode;
  className?: string;
  scrollElement?: HTMLElement | null;
};

/**
 * Phase 21.0.1 — Unified mixed stream renderer.
 * Renders orchestrator order exactly; posts via inject renderPost, others via FeedMixedCard.
 * No ranking.
 */
const FeedStreamRenderer: React.FC<FeedStreamRendererProps> = ({
  entries,
  renderPost,
  compact = false,
  virtualize = true,
  estimateSize = 360,
  footer = null,
  className = '',
  scrollElement = null
}) => {
  const renderItem = (entry: FeedStreamEntry, index: number) => {
    if (entry.kind === 'post' && entry.post) {
      return <>{renderPost(entry.post, entry, index)}</>;
    }
    return <FeedMixedCard entry={entry} compact={compact} />;
  };

  return (
    <FeedVirtualList
      items={entries}
      renderItem={renderItem}
      estimateSize={estimateSize}
      overscan={compact ? 3 : 5}
      className={className}
      footer={footer}
      scrollElement={scrollElement}
      enabled={virtualize}
    />
  );
};

export default FeedStreamRenderer;
