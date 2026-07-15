/**
 * Explainability — internal reasoning model + safe user-facing summaries.
 * Never expose private/hidden data or raw prompts.
 */
import type { RankedContextItem } from './scrolitha.contextRanking';
import type { SkillResult } from './scrolitha.skills';
import type { ConfidenceAssessment } from './scrolitha.confidence';
import type { TrustAssessment, TrustVerdict } from './scrolitha.trust';

export type ExplanationBlock = {
  summary: string;
  basis: Array<{ label: string; detail?: string }>;
  skillsUsed: string[];
  confidence: { band: string; label: string; score: number };
  caveats: string[];
  /** Optional trust verdict for verification answers */
  trust?: { verdict: TrustVerdict; label: string };
  /** Safe workflow name when known */
  workflow?: string | null;
};

/** Internal-only explanation model (admins / diagnostics; not all fields user-facing) */
export type InternalExplanationModel = {
  reasoningPath: string[];
  evidenceUsed: Array<{ label: string; authority?: number; supports?: string }>;
  confidence: ConfidenceAssessment;
  skillsInvoked: string[];
  workflowUsed: string | null;
  assumptions: string[];
  trustVerdict?: TrustVerdict;
  /** Sanitized for optional advanced UI */
  userSafe: ExplanationBlock;
};

export const buildExplanation = (input: {
  rankedItems?: RankedContextItem[];
  skillResults?: SkillResult[];
  confidence: ConfidenceAssessment;
  extraCaveats?: string[];
  trust?: TrustAssessment | null;
  workflow?: string | null;
  assumptions?: string[];
}): ExplanationBlock => {
  const basisMap = new Map<string, string | undefined>();

  for (const item of input.rankedItems || []) {
    if (!basisMap.has(item.sourceLabel)) {
      basisMap.set(item.sourceLabel, item.label);
    }
  }
  for (const skill of input.skillResults || []) {
    for (const src of skill.sources || []) {
      if (src && !basisMap.has(src)) basisMap.set(src, skill.title);
    }
  }
  if (input.trust?.citations?.length) {
    for (const c of input.trust.citations) {
      if (c.label && !basisMap.has(c.label)) basisMap.set(c.label, c.reference);
    }
  }

  const basis = Array.from(basisMap.entries())
    .slice(0, 8)
    .map(([label, detail]) => ({ label, detail: detail || undefined }));

  const skillsUsed = (input.skillResults || []).map((s) => s.title);
  const caveats = [
    ...(input.extraCaveats || []),
    input.confidence.shouldHedge ? 'Confidence is limited; verify critical decisions independently.' : '',
    input.trust?.hedgeRequired ? 'This assessment may require independent confirmation.' : '',
    'Private messages, hidden moderation notes, and inaccessible content are never used.'
  ].filter(Boolean);

  const summary =
    basis.length > 0
      ? `I based this answer on: ${basis.map((b) => b.label).join(', ')}.`
      : 'I based this answer on limited permission-safe platform context.';

  return {
    summary,
    basis,
    skillsUsed,
    confidence: {
      band: input.confidence.band,
      label: input.confidence.label,
      score: Number(input.confidence.score.toFixed(3))
    },
    caveats,
    trust: input.trust
      ? { verdict: input.trust.verdict, label: input.trust.userFacingLabel }
      : undefined,
    workflow: input.workflow || null
  };
};

/**
 * Full internal explanation: reasoning path, evidence, confidence, skills, workflow, assumptions.
 * User-facing surface uses `userSafe` only.
 */
export const buildInternalExplanation = (input: {
  rankedItems?: RankedContextItem[];
  skillResults?: SkillResult[];
  confidence: ConfidenceAssessment;
  workflow?: string | null;
  assumptions?: string[];
  trust?: TrustAssessment | null;
  intent?: string | null;
  extraCaveats?: string[];
}): InternalExplanationModel => {
  const skillsInvoked = (input.skillResults || []).map((s) => s.title || s.skillId || 'skill');
  const evidenceUsed = [
    ...(input.rankedItems || []).slice(0, 12).map((i) => ({
      label: i.sourceLabel || i.label,
      authority: typeof i.score === 'number' ? Math.min(1, i.score) : undefined,
      supports: 'context'
    })),
    ...(input.trust?.rankedEvidence || []).slice(0, 8).map((e) => ({
      label: e.label,
      authority: e.authority,
      supports: e.supports
    }))
  ];

  const reasoningPath = [
    input.intent ? `Interpreted intent: ${input.intent}` : 'Interpreted general assistance intent',
    input.workflow ? `Selected workflow: ${input.workflow}` : 'Selected default intelligence workflow',
    skillsInvoked.length
      ? `Invoked skills: ${skillsInvoked.join(', ')}`
      : 'No specialized skills required',
    evidenceUsed.length
      ? `Gathered ${evidenceUsed.length} evidence/context items`
      : 'Limited context available',
    input.trust
      ? `Trust verdict: ${input.trust.verdict} (${input.trust.userFacingLabel})`
      : `Confidence band: ${input.confidence.band}`,
    'Applied privacy and permission boundaries',
    'Produced answer with hedging where required'
  ];

  const assumptions = [
    ...(input.assumptions || []),
    'Only permission-safe public or self-owned context is used',
    'Platform records are authoritative only for fields they store',
    'External web verification is not simulated'
  ].slice(0, 10);

  const userSafe = buildExplanation({
    rankedItems: input.rankedItems,
    skillResults: input.skillResults,
    confidence: input.confidence,
    extraCaveats: input.extraCaveats,
    trust: input.trust,
    workflow: input.workflow,
    assumptions
  });

  return {
    reasoningPath,
    evidenceUsed,
    confidence: input.confidence,
    skillsInvoked,
    workflowUsed: input.workflow || null,
    assumptions,
    trustVerdict: input.trust?.verdict,
    userSafe
  };
};

/** Strip internal model down to user-safe fields */
export const toUserFacingExplanation = (
  internal: InternalExplanationModel
): ExplanationBlock => internal.userSafe;

export const formatExplanationForUser = (explanation: ExplanationBlock): string => {
  const lines = [
    explanation.summary,
    ...(explanation.basis.length
      ? explanation.basis.map((b) => `• ${b.label}${b.detail ? ` (${b.detail})` : ''}`)
      : []),
    `Confidence: ${explanation.confidence.label}`,
    explanation.trust ? `Trust: ${explanation.trust.label}` : ''
  ].filter(Boolean);
  return lines.join('\n');
};
