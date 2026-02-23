import prisma from '../utils/prismaClient';
import { computeCommissionBreakdown } from '../utils/commission';
import { awardAffiliateFirstPurchaseCommission } from './affiliateProgram.service';

type OrderPaymentStatus = 'succeeded' | 'failed';

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
};


const resolveIntent = async (provider: string, providerReferenceId: string, intentId?: string) => {
  if (intentId) {
    const direct = await prisma.orderPaymentIntent.findUnique({ where: { id: intentId } });
    if (direct) return direct;
  }

  if (providerReferenceId) {
    const byRef = await prisma.orderPaymentIntent.findFirst({
      where: { provider, providerReferenceId }
    });
    if (byRef) return byRef;

    const byId = await prisma.orderPaymentIntent.findUnique({ where: { id: providerReferenceId } });
    if (byId) return byId;
  }

  return null;
};

export const findOrderPaymentIntentByReference = async (provider: string, referenceId: string) => {
  return resolveIntent(provider, referenceId);
};

export const settleOrderPaymentIntent = async (params: {
  provider: string;
  providerReferenceId: string;
  status: OrderPaymentStatus;
  rawEvent: any;
  intentId?: string;
  stripeIntentId?: string | null;
}) => {
  const { provider, providerReferenceId, status, rawEvent, intentId, stripeIntentId } = params;
  const intent = await resolveIntent(provider, providerReferenceId, intentId);
  if (!intent) {
    throw new Error('Order payment intent not found');
  }

  if (intent.status === 'succeeded' && status === 'succeeded') {
    return intent;
  }

  const updatedIntent = await prisma.$transaction(async (tx) => {
    if (status === 'succeeded') {
      const existingSettlement = await tx.orderPaymentSettlement.findUnique({
        where: {
          provider_providerReferenceId: {
            provider,
            providerReferenceId
          }
        }
      });
      if (!existingSettlement) {
        await tx.orderPaymentSettlement.create({
          data: {
            provider,
            providerReferenceId,
            intentId: intent.id
          }
        });
      }
    }

    const updatedIntent = await tx.orderPaymentIntent.update({
      where: { id: intent.id },
      data: {
        status,
        providerReferenceId,
        providerPayload: rawEvent
      }
    });

    if (status === 'succeeded') {
      const settings = await getOrCreateSettings();
      const orderForFees = await tx.order.findUnique({ where: { id: intent.orderId } });
      const baseAmount = Number(orderForFees?.amount ?? intent.amount ?? 0);
      const commissionBreakdown = computeCommissionBreakdown(baseAmount, settings);
      const employerFee = Math.max(0, Number(intent.amount ?? 0) - baseAmount);

      await tx.order.update({
        where: { id: intent.orderId },
        data: {
          status: 'PAID',
          transactionId: providerReferenceId,
          stripeIntentId: stripeIntentId || undefined
        }
      });

      const escrow = await tx.escrow.findUnique({ where: { orderId: intent.orderId } });
      if (escrow) {
        await tx.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'FUNDED',
            fundedAt: new Date(),
            commission: escrow.commission ?? commissionBreakdown.freelancerFee
          }
        });
      } else {
        if (orderForFees) {
          await tx.escrow.create({
            data: {
              orderId: intent.orderId,
              clientId: orderForFees.clientId,
              freelancerId: orderForFees.freelancerId,
              amount: baseAmount,
              commission: commissionBreakdown.freelancerFee,
              status: 'FUNDED',
              fundedAt: new Date()
            }
          });
        }
      }

      if (employerFee > 0) {
        const admin = await tx.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
        if (admin?.id) {
          await tx.transaction.create({
            data: {
              userId: admin.id,
              type: 'COMMISSION',
              amount: employerFee,
              status: 'COMPLETED',
              description: `Employer processing fee for order ${intent.orderId}`,
              referenceId: intent.orderId,
              metadata: {
                orderId: intent.orderId,
                employerFee,
                currency: intent.currency || undefined
              }
            }
          });
        }
      }
    }

    return updatedIntent;
  });

  if (status === 'succeeded') {
    try {
      const order = await prisma.order.findUnique({ where: { id: intent.orderId } });
      if (order) {
        try {
          await awardAffiliateFirstPurchaseCommission({
            referredUserId: order.clientId,
            orderId: order.id,
            orderAmount: Number(order.amount || 0),
            currency: intent.currency || undefined
          });
        } catch (affiliateError) {
          console.warn('Affiliate first purchase commission failed', affiliateError);
        }
      }
      const ns = (global as any).appCommunityIo || null;
      if (order && ns && typeof ns.to === 'function') {
        ns.to(`community:user:${order.clientId}`).emit('orders:updated', { orderId: order.id, status: 'PAID' });
        ns.to(`community:user:${order.freelancerId}`).emit('orders:updated', { orderId: order.id, status: 'PAID' });
      }
    } catch (e) {
      // non-fatal
    }
  }

  return updatedIntent;
};
