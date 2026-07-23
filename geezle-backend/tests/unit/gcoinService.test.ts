export {};

const mockPrisma = {
  gcoinWallet: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  gcoinTransaction: { create: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn(), findFirst: jest.fn() },
  gcoinConfig: { findFirst: jest.fn() },
  transaction: { create: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma))
};

jest.mock('../../src/utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

const gcoinService = require('../../src/services/gcoinService').default;

describe('GcoinService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.gcoinConfig.findFirst.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
  });

  test('transfer throws on insufficient funds', async () => {
    mockPrisma.gcoinWallet.findUnique.mockImplementation(({ where }: any) => {
      if (where.userId === 'sender') return { userId: 'sender', balance: 10, status: 'active' };
      if (where.recipientId === 'r1') return { userId: 'recipient', balance: 0, status: 'active', recipientId: 'r1' };
      return null;
    });

    await expect(gcoinService.transfer('sender', { toRecipientId: 'r1', amount: 20 })).rejects.toThrow('INSUFFICIENT_FUNDS');
  });

  test('transfer throws when wallet frozen', async () => {
    mockPrisma.gcoinWallet.findUnique.mockImplementation(({ where }: any) => {
      if (where.userId === 'sender') return { userId: 'sender', balance: 100, status: 'frozen' };
      if (where.recipientId === 'r1') return { userId: 'recipient', balance: 0, status: 'active', recipientId: 'r1' };
      return null;
    });

    await expect(gcoinService.transfer('sender', { toRecipientId: 'r1', amount: 10 })).rejects.toThrow('WALLET_FROZEN');
  });

  test('award increments wallet and creates transaction', async () => {
    mockPrisma.gcoinWallet.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrisma.gcoinWallet.create.mockResolvedValue({ userId: 'u1', balance: 0 });
    mockPrisma.gcoinTransaction.create.mockResolvedValue({ id: 'gtx1', amount: 5, netAmount: 5 });
    mockPrisma.gcoinWallet.update.mockResolvedValue({ userId: 'u1', balance: 5 });
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx1' });

    const tx = await gcoinService.award('u1', 5, 'test award');
    expect(tx).toHaveProperty('id', 'gtx1');
    expect(mockPrisma.gcoinWallet.update).toHaveBeenCalled();
    expect(mockPrisma.transaction.create).toHaveBeenCalled();
  });
});
