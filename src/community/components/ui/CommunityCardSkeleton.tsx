import React from 'react';
import { communityCardMetrics, communityRadius, communitySurface } from '../../design/communityTokens';

const CommunityCardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading communities">
    {Array.from({ length: count }).map((_, index) => (
      <div
        key={index}
        className={`${communityRadius.card} border ${communitySurface.border} ${communitySurface.panel} overflow-hidden shadow-sm`}
      >
        <div className={`${communityCardMetrics.coverAspect} animate-pulse bg-slate-100`} />
        <div className="space-y-2 p-4">
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 flex gap-2">
            <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default CommunityCardSkeleton;
