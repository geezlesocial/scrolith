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

describe('computeWalletFraudScore - UA diversity', () => {
  beforeEach(() => jest.clearAllMocks());

  test('detects many user-agents and increases score', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    prisma.gcoinWallet.findUnique.mockResolvedValue({ userId: 'u2', recipientId: 'GC-ua', balance: 5, lifetimeEarned: 2, fraudScore: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });

    // small recent event count
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(1);

    // create 11 events each with distinct UA markers
    const events = [];
    for (let i = 0; i < 11; i++) {
      events.push({ eventKey: `action:ua=UA-${i}`, createdAt: new Date() });
    }
    prisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    // shared-IP checks -> 0
    prisma.gcoinEarningEvent.count.mockResolvedValue(0);

    const res = await computeWalletFraudScore('u2');
    expect(res.reasons).toContain('Many user-agents');
    expect(res.fraudScore).toBeGreaterThanOrEqual(20);
  });
});
