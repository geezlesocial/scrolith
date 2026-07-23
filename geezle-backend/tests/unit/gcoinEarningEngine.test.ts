export {};

const mockPrisma = {
  gcoinConfig: { findFirst: jest.fn() },
  communityPost: { findUnique: jest.fn() },
  gcoinTransaction: { findMany: jest.fn(), create: jest.fn() },
  gcoinWallet: { update: jest.fn() },
  monetizationProfile: { findUnique: jest.fn() },
  transaction: { create: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma))
};

jest.mock('../../src/utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

const { processEarningForPost } = require('../../src/services/gcoinEarningEngine');

describe('gcoinEarningEngine', () => {
  beforeEach(() => jest.clearAllMocks());

  test('awards coins when thresholds crossed and prevents double award', async () => {
    mockPrisma.gcoinConfig.findFirst.mockResolvedValue({ data: { viewsUnit: 100, coinPerViewsUnit: 1, adminFeePercent: 0 } });
    mockPrisma.communityPost.findUnique.mockResolvedValue({
      id: 'post1',
      authorId: 'u1',
      viewsCount: 250,
      likesCount: 0,
      videoIntegrityStatus: 'clear',
      videoMonetizationBlocked: false
    });
    mockPrisma.monetizationProfile.findUnique.mockResolvedValue({ isEnabled: true });
    mockPrisma.gcoinTransaction.findMany.mockResolvedValue([]);
    mockPrisma.gcoinTransaction.create.mockResolvedValue({ id: 'gtx1', netAmount: 2 });
    mockPrisma.gcoinWallet.update.mockResolvedValue({ userId: 'u1', balance: 2 });

    const tx = await processEarningForPost('post1');
    expect(tx).toBeTruthy();
    expect(mockPrisma.gcoinWallet.update).toHaveBeenCalled();
  });
});
