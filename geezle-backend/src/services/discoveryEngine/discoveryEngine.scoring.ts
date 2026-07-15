/**
 * Scoring stages: quality, freshness, trending, content, relationship, behavioral,
 * collaborative, diversity, cold-start. All bounded 0–1 (penalty subtractive).
 */
import type {
  RecommendationCandidate,
  ScoreComponents,
  ViewerInterestProfile,
  DiscoveryReasonCode
} from './discoveryEngine.types';
import { emptyScoreComponents } from './discoveryEngine.types';
import { interestOverlapScore } from './discoveryEngine.interest';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const ageHours = (iso?: string | null) => {
  if (!iso) return 72;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 72;
  return Math.max(0, (Date.now() - t) / 3_600_000);
};

/** Domain-aware freshness */
export const scoreFreshness = (candidate: RecommendationCandidate): number => {
  const hours = ageHours(candidate.updatedAt || candidate.createdAt);
  const type = candidate.entityType;
  let halfLifeH = 72;
  if (type === 'post' || type === 'discussion') halfLifeH = 36;
  else if (type === 'job' || type === 'event') halfLifeH = 96;
  else if (type === 'marketplace_listing' || type === 'service' || type === 'product') halfLifeH = 168;
  else if (type === 'person' || type === 'freelancer' || type === 'company' || type === 'page') halfLifeH = 720;
  else if (type === 'community' || type === 'group' || type === 'course' || type === 'project') halfLifeH = 360;
  // exponential-ish decay
  return clamp01(Math.exp(-hours / halfLifeH));
};

export const scoreQuality = (candidate: RecommendationCandidate): number => {
  const f = candidate.baseFeatures || {};
  const verified = f.isVerified === true || f.isVerified === 1 ? 0.15 : 0;
  const completeness = typeof f.completeness === 'number' ? clamp01(Number(f.completeness)) * 0.35 : 0.15;
  const engagement = typeof f.engagement === 'number' ? clamp01(Number(f.engagement)) * 0.35 : 0.2;
  const rating = typeof f.rating === 'number' ? clamp01(Number(f.rating) / 5) * 0.2 : 0.1;
  const reportPenalty = typeof f.reportRate === 'number' ? Math.min(0.4, Number(f.reportRate) * 5) : 0;
  return clamp01(0.25 + verified + completeness + engagement + rating - reportPenalty);
};

export const scoreTrending = (candidate: RecommendationCandidate): number => {
  const f = candidate.baseFeatures || {};
  const velocity = typeof f.velocity === 'number' ? clamp01(Number(f.velocity)) : 0;
  const uniqueEngagers = typeof f.uniqueEngagers === 'number' ? clamp01(Number(f.uniqueEngagers) / 50) : 0;
  const fresh = scoreFreshness(candidate);
  const computed = clamp01(velocity * 0.5 + uniqueEngagers * 0.3 + fresh * 0.2);
  // Prefer precomputed trending index score when present (same max semantics as pipeline post-pass).
  const injected =
    typeof f.trendingScore === 'number' && Number.isFinite(Number(f.trendingScore))
      ? clamp01(Number(f.trendingScore))
      : 0;
  return clamp01(Math.max(computed, injected));
};

export const scoreContent = (
  candidate: RecommendationCandidate,
  profile: ViewerInterestProfile,
  query?: string
): number => {
  const tags = candidate.tags || [];
  const blob = [candidate.label, candidate.summary, query].filter(Boolean).join(' ');
  const overlap = interestOverlapScore(profile, tags, candidate.category, blob);
  if (query) {
    const q = query.toLowerCase();
    const hit =
      (candidate.label || '').toLowerCase().includes(q) ||
      (candidate.summary || '').toLowerCase().includes(q) ||
      tags.some((t) => t.toLowerCase().includes(q));
    return clamp01(overlap * 0.7 + (hit ? 0.35 : 0));
  }
  return overlap;
};

export const scoreRelationship = (
  candidate: RecommendationCandidate,
  profile: ViewerInterestProfile,
  sharedCommunity: boolean,
  followedAuthor: boolean
): number => {
  let s = 0.1;
  if (followedAuthor) s += 0.45;
  if (sharedCommunity) s += 0.25;
  if (candidate.authorOrOwnerId && profile.viewerId === candidate.authorOrOwnerId) s -= 0.5;
  if (candidate.category && profile.categories.includes(candidate.category.toLowerCase())) s += 0.1;
  return clamp01(s);
};

export const scoreBehavioral = (
  candidate: RecommendationCandidate,
  positiveAffinity: number,
  negativeHit: boolean
): number => {
  if (negativeHit) return 0.02;
  return clamp01(0.2 + positiveAffinity * 0.7);
};

export const scoreCollaborative = (coEngageScore: number, allowed: boolean): number => {
  if (!allowed) return 0;
  // Require minimum cohort signal already encoded in coEngageScore
  return clamp01(coEngageScore);
};

export const scoreColdStart = (profile: ViewerInterestProfile, candidate: RecommendationCandidate): number => {
  if (!profile.coldStart) return 0;
  // Popular/quality exploration for new users
  const q = scoreQuality(candidate);
  const f = scoreFreshness(candidate);
  return clamp01(0.35 * q + 0.35 * f + 0.2);
};

export const scoreExploration = (rankSeed: number): number => {
  // deterministic light exploration 0–0.15
  const x = Math.abs(Math.sin(rankSeed * 12.9898) * 43758.5453) % 1;
  return clamp01(x * 0.15);
};

export const combineScores = (
  components: ScoreComponents,
  weights?: Partial<ScoreComponents>
): number => {
  const w = {
    interest: weights?.interest ?? 0.18,
    relationship: weights?.relationship ?? 0.14,
    behavioral: weights?.behavioral ?? 0.12,
    quality: weights?.quality ?? 0.16,
    freshness: weights?.freshness ?? 0.1,
    trending: weights?.trending ?? 0.08,
    content: weights?.content ?? 0.1,
    collaborative: weights?.collaborative ?? 0.05,
    diversity: weights?.diversity ?? 0.03,
    exploration: weights?.exploration ?? 0.02,
    coldStart: weights?.coldStart ?? 0.02,
    penalty: 1
  };
  const positive =
    components.interest * w.interest +
    components.relationship * w.relationship +
    components.behavioral * w.behavioral +
    components.quality * w.quality +
    components.freshness * w.freshness +
    components.trending * w.trending +
    components.content * w.content +
    components.collaborative * w.collaborative +
    components.diversity * w.diversity +
    components.exploration * w.exploration +
    components.coldStart * w.coldStart;
  return clamp01(positive - components.penalty);
};

export const scoreCandidate = (input: {
  candidate: RecommendationCandidate;
  profile: ViewerInterestProfile;
  query?: string;
  sharedCommunity?: boolean;
  followedAuthor?: boolean;
  /** When provided (e.g. from relationship module), used instead of the basic helper. */
  relationshipScore?: number;
  positiveAffinity?: number;
  negativeHit?: boolean;
  coEngageScore?: number;
  collaborativeAllowed?: boolean;
  seed?: number;
}): { components: ScoreComponents; score: number; reasonCodes: DiscoveryReasonCode[] } => {
  const components = emptyScoreComponents();
  components.interest = interestOverlapScore(
    input.profile,
    input.candidate.tags,
    input.candidate.category,
    `${input.candidate.label || ''} ${input.candidate.summary || ''}`
  );
  const basicRel = scoreRelationship(
    input.candidate,
    input.profile,
    Boolean(input.sharedCommunity),
    Boolean(input.followedAuthor)
  );
  // Preserve prior pipeline semantics: max(basic, graph-aware relationship score).
  components.relationship =
    typeof input.relationshipScore === 'number'
      ? clamp01(Math.max(basicRel, input.relationshipScore))
      : basicRel;
  components.behavioral = scoreBehavioral(
    input.candidate,
    input.positiveAffinity || 0,
    Boolean(input.negativeHit)
  );
  components.quality = scoreQuality(input.candidate);
  components.freshness = scoreFreshness(input.candidate);
  components.trending = scoreTrending(input.candidate);
  components.content = scoreContent(input.candidate, input.profile, input.query);
  components.collaborative = scoreCollaborative(
    input.coEngageScore || 0,
    Boolean(input.collaborativeAllowed)
  );
  components.coldStart = scoreColdStart(input.profile, input.candidate);
  components.exploration = scoreExploration(input.seed || 1);
  components.diversity = 0;
  components.penalty = input.negativeHit ? 0.35 : 0;

  const score = combineScores(components);
  const reasonCodes: DiscoveryReasonCode[] = [];
  if (components.interest >= 0.45) reasonCodes.push('shared_interest');
  if (input.sharedCommunity) reasonCodes.push('shared_community');
  if (input.followedAuthor) reasonCodes.push('followed_similar');
  if (components.trending >= 0.55) reasonCodes.push('trending_now');
  if (components.quality >= 0.65) reasonCodes.push('high_quality');
  if (components.freshness >= 0.7) reasonCodes.push('fresh_content');
  if (components.content >= 0.5) reasonCodes.push('skills_match');
  if (components.collaborative >= 0.4) reasonCodes.push('because_you_engaged');
  if (components.coldStart >= 0.3 && input.profile.coldStart) reasonCodes.push('cold_start');
  if (components.exploration >= 0.1 && reasonCodes.length < 2) reasonCodes.push('exploration');
  if (!reasonCodes.length) reasonCodes.push('new_for_you');

  return { components, score, reasonCodes };
};
