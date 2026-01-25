import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin conversion approval flow', () => {
  let adminToken: string | null = null;
  let userId: string | null = null;
  let convId: string | null = null;

  beforeAll(async () => {
    // create admin user and normal user
    const admin = await prisma.user.upsert({ where: { email: 'admin-seed@example.com' }, update: {}, create: { email: 'admin-seed@example.com', name: 'Admin Seed', role: 'ADMIN', passwordHash: 'seed' } });
    const user = await prisma.user.upsert({ where: { email: 'conv-user@example.com' }, update: {}, create: { email: 'conv-user@example.com', name: 'Conv User', role: 'USER', passwordHash: 'seed' } });
    userId = user.id;

    // ensure wallet and fund gcoin
    await prisma.gcoinWallet.upsert({ where: { userId: user.id }, update: { balance: 100 }, create: { userId: user.id, recipientId: `GC-${Date.now().toString().slice(-6)}`, balance: 100 } });

    // create conversion request
    const rec = await prisma.gcoinConversionRequest.create({ data: { userId: user.id, amountGcoin: 10, amountFiat: 1.0, status: 'pending' } });
    convId = rec.id;

    // Test app uses x-dev-role header to simulate admin; no real auth token
    adminToken = 'admin';
  });

  afterAll(async () => {
    // cleanup
    if (convId) await prisma.gcoinConversionRequest.deleteMany({ where: { id: convId } });
    if (userId) {
      // delete created fiat wallet and transactions created by conversion approve
      await prisma.transaction.deleteMany({ where: { userId } });
      await prisma.wallet.deleteMany({ where: { userId } });
      await prisma.gcoinWallet.deleteMany({ where: { userId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['admin-seed@example.com','conv-user@example.com'] } } });
    await prisma.$disconnect();
  });

  test('Admin approve conversion creates Transaction and credits Wallet', async () => {
    const res = await request(app).post(`/api/gcoin/conversions/${convId}`).set('x-dev-role', 'admin').send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // verify conversion marked approved
    const rec = await prisma.gcoinConversionRequest.findUnique({ where: { id: convId } });
    expect(rec?.status).toBe('approved');

    // verify user's gcoin decreased
    const gw = await prisma.gcoinWallet.findUnique({ where: { userId } });
    expect(gw?.balance).toBeCloseTo(90);

    // verify fiat wallet updated and transaction created
    const w = await prisma.wallet.findUnique({ where: { userId } });
    expect(w).toBeTruthy();
    const txs = await prisma.transaction.findMany({ where: { userId } });
    const found = txs.find(t => t.referenceId === convId);
    expect(found).toBeTruthy();
  });
});
