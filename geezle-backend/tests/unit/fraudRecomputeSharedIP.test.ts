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

describe('computeWalletFraudScore - shared IP high-reuse', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flags shared high-reuse IPs', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    prisma.gcoinWallet.findUnique.mockResolvedValue({ userId: 'u3', recipientId: 'GC-shared', balance: 1, lifetimeEarned: 1, fraudScore: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u3', createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    // recentEvents count
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(0);

    // events include a single IP used multiple times by this actor
    const events = [{ eventKey: 'action:ip=9.9.9.9', createdAt: new Date() }];
    prisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    // When checking shared usage for ip '9.9.9.9', return a high shared count
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(60);

    const res = await computeWalletFraudScore('u3');
    expect(res.reasons).toContain('Shared IP high reuse');
    expect(res.fraudScore).toBeGreaterThanOrEqual(25);
  });
});
