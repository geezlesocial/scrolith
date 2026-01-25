import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin transfer with fees', () => {
  beforeAll(async () => {
    // Ensure admin user exists
    await prisma.user.upsert({ where: { id: 'admin-user' }, update: { email: 'admin@local' , role: 'ADMIN' }, create: { id: 'admin-user', email: 'admin@local', role: 'ADMIN', isActive: true } });
    await prisma.gcoinWallet.upsert({ where: { userId: 'admin-user' }, update: { balance: 0 }, create: { userId: 'admin-user', recipientId: 'GC-ADMIN', balance: 0 } });
  });

  
  afterAll(async () => {
    // cleanup wallets and transactions created by test users
    // find wallets for users and delete any gcoinTransactions referencing them first
    const userIds = ['dev-user-id-123', 'recipient-user'];
    const wallets = await prisma.gcoinWallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const walletIds = wallets.map(w => w.id);
    if (walletIds.length > 0) {
      await prisma.gcoinTransaction.deleteMany({ where: { OR: [ { walletId: { in: walletIds } }, { fromUserId: { in: userIds } }, { toUserId: { in: userIds } }, { userId: { in: userIds } } ] } });
    }
    await prisma.gcoinTransaction.deleteMany({ where: { OR: [ { createdBy: 'dev-user-id-123' }, { userId: { in: userIds } } ] } });
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.gcoinWallet.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ['recipient-user'] } } });
  });

  test('applies percentage transfer fee and credits admin wallet', async () => {
    // prepare recipient
    const recipient = await prisma.user.upsert({ where: { id: 'recipient-user' }, update: {}, create: { id: 'recipient-user', email: 'r@example.com', role: 'USER', isActive: true } });
    await prisma.gcoinWallet.upsert({ where: { userId: 'recipient-user' }, update: { balance: 0 }, create: { userId: 'recipient-user', recipientId: 'GC-RECIP', balance: 0 } });

    // ensure sender (dev-user-id-123) has balance
    // ensure sender (dev-user-id-123) exists and has balance
    await prisma.user.upsert({ where: { id: 'dev-user-id-123' }, update: {}, create: { id: 'dev-user-id-123', email: 'dev@example.com', role: 'USER', isActive: true } });
    await prisma.gcoinWallet.upsert({ where: { userId: 'dev-user-id-123' }, update: { balance: 100 }, create: { userId: 'dev-user-id-123', recipientId: 'GC-SRC', balance: 100 } });

    // set transfer fee to 10% on settings
    const settings = await prisma.gcoinSettings.findFirst();
    if (!settings) {
      await prisma.gcoinSettings.create({ data: { transferFeeType: 'percentage', transferFeeValue: 0.1 } });
    } else {
      await prisma.gcoinSettings.update({ where: { id: settings.id }, data: { transferFeeType: 'percentage', transferFeeValue: 0.1 } });
    }

    const senderWalletBefore = await prisma.gcoinWallet.findUnique({ where: { userId: 'dev-user-id-123' } });
    const recipientWalletBefore = await prisma.gcoinWallet.findUnique({ where: { userId: 'recipient-user' } });
    const adminBefore = await prisma.gcoinWallet.findUnique({ where: { userId: 'admin-user' } });

    const res = await request(app)
      .post('/api/gcoin/transfer')
      .send({ toRecipientId: 'GC-RECIP', amount: 10 })
      .set('x-dev-role', 'freelancer');

    expect(res.status).toBe(200);

    const senderWallet = await prisma.gcoinWallet.findUnique({ where: { userId: 'dev-user-id-123' } });
    const recipientWallet = await prisma.gcoinWallet.findUnique({ where: { userId: 'recipient-user' } });
    const adminWallet = await prisma.gcoinWallet.findUnique({ where: { userId: 'admin-user' } });

    // fee = 10% of 10 = 1, total deducted = 11
    expect(Number((senderWalletBefore!.balance - (senderWallet!.balance)).toFixed(6))).toBeCloseTo(11, 6);
    expect(Number((recipientWallet!.balance))).toBeCloseTo(10, 6);
    expect(Number((adminWallet!.balance))).toBeCloseTo(1, 6);
  });
});
