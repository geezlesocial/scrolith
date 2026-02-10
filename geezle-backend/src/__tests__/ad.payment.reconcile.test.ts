import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

// Mock Stripe to avoid network calls
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_test_123', client_secret: 'cs_test_123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_test_123', amount_received: 2000, amount: 2000, currency: 'usd', status: 'succeeded' })
    },
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_test_123' }) }
  }));
});

import { reconcileAdPayments } from '../scripts/reconcileAdPayments';

describe('Ad payment and reconciliation flow', () => {
  let adId: string | null = null;

  beforeAll(async () => {
    // ensure dev user exists via auth middleware behavior
    await prisma.user.upsert({ where: { id: 'dev-user-id-123' }, update: {}, create: { id: 'dev-user-id-123', email: 'dev@example.com', role: 'FREELANCER', passwordHash: 'seed' } });
  });

  afterAll(async () => {
    if (adId) {
      await prisma.adPayment.deleteMany({ where: { adId } });
      await prisma.communityAd.deleteMany({ where: { id: adId } });
    }
    // clean up related financial records that may block user deletion
    await prisma.transaction.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.wallet.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.gcoinConversionRequest.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.gcoinTransaction.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.gcoinWallet.deleteMany({ where: { userId: 'dev-user-id-123' } });
    // remove profile which has a foreign key to user
    await prisma.profile.deleteMany({ where: { userId: 'dev-user-id-123' } });
    await prisma.user.deleteMany({ where: { id: 'dev-user-id-123' } });
    await prisma.$disconnect();
  });

  test('payAd creates pending AdPayment and reconciliation marks it completed and PAID', async () => {
    // Create ad draft via API as dev user
    const draftRes = await request(app)
      .post('/api/community/ads/draft')
      .set('x-dev-role', 'freelancer')
      .send({ title: 'Test Ad', body: 'Buy now', placement: 'feed', budget: 20 });
    expect(draftRes.status).toBe(200);
    const ad = draftRes.body.data;
    expect(ad).toBeTruthy();
    adId = ad.id;

    // Call pay endpoint
    const payRes = await request(app)
      .post(`/api/community/ads/${adId}/pay`)
      .set('x-dev-role', 'freelancer')
      .send();
    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);
    expect(payRes.body.data.paymentIntentId).toBe('pi_test_123');

    // Verify DB: ad status awaiting payment and pending AdPayment exists
    const adDb = await prisma.communityAd.findUnique({ where: { id: adId } });
    expect(adDb?.status).toBe('AWAITING_PAYMENT');
    const payments = await prisma.adPayment.findMany({ where: { adId } });
    expect(payments.length).toBeGreaterThan(0);
    const pending = payments.find(p => p.transactionId === 'pi_test_123');
    expect(pending).toBeTruthy();
    expect(pending?.status).toBe('pending');

    // Run reconciliation (this will use mocked Stripe.retrieve)
    await reconcileAdPayments();

    // Verify DB updated
    const updatedPayment = await prisma.adPayment.findUnique({ where: { id: pending!.id } });
    expect(updatedPayment?.status).toBe('completed');
    const updatedAd = await prisma.communityAd.findUnique({ where: { id: adId } });
    expect(updatedAd?.status).toBe('PAID');
  }, 20000);

  test('rejecting ad with refund=true marks payments refunded and creates refund records', async () => {
    if (!adId) return;
    // ensure there's at least one completed payment (re-run reconcile to be safe)
    await reconcileAdPayments();
    const paymentsBefore = await prisma.adPayment.findMany({ where: { adId } });
    expect(paymentsBefore.some(p => p.status === 'completed')).toBeTruthy();

    // Call reject endpoint with refund flag
    const rejectRes = await request(app)
      .post(`/api/community/admin/ads/${adId}/reject`)
      .set('x-dev-role', 'admin')
      .send({ refund: true });
    expect(rejectRes.status).toBe(200);

    // Verify original payments marked refunded and new refund records created
    const paymentsAfter = await prisma.adPayment.findMany({ where: { adId } });
    const hasRefunded = paymentsAfter.some(p => p.amount < 0 && p.status === 'refunded');
    expect(hasRefunded).toBeTruthy();
    const anyPending = paymentsAfter.some(p => p.status === 'pending');
    expect(anyPending).toBeFalsy();
  });
});
