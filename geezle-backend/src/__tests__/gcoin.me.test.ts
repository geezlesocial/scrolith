import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin user endpoints', () => {
  const devUserId = 'dev-user-id-123';

  beforeAll(async () => {
    // ensure clean state for wallets/transactions for dev user
    await prisma.gcoinTransaction.deleteMany({ where: { userId: devUserId } });
    await prisma.gcoinWallet.deleteMany({ where: { userId: devUserId } });
    // ensure dev user exists
    await prisma.user.upsert({ where: { id: devUserId }, update: {}, create: { id: devUserId, email: `${devUserId}@local.dev`, role: 'USER' } });
    await prisma.gcoinWallet.create({ data: { userId: devUserId, recipientId: 'GC-TEST-1', balance: 100, lifetimeEarned: 50, status: 'active' } });
    // create some transactions
    await prisma.gcoinTransaction.createMany({
      data: [
        { userId: devUserId, amount: 10, type: 'TEST', reason: 'test1', status: 'completed' },
        { userId: devUserId, amount: 20, type: 'TEST', reason: 'test2', status: 'completed' },
        { userId: devUserId, amount: 30, type: 'TEST', reason: 'test3', status: 'completed' }
      ]
    });
  });

  afterAll(async () => {
    // clean up
    await prisma.gcoinTransaction.deleteMany({ where: { userId: devUserId } });
    await prisma.gcoinWallet.deleteMany({ where: { userId: devUserId } });
    await prisma.$disconnect();
  });

  test('GET /api/gcoin/me returns wallet summary', async () => {
    const res = await request(app).get('/api/gcoin/me');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    const data = res.body.data;
    expect(data).toHaveProperty('wallet');
    expect(data.wallet).toHaveProperty('userId', devUserId);
    expect(typeof data.pendingEarnings).toBe('number');
  });

  test('GET /api/gcoin/transactions supports pagination', async () => {
    const res = await request(app).get('/api/gcoin/transactions').query({ limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    const payload = res.body.data;
    expect(payload).toHaveProperty('transactions');
    expect(Array.isArray(payload.transactions)).toBe(true);
    expect(payload.transactions.length).toBe(2);
    expect(payload).toHaveProperty('pagination');
    expect(payload.pagination.hasMore).toBe(true);
    expect(payload.pagination.nextCursor).toBeTruthy();
  });
});
