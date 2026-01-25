import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key', {
  apiVersion: '2023-10-16' as any
});

export const releaseEscrow = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            freelancer: true
          }
        }
      }
    });

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    if (escrow.status !== 'FUNDED') {
      return res.status(400).json({ error: 'Escrow is not funded' });
    }

    const freelancerStripeId = escrow.order.freelancer.stripeAccountId;
    const platformFee = 0.20; // 20% platform fee
    const freelancerAmount = escrow.amount * (1 - platformFee);

    // If freelancer has Stripe account, transfer funds
    if (freelancerStripeId) {
      try {
        await stripe.transfers.create({
          amount: Math.round(freelancerAmount * 100),
          currency: 'usd',
          destination: freelancerStripeId,
          description: `Payment for order ${escrow.orderId}`
        });
      } catch (error) {
        console.error('Stripe transfer failed:', error);
        // Continue with internal wallet update even if Stripe fails
      }
    }

    // Update escrow status
    await prisma.escrow.update({
      where: { id },
      data: {
        status: 'RELEASED',
        releasedAt: new Date()
      }
    });

    // Update freelancer's wallet
    await prisma.wallet.update({
      where: { userId: escrow.order.freelancerId },
      data: {
        balance: { increment: freelancerAmount }
      }
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        userId: escrow.order.freelancerId,
        orderId: escrow.orderId,
        type: 'ESCROW_RELEASE',
        amount: freelancerAmount,
        status: 'COMPLETED',
        metadata: {
          escrowId: escrow.id,
          platformFee: escrow.amount * platformFee
        }
      }
    });

    return res.json({
      success: true,
      message: 'Escrow released successfully',
      amount: freelancerAmount
    });
  } catch (error: any) {
    console.error('Release escrow error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const refundEscrow = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: { order: true }
    });

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    if (escrow.status !== 'FUNDED') {
      return res.status(400).json({ error: 'Escrow is not funded' });
    }

    // Update escrow status
    await prisma.escrow.update({
      where: { id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date()
      }
    });

    // Update order status
    await prisma.order.update({
      where: { id: escrow.orderId },
      data: { status: 'REFUNDED' }
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        userId: escrow.order.clientId,
        orderId: escrow.orderId,
        type: 'REFUND',
        amount: escrow.amount,
        status: 'COMPLETED',
        metadata: { escrowId: escrow.id }
      }
    });

    return res.json({
      success: true,
      message: 'Escrow refunded successfully'
    });
  } catch (error: any) {
    console.error('Refund escrow error:', error);
    return res.status(500).json({ error: error.message });
  }
};