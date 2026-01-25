import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Gcoin API smoke tests', () => {
  beforeAll(async () => {
    // ensure prisma client is connected
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('GET /api/gcoin/settings returns 200', async () => {
    const res = await request(app).get('/api/gcoin/settings').set('x-dev-role', 'admin');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });

  test('GET /api/gcoin/wallet (dev user) returns wallet', async () => {
    const res = await request(app).get('/api/gcoin/wallets/dev-user-id-123').set('x-dev-role', 'admin');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/gcoin/transfer fails without recipient', async () => {
    const res = await request(app)
      .post('/api/gcoin/transfer')
      .send({ amount: 1 })
      .set('x-dev-role', 'freelancer');
    expect(res.statusCode).toBe(400);
  });
});
