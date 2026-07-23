export {};

const mockPrisma = {
  appSetting: { findUnique: jest.fn() },
  adMetricsDaily: { upsert: jest.fn() },
  communityAd: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma))
};

jest.mock('../../src/utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

const { selectAdsForPlacement, recordImpression } = require('../../src/services/adService');

describe('adService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue(null);
  });

  test('selectAdsForPlacement returns active ads', async () => {
    mockPrisma.communityAd.findMany.mockResolvedValue([
      { id: 'a1', placement: 'homepage', remainingBudget: 100, status: 'ACTIVE' }
    ]);
    const ads = await selectAdsForPlacement('homepage');
    expect(ads).toHaveLength(1);
  });

  test('recordImpression updates metrics and ad counters', async () => {
    mockPrisma.communityAd.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'ACTIVE',
      placement: 'homepage',
      remainingBudget: 100,
      cpm: 5
    });
    mockPrisma.adMetricsDaily.upsert.mockResolvedValue({ impressions: 1, clicks: 0, spend: 0.005 });
    mockPrisma.communityAd.update.mockResolvedValue({ id: 'a1', impressions: 1, remainingBudget: 99.995, status: 'ACTIVE' });

    await expect(recordImpression('a1')).resolves.not.toThrow();
    expect(mockPrisma.adMetricsDaily.upsert).toHaveBeenCalled();
    expect(mockPrisma.communityAd.update).toHaveBeenCalled();
  });
});
