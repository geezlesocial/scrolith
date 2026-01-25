import { selectAdsForPlacement, recordImpression, recordClick } from '../../src/services/adService';

jest.mock('@prisma/client', () => {
  const mockAd = { findMany: jest.fn(), update: jest.fn() };
  const mockExecuteRaw = jest.fn();
  const mockPrisma = {
    communityAd: mockAd,
    $executeRaw: mockExecuteRaw
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('adService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('selectAdsForPlacement returns active ads', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.communityAd.findMany.mockResolvedValue([{ id: 'a1', remainingBudget: 100 }]);
    const ads = await selectAdsForPlacement('homepage');
    expect(ads).toHaveLength(1);
  });

  test('recordImpression updates metrics and ad counters', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.$executeRaw.mockResolvedValue(undefined);
    prisma.communityAd.update.mockResolvedValue({ id: 'a1', impressions: 1 });

    await expect(recordImpression('a1')).resolves.not.toThrow();
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.communityAd.update).toHaveBeenCalled();
  });
});
