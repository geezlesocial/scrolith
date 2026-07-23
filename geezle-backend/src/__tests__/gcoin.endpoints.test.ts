import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin API endpoint tests', () => {
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const alice = await prisma.user.findUnique({ where: { email: 'alice+seed@local.dev' } });
    const bob = await prisma.user.findUnique({ where: { email: 'bob+seed@local.dev' } });
    if (!alice || !bob) throw new Error('Seed users missing');
    aliceId = alice.id;
    bobId = bob.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Admin can credit a user wallet', async () => {
    const res = await request(app)
      .post('/api/gcoin/admin/credit')
      .set('x-dev-role', 'admin')
      .send({ userId: aliceId, amount: 50, note: 'test credit' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const wallet = await prisma.gcoinWallet.findUnique({ where: { userId: aliceId } });
    expect(wallet).not.toBeNull();
    expect(Number(wallet?.balance)).toBeGreaterThanOrEqual(50);
  });

  test('Admin create transaction and list transactions', async () => {
    const res = await request(app)
      .post('/api/gcoin/transactions')
      .set('x-dev-role', 'admin')
      .send({ userId: bobId, amount: 5, type: 'TEST', reason: 'unit test' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const list = await request(app).get('/api/gcoin/admin/transactions').set('x-dev-role', 'admin');
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBeTruthy();
  });

  test('Conversion request lifecycle', async () => {
    await prisma.gcoinSettings.upsert({
      where: { id: 'default' },
      update: {
        conversionRate: 1,
        minWithdrawal: 0,
        conversionEnabled: true,
        autoApproveConversions: false,
        userTransfersEnabled: true,
        transferFeeType: 'percentage',
        transferFeeValue: 0
      },
      create: {
        id: 'default',
        conversionRate: 1,
        minWithdrawal: 0,
        conversionEnabled: true,
        autoApproveConversions: false,
        userTransfersEnabled: true,
        transferFeeType: 'percentage',
        transferFeeValue: 0
      } as any
    });
    // credit dev user
    await request(app).post('/api/gcoin/admin/credit').set('x-dev-role', 'admin').send({ userId: 'dev-user-id-123', amount: 100 });

    const reqRes = await request(app)
      .post('/api/gcoin/conversions')
      .set('x-dev-role', 'freelancer')
      .send({ amount: 10 });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body.success).toBe(true);

    const adminList = await request(app).get('/api/gcoin/conversions').set('x-dev-role', 'admin');
    expect(adminList.status).toBe(200);
    expect(adminList.body.success).toBe(true);
    const requests = adminList.body.data;
    expect(Array.isArray(requests)).toBeTruthy();
    const created = requests.find((r: any) => r.userId === 'dev-user-id-123' || r.user?.email === 'dev@example.com');
    expect(created).toBeTruthy();

    const id = created.id || created.requestId || created[0];
    const proc = await request(app).post(`/api/gcoin/conversions/${id}`).set('x-dev-role', 'admin').send({ action: 'approve' });
    expect(proc.status).toBe(200);
  });

  test('Admin can freeze and unfreeze a wallet', async () => {
    const freeze = await request(app).post(`/api/gcoin/wallets/${bobId}/freeze`).set('x-dev-role', 'admin');
    expect(freeze.status).toBe(200);
    const w1 = await prisma.gcoinWallet.findUnique({ where: { userId: bobId } });
    expect(w1?.status).toBe('frozen' as any);

    const unfreeze = await request(app).post(`/api/gcoin/wallets/${bobId}/unfreeze`).set('x-dev-role', 'admin');
    expect(unfreeze.status).toBe(200);
    const w2 = await prisma.gcoinWallet.findUnique({ where: { userId: bobId } });
    expect(w2?.status).toBe('active' as any);
  });
});
