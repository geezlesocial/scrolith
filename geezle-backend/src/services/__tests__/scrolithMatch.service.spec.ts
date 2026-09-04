import { DEFAULT_SCROLITH_MATCH_CONFIG, normalizeMatchAccountType, normalizeMatchConfig } from '../scrolithMatch.service';

describe('Scrolith Match configuration contracts', () => {
  test('normalizes supported role aliases without trusting arbitrary values', () => {
    expect(normalizeMatchAccountType('employer')).toBe('CLIENT');
    expect(normalizeMatchAccountType('seller')).toBe('FREELANCER');
    expect(normalizeMatchAccountType('admin')).toBeNull();
  });

  test('clamps and normalizes operator configuration', () => {
    const config = normalizeMatchConfig({
      enabled: 'false', minimumScore: 4, maxCandidates: 1000, dailyInterestLimit: 0,
      weights: { skills: 4, experience: 0, location: 0, completeness: 0, activity: 0 }
    });
    expect(config.enabled).toBe(false);
    expect(config.minimumScore).toBe(1);
    expect(config.maxCandidates).toBe(100);
    expect(config.dailyInterestLimit).toBe(1);
    expect(Object.values(config.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(normalizeMatchConfig(null)).toEqual(DEFAULT_SCROLITH_MATCH_CONFIG);
  });
});

