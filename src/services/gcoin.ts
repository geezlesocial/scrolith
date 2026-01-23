import api from './api';
import { GcoinWallet, GcoinTransaction, GcoinSettings, GcoinConversionRequest } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const mapGcoinTransaction = (t: any) => ({
  id: t.id,
  userId: t.user_id ?? t.userId,
  userName: t.user_name ?? t.userName,
  amount: t.amount,
  type: t.type,
  reason: t.reason,
  referenceId: t.reference_id ?? t.referenceId,
  recipientId: t.recipient_id ?? t.recipientId,
  timestamp: t.timestamp ?? t.created_at ?? t.createdAt,
  status: t.status,
  source: t.source
});

const mapGcoinWallet = (w: any) => ({
  userId: w.user_id ?? w.userId,
  recipientId: w.recipient_id ?? w.recipientId,
  balance: w.balance ?? 0,
  lifetimeEarned: w.lifetime_earned ?? w.lifetimeEarned ?? 0,
  transactions: Array.isArray(w.transactions) ? w.transactions.map(mapGcoinTransaction) : [],
  status: w.status ?? 'active',
  fraudScore: w.fraud_score ?? w.fraudScore ?? 0,
  updatedAt: w.updated_at ?? w.updatedAt
});

const mapGcoinSettings = (s: any) => ({
  conversionRate: s.conversion_rate ?? s.conversionRate ?? 0,
  minWithdrawal: s.min_withdrawal ?? s.minWithdrawal ?? 0,
  conversionEnabled: s.conversion_enabled ?? s.conversionEnabled ?? false,
  userTransfersEnabled: s.user_transfers_enabled ?? s.userTransfersEnabled ?? false
});

const unmapGcoinSettings = (s: any) => ({
  conversion_rate: s.conversionRate ?? s.conversion_rate ?? 0,
  min_withdrawal: s.minWithdrawal ?? s.min_withdrawal ?? 0,
  conversion_enabled: s.conversionEnabled ?? s.conversion_enabled ?? false,
  user_transfers_enabled: s.userTransfersEnabled ?? s.user_transfers_enabled ?? false
});

const mapGcoinConversionRequest = (r: any) => ({
  id: r.id,
  userId: r.user_id ?? r.userId,
  userName: r.user_name ?? r.userName ?? '',
  amountGcoin: r.amount_gcoin ?? r.amountGcoin ?? 0,
  amountFiat: r.amount_fiat ?? r.amountFiat ?? 0,
  status: r.status ?? 'pending',
  requestedAt: r.requested_at ?? r.requestedAt
});

export const GcoinService = {
  getWallet: async (userId: string, email?: string): Promise<GcoinWallet> => {
    const response = await api.get(`/gcoin/wallets/${userId}`, { params: email ? { email } : undefined });
    return mapGcoinWallet(extractData<any>(response));
  },

  getAllWallets: async (): Promise<GcoinWallet[]> => {
    const response = await api.get('/gcoin/wallets');
    const data = extractData<any[]>(response);
    return Array.isArray(data) ? data.map(mapGcoinWallet) : [];
  },

  creditUser: async (identifier: string, amount: number, reason: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/gcoin/admin/credit', { identifier, amount, reason });
    return extractData<{ success: boolean; message: string }>(response);
  },

  transfer: async (
    senderId: string,
    recipientIdentifier: string,
    amount: number,
    note: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/gcoin/transfer', { senderId, recipientIdentifier, amount, note });
    return extractData<{ success: boolean; message: string }>(response);
  },

  checkAndAward: async (userId: string, type: 'like' | 'repost' | 'share', count: number): Promise<boolean> => {
    const response = await api.post('/gcoin/rewards', { userId, type, count });
    const data = extractData<{ success?: boolean }>(response);
    return Boolean(data?.success);
  },

  addTransaction: async (
    userId: string,
    amount: number,
    type: GcoinTransaction['type'],
    reason: string,
    refId?: string
  ): Promise<void> => {
    await api.post('/gcoin/transactions', { userId, amount, type, reason, referenceId: refId });
  },

  getSettings: async (): Promise<GcoinSettings> => {
    const response = await api.get('/gcoin/settings');
    return mapGcoinSettings(extractData<any>(response));
  },

  saveSettings: async (settings: GcoinSettings): Promise<void> => {
    await api.post('/gcoin/settings', unmapGcoinSettings(settings));
  },

  requestConversion: async (userId: string, amountGcoin: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/gcoin/conversions', { userId, amountGcoin });
    return extractData<{ success: boolean; message: string }>(response);
  },

  getConversionRequests: async (): Promise<GcoinConversionRequest[]> => {
    const response = await api.get('/gcoin/conversions');
    const data = extractData<any[]>(response);
    return Array.isArray(data) ? data.map(mapGcoinConversionRequest) : [];
  },

  processConversion: async (requestId: string, action: 'approve' | 'reject', adminId: string): Promise<void> => {
    await api.post(`/gcoin/conversions/${requestId}`, { action, adminId });
  },

  freezeWallet: async (userId: string): Promise<void> => {
    await api.post(`/gcoin/wallets/${userId}/freeze`, {});
  },

  unfreezeWallet: async (userId: string): Promise<void> => {
    await api.post(`/gcoin/wallets/${userId}/unfreeze`, {});
  },

  adminAdjustBalance: async (userId: string, amount: number, reason: string): Promise<void> => {
    await api.post('/gcoin/admin/adjust', { userId, amount, reason });
  },

  getTransactions: async (userId?: string): Promise<GcoinTransaction[]> => {
    const response = await api.get('/gcoin/transactions', { params: userId ? { userId } : undefined });
    const data = extractData<any[]>(response);
    return Array.isArray(data) ? data.map(mapGcoinTransaction) : [];
  },

  getAllTransactions: async (): Promise<GcoinTransaction[]> => {
    const response = await api.get('/gcoin/admin/transactions');
    const data = extractData<any[]>(response);
    return Array.isArray(data) ? data.map(mapGcoinTransaction) : [];
  }
};
