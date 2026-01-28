import { jest } from '@jest/globals';

// Mock Prisma client before importing the module under test
const mockPrisma: any = {
  gcoinWallet: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  gcoinEarningEvent: { count: jest.fn(), findMany: jest.fn() },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

// Import the module under test after mocking (done in beforeAll)
let computeWalletFraudScore: any;

describe('computeWalletFraudScore', () => {
  beforeAll(async () => {
    const mod = await import('../services/fraudDetector');
    computeWalletFraudScore = mod.computeWalletFraudScore;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('flags rotating IPs (many distinct IPs)', async () => {
    const userId = 'user-rotating';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId, balance: 10, lifetimeEarned: 100, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: userId, createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });

    // Create 7 distinct IPs in eventKey strings
    const events = Array.from({ length: 7 }).map((_, i) => ({ eventKey: `ip=10.0.0.${i} ua=UA${i}`, createdAt: new Date() }));
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    // default counts: recentEvents small
    mockPrisma.gcoinEarningEvent.count.mockResolvedValue(0);

    const res = await computeWalletFraudScore(userId);

    expect(res.reasons).toContain('Rotating IPs');
    expect(res.fraudScore).toBeGreaterThanOrEqual(40);
    expect(res.changed).toBe(true);
    expect(mockPrisma.gcoinWallet.update).toHaveBeenCalled();
  });

  test('flags many user-agents', async () => {
    const userId = 'user-uas';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId, balance: 0, lifetimeEarned: 0, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: userId, createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });

    // 12 distinct UA strings
    const events = Array.from({ length: 12 }).map((_, i) => ({ eventKey: `ua=Agent-${i} ip=1.2.3.4`, createdAt: new Date() }));
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    mockPrisma.gcoinEarningEvent.count.mockResolvedValue(0);

    const res = await computeWalletFraudScore(userId);

    expect(res.reasons).toContain('Many user-agents');
    expect(res.fraudScore).toBeGreaterThanOrEqual(20);
    expect(res.changed).toBe(true);
  });

  test('flags shared IP high reuse', async () => {
    const userId = 'user-shared';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId, balance: 5, lifetimeEarned: 1, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: userId, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });

    // single IP present
    const events = [{ eventKey: 'ip=203.0.113.7 ua=SomeAgent', createdAt: new Date() }];
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    // The shared-IP count call will include the IP string; return >50 to trigger shared-IP heuristic
    mockPrisma.gcoinEarningEvent.count.mockImplementation(async ({ where }: any) => {
      const ws = JSON.stringify(where || {});
      if (ws.includes('203.0.113.7') && ws.includes('not')) return 60; // shared by others
      // recent events
      if (ws.includes('actorId') && ws.includes('createdAt')) return 1;
      return 0;
    });

    const res = await computeWalletFraudScore(userId);

    expect(res.reasons).toContain('Shared IP high reuse');
    expect(res.fraudScore).toBeGreaterThanOrEqual(25);
    expect(res.changed).toBe(true);
  });
});
