import React from 'react';
import {
  resolveEngagementQuality,
  resolveFeedRankingPresentation,
  type EngagementQualityPresentation,
  type FeedRankingPresentation
} from '../../utils/feedIntelligence';
import {
  enterpriseIntelChip,
  enterpriseIntelChipEngagement,
  enterpriseIntelChipMatch,
  enterpriseIntelChipWhy,
  enterpriseIntelRail
} from '../enterprise/enterpriseClasses';

type FeedIntelligenceSignalsProps = {
  ranking?: any;
  interactions?: any;
  /** When false, hide why/reasons (CMS toggle). */
  showWhy?: boolean;
  /** Show engagement quality from existing counts. */
  showEngagement?: boolean;
  compact?: boolean;
  className?: string;
};

const engagementTone = (level: EngagementQualityPresentation['level']) => {
  switch (level) {
    case 'hot':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'steady':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

/**
 * Phase 18 — enterprise feed explainability strip.
 * Presentation-only; consumes ranking/interactions already on the post model.
 */
const FeedIntelligenceSignals: React.FC<FeedIntelligenceSignalsProps> = ({
  ranking,
  interactions,
  showWhy = true,
  showEngagement = true,
  compact = false,
  className = ''
}) => {
  const presentation: FeedRankingPresentation = resolveFeedRankingPresentation({ ranking });
  const engagement = showEngagement ? resolveEngagementQuality(interactions) : null;

  const secondaryReasons = presentation.reasons.filter(
    (reason) => reason && reason !== presentation.primaryReason
  );
  const hasWhy = showWhy && Boolean(presentation.primaryReason);
  const hasExtras =
    Boolean(presentation.scoreLabel) ||
    Boolean(presentation.modeLabel) ||
    secondaryReasons.length > 0 ||
    Boolean(engagement);

  if (!hasWhy && !hasExtras) return null;

  return (
    <div
      className={`feed-intel-rail ${enterpriseIntelRail} ${compact ? 'gap-1.5' : 'gap-2'} ${className}`}
      aria-label="Feed intelligence signals"
    >
      {hasWhy ? (
        <span className={`feed-intel-chip-enter ${enterpriseIntelChipWhy}`} title={presentation.primaryReason || undefined}>
          Why: {presentation.primaryReason}
        </span>
      ) : null}
      {presentation.scoreLabel ? (
        <span className={`feed-intel-chip-enter ${enterpriseIntelChipMatch}`}>{presentation.scoreLabel}</span>
      ) : null}
      {presentation.modeLabel ? (
        <span className={`feed-intel-chip-enter ${enterpriseIntelChip}`}>{presentation.modeLabel}</span>
      ) : null}
      {secondaryReasons.slice(0, compact ? 2 : 3).map((reason) => (
        <span key={reason} className={`feed-intel-chip-enter ${enterpriseIntelChip}`}>
          {reason}
        </span>
      ))}
      {engagement ? (
        <span
          className={`feed-intel-chip-enter ${enterpriseIntelChipEngagement} ${engagementTone(engagement.level)}`}
          title={engagement.detail}
        >
          {engagement.label}
        </span>
      ) : null}
    </div>
  );
};

type RecoSignalChipsProps = {
  reasons?: string[];
  whyRecommended?: string | null;
  className?: string;
};

export const RecoSignalChips: React.FC<RecoSignalChipsProps> = ({
  reasons = [],
  whyRecommended,
  className = ''
}) => {
  const chips = Array.isArray(reasons) ? reasons.filter(Boolean).slice(0, 4) : [];
  if (!whyRecommended && !chips.length) return null;
  return (
    <div className={`mt-1.5 space-y-1.5 ${className}`}>
      {whyRecommended ? (
        <p className="text-[11px] leading-4 text-slate-500">
          <span className="font-semibold text-slate-600">Why: </span>
          {whyRecommended}
        </p>
      ) : null}
      {chips.length ? (
        <div className={enterpriseIntelRail} aria-label="Recommendation signals">
          {chips.map((reason) => (
            <span key={reason} className={enterpriseIntelChip}>
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default FeedIntelligenceSignals;
