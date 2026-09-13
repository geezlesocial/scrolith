import { describe, expect, it } from 'vitest';
import { applyQualityAdjustment } from '../recommendationQuality';

describe('Phase 33.4 recommendation quality calibration', () => {
  it('applies bounded type and topic feedback adjustments', () => {
    const profile = {
      expiresAt: Date.now() + 1000,
      byType: { job: 0.08 },
      byTopic: { react: -0.08 }
    };
    expect(applyQualityAdjustment(0.5, 'job', 'react', profile)).toBe(0.5);
    expect(applyQualityAdjustment(0.98, 'job', null, profile)).toBe(1);
    expect(applyQualityAdjustment(0.02, 'unknown', 'react', profile)).toBe(0);
  });
});
