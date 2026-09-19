import Stripe from 'stripe';
import prisma, { disconnectPrisma } from '../src/utils/prismaClient';

let disconnectPromise: Promise<void> | undefined;

export const closeReconciliationResources = async () => {
  if (!disconnectPromise) {
    disconnectPromise = disconnectPrisma();
  }
  return disconnectPromise;
};

export async function reconcileAdPayments() {
  console.log('Starting ad payment reconciliation...');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  // Allow running in test environment where Stripe is mocked
  const isTest = (process.env.NODE_ENV || '') === 'test';
  if (!stripeKey && !isTest) {
    console.warn('Stripe secret key not set; skipping ad payment reconciliation.');
    return;
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });

  try {
    const pending = await prisma.adPayment.findMany({ where: { status: 'pending' }, take: 200, orderBy: { createdAt: 'asc' } });
    console.log(`Found ${pending.length} pending AdPayment(s)`);
    for (const p of pending) {
      if (!p.transactionId) {
        console.log(`AdPayment ${p.id} has no transactionId; skipping`);
        continue;
      }
      try {
        const pi = await stripe.paymentIntents.retrieve(p.transactionId as string) as any;
        const amt = (pi.amount_received || pi.amount || 0) / 100;
        const currency = (pi.currency || 'usd').toUpperCase();
        if (pi.status === 'succeeded' || pi.status === 'requires_capture' || pi.status === 'processing') {
          // mark completed and update ad
          await prisma.$transaction([
            prisma.adPayment.update({ where: { id: p.id }, data: { status: 'completed', amount: amt, currency } }),
            prisma.communityAd.update({ where: { id: p.adId }, data: { status: 'PAID', paymentTransactionId: p.transactionId } })
          ]);
          console.log(`AdPayment ${p.id} reconciled as completed`);
        } else if (pi.status === 'canceled' || pi.status === 'requires_payment_method' || pi.status === 'requires_action') {
          // mark failed
          await prisma.adPayment.update({ where: { id: p.id }, data: { status: 'failed', amount: amt, currency } });
          console.log(`AdPayment ${p.id} marked failed (status=${pi.status})`);
        } else {
          console.log(`AdPayment ${p.id} still pending (stripe status=${pi.status})`);
        }
      } catch (err) {
        console.error(`Error reconciling AdPayment ${p.id}:`, (err as any)?.message || err);
      }
    }
  } catch (err) {
    console.error('Reconciliation job error:', (err as any)?.message || err);
  }
}

// If run directly, execute reconciliation and close the shared adapter/pool.
if (require.main === module) {
  let shuttingDown = false;
  const shutdown = async (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await closeReconciliationResources();
    } finally {
      process.exit(exitCode);
    }
  };
  const handleSignal = () => { void shutdown(1); };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  reconcileAdPayments()
    .then(() => shutdown(0))
    .catch(async (error) => {
      console.error('[ad-payment-reconcile] reconciliation failed:', (error as any)?.message || error);
      await shutdown(1);
    });
}
