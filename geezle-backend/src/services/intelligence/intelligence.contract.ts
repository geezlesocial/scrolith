/**
 * Phase 19.1 — canonical additive Enterprise Intelligence envelope.
 * Server-owned ranking metadata normalized for safe client consumption.
 * Does not change ranking algorithms or sort order.
 */
import {
  inferReasonCodeFromText,
  labelForReasonCode,
  mapReasonCodesFromTexts
} from './reasonCodes';
import { intelligenceMetrics } from './intelligence.observability';

export const INTELLIGENCE_CONTRACT_VERSION = '19.1.0';

export type IntelligenceEntityType =
  | 'post'
  | 'person'
  | 'page'
  | 'job'
  | 'gig'
  | 'listing'
  | 'community'
  | 'notification'
  | 'ad'
  | 'story'
  | 'event'
  | 'scroll_video'
  | string;

export type IntelligenceItem = {
  entityType: IntelligenceEntityType;
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

const MAX_REASON_LEN = 160;
const MAX_REASONS = 4;

const cleanText = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isObjectCoercionArtifact = (value: string) =>
  !value ||
  value === '[object Object]' ||
  value.toLowerCase() === 'null' ||
  value.toLowerCase() === 'undefined' ||
  value.toLowerCase() === 'nan';

const sanitizeReason = (value: unknown): string | null => {
  const text = cleanText(value);
  if (!text || isObjectCoercionArtifact(text)) return null;
  if (text.startsWith('{') || text.startsWith('[')) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text)) return null;
  // Never expose raw internal weight dumps
  if (/weight|vector|embedding|feature[_-]?value|private[_-]?signal/i.test(text) && text.length > 48) {
    return null;
  }
  return text.length > MAX_REASON_LEN ? `${text.slice(0, MAX_REASON_LEN - 1).trimEnd()}…` : text;
};

const normalizeScore = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  // Bound extreme values without inventing scale
  if (n > 1e9 || n < -1e9) return null;
  return n;
};

const normalizeConfidence = (value: unknown): number | null => {
  const n = normalizeScore(value);
  if (n == null) return null;
  if (n >= 0 && n <= 1) return n;
  if (n > 1 && n <= 100) return n / 100;
  return null;
};

const pushUnique = (list: string[], value: string | null) => {
  if (!value) return;
  if (list.some((entry) => entry.toLowerCase() === value.toLowerCase())) return;
  list.push(value);
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const mapFeedTypeToEntity = (type: unknown): IntelligenceEntityType => {
  const t = cleanText(type).toUpperCase().replace(/[\s-]+/g, '_');
  switch (t) {
    case 'POST':
    case 'COMMUNITY_POST':
      return 'post';
    case 'JOB':
      return 'job';
    case 'GIG':
      return 'gig';
    case 'MARKETPLACE_LISTING':
    case 'MARKETPLACE':
      return 'listing';
    case 'PERSON_RECOMMENDATION':
    case 'PERSON':
      return 'person';
    case 'PAGE_RECOMMENDATION':
    case 'PAGE':
      return 'page';
    case 'COMMUNITY_RECOMMENDATION':
    case 'COMMUNITY':
      return 'community';
    case 'AD':
      return 'ad';
    case 'STORY':
      return 'story';
    case 'SCROLL_VIDEO':
      return 'scroll_video';
    case 'EVENT':
      return 'event';
    case 'NOTIFICATION':
      return 'notification';
    default:
      return cleanText(type).toLowerCase() || 'post';
  }
};

const collectReasonCandidates = (source: Record<string, any>): string[] => {
  const ranking = source.ranking && typeof source.ranking === 'object' ? source.ranking : {};
  const candidates: unknown[] = [
    ranking.primaryReason,
    ranking.primary_reason,
    source.primaryReason,
    source.primary_reason,
    source.why,
    source.reason,
    source.whyRecommended,
    source.why_recommended,
    source.explanation,
    ranking.why,
    ranking.reasons,
    source.reasons,
    ranking.reasonCodes,
    source.reasonCodes,
    source.reason_codes
  ];

  const out: string[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        // reasonCodes may be machine ids
        if (typeof entry === 'string' && /^[A-Z][A-Z0-9_]+$/.test(entry.trim())) {
          pushUnique(out, labelForReasonCode(entry) || sanitizeReason(entry));
        } else {
          pushUnique(out, sanitizeReason(entry));
        }
      }
      continue;
    }
    if (typeof candidate === 'string' && /^[A-Z][A-Z0-9_]+$/.test(candidate.trim())) {
      pushUnique(out, labelForReasonCode(candidate) || sanitizeReason(candidate));
    } else {
      pushUnique(out, sanitizeReason(candidate));
    }
  }
  return out.slice(0, MAX_REASONS + 1);
};

const collectReasonCodes = (source: Record<string, any>, reasonTexts: string[]): string[] => {
  const ranking = source.ranking && typeof source.ranking === 'object' ? source.ranking : {};
  const raw = [
    ...asArray(ranking.reasonCodes),
    ...asArray(ranking.reason_codes),
    ...asArray(source.reasonCodes),
    ...asArray(source.reason_codes)
  ]
    .map((entry) => cleanText(entry).toUpperCase())
    .filter(Boolean);

  const codes: string[] = [];
  const seen = new Set<string>();
  for (const code of raw) {
    if (seen.has(code)) continue;
    // Only keep known-safe looking codes (no free-form dumps)
    if (!/^[A-Z][A-Z0-9_]{1,48}$/.test(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  if (!codes.length) {
    for (const inferred of mapReasonCodesFromTexts(reasonTexts)) {
      if (seen.has(inferred)) continue;
      seen.add(inferred);
      codes.push(inferred);
    }
  }
  return codes.slice(0, MAX_REASONS);
};

const collectPolicyTags = (source: Record<string, any>): string[] => {
  const raw = [
    ...asArray(source.policyTags),
    ...asArray(source.policy_tags),
    source.sponsored || source.isSponsored || source.type === 'AD' ? 'sponsored' : null,
    source.exploration ? 'exploration' : null,
    source.diversity ? 'diversity' : null
  ];
  const out: string[] = [];
  for (const tag of raw) {
    const value = cleanText(tag).toLowerCase().replace(/\s+/g, '_');
    if (!value || value.length > 32) continue;
    if (out.includes(value)) continue;
    // block sensitive tags
    if (/private|vector|embedding|weight|moderation_evidence/.test(value)) continue;
    out.push(value);
  }
  return out.slice(0, 6);
};

/**
 * Normalize arbitrary ranking/recommendation metadata into the canonical envelope.
 * Never throws. Returns null only when entity identity cannot be resolved.
 */
export const normalizeIntelligenceItem = (
  input: unknown,
  defaults?: { entityType?: IntelligenceEntityType; entityId?: string; rankMode?: string | null }
): IntelligenceItem | null => {
  try {
    if (input == null) {
      if (defaults?.entityId) {
        return {
          entityType: defaults.entityType || 'post',
          entityId: cleanText(defaults.entityId),
          score: null,
          rankMode: defaults.rankMode || null,
          primaryReason: null,
          reasons: [],
          reasonCodes: [],
          intelligenceVersion: INTELLIGENCE_CONTRACT_VERSION
        };
      }
      return null;
    }

    const source = typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, any>) : {};
    const ranking = source.ranking && typeof source.ranking === 'object' ? source.ranking : {};
    const entityId =
      cleanText(
        defaults?.entityId ||
          source.entityId ||
          source.entity_id ||
          source.id ||
          source.sourceId ||
          source.source_id ||
          ranking.entityId
      ) || '';
    if (!entityId) return null;

    const entityType =
      defaults?.entityType ||
      mapFeedTypeToEntity(source.entityType || source.entity_type || source.type || source.feedItemType);

    const reasonTexts = collectReasonCandidates(source);
    const primaryReason = reasonTexts[0] || null;
    const reasons = reasonTexts.filter((entry) => entry.toLowerCase() !== String(primaryReason || '').toLowerCase()).slice(0, MAX_REASONS);
    const reasonCodes = collectReasonCodes(source, primaryReason ? [primaryReason, ...reasons] : reasons);

    const score = normalizeScore(
      ranking.score ?? source.score ?? source.rankingScore ?? source.ranking_score ?? source.relevanceScore ?? source.matchScore
    );
    const confidence = normalizeConfidence(ranking.confidence ?? source.confidence);
    const rankMode =
      cleanText(defaults?.rankMode ?? ranking.mode ?? ranking.rankMode ?? source.rankMode ?? source.mode) || null;
    const recipeKey =
      cleanText(ranking.recipeKey ?? ranking.recipe_key ?? source.recipeKey ?? source.recipe_key) || null;
    const experimentArm =
      cleanText(source.experimentArm ?? source.experiment_arm ?? ranking.experimentArm) || null;
    const policyTags = collectPolicyTags(source);

    return {
      entityType,
      entityId,
      score,
      rankMode,
      recipeKey,
      primaryReason,
      reasons,
      reasonCodes,
      confidence,
      policyTags: policyTags.length ? policyTags : undefined,
      experimentArm,
      intelligenceVersion: INTELLIGENCE_CONTRACT_VERSION
    };
  } catch {
    return null;
  }
};

/**
 * Attach additive intelligence envelope to an orchestrated feed item without
 * mutating ranking order fields. Preserves existing why / ranking / score.
 */
export const attachIntelligenceToFeedItem = <T extends Record<string, any>>(item: T, rankMode?: string | null): T => {
  if (!item || typeof item !== 'object') return item;
  const existingRanking =
    item.payload?.ranking && typeof item.payload.ranking === 'object' ? item.payload.ranking : {};
  const seed = {
    ...item,
    ranking: {
      ...existingRanking,
      score: item.score ?? item.rankingScore ?? existingRanking.score,
      primaryReason: existingRanking.primaryReason ?? item.why ?? null,
      reasons: existingRanking.reasons ?? (item.why ? [item.why] : []),
      mode: existingRanking.mode ?? rankMode ?? null
    },
    why: item.why,
    type: item.type
  };
  const intelligence = normalizeIntelligenceItem(seed, {
    entityType: mapFeedTypeToEntity(item.type),
    entityId: cleanText(item.id || item.sourceId),
    rankMode: rankMode || existingRanking.mode || null
  });
  if (!intelligence) return item;
  intelligenceMetrics.recordMemberFeedIntelligenceFill(intelligence);

  const nextPayload =
    item.payload && typeof item.payload === 'object'
      ? {
          ...item.payload,
          intelligence,
          ranking: {
            ...existingRanking,
            // Keep legacy ranking fields; fill blanks only
            primaryReason: existingRanking.primaryReason ?? intelligence.primaryReason ?? null,
            reasons:
              Array.isArray(existingRanking.reasons) && existingRanking.reasons.length
                ? existingRanking.reasons
                : intelligence.primaryReason
                  ? [intelligence.primaryReason, ...(intelligence.reasons || [])].slice(0, 3)
                  : intelligence.reasons || [],
            score: normalizeScore(existingRanking.score ?? item.score ?? item.rankingScore),
            mode: existingRanking.mode ?? intelligence.rankMode ?? rankMode ?? null,
            reasonCodes: intelligence.reasonCodes
          }
        }
      : item.payload;

  return {
    ...item,
    intelligence,
    payload: nextPayload
  };
};

export const mapOrchestratedItemsWithIntelligence = <T extends Record<string, any>>(
  items: T[],
  rankMode?: string | null
): T[] => (Array.isArray(items) ? items.map((item) => attachIntelligenceToFeedItem(item, rankMode)) : []);

/** Test-only helper: infer code from text. */
export const __intelligenceContractTestUtils = {
  sanitizeReason,
  normalizeScore,
  normalizeConfidence,
  mapFeedTypeToEntity,
  inferReasonCodeFromText
};
