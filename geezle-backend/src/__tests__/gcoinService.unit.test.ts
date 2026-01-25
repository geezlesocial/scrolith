import gcoinService from '../../src/services/gcoinService';

jest.mock('@prisma/client', () => {
  const mockWallet = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  };
  const mockGcoinTx = { create: jest.fn(), findMany: jest.fn() };
  const mockUser = { findUnique: jest.fn() };
  const mockConfig = { findFirst: jest.fn() };
  const mockTransaction = { create: jest.fn() };
  const mockPrisma = {
    gcoinWallet: mockWallet,
    gcoinTransaction: mockGcoinTx,
    user: mockUser,
    gcoinConfig: mockConfig,
    transaction: mockTransaction,
    $transaction: jest.fn((fn: any) => fn(mockPrisma))
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('GcoinService (unit)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('transfer throws on insufficient funds', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    prisma.gcoinWallet.findUnique.mockImplementation(({ where }: any) => {
      if (where.userId === 'sender') return { userId: 'sender', balance: 10, status: 'active' };
      if (where.recipientId === 'r1') return { userId: 'recipient', balance: 0, status: 'active', recipientId: 'r1' };
      return null;
    });

    await expect(gcoinService.transfer('sender', { toRecipientId: 'r1', amount: 20 })).rejects.toThrow('INSUFFICIENT_FUNDS');
  });

  test('transfer throws when wallet frozen', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.gcoinWallet.findUnique.mockImplementation(({ where }: any) => {
      if (where.userId === 'sender') return { userId: 'sender', balance: 100, status: 'frozen' };
      if (where.recipientId === 'r1') return { userId: 'recipient', balance: 0, status: 'active', recipientId: 'r1' };
      return null;
    });

    await expect(gcoinService.transfer('sender', { toRecipientId: 'r1', amount: 10 })).rejects.toThrow('WALLET_FROZEN');
  });

  test('award increments wallet and creates transaction', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.gcoinWallet.findUnique.mockResolvedValue(null);
    prisma.gcoinWallet.create.mockResolvedValue({ userId: 'u1', balance: 0 });
    prisma.gcoinTransaction.create.mockResolvedValue({ id: 'gtx1', amount: 5, netAmount: 5 });
    prisma.gcoinWallet.update.mockResolvedValue({ userId: 'u1', balance: 5 });
    prisma.transaction.create.mockResolvedValue({ id: 'tx1' });

    const tx = await gcoinService.award('u1', 5, 'test award');
    expect(tx).toHaveProperty('id', 'gtx1');
    expect(prisma.gcoinWallet.update).toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalled();
  });
});
