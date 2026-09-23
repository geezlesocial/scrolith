
import { PaymentGateway, PaymentProviderId, WithdrawalRequest, Escrow, CommissionRule, EscrowStatus } from '../types';
import { MOCK_TRANSACTIONS } from '../constants';

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

const INITIAL_GATEWAYS: PaymentGateway[] = [
  {
    id: 'stripe',
    name: 'Stripe Connect',
    isEnabled: true,
    mode: 'live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'SGD', 'INR'],
    config: { platformFeePercent: 20, escrowEnabled: true }
  },
  {
    id: 'paypal',
    name: 'PayPal',
    isEnabled: true,
    mode: 'live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'PHP', 'SGD'],
    config: { clientId: 'AX_...', payoutsEnabled: true }
  },
  {
    id: 'paystack',
    name: 'Paystack',
    isEnabled: true,
    mode: 'live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Paystack_Logo.png',
    supportedCurrencies: ['NGN', 'GHS', 'ZAR'],
    config: { publicKey: 'pk_...', splitPayment: true }
  },
  {
    id: 'flutterwave',
    name: 'Flutterwave',
    isEnabled: true,
    mode: 'live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Flutterwave_Logo.png',
    supportedCurrencies: ['NGN', 'KES', 'RWF', 'UGX', 'USD'],
    config: { encryptionKey: '...', subaccounts: true }
  },
  {
    id: 'payoneer',
    name: 'Payoneer',
    isEnabled: true,
    mode: 'live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/3/37/Payoneer_logo.svg',
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    config: { partnerId: '...', escrow: true }
  },
  {
    id: 'paymongo',
    name: 'PayMongo',
    isEnabled: true,
    mode: 'live',
    logo: 'https://images.crunchbase.com/image/upload/c_lpad,f_auto,q_auto:eco,dpr_1/vqw48yd4k3z5b9x8x3x8',
    supportedCurrencies: ['PHP'],
    config: { secretKey: 'sk_...' }
  },
  {
    id: 'monnify',
    name: 'Monnify',
    isEnabled: false,
    mode: 'test',
    logo: 'https://monnify.com/images/logo.svg',
    supportedCurrencies: ['NGN'],
    config: { contractCode: '...' }
  },
  {
    id: 'opay',
    name: 'OPay Checkout',
    isEnabled: false,
    mode: 'live',
    logo: 'https://opayweb.com/static/img/logo.png',
    supportedCurrencies: ['NGN', 'EGP'],
    config: { merchantId: '...' }
  },
  {
    id: 'xendit',
    name: 'Xendit',
    isEnabled: true,
    mode: 'live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Xendit_logo.png',
    supportedCurrencies: ['IDR', 'PHP', 'VND'],
    config: { secretKey: '...' }
  },
  {
    id: 'dragonpay',
    name: 'Dragonpay',
    isEnabled: true,
    mode: 'live',
    logo: 'https://www.dragonpay.ph/wp-content/uploads/2018/05/Dragonpay-Logo-Small.png',
    supportedCurrencies: ['PHP'],
    config: { merchantId: '...' }
  }
];

let gateways = [...INITIAL_GATEWAYS];
let escrows: Escrow[] = []; // Populated via wallet.ts usually, kept here for orchestration simulation

export const PaymentService = {
  // --- PROVIDER ORCHESTRATION ---

  getGateways: async (): Promise<PaymentGateway[]> => {
    return new Promise(resolve => setTimeout(() => resolve([...gateways]), 200));
  },

  getAvailableProviders: (currency: string): PaymentGateway[] => {
      return gateways.filter(g => g.isEnabled && g.supportedCurrencies.includes(currency));
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
              if (!provider || !provider.isEnabled) {
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
                  // This client-side adapter is a demo/mock flow; never model a
                  // provider-shaped secret, even as placeholder data.
                  intent.clientSecret = 'demo_client_secret_placeholder';
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
    return new Promise(resolve => {
        setTimeout(() => {
            gateways = gateways.map(g => g.id === gateway.id ? gateway : g);
            resolve();
        }, 300);
    });
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
