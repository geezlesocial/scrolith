import request from 'supertest';
import app from '../server';
import prisma from '../utils/prismaClient';

describe('Conversion note behavior', () => {
  let userId: string;
  let convId: string | null = null;
  beforeAll(async () => {
    userId = 'conv-user-' + Date.now().toString().slice(-6);
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, role: 'USER' } });
    // give user some gcoin balance
    await prisma.gcoinWallet.create({ data: { userId, recipientId: `GC-${Date.now().toString().slice(-6)}`, balance: 100, lifetimeEarned: 100 } });
    const rec = await prisma.gcoinConversionRequest.create({ data: { userId, amountGcoin: 10, amountFiat: 1.0, status: 'pending' } });
    convId = rec.id;
  });

  afterAll(async () => {
    if (convId) await prisma.gcoinConversionRequest.deleteMany({ where: { id: convId } });
    await prisma.gcoinTransaction.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.gcoinWallet.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test('admin approve with note creates notification for user', async () => {
    expect(convId).not.toBeNull();
    const res = await request(app).post(`/api/gcoin/conversions/${convId}`).set('x-dev-role', 'admin').send({ action: 'approve', note: 'Payout processed by admin' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // notification should exist for user
    const note = await prisma.notification.findFirst({ where: { userId } });
    expect(note).not.toBeNull();
    expect(note?.body).toContain('Admin note');
  }, 20000);
});
