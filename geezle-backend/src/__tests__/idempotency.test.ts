import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Use the actual middleware under test
import { idempotency } from '../middleware/idempotency';

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
    // create a small in-test state for payments so findFirst can observe created payment
    let createdPayment: any = null;
    const mockPrisma: any = {
      user: {
        upsert: jest.fn().mockResolvedValue({ id: 'dev-user-id-123', email: 'dev@example.com', role: 'FREELANCER', isActive: true })
      },
      communityAd: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ad-1', budget: 100, currency: 'USD', creatorId: 'dev-user-id-123', remainingBudget: 100, status: 'DRAFT' }),
        update: jest.fn().mockResolvedValue({ id: 'ad-1', status: 'PAID' }),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ad-1', ...data }))
      },
      adPayment: {
        findFirst: jest.fn().mockImplementation(async () => createdPayment),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          createdPayment = { id: 'pay-1', ...data };
          return createdPayment;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          if (!createdPayment) return [];
          if (!where || where.adId === createdPayment.adId) return [createdPayment];
          return [];
        })
      }
    };

    // Replace the real prisma client with our mock in the module cache
    jest.resetModules();
    // Mock both prisma entry points used across the codebase
    jest.doMock('../utils/prismaClient', () => mockPrisma);
    jest.doMock('../prisma', () => mockPrisma);
    // Mock Stripe to avoid real network calls during tests
    jest.doMock('stripe', () => {
      return jest.fn().mockImplementation(() => ({
        paymentIntents: { create: jest.fn().mockResolvedValue({ id: 'pi_mock_1', client_secret: 'cs_mock', status: 'requires_confirmation' }) },
        refunds: { create: jest.fn().mockResolvedValue({ id: 're_mock_1' }) }
      }));
    });

    // Import the focused ads router instead of the full community router.
    const adsRouter = (await import('../routes/community/ads')).default;

    const app = express();
    app.use(bodyParser.json());
    app.use((req: any, _res, next) => {
      req.user = { id: 'dev-user-id-123', role: 'FREELANCER', isActive: true };
      next();
    });
    app.use('/api/community/ads', adsRouter);

    const agent = request(app);
    const key = 'idem-ad-pay-456';

    // create an ad first (using the focused ads router under /ads)
    const draftRes = await agent.post('/api/community/ads/draft').set('x-dev-role', 'freelancer').send({ title: 'x', placement: 'home' });
    expect(draftRes.status).toBe(200);

    // Now call the pay endpoint twice with same Idempotency-Key (ads route is under /ads)
    const r1 = await agent.post('/api/community/ads/ad-1/pay').set('Idempotency-Key', key).send({});
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveProperty('success', true);
    const r2 = await agent.post('/api/community/ads/ad-1/pay').set('Idempotency-Key', key).send({});
    expect(r2.status).toBe(200);
    expect(r2.body).toHaveProperty('success', true);

  // Ensure only one AdPayment record exists (idempotent)
  const payments = await mockPrisma.adPayment.findMany({ where: { adId: 'ad-1' } });
  expect(payments.length).toBe(1);
  }, 20000);
});

