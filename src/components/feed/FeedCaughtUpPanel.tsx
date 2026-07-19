import React from 'react';
import { Link } from 'react-router-dom';
import {
  buildCaughtUpSuggestions,
  type EndOfFeedSuggestion
} from '../../utils/enterpriseFeedEngine';

type FeedCaughtUpPanelProps = {
  surface?: 'member_home' | 'community' | string;
  title?: string;
  subtitle?: string;
  className?: string;
  suggestions?: EndOfFeedSuggestion[];
  hasPeople?: boolean;
  hasCommunities?: boolean;
  hasJobs?: boolean;
  hasMarketplace?: boolean;
};

/**
 * Phase 21.0 — end-of-feed state: never stuck on Loading…
 * Offers professional discovery paths when the continuous feed is terminal.
 */
const FeedCaughtUpPanel: React.FC<FeedCaughtUpPanelProps> = ({
  surface = 'member_home',
  title = "You're all caught up",
  subtitle = 'Here are smart ways to keep discovering professional value on Scrolith.',
  className = '',
  suggestions,
  hasPeople,
  hasCommunities,
  hasJobs,
  hasMarketplace
}) => {
  const items =
    Array.isArray(suggestions) && suggestions.length
      ? suggestions
      : buildCaughtUpSuggestions({
          surface,
          hasPeople,
          hasCommunities,
          hasJobs,
          hasMarketplace
        });

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
      data-testid="feed-caught-up-panel"
      data-phase="21.0"
      aria-label={title}
    >
      <div className="text-center">
        <h3 className="text-sm font-semibold text-slate-900 sm:text-base">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">{subtitle}</p>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={`${item.kind}-${item.href}`}>
            <Link
              to={item.href}
              className="block rounded-xl border border-slate-150 bg-slate-50/80 px-3 py-3 transition hover:border-slate-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {item.kind.replace(/_/g, ' ')}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">{item.title}</div>
              <div className="mt-0.5 text-xs leading-snug text-slate-600">{item.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default FeedCaughtUpPanel;
