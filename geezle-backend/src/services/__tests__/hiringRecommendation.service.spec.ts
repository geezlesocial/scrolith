import {
  DEFAULT_HIRING_RECOMMENDATION_CONFIG,
  evaluateHiringEligibility,
  normalizeHiringAccountType,
  normalizeHiringRecommendationConfig
} from '../hiringRecommendation.service';

const signals = {
  profileCompleteness: 0.8,
  hasProfessionalProfile: true,
  hasSkills: true,
  hasPortfolio: false,
  hasServices: false,
  hasProfessionalActivity: true,
  meaningfulInformation: true
};

describe('hiring recommendation eligibility', () => {
  test('normalizes the existing freelancer/client role vocabulary', () => {
    expect(normalizeHiringAccountType('seller')).toBe('FREELANCER');
    expect(normalizeHiringAccountType('employer')).toBe('CLIENT');
    expect(normalizeHiringAccountType('admin')).toBeNull();
  });

  test('recommends an inactive freelancer with meaningful profile signals', () => {
    expect(evaluateHiringEligibility({ accountType: 'FREELANCER', config: DEFAULT_HIRING_RECOMMENDATION_CONFIG, statusActive: false, signals }).eligible).toBe(true);
  });

  test('suppresses an already-active hiring status', () => {
    expect(evaluateHiringEligibility({ accountType: 'CLIENT', config: DEFAULT_HIRING_RECOMMENDATION_CONFIG, statusActive: true, signals })).toMatchObject({ eligible: false, reason: 'already_active' });
  });

  test('keeps account-specific state isolated and respects cooldown', () => {
    const now = new Date('2026-09-03T00:00:00.000Z');
    const state = { lastDismissedAt: new Date('2026-09-01T00:00:00.000Z'), snoozeUntil: null, impressionCount: 0, sessionKey: null, sessionImpressionCount: 0, dismissCount: 1 };
    expect(evaluateHiringEligibility({ accountType: 'FREELANCER', config: DEFAULT_HIRING_RECOMMENDATION_CONFIG, statusActive: false, signals, state, now })).toMatchObject({ eligible: false, reason: 'cooldown' });
    expect(evaluateHiringEligibility({ accountType: 'CLIENT', config: DEFAULT_HIRING_RECOMMENDATION_CONFIG, statusActive: false, signals, now })).toMatchObject({ eligible: true });
  });

  test('normalizes admin content and timing without accepting unsafe markup or extremes', () => {
    const config = normalizeHiringRecommendationConfig({ enabled: 'false', freelancer: { title: '<script>bad</script>', eligibilityThreshold: 4 }, timing: { maxPerSession: 0 } });
    expect(config.enabled).toBe(false);
    expect(config.freelancer.title).not.toContain('<');
    expect(config.freelancer.eligibilityThreshold).toBe(1);
    expect(config.timing.maxPerSession).toBe(1);
  });
});
