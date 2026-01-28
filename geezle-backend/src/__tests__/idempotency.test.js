const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

// Use the actual middleware under test
const { idempotency } = require('../middleware/idempotency');

describe('Idempotency middleware', () => {
  test('replays stored response for identical Idempotency-Key (unit)', async () => {
    const app = express();
    app.use(bodyParser.json());

    let counter = 0;
    app.post('/test', idempotency(), (req, res) => {
      counter += 1;
      return res.json({ ok: true, count: counter });
    });

    const agent = request(app);
    const key = 'idem-test-key-123';

    const r1 = await agent.post('/test').set('Idempotency-Key', key).send({});
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ ok: true, count: 1 });

    const r2 = await agent.post('/test').set('Idempotency-Key', key).send({});
    expect(r2.status).toBe(200);
    // body should be replayed and counter should not have incremented again
    expect(r2.body).toEqual({ ok: true, count: 1 });
    expect(counter).toBe(1);
  });

  test('ads pay endpoint is idempotent and does not double-create payments (integration-ish)', async () => {
    // Mock prisma methods used by auth middleware and the ads route
    const mockPrisma = {
      user: {
        upsert: jest.fn().mockResolvedValue({ id: 'dev-user-id-123', email: 'dev@example.com', role: 'FREELANCER', isActive: true })
      },
      communityAd: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ad-1', budget: 100, currency: 'USD', creatorId: 'dev-user-id-123', remainingBudget: 100, status: 'DRAFT' }),
        update: jest.fn().mockResolvedValue({ id: 'ad-1', status: 'PAID' })
      },
      adPayment: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'pay-1', ...data }))
      }
    };

    // Replace the real prisma client with our mock in the module cache
    jest.resetModules();
    jest.doMock('../utils/prismaClient', () => mockPrisma);

    // Now import the routes with prisma mocked
    const adsRouter = require('../routes/community').default;

    const app = express();
    app.use(bodyParser.json());
    // mount the community routes under /api/community similar to server
    app.use('/api/community', adsRouter);

    const agent = request(app);
    const key = 'idem-ad-pay-456';

    // create an ad first (using the router's draft endpoint)
    const draftRes = await agent.post('/api/community/draft').set('x-dev-role', 'freelancer').send({ title: 'x', placement: 'home' });
    expect(draftRes.status).toBe(200);

    // Now call the pay endpoint twice with same Idempotency-Key
    const r1 = await agent.post('/api/community/ad-1/pay').set('Idempotency-Key', key).send({});
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveProperty('success', true);
    const r2 = await agent.post('/api/community/ad-1/pay').set('Idempotency-Key', key).send({});
    expect(r2.status).toBe(200);
    expect(r2.body).toHaveProperty('success', true);

    // Ensure adPayment.create called only once (idempotent)
    expect(mockPrisma.adPayment.create).toHaveBeenCalledTimes(1);
  }, 20000);
});
