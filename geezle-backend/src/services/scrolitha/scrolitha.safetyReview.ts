/**
 * AI Safety Review — documented mitigations for Phase 7.7.
 * Runtime helpers for abuse / privacy leakage checks (lightweight).
 */

export type SafetyRisk =
  | 'hallucination'
  | 'prompt_injection'
  | 'misinformation'
  | 'abusive_prompt'
  | 'recommendation_manipulation'
  | 'privacy_leakage';

export type SafetyMitigation = {
  risk: SafetyRisk;
  severity: 'low' | 'medium' | 'high';
  mitigations: string[];
  residualRisk: string;
};

export const SAFETY_MITIGATION_MATRIX: SafetyMitigation[] = [
  {
    risk: 'hallucination',
    severity: 'high',
    mitigations: [
      'Trust engine distinguishes verified / likely / uncertain / insufficient evidence',
      'LLM refine validates against claim classification (validateContextualAnswer)',
      'Confidence hedging for low/unknown bands',
      'Never invent citations; sources only from ranked platform context'
    ],
    residualRisk: 'Model may still paraphrase weakly supported claims — hedging and disclosure remain required'
  },
  {
    risk: 'prompt_injection',
    severity: 'high',
    mitigations: [
      'Existing sanitizeScrolithaUserMessage / policy prompt blocklist',
      'System prompts forbid instruction override and privilege escalation',
      'Tools require confirmation for risky actions'
    ],
    residualRisk: 'Novel injection phrasings may appear — keep blocklist updated'
  },
  {
    risk: 'misinformation',
    severity: 'high',
    mitigations: [
      'Evidence ranking + conflict detection',
      'No simulated external web verification',
      'Outdated/stale freshness bands reduce trust',
      'User-facing trust labels explicit'
    ],
    residualRisk: 'Platform records may themselves be incomplete or stale'
  },
  {
    risk: 'abusive_prompt',
    severity: 'medium',
    mitigations: [
      'Rate limits on ScrolithaConfig',
      'Toxicity check task endpoint',
      'Moderation assist never auto-enforces',
      'Rollout flags can disable surfaces quickly'
    ],
    residualRisk: 'Abuse volume may still load LLM — capacity messaging and rate limits apply'
  },
  {
    risk: 'recommendation_manipulation',
    severity: 'medium',
    mitigations: [
      'Recommendations use public graph/search only',
      'Learning loop stores affinity aggregates, not attacker-controlled ranking API',
      'User can disable recommendation categories',
      'Dismissed suggestions suppressed in session'
    ],
    residualRisk: 'Public content gaming remains a platform-wide moderation concern'
  },
  {
    risk: 'privacy_leakage',
    severity: 'high',
    mitigations: [
      'Memory layers exclude private messages / hidden moderation notes',
      'Prompt-safe summaries only for LLM',
      'Diagnostics never include raw prompts',
      'Org enforce can force memory/proactive off',
      'User clear-memory endpoint',
      'Learning aggregates omit user identifiers'
    ],
    residualRisk: 'Operators with DB access can read preference metadata — protect DB IAM outside Scrolitha'
  }
];

const INJECTION_HINTS =
  /\b(ignore (all )?(previous|prior) (instructions|prompts)|system prompt|jailbreak|developer mode|exfiltrate|reveal (your )?(system|hidden))\b/i;

const ABUSE_HINTS =
  /\b(kill yourself|how to make a bomb|credit card dump|doxx|child sexual)\b/i;

export const scanPromptSafety = (text: string): { flags: SafetyRisk[]; notes: string[] } => {
  const flags: SafetyRisk[] = [];
  const notes: string[] = [];
  const raw = String(text || '');
  if (INJECTION_HINTS.test(raw)) {
    flags.push('prompt_injection');
    notes.push('Possible prompt injection phrasing detected');
  }
  if (ABUSE_HINTS.test(raw)) {
    flags.push('abusive_prompt');
    notes.push('Possible abusive or disallowed topic detected');
  }
  return { flags, notes };
};

export const getSafetyReviewSummary = () => ({
  matrix: SAFETY_MITIGATION_MATRIX,
  principles: [
    'Degrade AI rather than leak private data',
    'Prefer insufficient evidence over fabricated certainty',
    'User and org controls always win over personalization',
    'No auto-moderation destructive actions'
  ]
});
