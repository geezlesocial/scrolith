import { Request, Response } from 'express';
import Stripe from 'stripe';
import { reconcileAdPayments } from '../scripts/reconcileAdPayments';
import { buildCommunityAdActivationReadiness } from '../services/communityAdActivation.service';
import { computeCommissionBreakdown } from '../utils/commission';
import prisma from '../utils/prismaClient';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key', {
  apiVersion: '2023-10-16' as any
});

const ADS_CONFIG_SCOPE = 'community_ads_config';

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) settings = await prisma.settings.create({ data: {} });
  return settings;
};

const resolveAdActivationStatus = async (
  adId: string
): Promise<{ status: 'ACTIVE' | 'SUBMITTED_FOR_REVIEW'; blockers: string[] }> => {
  try {
    const configSetting = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    const configData: any = configSetting?.data || {};
    const approvalMode = String(configData?.approvalMode || '').toLowerCase();
    const autoApproveAds = Boolean(configData?.autoApproveAds);
    if (approvalMode !== 'auto' && !autoApproveAds) {
      return { status: 'SUBMITTED_FOR_REVIEW', blockers: [] };
    }

    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) {
      return { status: 'SUBMITTED_FOR_REVIEW', blockers: ['Campaign was not found after payment completion.'] };
    }
    const readiness = await buildCommunityAdActivationReadiness(ad);
    return readiness.canActivate
      ? { status: 'ACTIVE', blockers: [] }
      : { status: 'SUBMITTED_FOR_REVIEW', blockers: readiness.blockers };
  } catch (error) {
    console.warn('Failed to resolve ad activation status from ads config; falling back to review queue.');
    return { status: 'SUBMITTED_FOR_REVIEW', blockers: [] };
  }
};

export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const { orderId, amount, currency = 'usd' } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Order ID and amount are required' });
    }

    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid positive number' });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const baseAmount = Number(order?.amount ?? requestedAmount);
    const settings = await getOrCreateSettings();
    const commissionBreakdown = computeCommissionBreakdown(baseAmount, settings);
    const employerFee = commissionBreakdown.employerFee;
    const freelancerCommission = commissionBreakdown.freelancerFee;
    const totalCharged = Number((baseAmount + employerFee).toFixed(2));

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalCharged * 100),
      currency,
      metadata: {
        orderId: String(orderId),
        baseAmount: String(baseAmount),
        employerFee: String(employerFee),
        freelancerCommission: String(freelancerCommission),
        totalCharged: String(totalCharged)
      },
      automatic_payment_methods: { enabled: true },
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      baseAmount,
      employerFee,
      freelancerCommission,
      totalCharged
    });
  } catch (error: any) {
    console.error('Payment intent error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature']!;
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const checkoutSession: any = event.data.object;
      const adId = checkoutSession?.metadata?.adId;
      if (adId) {
        try {
          let paymentIntentId =
            typeof checkoutSession.payment_intent === 'string'
              ? checkoutSession.payment_intent
              : checkoutSession.payment_intent?.id;

          if (!paymentIntentId && checkoutSession?.id) {
            try {
              const refreshedSession = await stripe.checkout.sessions.retrieve(checkoutSession.id, {
                expand: ['payment_intent']
              });
              paymentIntentId =
                typeof (refreshedSession as any)?.payment_intent === 'string'
                  ? (refreshedSession as any).payment_intent
                  : (refreshedSession as any)?.payment_intent?.id;
            } catch (retrieveError) {
              console.warn('Unable to expand checkout session payment_intent for ad payment:', retrieveError);
            }
          }

          const transactionId = paymentIntentId || checkoutSession.id;
          const amountReceived = Number(checkoutSession.amount_total || 0) / 100;
          const currencyStr = String(checkoutSession.currency || 'usd').toUpperCase();

          const existing = await prisma.adPayment.findFirst({
            where: { adId, transactionId }
          });

          if (existing) {
            await prisma.$transaction([
              prisma.adPayment.update({
                where: { id: existing.id },
                data: { status: 'completed', amount: amountReceived, currency: currencyStr }
              }),
              prisma.communityAd.update({
                where: { id: adId },
                data: { status: 'PAID', paymentTransactionId: transactionId }
              })
            ]);
          } else {
            await prisma.$transaction([
              prisma.adPayment.create({
                data: {
                  adId,
                  transactionId,
                  amount: amountReceived,
                  currency: currencyStr,
                  status: 'completed'
                }
              }),
              prisma.communityAd.update({
                where: { id: adId },
                data: { status: 'PAID', paymentTransactionId: transactionId }
              })
            ]);
          }

          const activation = await resolveAdActivationStatus(String(adId));
          await prisma.communityAd.update({
            where: { id: adId },
            data: { status: activation.status }
          });
          try {
            const ioReal = (global as any).appIo || (global as any).io || null;
            if (ioReal && typeof ioReal.emit === 'function') {
              try { ioReal.emit('community:ad_status_updated', { adId, status: activation.status }); } catch(e){}
            }
          } catch(e){ console.error('Emit ad checkout event error:', e); }

          console.log(
            `Checkout session completed for ad ${adId}; transitioned to ${activation.status}${
              activation.blockers.length ? ` (${activation.blockers.join('; ')})` : ''
            }`
          );
        } catch (checkoutAdError) {
          console.error('Error updating ad payment from checkout session completion:', checkoutAdError);
        }
      }
      break;
    }

    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;
      const adId = paymentIntent.metadata.adId;

      try {
        if (adId) {
          // Reconcile a pending AdPayment (created when PaymentIntent was requested)
          const amountReceived = (paymentIntent.amount_received || paymentIntent.amount) / 100;
          const currencyStr = (paymentIntent.currency || 'usd').toUpperCase();
          const existing = await prisma.adPayment.findFirst({ where: { adId, transactionId: paymentIntent.id } });
          if (existing) {
            await prisma.$transaction([
              prisma.adPayment.update({ where: { id: existing.id }, data: { status: 'completed', amount: amountReceived, currency: currencyStr } }),
              prisma.communityAd.update({
                where: { id: adId },
                data: { status: 'PAID', paymentTransactionId: paymentIntent.id }
              })
            ]);
          } else {
            // Mark ad as paid and create AdPayment record
            await prisma.$transaction([
              prisma.adPayment.create({
                data: {
                  adId,
                  transactionId: paymentIntent.id,
                  amount: amountReceived,
                  currency: currencyStr,
                  status: 'completed'
                }
              }),
              prisma.communityAd.update({
                where: { id: adId },
                data: { status: 'PAID', paymentTransactionId: paymentIntent.id }
              })
            ]);
          }

          const activation = await resolveAdActivationStatus(String(adId));
          await prisma.communityAd.update({
            where: { id: adId },
            data: { status: activation.status }
          });

          console.log(
            `Payment for ad ${adId} succeeded; transitioned to ${activation.status}${
              activation.blockers.length ? ` (${activation.blockers.join('; ')})` : ''
            }`
          );
          try {
            const io = (global as any).appIo || null;
            // Try to get io from prisma context via process (fallback to runtime app)
            if (!io && typeof (global as any).getAppIo === 'function') {
              try { (global as any).appIo = (global as any).getAppIo(); } catch(e){}
            }
            const ioReal = (global as any).appIo || (global as any).io || null;
            if (ioReal && typeof ioReal.emit === 'function') {
              try { ioReal.emit('community:ad_status_updated', { adId, status: activation.status }); } catch(e){}
            }
          } catch(e){ console.error('Emit ad paid event error:', e); }
        } else if (orderId) {
          // Update escrow status and order if an orderId was provided
          try {
            const settings = await getOrCreateSettings();
            const order = await prisma.order.findUnique({ where: { id: orderId } });
            const baseAmount = Number(order?.amount ?? 0);
            const commissionBreakdown = computeCommissionBreakdown(baseAmount, settings);
            const commissionFromMetadata = Number(paymentIntent?.metadata?.freelancerCommission);
            const freelancerCommission =
              Number.isFinite(commissionFromMetadata) && commissionFromMetadata >= 0
                ? commissionFromMetadata
                : commissionBreakdown.freelancerFee;
            await prisma.escrow.update({
              where: { orderId },
              data: {
                status: 'FUNDED',
                fundedAt: new Date(),
                commission: freelancerCommission
              }
            });

            await prisma.order.update({
              where: { id: orderId },
              data: {
                status: 'PAID',
                stripeIntentId: paymentIntent.id
              }
            });

            console.log(`Payment for order ${orderId} succeeded`);
          } catch (error) {
            console.error('Error updating database after order payment:', error);
          }
        }
      } catch (error) {
        console.error('Error updating database after payment:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return res.json({ received: true });
};

export const triggerReconcileAdPayments = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.role || !user.role.toString().toLowerCase().includes('admin')) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await reconcileAdPayments();
    return res.json({ success: true, message: 'Reconciliation job triggered' });
  } catch (err: any) {
    console.error('Manual reconcile failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed' });
  }
};
