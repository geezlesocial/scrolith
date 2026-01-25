import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin admin endpoints', () => {
  const devUserId = 'dev-user-id-123';
  let convId: string;

  beforeAll(async () => {
    // ensure wallet exists and has balance
    await prisma.gcoinWallet.deleteMany({ where: { userId: devUserId } });
    await prisma.gcoinWallet.create({ data: { userId: devUserId, recipientId: 'GC-ADMIN-TEST', balance: 100, lifetimeEarned: 100, status: 'active' } });
    // create a pending conversion request directly
    const rec = await prisma.gcoinConversionRequest.create({ data: { userId: devUserId, amountGcoin: 10, amountFiat: 0.1, status: 'pending' } });
    convId = rec.id;
    // set up a suspicious wallet for fraud report
    await prisma.gcoinWallet.upsert({ where: { userId: 'suspicious-user' }, update: { fraudScore: 5, status: 'active' }, create: { userId: 'suspicious-user', recipientId: 'GC-SUS', balance: 1, lifetimeEarned: 1, fraudScore: 5, status: 'active' } as any });
  });

  afterAll(async () => {
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: devUserId } });
    await prisma.gcoinWallet.deleteMany({ where: { userId: devUserId } });
    await prisma.gcoinWallet.deleteMany({ where: { userId: 'suspicious-user' } });
    await prisma.$disconnect();
  });

  test('Admin can approve a conversion request', async () => {
    const res = await request(app)
      .post(`/api/gcoin/conversions/${convId}`)
      .set('x-dev-role', 'admin')
      .send({ action: 'approve', note: 'approved in test' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const updated = await prisma.gcoinConversionRequest.findUnique({ where: { id: convId } });
    expect(updated?.status).toBe('approved');
    // fiat wallet credited
    const fiat = await prisma.wallet.findUnique({ where: { userId: devUserId } });
    expect(fiat).toBeTruthy();
    expect(Number(fiat?.balance || 0)).toBeGreaterThan(0);
  });

  test('Admin summary endpoint returns expected fields', async () => {
    const res = await request(app).get('/api/gcoin/admin/summary').set('x-dev-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const data = res.body.data;
    expect(data).toHaveProperty('totalSupply');
    expect(data).toHaveProperty('totalLifetimeEarned');
    expect(data).toHaveProperty('platformFees');
  });

  test('Admin fraud reports returns suspicious wallets', async () => {
    const res = await request(app).get('/api/gcoin/admin/fraud').set('x-dev-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const data = res.body.data;
    expect(Array.isArray(data.suspiciousWallets)).toBe(true);
    expect(data.suspiciousWallets.find((w: any) => w.userId === 'suspicious-user')).toBeTruthy();
  });
});
