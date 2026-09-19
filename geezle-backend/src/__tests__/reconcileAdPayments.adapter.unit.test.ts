const mockPrisma = { adPayment: { findMany: jest.fn().mockResolvedValue([]) } };

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma,
  disconnectPrisma: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('stripe', () => jest.fn());

import prisma, { disconnectPrisma } from '../utils/prismaClient';
import { closeReconciliationResources, reconcileAdPayments } from '../scripts/reconcileAdPayments';

describe('reconcileAdPayments Prisma adapter lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    process.env.NODE_ENV = 'test';
  });

  test('uses the shared adapter-safe client and does not construct Prisma directly', async () => {
    await expect(reconcileAdPayments()).resolves.toBeUndefined();
    expect(prisma).toBe(mockPrisma);
  });

  test('closes the shared Prisma client and pool exactly once when requested repeatedly', async () => {
    await closeReconciliationResources();
    await closeReconciliationResources();
    expect(disconnectPrisma).toHaveBeenCalledTimes(1);
  });
});
