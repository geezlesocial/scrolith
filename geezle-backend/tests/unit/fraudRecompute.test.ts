import { computeWalletFraudScore } from '../../src/services/fraudDetector';

jest.mock('@prisma/client', () => {
  // build mocks used by computeWalletFraudScore
  const mockGcoinWallet = { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() };
  const mockUser = { findUnique: jest.fn() };
  const mockEarningEvent = { count: jest.fn(), findMany: jest.fn() };
  const mockPrisma = {
    gcoinWallet: mockGcoinWallet,
    user: mockUser,
    gcoinEarningEvent: mockEarningEvent
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('computeWalletFraudScore', () => {
  beforeEach(() => jest.clearAllMocks());

  test('detects rotating IPs and increases score', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // wallet and user fixtures
    prisma.gcoinWallet.findUnique.mockResolvedValue({ userId: 'u1', recipientId: 'GC-123', balance: 10, lifetimeEarned: 2, fraudScore: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    // recentEvents count -> small
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(1);

    // findMany returns events with distinct IPs
    const events = [];
    for (let i = 0; i < 6; i++) {
      events.push({ eventKey: `action:ip=1.2.3.${i}`, createdAt: new Date() });
    }
    prisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    // subsequent shared-IP counts (called for each distinct IP) -> return 0
    prisma.gcoinEarningEvent.count.mockResolvedValue(0);

    const res = await computeWalletFraudScore('u1');
    expect(res.fraudScore).toBeGreaterThanOrEqual(40);
    expect(res.reasons).toContain('Rotating IPs');
  });
});
