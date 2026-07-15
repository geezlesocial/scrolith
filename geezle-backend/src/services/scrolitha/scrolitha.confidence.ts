/**
 * AI Confidence Engine — maps numeric confidence to bands and wording.
 */
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

export type ConfidenceAssessment = {
  score: number;
  band: ConfidenceBand;
  label: string;
  wordingPrefix: string;
  shouldHedge: boolean;
};

export const assessConfidence = (score: unknown): ConfidenceAssessment => {
  const n = Number(score);
  if (!Number.isFinite(n)) {
    return {
      score: 0,
      band: 'unknown',
      label: 'Unknown',
      wordingPrefix: 'I do not have enough reliable signal to be confident.',
      shouldHedge: true
    };
  }
  const scoreClamped = Math.max(0, Math.min(1, n));
  if (scoreClamped >= 0.75) {
    return {
      score: scoreClamped,
      band: 'high',
      label: 'High Confidence',
      wordingPrefix: 'Based on strong platform evidence,',
      shouldHedge: false
    };
  }
  if (scoreClamped >= 0.5) {
    return {
      score: scoreClamped,
      band: 'medium',
      label: 'Medium Confidence',
      wordingPrefix: 'Based on partial platform evidence,',
      shouldHedge: true
    };
  }
  if (scoreClamped >= 0.25) {
    return {
      score: scoreClamped,
      band: 'low',
      label: 'Low Confidence',
      wordingPrefix: 'With limited evidence,',
      shouldHedge: true
    };
  }
  return {
    score: scoreClamped,
    band: 'unknown',
    label: 'Unknown',
    wordingPrefix: 'I cannot confidently determine this from available platform records.',
    shouldHedge: true
  };
};

/** Blend multiple skill confidences with light authority weighting. */
export const blendConfidences = (parts: Array<{ confidence: number; authority?: number }>): number => {
  if (!parts.length) return 0.3;
  let num = 0;
  let den = 0;
  for (const p of parts) {
    const w = Math.max(0.1, Number(p.authority ?? 0.5));
    const c = Math.max(0, Math.min(1, Number(p.confidence) || 0));
    num += c * w;
    den += w;
  }
  return den ? num / den : 0.3;
};

export const applyConfidenceWording = (answer: string, assessment: ConfidenceAssessment): string => {
  const body = String(answer || '').trim();
  if (!body) return assessment.wordingPrefix;
  if (!assessment.shouldHedge) return body;
  // Avoid double-prefixing
  if (/^(based on|with limited|i cannot confidently|i do not have enough)/i.test(body)) return body;
  return `${assessment.wordingPrefix} ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
};
