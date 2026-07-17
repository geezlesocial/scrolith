/**
 * Diversity, fairness, and exposure control (policy versioned).
 */
import type { RecommendationCandidate, ScoreComponents } from './discoveryEngine.types';
import { combineScores } from './discoveryEngine.scoring';

export const DIVERSITY_POLICY_VERSION = 'diversity-v8.1.0';

export type DiversityPolicy = {
  maxPerAuthor: number;
  maxPerType: number;
  maxPerSource: number;
  maxPerCategory: number;
  maxPerCompany: number;
  explorationSlots: number;
  newEntityBoost: number;
  popularityDampening: number;
  repeatExposurePenalty: number;
};

export const DEFAULT_DIVERSITY_POLICY: DiversityPolicy = {
  maxPerAuthor: 2,
  maxPerType: 4,
  maxPerSource: 5,
  maxPerCategory: 3,
  maxPerCompany: 2,
  explorationSlots: 1,
  newEntityBoost: 0.06,
  popularityDampening: 0.12,
  repeatExposurePenalty: 0.2
};

export type RankedRow = {
  candidate: RecommendationCandidate;
  score: number;
  components: ScoreComponents;
  reasonCodes?: string[];
  exposedBefore?: boolean;
};

const isNewEntity = (c: RecommendationCandidate) => {
  const iso = c.createdAt || c.updatedAt;
  if (!iso) return false;
  const ageH = (Date.now() - Date.parse(iso)) / 3_600_000;
  return Number.isFinite(ageH) && ageH < 72;
};

export const applyDiversityPolicy = (
  ranked: RankedRow[],
  policy: Partial<DiversityPolicy> = {}
): RankedRow[] => {
  const p: DiversityPolicy = { ...DEFAULT_DIVERSITY_POLICY, ...policy };
  const authorCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  const companyCount = new Map<string, number>();

  const adjusted = ranked.map((row, idx) => {
    const author = row.candidate.authorOrOwnerId || row.candidate.entityId;
    const type = row.candidate.entityType;
    const source = row.candidate.source;
    const category = String(row.candidate.category || 'none').toLowerCase();
    const company = String(row.candidate.baseFeatures?.companyId || row.candidate.metadata?.companyId || author);

    const ac = authorCount.get(author) || 0;
    const tc = typeCount.get(type) || 0;
    const sc = sourceCount.get(source) || 0;
    const cc = categoryCount.get(category) || 0;
    const co = companyCount.get(company) || 0;

    let penalty = row.components.penalty || 0;
    let diversity = 0.05;
    if (ac === 0) diversity += 0.04;
    if (tc === 0) diversity += 0.04;
    if (ac >= p.maxPerAuthor) penalty += 0.28;
    if (tc >= p.maxPerType) penalty += 0.22;
    if (sc >= p.maxPerSource) penalty += 0.12;
    if (cc >= p.maxPerCategory) penalty += 0.12;
    if (co >= p.maxPerCompany) penalty += 0.15;
    if (row.exposedBefore) penalty += p.repeatExposurePenalty;

    // Popularity dampening for high engagement features
    const eng = Number(row.candidate.baseFeatures?.engagement || 0);
    if (eng > 0.85) penalty += p.popularityDampening * 0.5;

    let exploration = row.components.exploration || 0;
    if (isNewEntity(row.candidate)) {
      diversity += p.newEntityBoost;
    }

    // Reserve exploration: light boost for lower-ranked novel sources
    if (idx > 3 && sc === 0 && p.explorationSlots > 0) {
      exploration = Math.max(exploration, 0.12);
    }

    const components: ScoreComponents = {
      ...row.components,
      diversity,
      exploration,
      penalty
    };
    const score = combineScores(components);

    authorCount.set(author, ac + 1);
    typeCount.set(type, tc + 1);
    sourceCount.set(source, sc + 1);
    categoryCount.set(category, cc + 1);
    companyCount.set(company, co + 1);

    return { ...row, components, score };
  });

  // Deterministic tie-break: score desc, then entityId asc
  return adjusted.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return `${a.candidate.entityType}:${a.candidate.entityId}`.localeCompare(
      `${b.candidate.entityType}:${b.candidate.entityId}`
    );
  });
};
