
import { Request, Response } from 'express';
// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

// Mock Stripe
const stripeMock = {
    paymentIntents: {
        create: async (data: any) => ({
            id: `pi_${Date.now()}`,
            client_secret: `secret_${Date.now()}`,
            amount: data.amount,
            currency: data.currency
        })
    }
};

export const createPaymentIntent = async (req: any, res: any) => {
  const { orderId, amount, currency } = req.body;

  try {
    const paymentIntent = await stripeMock.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { orderId },
      automatic_payment_methods: { enabled: true },
      capture_method: 'manual', // Hold for Escrow
    });

    console.log(`[Mock DB] Created payment intent for Order ${orderId}: ${amount} ${currency}`);

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const handleWebhook = async (req: any, res: any) => {
  // Mock webhook handler
  console.log('[Mock Webhook] Received Stripe Event');
  res.json({ received: true });
};
