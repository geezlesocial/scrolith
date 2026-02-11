import { RecoGating, RecoPenalties } from './reco.defaults';

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export const ratio = (numerator: number, denominator: number): number => {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return clamp01(n / d);
};

export const daysSince = (value?: Date | string | null): number => {
  if (!value) return 3650;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 3650;
  const delta = Date.now() - ts;
  if (!Number.isFinite(delta)) return 3650;
  return Math.max(0, delta / (24 * 60 * 60 * 1000));
};

export const recencyScore = (value?: Date | string | null): number => {
  const days = daysSince(value);
  if (days <= 1) return 1;
  if (days <= 3) return 0.9;
  if (days <= 7) return 0.8;
  if (days <= 14) return 0.65;
  if (days <= 30) return 0.5;
  if (days <= 90) return 0.3;
  return 0.15;
};

export const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((item) => {
    if (right.has(item)) overlap += 1;
  });
  const union = left.size + right.size - overlap;
  if (!union) return 0;
  return clamp01(overlap / union);
};

export const normalizeTokens = (items: unknown[]): Set<string> => {
  const out = new Set<string>();
  items.forEach((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) out.add(normalized);
  });
  return out;
};

export const computeProfileCompleteness = (input: {
  photo?: string | null;
  bio?: string | null;
  location?: string | null;
  skills?: string[] | null;
  links?: string[] | null;
  hasPortfolio?: boolean;
}): number => {
  const checks = [
    Boolean(String(input.photo || '').trim()),
    Boolean(String(input.bio || '').trim()),
    Boolean(String(input.location || '').trim()),
    Array.isArray(input.skills) && input.skills.filter((item) => String(item || '').trim()).length > 0,
    Boolean(input.hasPortfolio),
    Array.isArray(input.links) && input.links.filter((item) => String(item || '').trim()).length > 0
  ];
  const total = checks.length || 1;
  const passed = checks.filter(Boolean).length;
  return clamp01(passed / total);
};

export type EligibilityEvaluation = {
  passed: boolean;
  reasons: string[];
};

export const evaluateEligibilityGate = (input: {
  isActive: boolean;
  blocked: boolean;
  alreadyFollowing: boolean;
  accountAgeDays: number;
  profileCompleteness: number;
  kycVerified: boolean;
  verified: boolean;
  gating: RecoGating;
  surface: string;
}): EligibilityEvaluation => {
  const reasons: string[] = [];
  if (input.gating.activeOnly && !input.isActive) {
    reasons.push('Account is not active');
  }
  if (input.gating.excludeBlocked && input.blocked) {
    reasons.push('Viewer block relationship');
  }
  if (input.surface === 'who_to_follow' && input.alreadyFollowing) {
    reasons.push('Already followed by viewer');
  }
  if (input.accountAgeDays < input.gating.minAccountAgeDays) {
    reasons.push(`Account age below ${input.gating.minAccountAgeDays} days`);
  }
  if (input.profileCompleteness < input.gating.minProfileCompleteness) {
    reasons.push(
      `Profile completeness below ${(input.gating.minProfileCompleteness * 100).toFixed(0)}%`
    );
  }
  if (input.gating.requireKyc && !input.kycVerified) {
    reasons.push('KYC verification required');
  }
  if (input.gating.requireVerified && !input.verified) {
    reasons.push('Verified account required');
  }
  return {
    passed: reasons.length === 0,
    reasons
  };
};

export type SafetyEvaluation = {
  passed: boolean;
  reasons: string[];
  penalties: {
    violationPenalty: number;
    reportRatePenalty: number;
    spamPenalty: number;
    lowQualityPenalty: number;
    totalPenalty: number;
  };
};

export const evaluateSafetyGate = (input: {
  severeViolation: boolean;
  reportRate: number;
  spamSignals: number;
  profileCompleteness: number;
  penalties: RecoPenalties;
  minProfileCompleteness: number;
}): SafetyEvaluation => {
  const reasons: string[] = [];
  let violationPenalty = 0;
  let reportRatePenalty = 0;
  let spamPenalty = 0;
  let lowQualityPenalty = 0;

  if (input.severeViolation) {
    reasons.push('Recent severe violation');
    violationPenalty = input.penalties.violationPenalty;
  }

  if (input.reportRate > input.penalties.reportRateThreshold) {
    const over = input.reportRate - input.penalties.reportRateThreshold;
    const scaled = over / Math.max(0.0001, input.penalties.reportRateThreshold);
    reportRatePenalty = clamp01(input.penalties.reportRatePenalty * scaled);
    reasons.push('High report rate');
  }

  if (input.spamSignals > 0) {
    spamPenalty = clamp01(input.penalties.spamPenalty * Math.min(1, input.spamSignals));
    reasons.push('Spam/fraud signals');
  }

  if (input.profileCompleteness < input.minProfileCompleteness) {
    lowQualityPenalty = input.penalties.lowQualityPenalty;
    reasons.push('Low profile quality');
  }

  const totalPenalty = clamp01(violationPenalty + reportRatePenalty + spamPenalty + lowQualityPenalty);
  const passed = !input.severeViolation && input.reportRate <= Math.max(0.5, input.penalties.shadowLimitReportRate * 5);
  return {
    passed,
    reasons,
    penalties: {
      violationPenalty,
      reportRatePenalty,
      spamPenalty,
      lowQualityPenalty,
      totalPenalty
    }
  };
};

