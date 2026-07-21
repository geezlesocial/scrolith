import React from 'react';

/**
 * Progressive shimmer placeholders for feed surfaces.
 * Used on Member Home, Community, and load-more footers.
 * Does not alter feed ordering, ranking, or content — presentation only.
 */
type FeedLoadSkeletonProps = {
  count?: number;
  compact?: boolean;
  className?: string;
  label?: string;
  /**
   * default — social post cards
   * stream — denser infinite-scroll rows
   * scroll — full-viewport vertical video shell (Scroll surface)
   * page — community/member first-paint shell with chrome
   */
  variant?: 'default' | 'stream' | 'scroll' | 'page';
};

const ShimmerBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`scrolith-shimmer rounded-md ${className}`} />
);

const PostCardSkeleton: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
      compact ? 'p-3' : 'p-4 sm:p-5'
    }`}
    style={{ contentVisibility: 'auto', containIntrinsicSize: compact ? '120px' : '280px' }}
  >
    <div className="flex items-center gap-3">
      <ShimmerBlock className="h-11 w-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <ShimmerBlock className="h-3 w-36 max-w-[45%]" />
        <ShimmerBlock className="h-2.5 w-24 max-w-[30%]" />
      </div>
      <ShimmerBlock className="h-8 w-8 shrink-0 rounded-full" />
    </div>
    <div className={`space-y-2.5 ${compact ? 'mt-3' : 'mt-4'}`}>
      <ShimmerBlock className="h-3 w-full" />
      <ShimmerBlock className="h-3 w-[92%]" />
      <ShimmerBlock className="h-3 w-[78%]" />
    </div>
    {!compact ? (
      <ShimmerBlock className="mt-4 h-44 w-full rounded-xl sm:h-52" />
    ) : null}
    <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
      <ShimmerBlock className="h-8 flex-1 rounded-full" />
      <ShimmerBlock className="h-8 flex-1 rounded-full" />
      <ShimmerBlock className="h-8 flex-1 rounded-full" />
      <ShimmerBlock className="h-8 flex-1 rounded-full" />
    </div>
  </div>
);

const ScrollCardSkeleton: React.FC = () => (
  <div
    className="relative flex h-[100dvh] w-full items-end justify-between bg-gradient-to-b from-slate-950 via-slate-900 to-black px-4 pb-24 pt-6"
    role="status"
    aria-label="Loading Scroll"
  >
    <div className="pointer-events-none absolute inset-0 scrolith-shimmer-dark opacity-40" />
    <div className="relative z-[1] min-w-0 flex-1 space-y-3 pr-14">
      <div className="flex items-center gap-3">
        <ShimmerBlock className="h-11 w-11 rounded-full bg-white/15" />
        <div className="space-y-2">
          <ShimmerBlock className="h-3 w-28 bg-white/20" />
          <ShimmerBlock className="h-2.5 w-16 bg-white/10" />
        </div>
      </div>
      <ShimmerBlock className="h-3 w-4/5 max-w-sm bg-white/15" />
      <ShimmerBlock className="h-3 w-3/5 max-w-xs bg-white/10" />
    </div>
    <div className="relative z-[1] flex flex-col items-center gap-4">
      <ShimmerBlock className="h-12 w-12 rounded-full bg-white/15" />
      <ShimmerBlock className="h-12 w-12 rounded-full bg-white/15" />
      <ShimmerBlock className="h-12 w-12 rounded-full bg-white/15" />
      <ShimmerBlock className="h-12 w-12 rounded-full bg-white/15" />
    </div>
  </div>
);

const PageShellSkeleton: React.FC = () => (
  <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
      <ShimmerBlock className="mx-auto h-3 w-40" />
      <ShimmerBlock className="mx-auto mt-4 h-8 w-72 max-w-full" />
      <ShimmerBlock className="mx-auto mt-3 h-3 w-96 max-w-full" />
    </div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <div className="hidden space-y-4 lg:col-span-1 lg:block">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <ShimmerBlock className="h-3 w-28" />
          <div className="mt-4 space-y-3">
            <ShimmerBlock className="h-9 w-full rounded-xl" />
            <ShimmerBlock className="h-9 w-full rounded-xl" />
            <ShimmerBlock className="h-9 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton compact />
      </div>
      <div className="hidden space-y-4 lg:col-span-1 lg:block">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <ShimmerBlock className="h-3 w-24" />
          <div className="mt-4 space-y-3">
            <ShimmerBlock className="h-16 w-full rounded-xl" />
            <ShimmerBlock className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const FeedLoadSkeleton: React.FC<FeedLoadSkeletonProps> = ({
  count = 2,
  compact = false,
  className = '',
  label = 'Loading more content',
  variant = 'default'
}) => {
  if (variant === 'scroll') {
    return (
      <div
        className={className}
        role="status"
        aria-live="polite"
        aria-label={label}
        data-testid="feed-load-skeleton"
        data-skeleton-variant="scroll"
      >
        <span className="sr-only">{label}</span>
        <ScrollCardSkeleton />
      </div>
    );
  }

  if (variant === 'page') {
    return (
      <div
        className={`min-h-screen bg-slate-50 ${className}`}
        role="status"
        aria-live="polite"
        aria-label={label}
        data-testid="feed-load-skeleton"
        data-skeleton-variant="page"
      >
        <span className="sr-only">{label}</span>
        <PageShellSkeleton />
      </div>
    );
  }

  const cards = Math.max(1, Math.min(6, Math.trunc(count)));
  return (
    <div
      className={`space-y-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="feed-load-skeleton"
      data-skeleton-variant={variant}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: cards }).map((_, index) => (
        <PostCardSkeleton key={`feed-skel-${index}`} compact={compact || variant === 'stream'} />
      ))}
    </div>
  );
};

export default FeedLoadSkeleton;
