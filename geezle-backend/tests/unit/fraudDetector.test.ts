import { scoreEvent } from '../../src/services/fraudDetector';

jest.mock('@prisma/client', () => {
  const mockEarningEvent = { count: jest.fn() };
  const mockUser = { findUnique: jest.fn() };
  const mockPrisma = {
    gcoinEarningEvent: mockEarningEvent,
    user: mockUser
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('fraudDetector', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns higher score for repeated IPs and new accounts', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(30); // IP
    prisma.gcoinEarningEvent.count.mockResolvedValueOnce(0); // UA
    prisma.user.findUnique.mockResolvedValue({ id: 'actor1', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });

    const score = await scoreEvent({ postId: 'p1', actorId: 'actor1', ip: '1.2.3.4', userAgent: 'ua' });
    expect(score).toBeGreaterThanOrEqual(20);
  });
});
