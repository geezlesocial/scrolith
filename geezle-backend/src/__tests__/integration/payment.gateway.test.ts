import request from 'supertest';
import prisma from '../../utils/prismaClient';
import app from '../../testPaymentApp';

// Mock Stripe package to avoid network calls and to control webhook construction
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_integration_123', client_secret: 'cs_integration_123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_integration_123', amount_received: 5000, amount: 5000, currency: 'usd', status: 'succeeded' })
    },
      webhooks: {
        constructEvent: jest.fn((rawBody: any, sig: any, secret: any) => {
          if (sig === 'invalid-signature') throw new Error('signature detail must not reach the client');
          let parsed;
        try {
          if (Buffer.isBuffer(rawBody)) parsed = JSON.parse(rawBody.toString());
          else if (typeof rawBody === 'string') parsed = JSON.parse(rawBody);
          else parsed = rawBody;
        } catch (e) { parsed = rawBody; }
        return parsed;
      })
    }
  }));
});

describe('Payment gateway integration tests', () => {
  let adId: string | null = null;

  beforeAll(async () => {
    // Ensure dev user exists (auth middleware will upsert but ensure DB cleanliness)
    await prisma.user.upsert({ where: { id: 'dev-user-id-123' }, update: {}, create: { id: 'dev-user-id-123', email: 'dev@example.com', role: 'FREELANCER', passwordHash: 'seed' } });
  });

  afterAll(async () => {
    if (adId) {
      await prisma.adPayment.deleteMany({ where: { adId } });
      await prisma.communityAd.deleteMany({ where: { id: adId } });
    }
    await prisma.transaction.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.wallet.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.$disconnect();
  });

  test('POST /api/payments/create-intent returns client secret and id', async () => {
    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('x-dev-role', 'freelancer')
      .send({ orderId: 'order_1', amount: 50, currency: 'usd' });

    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBeDefined();
    expect(res.body.paymentIntentId).toBe('pi_integration_123');
  });

  test('Stripe webhook for payment_intent.succeeded updates ad payment and ad status', async () => {
    // Create an ad record to be paid
    const ad = await prisma.communityAd.create({ data: { title: 'Integration Ad', body: 'Ad body', placement: 'feed', budget: 50, currency: 'usd', status: 'AWAITING_PAYMENT', creator: { connect: { id: 'dev-user-id-123' } } } });
    adId = ad.id;

    // Create a matching pending AdPayment to simulate the payment-intent creation step
    await prisma.adPayment.create({ data: { adId: ad.id, transactionId: 'pi_integration_123', amount: 50, currency: 'USD', status: 'pending' } });

    const eventPayload = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_123',
          amount_received: 5000,
          amount: 5000,
          currency: 'usd',
          metadata: { adId: ad.id }
        }
      }
    };

    // Call controller directly (avoid express raw/body-parser complexities in tests)
    const { handleWebhook } = require('../../controllers/payment.controller');
    const mockReq: any = { body: eventPayload, headers: { 'stripe-signature': 't=123,v1=fake' } };
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
    await handleWebhook(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({ received: true });

    const updatedPayment = await prisma.adPayment.findFirst({ where: { adId: ad.id, transactionId: 'pi_integration_123' } });
    expect(updatedPayment?.status).toBe('completed');

    const updatedAd = await prisma.communityAd.findUnique({ where: { id: ad.id } });
    expect(updatedAd?.paymentTransactionId).toBe('pi_integration_123');
    expect(updatedAd?.status).toBe('SUBMITTED_FOR_REVIEW');
  });

  test('invalid Stripe webhook signatures return a generic error without exception details', async () => {
    const { handleWebhook } = require('../../controllers/payment.controller');
    const mockReq: any = { body: '{}', headers: { 'stripe-signature': 'invalid-signature' } };
    const mockRes: any = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };

    await handleWebhook(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.send).toHaveBeenCalledWith('Webhook signature verification failed');
    expect(mockRes.send.mock.calls[0][0]).not.toContain('signature detail');
  });

});
