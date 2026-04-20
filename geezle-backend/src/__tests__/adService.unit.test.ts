import { selectAdsForPlacement, recordImpression, recordClick } from '../../src/services/adService';

jest.mock('@prisma/client', () => {
  const mockAd = { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() };
  const mockMetrics = { upsert: jest.fn() };
  const mockAppSetting = { findUnique: jest.fn() };
  const mockTransaction = jest.fn(async (cb: any) => cb({
    adMetricsDaily: mockMetrics,
    communityAd: mockAd
  }));
  const mockPrisma = {
    communityAd: mockAd,
    adMetricsDaily: mockMetrics,
    appSetting: mockAppSetting,
    $transaction: mockTransaction,
    $on: jest.fn()
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('adService (unit)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('selectAdsForPlacement returns active ads', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.communityAd.findMany.mockResolvedValue([{ id: 'a1', placement: 'homepage', remainingBudget: 100 }]);
    const ads = await selectAdsForPlacement('homepage');
    expect(ads).toHaveLength(1);
  });

  test('recordImpression updates metrics and ad counters', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.appSetting.findUnique.mockResolvedValue(null);
    prisma.communityAd.findUnique.mockResolvedValue({ id: 'a1', status: 'ACTIVE', remainingBudget: 10, cpm: 5, placement: 'feed' });
    prisma.adMetricsDaily.upsert.mockResolvedValue({ impressions: 1, clicks: 0, spend: 0.005 });
    prisma.communityAd.update.mockResolvedValue({ id: 'a1', impressions: 1, remainingBudget: 9.995, status: 'ACTIVE' });

    await expect(recordImpression('a1')).resolves.not.toThrow();
    expect(prisma.communityAd.findUnique).toHaveBeenCalled();
    expect(prisma.adMetricsDaily.upsert).toHaveBeenCalled();
    expect(prisma.communityAd.update).toHaveBeenCalled();
  });
});
