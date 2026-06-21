import Stripe from 'stripe';
import prisma from '../utils/prismaClient';

export async function reconcileAdPayments() {
  console.log('Starting ad payment reconciliation...');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const isTest = (process.env.NODE_ENV || '') === 'test';
  if (!stripeKey && !isTest) {
    console.warn('Stripe secret key not set; skipping ad payment reconciliation.');
    return;
  }

  const stripe = new Stripe(stripeKey || 'sk_test_mock_key', {
    apiVersion: '2023-10-16' as any
  });

  try {
    const pending = await prisma.adPayment.findMany({
      where: { status: 'pending' },
      take: 200,
      orderBy: { createdAt: 'asc' }
    });
    console.log(`Found ${pending.length} pending AdPayment(s)`);

    for (const payment of pending) {
      if (!payment.transactionId) {
        console.log(`AdPayment ${payment.id} has no transactionId; skipping`);
        continue;
      }

      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(payment.transactionId as string) as any;
        const amount = (paymentIntent.amount_received || paymentIntent.amount || 0) / 100;
        const currency = (paymentIntent.currency || 'usd').toUpperCase();

        if (
          paymentIntent.status === 'succeeded' ||
          paymentIntent.status === 'requires_capture' ||
          paymentIntent.status === 'processing'
        ) {
          await prisma.$transaction([
            prisma.adPayment.update({
              where: { id: payment.id },
              data: { status: 'completed', amount, currency }
            }),
            prisma.communityAd.update({
              where: { id: payment.adId },
              data: { status: 'PAID', paymentTransactionId: payment.transactionId }
            })
          ]);
          console.log(`AdPayment ${payment.id} reconciled as completed`);
        } else if (
          paymentIntent.status === 'canceled' ||
          paymentIntent.status === 'requires_payment_method' ||
          paymentIntent.status === 'requires_action'
        ) {
          await prisma.adPayment.update({
            where: { id: payment.id },
            data: { status: 'failed', amount, currency }
          });
          console.log(`AdPayment ${payment.id} marked failed (status=${paymentIntent.status})`);
        } else {
          console.log(`AdPayment ${payment.id} still pending (stripe status=${paymentIntent.status})`);
        }
      } catch (error) {
        console.error(`Error reconciling AdPayment ${payment.id}:`, (error as any)?.message || error);
      }
    }
  } catch (error) {
    console.error('Reconciliation job error:', (error as any)?.message || error);
  }
}
