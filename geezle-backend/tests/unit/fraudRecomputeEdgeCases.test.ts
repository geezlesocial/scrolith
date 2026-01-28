import { computeWalletFraudScore } from '../../src/services/fraudDetector';

jest.mock('@prisma/client', () => {
  const mockGcoinWallet = { findUnique: jest.fn(), update: jest.fn() };
  const mockUser = { findUnique: jest.fn() };
  const mockEarningEvent = { count: jest.fn(), findMany: jest.fn() };
  const mockPrisma = {
    gcoinWallet: mockGcoinWallet,
    user: mockUser,
    gcoinEarningEvent: mockEarningEvent
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('computeWalletFraudScore - edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  test('handles missing wallet gracefully', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // wallet missing
    prisma.gcoinWallet.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'u5', createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) });

    // no recent events
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(0);
    prisma.gcoinEarningEvent.findMany.mockResolvedValue([]);

    const res = await computeWalletFraudScore('u5');
    expect(res).toHaveProperty('fraudScore');
    expect(typeof res.fraudScore).toBe('number');
  });

  test('handles missing events without throwing', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    prisma.gcoinWallet.findUnique.mockResolvedValue({ userId: 'u6', recipientId: 'GC-edge', balance: 0, lifetimeEarned: 0, fraudScore: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u6', createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) });

    // count returns values, findMany returns null to simulate unexpected DB shape
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(0);
    prisma.gcoinEarningEvent.findMany.mockResolvedValue(null);

    const res = await computeWalletFraudScore('u6');
    expect(res).toHaveProperty('fraudScore');
    expect(Array.isArray(res.reasons)).toBe(true);
  });
});
