import React from 'react';

/**
 * Phase 21.0 — progressive shimmer placeholders for silent feed prefetch.
 * Replaces generic "Loading more..." chrome when content is still arriving.
 */
type FeedLoadSkeletonProps = {
  count?: number;
  compact?: boolean;
  className?: string;
  label?: string;
};

const FeedLoadSkeleton: React.FC<FeedLoadSkeletonProps> = ({
  count = 2,
  compact = false,
  className = '',
  label = 'Loading more content'
}) => {
  const cards = Math.max(1, Math.min(4, Math.trunc(count)));
  return (
    <div
      className={`space-y-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="feed-load-skeleton"
      data-phase="21.0"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={`feed-skel-${index}`}
          className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
            compact ? 'p-3' : 'p-4'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200/90" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200/90" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className={`mt-3 space-y-2 ${compact ? '' : 'mt-4'}`}>
            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
          </div>
          {!compact ? (
            <div className="mt-4 h-36 w-full animate-pulse rounded-xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100" />
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default FeedLoadSkeleton;
