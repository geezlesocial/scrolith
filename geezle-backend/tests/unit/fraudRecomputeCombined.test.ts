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

describe('computeWalletFraudScore - combined signals', () => {
  beforeEach(() => jest.clearAllMocks());

  test('detects both rotating IPs and UA diversity together', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    prisma.gcoinWallet.findUnique.mockResolvedValue({ userId: 'u4', recipientId: 'GC-combo', balance: 100, lifetimeEarned: 1, fraudScore: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u4', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });

    // recentEvents count -> small
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(2);

    // create events with 7 distinct IPs and 12 distinct UAs
    const events = [];
    for (let i = 0; i < 7; i++) events.push({ eventKey: `x ip=2.2.2.${i} ua=UA-${i}`, createdAt: new Date() });
    for (let i = 7; i < 19; i++) events.push({ eventKey: `x ip=2.2.2.${i%7} ua=UA-${i}`, createdAt: new Date() });
    prisma.gcoinEarningEvent.findMany.mockResolvedValue(events);

    // shared-IP check returns low reuse
    prisma.gcoinEarningEvent.count.mockResolvedValue(1);

    const res = await computeWalletFraudScore('u4');
    expect(res.reasons).toEqual(expect.arrayContaining(['Rotating IPs', 'Many user-agents', 'New account']));
    expect(res.fraudScore).toBeGreaterThanOrEqual(60);
  });
});
