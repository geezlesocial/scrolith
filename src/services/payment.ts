
import { PaymentGateway, PaymentProviderId, WithdrawalRequest, Escrow, CommissionRule, EscrowStatus } from '../types';
import api from './api';
import { withUserFacingPaymentMethodName } from '../utils/paymentGatewayDisplay';

// --- PAYMENT ADAPTER INTERFACES ---

export interface PaymentIntent {
    id: string;
    clientSecret?: string;
    redirectUrl?: string;
    provider: PaymentProviderId;
    amount: number;
    currency: string;
    status: 'pending' | 'requires_action';
}

export interface PaymentStatus {
    id: string;
    status: 'succeeded' | 'failed' | 'pending';
    providerRef: string;
}

export interface PayoutStatus {
    id: string;
    status: 'processed' | 'failed' | 'pending';
    estimatedArrival?: string;
}

// --- MOCK DATA ---

let gateways: PaymentGateway[] = [];
let escrows: Escrow[] = []; // Populated via wallet.ts usually, kept here for orchestration simulation

export const PaymentService = {
  // --- PROVIDER ORCHESTRATION ---

  getGateways: async (): Promise<PaymentGateway[]> => {
    const response = await api.get('/wallet/admin/gateways');
    const data = response?.data?.data ?? response?.data ?? [];
    gateways = Array.isArray(data) ? data : [];
    return gateways;
  },

  getPublicGateways: async (): Promise<PaymentGateway[]> => {
    const response = await api.get('/wallet/gateways');
    const data = response?.data?.data ?? response?.data ?? [];
    gateways = Array.isArray(data) ? data.map((gateway: any) => withUserFacingPaymentMethodName(gateway)) : [];
    return gateways;
  },

  getActivePaymentMethods: async (): Promise<PaymentGateway[]> => {
    const response = await api.get('/payments/methods/active');
    const data = response?.data?.data ?? response?.data ?? [];
    gateways = Array.isArray(data) ? data.map((gateway: any) => withUserFacingPaymentMethodName(gateway)) : [];
    return gateways;
  },

  getAvailableProviders: (currency: string): PaymentGateway[] => {
      return gateways.filter(g => (g.is_enabled ?? g.isEnabled) && ((g.supported_currencies && g.supported_currencies.includes(currency)) || (g.supportedCurrencies && g.supportedCurrencies.includes(currency))));
  },

  // 1. Initialize Payment (Client -> Platform)
  initializePayment: async (
      providerId: PaymentProviderId, 
      amount: number, 
      currency: string,
      orderId: string
  ): Promise<PaymentIntent> => {
      const provider = gateways.find(g => g.id === providerId);
      if (!provider || !(provider.is_enabled ?? provider.isEnabled)) {
        throw new Error('Payment provider unavailable');
      }
      if (providerId !== 'stripe') {
        throw new Error('Direct payment intent is only available for Stripe. Use hosted checkout for other providers.');
      }

      const response = await api.post('/payments/create-intent', {
        orderId,
        amount,
        currency: currency.toLowerCase()
      });
      const data = response?.data ?? response;
      const clientSecret = data?.clientSecret || data?.client_secret;
      const paymentIntentId = data?.paymentIntentId || data?.payment_intent_id;
      if (!clientSecret || !paymentIntentId) {
        throw new Error('Failed to initialize payment');
      }
      return {
        id: paymentIntentId,
        clientSecret,
        provider: providerId,
        amount,
        currency,
        status: 'requires_action'
      };
  },

  // 2. Verify Payment (Webhook/Callback Simulation)
  verifyPayment: async (paymentRef: string, providerId: PaymentProviderId): Promise<PaymentStatus> => {
      throw new Error(`Verify payment is not implemented for provider ${providerId}. Use webhooks for confirmation.`);
  },

  // 3. Payout (Platform -> Freelancer)
  payout: async (
      providerId: PaymentProviderId, 
      amount: number, 
      currency: string, 
      destinationAccount: string
  ): Promise<PayoutStatus> => {
      return new Promise(resolve => {
          setTimeout(() => {
              resolve({
                  id: `po_${Date.now()}`,
                  status: 'processed',
                  estimatedArrival: new Date(Date.now() + 86400000 * 2).toISOString() // 2 days
              });
          }, 2000);
      });
  },

  // --- ESCROW & ADMIN ---

  updateGateway: async (gateway: PaymentGateway): Promise<void> => {
        const payload = {
            id: gateway.id,
            isEnabled: gateway.isEnabled ?? (gateway as any).is_enabled ?? false,
            config: gateway.config || {}
        };
        const response = await api.post('/wallet/admin/gateways', payload);
        const data = response?.data?.data ?? response?.data ?? [];
        gateways = Array.isArray(data) ? data : [];
  },

  // For Admin Dashboard
  testGatewayConnection: async (id: string): Promise<{success: boolean; message: string}> => {
      return new Promise(resolve => setTimeout(() => {
          const gw = gateways.find(g => g.id === id);
          if (gw?.mode === 'live' && !gw.config) {
              resolve({ success: false, message: 'Missing API Credentials' });
          } else {
              resolve({ success: true, message: `Connected to ${id.toUpperCase()} (${gw?.mode})` });
          }
      }, 1000));
  }
};
