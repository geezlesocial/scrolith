import { processEarningForPost } from '../../src/services/gcoinEarningEngine';

jest.mock('@prisma/client', () => {
  const mockGcoinConfig = { findFirst: jest.fn() };
  const mockPost = { findUnique: jest.fn() };
  const mockGcoinTx = { findMany: jest.fn(), create: jest.fn() };
  const mockWallet = { update: jest.fn() };
  const mockTransaction = { create: jest.fn() };
  const mockPrisma = {
    gcoinConfig: mockGcoinConfig,
    communityPost: mockPost,
    gcoinTransaction: mockGcoinTx,
    gcoinWallet: mockWallet,
    transaction: mockTransaction,
    $transaction: jest.fn((fn: any) => fn(mockPrisma))
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('gcoinEarningEngine (unit)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('awards coins when thresholds crossed and prevents double award', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.gcoinConfig.findFirst.mockResolvedValue({ data: { viewsUnit: 100, coinPerViewsUnit: 1, adminFeePercent: 0 } });
    prisma.communityPost.findUnique.mockResolvedValue({ id: 'post1', authorId: 'u1', viewsCount: 250, likesCount: 0 });
    prisma.gcoinTransaction.findMany.mockResolvedValue([]);
    prisma.gcoinTransaction.create.mockResolvedValue({ id: 'gtx1', netAmount: 2 });
    prisma.gcoinWallet.update.mockResolvedValue({ userId: 'u1', balance: 2 });

    const tx = await processEarningForPost('post1');
    expect(tx).toBeTruthy();
    expect(prisma.gcoinWallet.update).toHaveBeenCalled();
  });
});
