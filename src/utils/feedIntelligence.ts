/**
 * Phase 18 — Enterprise Feed Intelligence (presentation-only).
 * Phase 19.1 — prefer server intelligence envelope / reasons over invented copy.
 * Does not call APIs or invent ranking scores.
 */
import { labelForReasonCode, normalizeClientIntelligence } from './intelligenceContract';

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (
      normalized &&
      normalized !== '[object Object]' &&
      normalized.toLowerCase() !== 'null' &&
      normalized.toLowerCase() !== 'undefined'
    ) {
      // Do not surface raw enum codes as user-facing text.
      if (/^[A-Z][A-Z0-9_]{2,}$/.test(normalized) && !normalized.includes(' ')) {
        const mapped = labelForReasonCode(normalized);
        if (mapped) return mapped;
        continue;
      }
      return normalized;
    }
  }
  return '';
};

const uniqueLabels = (values: unknown[], limit = 4) =>
  Array.from(
    new Set(
      values
        .map((entry) => {
          const raw = String(entry || '').trim();
          if (!raw || raw === '[object Object]') return '';
          if (/^[A-Z][A-Z0-9_]{2,}$/.test(raw) && !raw.includes(' ')) {
            return labelForReasonCode(raw) || '';
          }
          return raw;
        })
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
  const intel = normalizeClientIntelligence(source);
  const ranking = source?.ranking && typeof source.ranking === 'object' ? source.ranking : {};
  const whyRaw = source?.why ?? ranking.why ?? ranking.reasons ?? ranking.primaryReason ?? ranking.primary_reason;
  const reasonsFromArray = Array.isArray(whyRaw)
    ? whyRaw
    : Array.isArray(ranking.reasons)
      ? ranking.reasons
      : Array.isArray(ranking.why)
        ? ranking.why
        : Array.isArray(intel?.reasons)
          ? intel.reasons
          : [];

  const primary =
    firstText(
      intel?.primaryReason,
      ranking.primaryReason,
      ranking.primary_reason,
      typeof whyRaw === 'string' ? whyRaw : '',
      reasonsFromArray[0]
    ) || null;

  const secondary = uniqueLabels(
    [
      ...(Array.isArray(intel?.reasons) ? intel.reasons : []),
      ...reasonsFromArray,
      ...(Array.isArray(intel?.reasonCodes) ? intel.reasonCodes : [])
    ],
    4
  ).filter((reason) => reason !== primary);

  const score = Number(
    intel?.score ?? ranking.score ?? source?.rankingScore ?? source?.score ?? source?.aiScore ?? NaN
  );
  let scoreLabel: string | null = null;
  // Only show score labels when a finite server score exists (never invent).
  if (Number.isFinite(score)) {
    if (score >= 0.85 || score >= 85) scoreLabel = 'Strong match';
    else if (score >= 0.65 || score >= 65) scoreLabel = 'Good match';
    else if (score >= 0.4 || score >= 40) scoreLabel = 'Relevant';
    else if (score > 0) scoreLabel = 'Suggested';
  }

  const mode = firstText(
    intel?.rankMode,
    ranking.mode,
    ranking.recipeKey,
    ranking.recipe_key,
    source?.feedItemType
  );
  const modeLabel = mode
    ? mode
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 28)
    : null;

  return {
    primaryReason: primary,
    reasons: secondary.length ? secondary : primary ? [] : [],
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

/** People reco presentation — server reasons take precedence. */
export const resolvePersonRecoPresentation = (item: any): RecoPresentation => {
  const intel = normalizeClientIntelligence(item);
  const account = item?.account || {};
  const userType = String(item?.entityType || account?.entityType || item?.role || account?.role || 'freelancer')
    .trim()
    .toLowerCase();
  const isClient = userType === 'client' || userType === 'employer';
  const industry = firstText(account?.industry, item?.industry, account?.category, item?.category);
  const location = firstText(account?.location, item?.location, item?.country);
  const name = firstText(account?.name, item?.name, 'this member');

  const serverWhy = firstText(
    intel?.primaryReason,
    item?.reason,
    item?.why,
    item?.whyRecommended,
    item?.explanation
  );
  const serverReasons = uniqueLabels(
    [
      ...(Array.isArray(intel?.reasons) ? intel.reasons : []),
      ...(Array.isArray(item?.reasons) ? item.reasons : []),
      ...(Array.isArray(intel?.reasonCodes) ? intel.reasonCodes : [])
    ],
    4
  );

  // Grounded chips only — no fabricated "High match" from bare numeric score.
  const groundedReasons = uniqueLabels(
    [
      ...serverReasons,
      isClient ? 'Hiring' : 'Creator',
      industry,
      location,
      account?.verified || item?.verified || account?.isVerified ? 'Verified' : '',
      item?.trending || account?.trending ? 'Trending' : '',
      item?.mutual || account?.mutualCount || item?.mutualCount ? 'Mutual' : ''
    ],
    4
  );

  const whyRecommended =
    serverWhy ||
    firstText(item?.subtitle, account?.headline) ||
    (isClient
      ? 'Relevant hiring signal for your professional graph.'
      : `Follow ${name.split(' ')[0] || 'this creator'} to strengthen feed quality.`);

  return {
    whyRecommended,
    reasons: groundedReasons.length ? groundedReasons : serverWhy ? [serverWhy] : ['Recommended for you'],
    badge: isClient ? 'Client' : 'Freelancer'
  };
};

/** Page reco presentation — server reasons take precedence. */
export const resolvePageRecoPresentation = (page: any): RecoPresentation => {
  const intel = normalizeClientIntelligence(page);
  const account = page?.account || {};
  const industry = firstText(page?.industry, account?.industry, page?.category, account?.category);
  const name = firstText(page?.name, account?.name, 'this page');

  const serverWhy = firstText(
    intel?.primaryReason,
    page?.reason,
    page?.why,
    page?.whyRecommended,
    page?.explanation,
    page?.tagline,
    account?.tagline
  );
  const groundedReasons = uniqueLabels(
    [
      ...(Array.isArray(intel?.reasons) ? intel.reasons : []),
      ...(Array.isArray(page?.reasons) ? page.reasons : []),
      'Page',
      industry,
      page?.verified || account?.verified || page?.isVerified ? 'Verified' : '',
      page?.trending || account?.trending ? 'Trending' : '',
      page?.hiring || account?.hiring ? 'Hiring' : ''
    ],
    4
  );

  const whyRecommended =
    serverWhy ||
    (industry
      ? `Relevant ${industry} page for brand and community updates.`
      : `Follow ${name} for trusted professional updates.`);

  return {
    whyRecommended,
    reasons: groundedReasons.length ? groundedReasons : serverWhy ? [serverWhy] : ['Recommended for you'],
    badge: 'Page'
  };
};

/** Job/gig listing fit chips — server reasons first, then grounded listing fields. */
export const resolveListingFitReasons = (item: any, kind: 'job' | 'gig'): string[] => {
  const intel = normalizeClientIntelligence(item);
  const server = uniqueLabels(
    [
      intel?.primaryReason,
      ...(Array.isArray(intel?.reasons) ? intel.reasons : []),
      item?.primaryReason,
      item?.reason,
      item?.why,
      item?.whyRecommended,
      item?.explanation,
      ...(Array.isArray(item?.reasons) ? item.reasons : []),
      ...(Array.isArray(item?.reasonCodes) ? item.reasonCodes : [])
    ],
    4
  );
  if (server.length) return server;

  return uniqueLabels(
    [
      kind === 'job' ? 'Hiring' : 'Service',
      firstText(
        typeof item?.category === 'string' ? item.category : item?.category?.name,
        item?.categoryName,
        item?.subcategory
      ),
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
