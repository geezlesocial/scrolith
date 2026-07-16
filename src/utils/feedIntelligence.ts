/**
 * Phase 18 — Enterprise Feed Intelligence (presentation-only).
 * Derives explainability chips and quality labels from existing payload fields.
 * Does not call APIs or invent ranking scores.
 */

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const uniqueLabels = (values: unknown[], limit = 4) =>
  Array.from(
    new Set(
      values
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  ).slice(0, limit);

export type FeedRankingPresentation = {
  primaryReason: string | null;
  reasons: string[];
  scoreLabel: string | null;
  modeLabel: string | null;
};

export type EngagementQualityPresentation = {
  label: string;
  detail: string;
  level: 'quiet' | 'steady' | 'active' | 'hot';
};

export type RecoPresentation = {
  whyRecommended: string;
  reasons: string[];
  badge: string;
};

/** Normalize ranking for UI from post / discovery / orchestrated payloads. */
export const resolveFeedRankingPresentation = (source: any): FeedRankingPresentation => {
  const ranking = source?.ranking && typeof source.ranking === 'object' ? source.ranking : {};
  const whyRaw = source?.why ?? ranking.why ?? ranking.reasons ?? ranking.primaryReason ?? ranking.primary_reason;
  const reasonsFromArray = Array.isArray(whyRaw)
    ? whyRaw
    : Array.isArray(ranking.reasons)
      ? ranking.reasons
      : Array.isArray(ranking.why)
        ? ranking.why
        : [];
  const primary =
    firstText(
      ranking.primaryReason,
      ranking.primary_reason,
      typeof whyRaw === 'string' ? whyRaw : '',
      reasonsFromArray[0]
    ) || null;
  const reasons = uniqueLabels([primary, ...reasonsFromArray], 4);
  const score = Number(ranking.score ?? source?.rankingScore ?? source?.score ?? source?.aiScore ?? NaN);
  let scoreLabel: string | null = null;
  if (Number.isFinite(score)) {
    if (score >= 0.85 || score >= 85) scoreLabel = 'Strong match';
    else if (score >= 0.65 || score >= 65) scoreLabel = 'Good match';
    else if (score >= 0.4 || score >= 40) scoreLabel = 'Relevant';
    else if (score > 0) scoreLabel = 'Suggested';
  }
  const mode = firstText(ranking.mode, ranking.recipeKey, ranking.recipe_key, source?.feedItemType);
  const modeLabel = mode
    ? mode
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 28)
    : null;

  return {
    primaryReason: primary,
    reasons: reasons.filter((r) => r !== primary).length ? reasons : primary ? [primary] : [],
    scoreLabel,
    modeLabel
  };
};

/** Engagement quality from interaction counts already on the post. */
export const resolveEngagementQuality = (interactions: any): EngagementQualityPresentation | null => {
  if (!interactions || typeof interactions !== 'object') return null;
  const likes = Number(interactions.likes ?? 0) || 0;
  const comments = Number(interactions.comments ?? 0) || 0;
  const shares = Number(interactions.shares ?? 0) || 0;
  const reposts = Number(interactions.reposts ?? 0) || 0;
  const views = Number(interactions.views ?? 0) || 0;
  let reactionSum = 0;
  if (interactions.reactions && typeof interactions.reactions === 'object') {
    reactionSum = Object.values(interactions.reactions as Record<string, unknown>).reduce(
      (sum: number, value) => sum + (Number(value) || 0),
      0
    );
  }
  const engagement = likes + comments * 2 + shares * 2 + reposts * 2 + reactionSum;
  if (engagement <= 0 && views <= 0) return null;
  if (engagement >= 40 || (comments >= 8 && likes >= 10)) {
    return { label: 'High engagement', detail: 'Active discussion and reactions', level: 'hot' };
  }
  if (engagement >= 12 || comments >= 3 || views >= 200) {
    return { label: 'Active', detail: 'Solid professional engagement', level: 'active' };
  }
  if (engagement >= 3 || views >= 40) {
    return { label: 'Steady', detail: 'Gaining professional attention', level: 'steady' };
  }
  return { label: 'Early signal', detail: 'Fresh for your network', level: 'quiet' };
};

/** People reco presentation from existing /reco/accounts fields. */
export const resolvePersonRecoPresentation = (item: any): RecoPresentation => {
  const account = item?.account || {};
  const userType = String(item?.entityType || account?.entityType || item?.role || account?.role || 'freelancer')
    .trim()
    .toLowerCase();
  const isClient = userType === 'client' || userType === 'employer';
  const industry = firstText(account?.industry, item?.industry, account?.category, item?.category);
  const location = firstText(account?.location, item?.location, item?.country);
  const name = firstText(account?.name, item?.name, 'this member');
  const reasons = uniqueLabels(
    [
      isClient ? 'Hiring' : 'Creator',
      industry,
      location,
      item?.score != null || item?.confidence != null ? 'High match' : '',
      account?.verified || item?.verified || account?.isVerified ? 'Verified' : '',
      item?.trending || account?.trending ? 'Trending' : '',
      item?.mutual || account?.mutualCount || item?.mutualCount ? 'Mutual' : ''
    ],
    4
  );
  const whyRecommended =
    firstText(item?.reason, item?.why, item?.explanation, item?.subtitle, account?.headline) ||
    (isClient
      ? 'Relevant hiring signal for your professional graph.'
      : `Follow ${name.split(' ')[0] || 'this creator'} to strengthen feed quality.`);
  return {
    whyRecommended,
    reasons: reasons.length ? reasons : ['Recommended for you'],
    badge: isClient ? 'Client' : 'Freelancer'
  };
};

/** Page reco presentation from existing reco / page payloads. */
export const resolvePageRecoPresentation = (page: any): RecoPresentation => {
  const account = page?.account || {};
  const industry = firstText(page?.industry, account?.industry, page?.category, account?.category);
  const name = firstText(page?.name, account?.name, 'this page');
  const reasons = uniqueLabels(
    [
      'Page',
      industry,
      page?.verified || account?.verified || page?.isVerified ? 'Verified' : '',
      page?.trending || account?.trending ? 'Trending' : '',
      page?.hiring || account?.hiring ? 'Hiring' : '',
      'Popular'
    ],
    4
  );
  const whyRecommended =
    firstText(page?.reason, page?.why, page?.explanation, page?.tagline, account?.tagline) ||
    (industry
      ? `Relevant ${industry} page for brand and community updates.`
      : `Follow ${name} for trusted professional updates.`);
  return {
    whyRecommended,
    reasons: reasons.length ? reasons : ['Recommended for you'],
    badge: 'Page'
  };
};

/** Job/gig listing fit chips from existing listing fields. */
export const resolveListingFitReasons = (item: any, kind: 'job' | 'gig'): string[] => {
  return uniqueLabels(
    [
      kind === 'job' ? 'Hiring' : 'Service',
      firstText(item?.category, item?.categoryName, item?.subcategory),
      item?.featured || item?.isFeatured || item?.is_featured ? 'Featured' : '',
      item?.verified || item?.clientVerified || item?.isVerified ? 'Verified' : '',
      item?.recommended || item?.isRecommended ? 'Recommended' : '',
      firstText(item?.location, item?.region, item?.city),
      kind === 'job' && (item?.budget || item?.budgetMin || item?.salary) ? 'Budget listed' : '',
      kind === 'gig' && (item?.price || item?.startingPrice) ? 'Priced' : ''
    ],
    4
  );
};
