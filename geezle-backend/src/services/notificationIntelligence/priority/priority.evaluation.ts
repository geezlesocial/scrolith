/**
 * Pure priority evaluation (Phase 10.4).
 * Deterministic, side-effect free — safe for dual-run and tests.
 */
import type { PreferenceCategoryKey } from '../preferences/preference.types';
import { categoryFromLegacyEngagementType } from '../preferences/preference.validation';
import type {
  PriorityBand,
  PriorityEvaluationInput,
  PriorityEvaluationResult,
  PriorityFactorContribution,
  PriorityExplanation
} from './priority.types';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const parseTime = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
};

/** Map type string → preference category when possible */
export const resolvePriorityCategory = (
  type: string | null | undefined,
  category: string | null | undefined
): PreferenceCategoryKey | 'unknown' => {
  if (category) {
    const c = String(category).trim().toLowerCase();
    const known: PreferenceCategoryKey[] = [
      'messages',
      'mentions',
      'comments',
      'likes',
      'replies',
      'followers',
      'jobs',
      'marketplace',
      'communities',
      'companies',
      'system',
      'future'
    ];
    if ((known as string[]).includes(c)) return c as PreferenceCategoryKey;
  }
  const fromType = categoryFromLegacyEngagementType(type);
  if (fromType) return fromType;
  const t = String(type || '').toLowerCase();
  if (t.includes('message') || t.includes('dm') || t.includes('chat')) return 'messages';
  if (t.includes('mention')) return 'mentions';
  if (t.includes('comment') || t.includes('reply')) return t.includes('reply') ? 'replies' : 'comments';
  if (t.includes('like') || t.includes('reaction') || t.includes('repost')) return 'likes';
  if (t.includes('follow')) return 'followers';
  if (t.includes('job') || t.includes('proposal') || t.includes('application')) return 'jobs';
  if (t.includes('market') || t.includes('order') || t.includes('commerce')) return 'marketplace';
  if (t.includes('communit') || t.includes('group')) return 'communities';
  if (t.includes('compan') || t.includes('page')) return 'companies';
  if (
    t.includes('system') ||
    t.includes('security') ||
    t.includes('admin') ||
    t.includes('moderat') ||
    t.includes('verify') ||
    t.includes('password')
  ) {
    return 'system';
  }
  return 'unknown';
};

/** Base importance by category (0..1) */
export const categoryBaseScore = (category: PreferenceCategoryKey | 'unknown'): number => {
  switch (category) {
    case 'system':
      return 0.88;
    case 'messages':
      return 0.82;
    case 'mentions':
      return 0.78;
    case 'jobs':
      return 0.72;
    case 'replies':
      return 0.65;
    case 'comments':
      return 0.6;
    case 'marketplace':
      return 0.55;
    case 'communities':
    case 'companies':
      return 0.5;
    case 'followers':
      return 0.42;
    case 'likes':
      return 0.35;
    case 'future':
      return 0.15;
    default:
      return 0.5;
  }
};

/** Type-level nudges for security / messaging / low-noise social */
export const typeHintScore = (type: string | null | undefined): { score: number; detail: string } => {
  const t = String(type || '').toLowerCase();
  if (!t) return { score: 0.5, detail: 'no_type' };
  if (
    t.includes('security') ||
    t.includes('password') ||
    t.includes('2fa') ||
    t.includes('breach') ||
    t.includes('login_alert') ||
    t.includes('suspicious')
  ) {
    return { score: 0.98, detail: 'security_critical' };
  }
  if (t.includes('admin') || t.includes('moderat') || t.includes('ban') || t.includes('report')) {
    return { score: 0.9, detail: 'moderation_high' };
  }
  if (t.includes('message') || t.includes('dm') || t.startsWith('chat')) {
    return { score: 0.85, detail: 'direct_message' };
  }
  if (t.includes('mention')) return { score: 0.8, detail: 'mention' };
  if (t.includes('job_application') || t.includes('interview') || t.includes('proposal')) {
    return { score: 0.75, detail: 'jobs_lifecycle' };
  }
  if (t.includes('comment') || t.includes('reply')) return { score: 0.62, detail: 'conversation' };
  if (t.includes('follow')) return { score: 0.4, detail: 'social_follow' };
  if (t.includes('reaction') || t.includes('like') || t.includes('repost')) {
    return { score: 0.32, detail: 'low_noise_social' };
  }
  return { score: 0.5, detail: 'generic_type' };
};

export const relationshipScore = (
  rel: PriorityEvaluationInput['relationship']
): { score: number; detail: string } => {
  if (!rel) return { score: 0.5, detail: 'relationship_unknown' };
  if (typeof rel.strength === 'number' && Number.isFinite(rel.strength)) {
    return { score: clamp01(rel.strength), detail: 'relationship_strength' };
  }
  let s = 0.45;
  const bits: string[] = [];
  if (rel.isClose) {
    s += 0.35;
    bits.push('close');
  }
  if (rel.isConnection) {
    s += 0.2;
    bits.push('connection');
  }
  if (rel.isFollowing && rel.isFollower) {
    s += 0.15;
    bits.push('mutual');
  } else if (rel.isFollowing || rel.isFollower) {
    s += 0.08;
    bits.push(rel.isFollowing ? 'following' : 'follower');
  }
  return { score: clamp01(s), detail: bits.length ? bits.join('+') : 'relationship_default' };
};

export const engagementScore = (
  eng: PriorityEvaluationInput['engagement']
): { score: number; detail: string } => {
  if (!eng) return { score: 0.5, detail: 'engagement_unknown' };
  if (typeof eng.score === 'number' && Number.isFinite(eng.score)) {
    return { score: clamp01(eng.score), detail: 'engagement_score' };
  }
  const n = Math.max(0, Number(eng.recentInteractionCount) || 0);
  // Diminishing returns: 0 → 0.35, 5+ → ~0.85
  const s = clamp01(0.35 + Math.min(n, 10) * 0.05);
  return { score: s, detail: `recent_interactions:${n}` };
};

/** Fresher notifications score higher; older decay toward low */
export const recencyScore = (createdAt: Date | string | null | undefined): { score: number; detail: string } => {
  const ts = parseTime(createdAt);
  if (ts == null) return { score: 0.55, detail: 'recency_unknown' };
  const ageMs = Math.max(0, Date.now() - ts);
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 1) return { score: 0.95, detail: 'under_1h' };
  if (ageHours < 6) return { score: 0.85, detail: 'under_6h' };
  if (ageHours < 24) return { score: 0.7, detail: 'under_24h' };
  if (ageHours < 72) return { score: 0.5, detail: 'under_3d' };
  if (ageHours < 168) return { score: 0.35, detail: 'under_7d' };
  return { score: 0.2, detail: 'older_than_7d' };
};

export const preferencesScore = (
  prefs: PriorityEvaluationInput['preferences']
): { score: number; detail: string } => {
  if (!prefs) return { score: 0.55, detail: 'preferences_unknown' };
  if (prefs.globalEnabled === false) {
    return { score: 0.05, detail: 'global_disabled' };
  }
  if (prefs.categoryEnabled === false) {
    return { score: 0.12, detail: 'category_disabled' };
  }
  if (prefs.categoryEnabled === true || prefs.globalEnabled === true) {
    return { score: 0.7, detail: 'preferences_enabled' };
  }
  return { score: 0.55, detail: 'preferences_partial' };
};

export const scoreToBand = (score: number): PriorityBand => {
  const s = clamp01(score);
  if (s >= 0.9) return 'critical';
  if (s >= 0.7) return 'high';
  if (s >= 0.4) return 'normal';
  if (s >= 0.2) return 'low';
  return 'background';
};

const BAND_RULE =
  'critical>=0.9; high>=0.7; normal>=0.4; low>=0.2; else background';

const factor = (
  key: PriorityFactorContribution['key'],
  weight: number,
  score: number,
  detail?: string,
  placeholder?: boolean
): PriorityFactorContribution => {
  const s = clamp01(score);
  const w = Math.max(0, weight);
  return {
    key,
    weight: w,
    score: s,
    weighted: Math.round(w * s * 1000) / 1000,
    detail,
    placeholder
  };
};

/**
 * Compute blended priority score and band from input factors.
 * Does not read DB, does not reorder, does not deliver.
 */
export const computePriorityEvaluation = (
  input: PriorityEvaluationInput,
  options?: { engineActive: boolean }
): PriorityEvaluationResult => {
  const engineActive = Boolean(options?.engineActive);
  const evaluatedAt = new Date().toISOString();

  if (!engineActive) {
    return {
      band: 'normal',
      score: 0.5,
      engineActive: false,
      reason: 'priority_engine_inactive',
      factors: [],
      explanation: {
        summary: 'Priority engine inactive (flags OFF); default normal; no list reordering',
        topFactors: [],
        bandRule: BAND_RULE
      },
      orderingApplied: false,
      evaluatedAt
    };
  }

  const userId = String(input.userId || '').trim();
  if (!userId) {
    return {
      band: 'normal',
      score: 0.5,
      engineActive: true,
      reason: 'validation_defaults',
      factors: [],
      explanation: {
        summary: 'Missing userId; default normal priority',
        topFactors: [],
        bandRule: BAND_RULE
      },
      orderingApplied: false,
      evaluatedAt
    };
  }

  const category = resolvePriorityCategory(input.type, input.category);
  const catBase = categoryBaseScore(category);
  const typeHint = typeHintScore(input.type);
  const rel = relationshipScore(input.relationship);
  const eng = engagementScore(input.engagement);
  const rec = recencyScore(input.createdAt);
  const pref = preferencesScore(input.preferences);

  // Discovery / Scrolitha: placeholders with zero weight until future phases
  const discoveryRaw =
    input.discoverySignals && typeof input.discoverySignals.relevanceScore === 'number'
      ? clamp01(input.discoverySignals.relevanceScore)
      : 0.5;
  const scrolithaRaw =
    input.scrolithaSignals && typeof input.scrolithaSignals.urgencyHint === 'number'
      ? clamp01(input.scrolithaSignals.urgencyHint)
      : 0.5;

  const factors: PriorityFactorContribution[] = [
    factor('category', 0.28, catBase, `category:${category}`),
    factor('type_hint', 0.18, typeHint.score, typeHint.detail),
    factor('relationship', 0.16, rel.score, rel.detail),
    factor('engagement', 0.14, eng.score, eng.detail),
    factor('recency', 0.12, rec.score, rec.detail),
    factor('user_preferences', 0.12, pref.score, pref.detail),
    factor('discovery_signals', 0, discoveryRaw, 'reserved_discovery', true),
    factor('scrolitha_signals', 0, scrolithaRaw, 'reserved_scrolitha', true)
  ];

  const weightSum = factors.reduce((acc, f) => acc + f.weight, 0) || 1;
  const blended = factors.reduce((acc, f) => acc + f.weighted, 0) / weightSum;
  let score = clamp01(blended);

  // Hard floors/ceilings for security-critical types
  if (typeHint.detail === 'security_critical') {
    score = Math.max(score, 0.92);
  }
  // Preference disabled strongly dampens non-security
  if (pref.detail === 'global_disabled' || pref.detail === 'category_disabled') {
    if (typeHint.detail !== 'security_critical') {
      score = Math.min(score, 0.25);
    }
  }

  score = Math.round(score * 1000) / 1000;
  const band = scoreToBand(score);

  const ranked = [...factors]
    .filter((f) => !f.placeholder && f.weight > 0)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3);

  const explanation: PriorityExplanation = {
    summary: `Priority ${band} (score ${score}) from category ${category}`,
    topFactors: ranked.map((f) => `${f.key}:${f.detail || f.score}`),
    bandRule: BAND_RULE
  };

  return {
    band,
    score,
    engineActive: true,
    reason: 'evaluated',
    factors,
    explanation,
    orderingApplied: false,
    evaluatedAt
  };
};
