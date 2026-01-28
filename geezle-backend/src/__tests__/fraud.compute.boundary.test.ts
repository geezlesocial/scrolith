import { jest } from '@jest/globals';

const mockPrisma: any = {
  gcoinWallet: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  gcoinEarningEvent: { count: jest.fn(), findMany: jest.fn() },
};

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn().mockImplementation(() => mockPrisma) }));

let computeWalletFraudScore: any;

describe('computeWalletFraudScore boundary cases', () => {
  beforeAll(async () => {
    const mod = await import('../services/fraudDetector');
    computeWalletFraudScore = mod.computeWalletFraudScore;
  });

  beforeEach(() => jest.clearAllMocks());

  test('does not flag rotating IPs at threshold (5) but flags at 6', async () => {
    const user = 'bnd-ips';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId: user, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: user, createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) });

    // exactly 5 distinct IPs -> should NOT trigger (threshold is >5)
    const events5 = Array.from({ length: 5 }).map((_, i) => ({ eventKey: `ip=10.1.1.${i}`, createdAt: new Date() }));
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(events5);
    mockPrisma.gcoinEarningEvent.count.mockResolvedValue(0);
    const r5 = await computeWalletFraudScore(user);
    expect(r5.reasons).not.toContain('Rotating IPs');

    // 6 distinct IPs -> should trigger
    const events6 = Array.from({ length: 6 }).map((_, i) => ({ eventKey: `ip=10.1.2.${i}`, createdAt: new Date() }));
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(events6);
    const r6 = await computeWalletFraudScore(user);
    expect(r6.reasons).toContain('Rotating IPs');
  });

  test('UA boundary: 10 not flagged, 11 flagged', async () => {
    const user = 'bnd-uas';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId: user, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: user, createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) });

    const uas10 = Array.from({ length: 10 }).map((_, i) => ({ eventKey: `ua=Agent${i} ip=1.2.3.4`, createdAt: new Date() }));
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(uas10);
    mockPrisma.gcoinEarningEvent.count.mockResolvedValue(0);
    const r10 = await computeWalletFraudScore(user);
    expect(r10.reasons).not.toContain('Many user-agents');

    const uas11 = Array.from({ length: 11 }).map((_, i) => ({ eventKey: `ua=AgentX${i} ip=1.2.3.4`, createdAt: new Date() }));
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(uas11);
    const r11 = await computeWalletFraudScore(user);
    expect(r11.reasons).toContain('Many user-agents');
  });

  test('recent event velocity boundaries: 5->elevated, 21->high', async () => {
    const user = 'bnd-velocity';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId: user, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: user, createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) });

    mockPrisma.gcoinEarningEvent.count.mockImplementation(async ({ where }: any) => {
      // crude detection of the recentEvents count queries
      const str = JSON.stringify(where || {});
      if (str.includes('actorId') && str.includes('gt')) return 6;
      return 0;
    });
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue([]);
    const r5 = await computeWalletFraudScore(user);
    expect(r5.reasons).toContain('Elevated event rate');

    mockPrisma.gcoinEarningEvent.count.mockImplementation(async ({ where }: any) => {
      const str = JSON.stringify(where || {});
      if (str.includes('actorId') && str.includes('gt')) return 21;
      return 0;
    });
    const r21 = await computeWalletFraudScore(user);
    expect(r21.reasons).toContain('High event velocity');
  });

  test('shared-IP boundary: 50 not trigger, 51 triggers', async () => {
    const user = 'bnd-shared';
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue({ userId: user, fraudScore: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: user, createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) });

    // single IP in events
    const events = [{ eventKey: 'ip=198.51.100.9 ua=Agent', createdAt: new Date() }];
    mockPrisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    mockPrisma.gcoinEarningEvent.count.mockImplementation(async ({ where }: any) => {
      const s = JSON.stringify(where || {});
      if (s.includes('198.51.100.9') && s.includes('not')) return 50;
      // recentEvents check
      if (s.includes('actorId') && s.includes('gt')) return 0;
      return 0;
    });
    const r50 = await computeWalletFraudScore(user);
    expect(r50.reasons).not.toContain('Shared IP high reuse');

    mockPrisma.gcoinEarningEvent.count.mockImplementation(async ({ where }: any) => {
      const s = JSON.stringify(where || {});
      if (s.includes('198.51.100.9') && s.includes('not')) return 51;
      if (s.includes('actorId') && s.includes('gt')) return 0;
      return 0;
    });
    const r51 = await computeWalletFraudScore(user);
    expect(r51.reasons).toContain('Shared IP high reuse');
  });
});
