/**
 * Phase 19.1 — frontend consumer for additive Enterprise Intelligence envelope.
 * Prefers server-provided reasons; never invents ranking scores.
 */

export const INTELLIGENCE_CONTRACT_VERSION = '19.1.0';

export type IntelligenceItem = {
  entityType: string;
  entityId: string;
  score?: number | null;
  rankMode?: string | null;
  recipeKey?: string | null;
  primaryReason?: string | null;
  reasons?: string[];
  reasonCodes?: string[];
  confidence?: number | null;
  policyTags?: string[];
  experimentArm?: string | null;
  intelligenceVersion?: string;
};

const clean = (value: unknown) =>
  String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isBad = (value: string) =>
  !value ||
  value === '[object Object]' ||
  value.toLowerCase() === 'null' ||
  value.toLowerCase() === 'undefined';

const sanitizeReason = (value: unknown): string | null => {
  const text = clean(value);
  if (isBad(text)) return null;
  if (text.startsWith('{') || text.startsWith('[')) return null;
  // Raw enum codes are mapped elsewhere; bare ALL_CAPS codes without spaces are not display text
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(text) && !text.includes(' ')) return null;
  return text.slice(0, 160);
};

const normalizeScore = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const uniqueReasons = (values: unknown[], primary?: string | null, limit = 4) => {
  const out: string[] = [];
  const primaryKey = clean(primary).toLowerCase();
  for (const value of values) {
    const text = sanitizeReason(value);
    if (!text) continue;
    if (primaryKey && text.toLowerCase() === primaryKey) continue;
    if (out.some((entry) => entry.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
};

const CODE_LABELS: Record<string, string> = {
  FOLLOWING_AUTHOR: 'From someone you follow',
  SHARED_COMMUNITY: 'From communities you share',
  TOPIC_AFFINITY: 'Matches topics you follow',
  LOCATION_RELEVANCE: 'Relevant to your location',
  HIRING_INTENT: 'Strong hiring intent',
  SERVICE_INTENT: 'Strong service or selling intent',
  LEARNING_INTENT: 'Strong learning value',
  LOCAL_INTENT: 'Has local context',
  TRENDING: 'Trending now',
  RECENT_ACTIVITY: 'Recommended from recent community activity',
  VERIFIED_ENTITY: 'Verified',
  HIGH_MATCH: 'Strong match for you',
  FEATURED: 'Featured',
  EXPLORATION: 'Something new for you',
  SPONSORED: 'Sponsored',
  PINNED: 'Pinned post',
  HIGHLIGHTED: 'Highlighted post',
  RECOMMENDED: 'Recommended for you'
};

export const labelForReasonCode = (code: unknown): string | null => {
  const key = clean(code).toUpperCase();
  return CODE_LABELS[key] || null;
};

/**
 * Normalize server intelligence / ranking metadata for UI presentation.
 */
export const normalizeClientIntelligence = (source: any): IntelligenceItem | null => {
  if (!source || typeof source !== 'object') return null;
  const intel =
    source.intelligence && typeof source.intelligence === 'object' ? source.intelligence : null;
  const ranking = source.ranking && typeof source.ranking === 'object' ? source.ranking : {};

  const entityId = clean(
    intel?.entityId || source.entityId || source.id || source.sourceId || ranking.entityId
  );
  if (!entityId) return null;

  const reasonSeed: unknown[] = [
    intel?.primaryReason,
    ranking.primaryReason,
    ranking.primary_reason,
    source.primaryReason,
    source.why,
    source.reason,
    source.whyRecommended,
    source.explanation,
    ...(Array.isArray(intel?.reasons) ? intel.reasons : []),
    ...(Array.isArray(ranking.reasons) ? ranking.reasons : []),
    ...(Array.isArray(source.reasons) ? source.reasons : []),
    ...(Array.isArray(intel?.reasonCodes) ? intel.reasonCodes.map(labelForReasonCode) : []),
    ...(Array.isArray(ranking.reasonCodes) ? ranking.reasonCodes.map(labelForReasonCode) : [])
  ];

  const primaryReason =
    sanitizeReason(intel?.primaryReason) ||
    sanitizeReason(ranking.primaryReason) ||
    sanitizeReason(ranking.primary_reason) ||
    sanitizeReason(source.primaryReason) ||
    sanitizeReason(typeof source.why === 'string' ? source.why : null) ||
    sanitizeReason(source.reason) ||
    sanitizeReason(source.whyRecommended) ||
    sanitizeReason(source.explanation) ||
    sanitizeReason(reasonSeed.find((entry) => sanitizeReason(entry))) ||
    null;

  const reasons = uniqueReasons(reasonSeed, primaryReason, 4);
  const reasonCodes = Array.from(
    new Set(
      [
        ...(Array.isArray(intel?.reasonCodes) ? intel.reasonCodes : []),
        ...(Array.isArray(ranking.reasonCodes) ? ranking.reasonCodes : []),
        ...(Array.isArray(source.reasonCodes) ? source.reasonCodes : [])
      ]
        .map((code) => clean(code).toUpperCase())
        .filter((code) => /^[A-Z][A-Z0-9_]{1,48}$/.test(code))
    )
  ).slice(0, 4);

  return {
    entityType: clean(intel?.entityType || source.entityType || source.type || 'post').toLowerCase() || 'post',
    entityId,
    score: normalizeScore(intel?.score ?? ranking.score ?? source.score ?? source.rankingScore),
    rankMode: clean(intel?.rankMode ?? ranking.mode ?? ranking.rankMode ?? source.mode) || null,
    recipeKey: clean(intel?.recipeKey ?? ranking.recipeKey ?? source.recipeKey) || null,
    primaryReason,
    reasons,
    reasonCodes,
    confidence: normalizeScore(intel?.confidence ?? ranking.confidence ?? source.confidence),
    policyTags: Array.isArray(intel?.policyTags) ? intel.policyTags.map(clean).filter(Boolean).slice(0, 6) : undefined,
    experimentArm: clean(intel?.experimentArm ?? source.experimentArm) || null,
    intelligenceVersion: clean(intel?.intelligenceVersion) || INTELLIGENCE_CONTRACT_VERSION
  };
};
