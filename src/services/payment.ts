
import { PaymentGateway, PaymentProviderId, WithdrawalRequest, Escrow, CommissionRule, EscrowStatus } from '../types';
import { MOCK_TRANSACTIONS } from '../constants';
import api from './api';

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
      return new Promise((resolve, reject) => {
          setTimeout(() => {
              const provider = gateways.find(g => g.id === providerId);
                if (!provider || !(provider.is_enabled ?? provider.isEnabled)) {
                  reject(new Error('Payment provider unavailable'));
                  return;
              }

              // Mock Provider-Specific Logic
              let intent: PaymentIntent = {
                  id: `pi_${providerId}_${Math.random().toString(36).substr(2, 9)}`,
                  provider: providerId,
                  amount,
                  currency,
                  status: 'requires_action'
              };

              if (providerId === 'stripe') {
                  intent.clientSecret = 'pi_123_secret_456';
              } else if (providerId === 'paypal') {
                  intent.redirectUrl = 'https://www.paypal.com/checkoutnow?token=...';
              } else if (providerId === 'paystack' || providerId === 'flutterwave') {
                  intent.redirectUrl = 'https://checkout.provider.com/pay/...';
              }

              resolve(intent);
          }, 800);
      });
  },

  // 2. Verify Payment (Webhook/Callback Simulation)
  verifyPayment: async (paymentRef: string, providerId: PaymentProviderId): Promise<PaymentStatus> => {
      return new Promise(resolve => {
          setTimeout(() => {
              resolve({
                  id: paymentRef,
                  status: 'succeeded',
                  providerRef: `txn_${providerId}_${Date.now()}`
              });
          }, 1500);
      });
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
      isEnabled: (gateway as any).isEnabled ?? (gateway as any).is_enabled ?? false
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
