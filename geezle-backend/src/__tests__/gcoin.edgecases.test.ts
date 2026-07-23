import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin edge cases', () => {
  const senderId = 'dev-user-id-123';
  const recipientId = 'edge-recipient-1';
  let prevSettings: any = null;
  const enabledSettings = {
    conversionRate: 0.5,
    minWithdrawal: 0,
    conversionEnabled: true,
    autoApproveConversions: false,
    userTransfersEnabled: true,
    transferFeeType: 'percentage',
    transferFeeValue: 0,
    viewsUnit: 200,
    likesUnit: 30,
    repostsUnit: 40,
    sharesUnit: 50,
    coinPerViewsUnit: 1,
    coinPerLikesUnit: 1,
    coinPerRepostsUnit: 1,
    coinPerSharesUnit: 1,
    adminFeePercent: 0.1
  };

  beforeAll(async () => {
    // ensure users and clean state
    await prisma.gcoinTransaction.deleteMany({ where: { OR: [{ userId: senderId }, { userId: recipientId }] } });
    await prisma.gcoinWallet.deleteMany({ where: { OR: [{ userId: senderId }, { userId: recipientId }] } });
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: senderId } });

    await prisma.user.upsert({ where: { id: senderId }, update: { email: 'dev@example.com' }, create: { id: senderId, email: 'dev@example.com', role: 'USER' } });
    await prisma.user.upsert({ where: { id: recipientId }, update: {}, create: { id: recipientId, email: `${recipientId}@local.dev`, role: 'USER' } });

    await prisma.gcoinWallet.create({ data: { userId: senderId, recipientId: `GC-S-${Date.now().toString().slice(-6)}`, balance: 1, lifetimeEarned: 1, status: 'active' } });
    await prisma.gcoinWallet.create({ data: { userId: recipientId, recipientId: `GC-R-${Date.now().toString().slice(-6)}`, balance: 0, lifetimeEarned: 0, status: 'active' } });
    // capture existing settings to avoid interfering with other tests
    prevSettings = await prisma.gcoinSettings.findFirst();
  });

  afterAll(async () => {
    await prisma.gcoinTransaction.deleteMany({ where: { OR: [{ userId: senderId }, { userId: recipientId }] } });
    await prisma.gcoinWallet.deleteMany({ where: { OR: [{ userId: senderId }, { userId: recipientId }] } });
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: senderId } });
    // restore previous gcoin settings if any
    if (!prevSettings || prevSettings.id !== 'default') {
      await prisma.gcoinSettings.deleteMany({ where: { id: 'default' } });
    }
    if (prevSettings) {
      const { id, createdAt, updatedAt, ...restoredSettings } = prevSettings;
      await prisma.gcoinSettings.update({ where: { id: prevSettings.id }, data: restoredSettings as any });
    }
    await prisma.$disconnect();
  });

  test('transfer fails when insufficient balance for amount+fee', async () => {
    // set transfer fee high so small balance is insufficient
    await prisma.gcoinSettings.upsert({
      where: { id: 'default' },
      update: { ...enabledSettings, transferFeeType: 'percentage', transferFeeValue: 0.5 },
      create: { id: 'default', ...enabledSettings, transferFeeType: 'percentage', transferFeeValue: 0.5 } as any
    });

    const res = await request(app)
      .post('/api/gcoin/transfer')
      .send({ toRecipientId: (await prisma.gcoinWallet.findUnique({ where: { userId: recipientId } }))!.recipientId, amount: 1 })
      .set('x-dev-role', 'freelancer');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
  });

  test('transfer blocked when sender wallet frozen', async () => {
    // freeze sender wallet
    await prisma.gcoinWallet.update({ where: { userId: senderId }, data: { status: 'frozen' } });
    const res = await request(app).post('/api/gcoin/transfer').send({ toRecipientId: (await prisma.gcoinWallet.findUnique({ where: { userId: recipientId } }))!.recipientId, amount: 0.1 }).set('x-dev-role', 'freelancer');
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('success', false);
    // unfreeze for cleanup
    await prisma.gcoinWallet.update({ where: { userId: senderId }, data: { status: 'active' } });
  });

  test('conversion request respects min withdrawal and rate calculation', async () => {
    // set conversion settings
    await prisma.gcoinSettings.upsert({
      where: { id: 'default' },
      update: { ...enabledSettings, conversionRate: 0.5, minWithdrawal: 10 },
      create: { id: 'default', ...enabledSettings, conversionRate: 0.5, minWithdrawal: 10 } as any
    });

    // insufficient (below min)
    const resFail = await request(app).post('/api/gcoin/conversions').send({ amount: 1 }).set('x-dev-role', 'freelancer');
    expect(resFail.status).toBe(400);

    // fund wallet and valid request
    await prisma.gcoinWallet.update({ where: { userId: senderId }, data: { balance: 100 } });
    const resOk = await request(app).post('/api/gcoin/conversions').send({ amount: 20 }).set('x-dev-role', 'freelancer');
    expect(resOk.status).toBe(200);
    expect(resOk.body.data).toHaveProperty('amountFiat');
    const rec = await prisma.gcoinConversionRequest.findUnique({ where: { id: resOk.body.data.id } });
    expect(Number(rec!.amountFiat)).toBeCloseTo(20 * 0.5, 6);
  });

  test('admin can deny conversion request', async () => {
    // create pending conversion
    const rec = await prisma.gcoinConversionRequest.create({ data: { userId: senderId, amountGcoin: 5, amountFiat: 0, status: 'pending' } });
    const res = await request(app).post(`/api/gcoin/conversions/${rec.id}`).set('x-dev-role', 'admin').send({ action: 'deny' });
    expect(res.status).toBe(200);
    const updated = await prisma.gcoinConversionRequest.findUnique({ where: { id: rec.id } });
    expect(updated?.status).toBe('denied');
  });
});
