import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin transfer, donate, conversion endpoints', () => {
  const devUserId = 'dev-user-id-123';
  let recipientId: string;
  let recipientUserId = 'dev-recipient-1';
  let postId: string;

  beforeAll(async () => {
    // clean
    await prisma.gcoinTransaction.deleteMany({ where: { OR: [{ userId: devUserId }, { userId: recipientUserId }] } });
    await prisma.gcoinWallet.deleteMany({ where: { OR: [{ userId: devUserId }, { userId: recipientUserId }] } });
    // remove any wallets that might conflict by recipientId
    await prisma.gcoinWallet.deleteMany({ where: { recipientId: { in: ['GC-DEV', 'GC-RECIP'] } } });
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: devUserId } });

    // ensure users
    await prisma.user.upsert({ where: { id: devUserId }, update: {}, create: { id: devUserId, email: `${devUserId}@local.dev`, role: 'USER' } });
    await prisma.user.upsert({ where: { id: recipientUserId }, update: {}, create: { id: recipientUserId, email: `${recipientUserId}@local.dev`, role: 'USER' } });

    // create wallets
    await prisma.gcoinWallet.create({ data: { userId: devUserId, recipientId: 'GC-DEV', balance: 100, lifetimeEarned: 100, status: 'active' } });
    const rw = await prisma.gcoinWallet.create({ data: { userId: recipientUserId, recipientId: 'GC-RECIP', balance: 10, lifetimeEarned: 10, status: 'active' } });
    recipientId = rw.recipientId;

    // create a post by recipient
    const post = await prisma.communityPost.create({ data: { authorId: recipientUserId, content: 'donate target', title: 'Donate me' } });
    postId = post.id;

    // ensure settings for conversion
    await prisma.gcoinSettings.upsert({ where: { id: 'default' }, update: { conversionRate: 0.01, minWithdrawal: 1 }, create: { id: 'default', conversionRate: 0.01, minWithdrawal: 1 } as any });
  });

  afterAll(async () => {
    await prisma.gcoinTransaction.deleteMany({ where: { OR: [{ userId: devUserId }, { userId: recipientUserId }] } });
    await prisma.gcoinWallet.deleteMany({ where: { OR: [{ userId: devUserId }, { userId: recipientUserId }] } });
    await prisma.communityPost.deleteMany({ where: { id: postId } });
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: devUserId } });
    await prisma.$disconnect();
  });

  test('POST /api/gcoin/transfer transfers gcoin between users', async () => {
    const res = await request(app).post('/api/gcoin/transfer').send({ toRecipientId: recipientId, amount: 5, note: 'test transfer' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const data = res.body.data;
    expect(data).toHaveProperty('from');
    expect(data).toHaveProperty('to');

    // verify balances in DB
    const senderW = await prisma.gcoinWallet.findUnique({ where: { userId: devUserId } });
    const recipW = await prisma.gcoinWallet.findUnique({ where: { userId: recipientUserId } });
    expect(Number(senderW?.balance || 0)).toBeLessThan(100);
    expect(Number(recipW?.balance || 0)).toBeGreaterThanOrEqual(15);
  });

  test('POST /api/gcoin/donate allows donating to a post', async () => {
    const res = await request(app).post('/api/gcoin/donate').send({ postId, amount: 2, note: 'ty' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const txs = await prisma.gcoinTransaction.findMany({ where: { userId: recipientUserId, type: 'donation_received' } });
    expect(txs.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/gcoin/conversions creates a conversion request', async () => {
    const res = await request(app).post('/api/gcoin/conversions').send({ amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const list = await prisma.gcoinConversionRequest.findMany({ where: { userId: devUserId } });
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
