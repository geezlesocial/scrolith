import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type StripeConnectedAccount = {
  id: string;
  userId: string;
  provider: string;
  accountType: 'express' | 'standard';
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue?: {
    currentlyDue?: string[];
    eventuallyDue?: string[];
    pastDue?: string[];
    pendingVerification?: string[];
    disabledReason?: string | null;
  } | null;
  country?: string | null;
  currency?: string | null;
  status: string;
  isDisabledByAdmin: boolean;
  disabledReason?: string | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type StripePayoutStatusResponse = {
  stripe: {
    configured: boolean;
    connectEnabled: boolean;
    connectType: 'express' | 'standard';
  };
  account: StripeConnectedAccount | null;
};

export type StripeAutoPayoutFrequency = 'daily' | 'weekly' | 'monthly';

export type StripeAutoPayoutSettings = {
  enabled: boolean;
  frequency: StripeAutoPayoutFrequency;
  minimumAmount: number;
  reserveAmount: number;
  dayOfWeek: number;
  dayOfMonth: number;
  timezone: string;
  method: 'stripe';
  updatedAt?: string;
  nextRunAt?: string | null;
};

export type StripeAutoPayoutSettingsResponse = {
  stripe: {
    configured: boolean;
    connectEnabled: boolean;
    connectType: 'express' | 'standard';
  };
  account: StripeConnectedAccount | null;
  settings: StripeAutoPayoutSettings;
  canEnable: boolean;
  blockingReason?: string | null;
};

export const stripePayoutsApi = {
  async getStatus(): Promise<StripePayoutStatusResponse> {
    const response = await api.get('/payouts/stripe/status');
    return extractData<StripePayoutStatusResponse>(response);
  },
  async createAccount(payload: { accountType?: 'express' | 'standard'; country?: string } = {}) {
    const response = await api.post('/payouts/stripe/create-account', payload);
    return extractData<{ account: StripeConnectedAccount }>(response);
  },
  async createOnboardingLink() {
    const response = await api.post('/payouts/stripe/onboarding-link', {});
    return extractData<{ url: string; expiresAt?: number | null }>(response);
  },
  async createLoginLink() {
    const response = await api.post('/payouts/stripe/login-link', {});
    return extractData<{ url: string }>(response);
  },
  async disconnect() {
    const response = await api.post('/payouts/stripe/disconnect', {});
    return extractData<{ account: StripeConnectedAccount }>(response);
  },
  async getAutoSettings() {
    const response = await api.get('/payouts/stripe/auto-settings');
    return extractData<StripeAutoPayoutSettingsResponse>(response);
  },
  async saveAutoSettings(settings: StripeAutoPayoutSettings) {
    const response = await api.put('/payouts/stripe/auto-settings', settings);
    return extractData<{ settings: StripeAutoPayoutSettings }>(response);
  },
  async listAdminAccounts(status = 'all') {
    const response = await api.get('/admin/payouts/stripe/accounts', { params: { status } });
    return extractData<{ accounts: Array<StripeConnectedAccount & { user: any; wallet: any }> }>(response);
  },
  async adminDisable(userId: string, reason: string) {
    const response = await api.post(`/admin/payouts/stripe/users/${userId}/disable`, { reason });
    return extractData<{ account: StripeConnectedAccount }>(response);
  },
  async adminEnable(userId: string) {
    const response = await api.post(`/admin/payouts/stripe/users/${userId}/enable`, {});
    return extractData<{ account: StripeConnectedAccount }>(response);
  }
};
