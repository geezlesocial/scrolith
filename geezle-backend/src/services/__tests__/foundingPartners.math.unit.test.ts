import { calculateEqualDistribution } from '../foundingPartners.math';

describe('Founding Partners distribution math', () => {
  it('splits a pool to cents and preserves the remainder for the final partner', () => {
    const result = calculateEqualDistribution('20.00', 3);
    expect(result.perPartner.toFixed(2)).toBe('6.67');
    expect(result.remainder.toFixed(2)).toBe('-0.01');
    expect(result.perPartner.mul(2).plus(result.perPartner.plus(result.remainder)).toFixed(2)).toBe('20.00');
  });

  it('rejects empty or non-positive partner sets', () => {
    expect(() => calculateEqualDistribution('20.00', 0)).toThrow('Partner count must be positive');
    expect(() => calculateEqualDistribution('0.00', 1)).toThrow('Distribution pool must be greater than zero');
  });
});
