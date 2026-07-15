/**
 * Trust & Verification Engine — factual verification, evidence ranking,
 * conflict detection, uncertainty handling, citation aggregation.
 * Distinguishes: verified | likely | uncertain | insufficient_evidence
 * (plus legacy-compatible labels used by contextual posts).
 */
import { assessConfidence, type ConfidenceAssessment } from './scrolitha.confidence';
import { evaluateKnowledgeFreshness, type FreshnessReport } from './scrolitha.knowledgeFreshness';

export type TrustVerdict =
  | 'verified'
  | 'likely'
  | 'uncertain'
  | 'insufficient_evidence'
  | 'conflicting'
  | 'outdated';

export type EvidenceItem = {
  id: string;
  label: string;
  detail?: string;
  authority: number; // 0–1
  freshness?: string | null;
  supports: 'claim' | 'counter' | 'neutral' | 'context';
  sourceType?: string;
};

export type TrustAssessment = {
  verdict: TrustVerdict;
  confidence: ConfidenceAssessment;
  evidence: EvidenceItem[];
  rankedEvidence: EvidenceItem[];
  conflicts: Array<{ a: string; b: string; reason: string }>;
  citations: Array<{ label: string; reference?: string }>;
  reasoning: string;
  userFacingLabel: string;
  hedgeRequired: boolean;
  freshness?: FreshnessReport | null;
};

const text = (v: unknown) => String(v || '').trim();

const authorityForSource = (label: string, sourceType?: string): number => {
  const l = `${label} ${sourceType || ''}`.toLowerCase();
  if (l.includes('verified') && l.includes('profile')) return 0.92;
  if (l.includes('platform record') || l.includes('official')) return 0.88;
  if (l.includes('public job') || l.includes('public service')) return 0.75;
  if (l.includes('public post') || l.includes('community')) return 0.55;
  if (l.includes('session') || l.includes('memory')) return 0.35;
  if (l.includes('user claim') || l.includes('author')) return 0.4;
  return 0.5;
};

export const rankEvidence = (items: EvidenceItem[]): EvidenceItem[] => {
  return [...items].sort((a, b) => {
    const sa = a.authority * (a.supports === 'claim' ? 1 : a.supports === 'counter' ? 0.95 : 0.7);
    const sb = b.authority * (b.supports === 'claim' ? 1 : b.supports === 'counter' ? 0.95 : 0.7);
    return sb - sa;
  });
};

export const detectEvidenceConflicts = (
  items: EvidenceItem[]
): Array<{ a: string; b: string; reason: string }> => {
  const supports = items.filter((e) => e.supports === 'claim');
  const counters = items.filter((e) => e.supports === 'counter');
  const conflicts: Array<{ a: string; b: string; reason: string }> = [];
  for (const s of supports.slice(0, 5)) {
    for (const c of counters.slice(0, 5)) {
      if (s.authority >= 0.5 && c.authority >= 0.5) {
        conflicts.push({
          a: s.label,
          b: c.label,
          reason: 'Supporting and counter-evidence both above medium authority'
        });
      }
    }
  }
  return conflicts.slice(0, 6);
};

export const verdictFromSignals = (input: {
  supportScore: number;
  counterScore: number;
  hasAuthoritative: boolean;
  conflicts: number;
  stale: boolean;
  evidenceCount: number;
}): TrustVerdict => {
  if (input.stale && input.supportScore >= 0.5) return 'outdated';
  if (input.conflicts > 0 && input.counterScore >= 0.45) return 'conflicting';
  if (input.evidenceCount === 0 || (input.supportScore < 0.25 && input.counterScore < 0.25)) {
    return 'insufficient_evidence';
  }
  if (input.hasAuthoritative && input.supportScore >= 0.72 && input.counterScore < 0.35) {
    return 'verified';
  }
  if (input.supportScore >= 0.5 && input.counterScore < 0.4) return 'likely';
  if (input.supportScore >= 0.35) return 'uncertain';
  return 'insufficient_evidence';
};

export const userFacingTrustLabel = (verdict: TrustVerdict): string => {
  switch (verdict) {
    case 'verified':
      return 'Verified against platform records';
    case 'likely':
      return 'Likely — supported but not definitive';
    case 'uncertain':
      return 'Uncertain — limited evidence';
    case 'conflicting':
      return 'Conflicting evidence';
    case 'outdated':
      return 'Possibly outdated';
    case 'insufficient_evidence':
    default:
      return 'Insufficient evidence';
  }
};

/**
 * Build a full trust assessment from evidence items + optional claim text.
 */
export const assessTrust = (input: {
  claim?: string;
  evidence: Array<Partial<EvidenceItem> & { label: string }>;
  freshnessIso?: string | null;
  priorConfidence?: number;
}): TrustAssessment => {
  const evidence: EvidenceItem[] = (input.evidence || []).map((e, idx) => ({
    id: text(e.id) || `ev-${idx}`,
    label: text(e.label).slice(0, 160),
    detail: e.detail ? text(e.detail).slice(0, 280) : undefined,
    authority:
      typeof e.authority === 'number'
        ? Math.max(0, Math.min(1, e.authority))
        : authorityForSource(e.label, e.sourceType),
    freshness: e.freshness ?? null,
    supports: e.supports || 'context',
    sourceType: e.sourceType
  }));

  const ranked = rankEvidence(evidence);
  const conflicts = detectEvidenceConflicts(evidence);

  let support = 0;
  let supportW = 0;
  let counter = 0;
  let counterW = 0;
  for (const e of evidence) {
    if (e.supports === 'claim') {
      support += e.authority;
      supportW += 1;
    } else if (e.supports === 'counter') {
      counter += e.authority;
      counterW += 1;
    }
  }
  const supportScore = supportW ? support / supportW : 0;
  const counterScore = counterW ? counter / counterW : 0;
  const hasAuthoritative = evidence.some((e) => e.authority >= 0.85 && e.supports === 'claim');

  const freshness = evaluateKnowledgeFreshness(input.freshnessIso || null);
  const verdict = verdictFromSignals({
    supportScore,
    counterScore,
    hasAuthoritative,
    conflicts: conflicts.length,
    stale: freshness.isStale,
    evidenceCount: evidence.length
  });

  const score =
    typeof input.priorConfidence === 'number'
      ? Math.max(0, Math.min(1, (input.priorConfidence + supportScore - counterScore * 0.5) / 1.5))
      : Math.max(0, Math.min(1, supportScore * 0.85 + (hasAuthoritative ? 0.1 : 0) - counterScore * 0.35));

  const confidence = assessConfidence(
    verdict === 'verified' ? Math.max(score, 0.78) : verdict === 'likely' ? Math.max(score, 0.55) : score
  );

  const citations = ranked
    .filter((e) => e.supports === 'claim' || e.supports === 'counter' || e.authority >= 0.7)
    .slice(0, 8)
    .map((e) => ({ label: e.label, reference: e.id }));

  const reasoning = [
    input.claim ? `Claim under review: “${text(input.claim).slice(0, 160)}”.` : 'General factual assessment.',
    `Evidence items: ${evidence.length} (support=${supportScore.toFixed(2)}, counter=${counterScore.toFixed(2)}).`,
    conflicts.length ? `Conflicts detected: ${conflicts.length}.` : 'No strong conflicts detected.',
    freshness.isStale ? `Freshness: ${freshness.label}.` : `Freshness: ${freshness.label}.`,
    `Verdict: ${verdict}.`
  ].join(' ');

  return {
    verdict,
    confidence,
    evidence,
    rankedEvidence: ranked,
    conflicts,
    citations,
    reasoning,
    userFacingLabel: userFacingTrustLabel(verdict),
    hedgeRequired: verdict !== 'verified' || confidence.shouldHedge,
    freshness
  };
};

/** Map legacy contextual classifications into trust verdicts */
export const mapLegacyClassificationToVerdict = (classification: string): TrustVerdict => {
  const c = text(classification).toLowerCase();
  if (c === 'confirmed' || c === 'verified') return 'verified';
  if (c === 'supported' || c === 'likely') return 'likely';
  if (c === 'disputed' || c === 'conflicting') return 'conflicting';
  if (c === 'outdated') return 'outdated';
  if (c === 'opinion' || c === 'claimed') return 'uncertain';
  if (c === 'unverified' || c === 'insufficient_evidence') return 'insufficient_evidence';
  return 'uncertain';
};

export const buildVerificationPackage = (assessment: TrustAssessment) => ({
  verdict: assessment.verdict,
  label: assessment.userFacingLabel,
  confidence: {
    score: assessment.confidence.score,
    band: assessment.confidence.band,
    label: assessment.confidence.label
  },
  citations: assessment.citations,
  conflicts: assessment.conflicts,
  hedgeRequired: assessment.hedgeRequired,
  /** Safe user summary — never dumps internal scoring math */
  summary: `${assessment.userFacingLabel}. ${
    assessment.citations.length
      ? `Sources considered: ${assessment.citations.map((c) => c.label).join('; ')}.`
      : 'No strong authoritative sources available.'
  }${assessment.hedgeRequired ? ' Treat critical decisions as needing independent confirmation.' : ''}`
});
