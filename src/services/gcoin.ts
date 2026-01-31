import api from './api';
import { GcoinWallet, GcoinTransaction, GcoinSettings, GcoinConversionRequest } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const mapGcoinTransaction = (t: any) => ({
  id: t.id,
  user_id: t.user_id ?? t.userId,
  userId: t.user_id ?? t.userId,
  user_name: t.user_name ?? t.userName,
  userName: t.user_name ?? t.userName,
  amount: t.amount,
  type: t.type,
  reason: t.reason,
  reference_id: t.reference_id ?? t.referenceId,
  referenceId: t.reference_id ?? t.referenceId,
  recipient_id: t.recipient_id ?? t.recipientId,
  recipientId: t.recipient_id ?? t.recipientId,
  timestamp: t.timestamp ?? t.created_at ?? t.createdAt,
  created_at: t.timestamp ?? t.created_at ?? t.createdAt,
  status: t.status,
  source: t.source
});

const mapGcoinWallet = (w: any) => ({
  user_id: w.user_id ?? w.userId,
  userId: w.user_id ?? w.userId,
  recipient_id: w.recipient_id ?? w.recipientId,
  recipientId: w.recipient_id ?? w.recipientId,
  balance: w.balance ?? 0,
  lifetime_earned: w.lifetime_earned ?? w.lifetimeEarned ?? 0,
  lifetimeEarned: w.lifetime_earned ?? w.lifetimeEarned ?? 0,
  transactions: Array.isArray(w.transactions) ? w.transactions.map(mapGcoinTransaction) : [],
  status: w.status ?? 'active',
  fraud_score: w.fraud_score ?? w.fraudScore ?? 0,
  fraudScore: w.fraud_score ?? w.fraudScore ?? 0,
  updated_at: w.updated_at ?? w.updatedAt,
  updatedAt: w.updated_at ?? w.updatedAt
});

const mapGcoinSettings = (s: any) => ({
  conversion_rate: s.conversion_rate ?? s.conversionRate ?? 0,
  conversionRate: s.conversion_rate ?? s.conversionRate ?? 0,
  min_withdrawal: s.min_withdrawal ?? s.minWithdrawal ?? 0,
  minWithdrawal: s.min_withdrawal ?? s.minWithdrawal ?? 0,
  conversion_enabled: s.conversion_enabled ?? s.conversionEnabled ?? false,
  conversionEnabled: s.conversion_enabled ?? s.conversionEnabled ?? false,
  user_transfers_enabled: s.user_transfers_enabled ?? s.userTransfersEnabled ?? false,
  userTransfersEnabled: s.user_transfers_enabled ?? s.userTransfersEnabled ?? false
  ,
  viewsUnit: s.views_unit ?? s.viewsUnit ?? s.viewsUnit ?? 200,
  likesUnit: s.likes_unit ?? s.likesUnit ?? 30,
  repostsUnit: s.reposts_unit ?? s.repostsUnit ?? 40,
  sharesUnit: s.shares_unit ?? s.sharesUnit ?? 50,
  coinPerViewsUnit: s.coin_per_views_unit ?? s.coinPerViewsUnit ?? s.coinPerViewsUnit ?? 1,
  coinPerLikesUnit: s.coin_per_likes_unit ?? s.coinPerLikesUnit ?? 1,
  coinPerRepostsUnit: s.coin_per_reposts_unit ?? s.coinPerRepostsUnit ?? 1,
  coinPerSharesUnit: s.coin_per_shares_unit ?? s.coinPerSharesUnit ?? 1,
  adminFeePercent: s.admin_fee_percent ?? s.adminFeePercent ?? 0.1,
  transferFeeType: s.transfer_fee_type ?? s.transferFeeType ?? 'percentage',
  transferFeeValue: s.transfer_fee_value ?? s.transferFeeValue ?? 0
});

const unmapGcoinSettings = (s: any) => ({
  conversion_rate: s.conversionRate ?? s.conversion_rate ?? 0,
  min_withdrawal: s.minWithdrawal ?? s.min_withdrawal ?? 0,
  conversion_enabled: s.conversionEnabled ?? s.conversion_enabled ?? false,
  user_transfers_enabled: s.userTransfersEnabled ?? s.user_transfers_enabled ?? false
  ,
  views_unit: s.viewsUnit ?? s.views_unit,
  likes_unit: s.likesUnit ?? s.likes_unit,
  reposts_unit: s.repostsUnit ?? s.reposts_unit,
  shares_unit: s.sharesUnit ?? s.shares_unit,
  coin_per_views_unit: s.coinPerViewsUnit ?? s.coin_per_views_unit,
  coin_per_likes_unit: s.coinPerLikesUnit ?? s.coin_per_likes_unit,
  coin_per_reposts_unit: s.coinPerRepostsUnit ?? s.coin_per_reposts_unit,
  coin_per_shares_unit: s.coinPerSharesUnit ?? s.coin_per_shares_unit,
  admin_fee_percent: s.adminFeePercent ?? s.admin_fee_percent,
  transfer_fee_type: s.transferFeeType ?? s.transfer_fee_type,
  transfer_fee_value: s.transferFeeValue ?? s.transfer_fee_value
});

const mapGcoinConversionRequest = (r: any) => ({
  id: r.id,
  user_id: r.user_id ?? r.userId,
  userId: r.user_id ?? r.userId,
  user_name: r.user_name ?? r.userName ?? '',
  userName: r.user_name ?? r.userName ?? '',
  amount_gcoin: r.amount_gcoin ?? r.amountGcoin ?? 0,
  amountGcoin: r.amount_gcoin ?? r.amountGcoin ?? 0,
  amount_fiat: r.amount_fiat ?? r.amountFiat ?? 0,
  amountFiat: r.amount_fiat ?? r.amountFiat ?? 0,
  status: r.status ?? 'pending',
  requested_at: r.requested_at ?? r.requestedAt,
  requestedAt: r.requested_at ?? r.requestedAt
});

export const GcoinService = {
  getWallet: async (userId: string, email?: string): Promise<GcoinWallet> => {
    const response = await api.get(`/gcoin/wallets/${userId}`, { params: email ? { email } : undefined });
    return mapGcoinWallet(extractData<any>(response));
  },

  getMe: async (): Promise<GcoinWallet> => {
    const response = await api.get('/gcoin/me');
    const data = extractData<any>(response);
    return mapGcoinWallet(data?.wallet ?? data);
  },

  getAllWallets: async (): Promise<GcoinWallet[]> => {
    const response = await api.get('/gcoin/wallets');
    const data = extractData<any[]>(response);
    return Array.isArray(data) ? data.map(mapGcoinWallet) : [];
  },

  creditUser: async (userId: string, amount: number, note?: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/gcoin/admin/credit', { userId, amount, note });
    return extractData<{ success: boolean; message: string }>(response);
  },

  transfer: async (
    recipientIdentifier: string,
    amount: number,
    note?: string
  ): Promise<{ success: boolean; message: string }> => {
    const payload: any = { amount: Number(amount) };
    if (recipientIdentifier && recipientIdentifier.includes('@')) payload.toEmail = recipientIdentifier;
    else if (recipientIdentifier) payload.toRecipientId = recipientIdentifier;
    if (note) payload.note = note;
    const response = await api.post('/gcoin/transfer', payload);
    if (response?.data?.success === false) {
      return { success: false, message: response?.data?.error || 'Transfer failed' };
    }
    return { success: true, message: 'Transfer completed' };
  },

  donate: async (postId: string, amount: number, note?: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/gcoin/donate', { postId, amount, note });
    if (response?.data?.success === false) {
      return { success: false, message: response?.data?.error || 'Donation failed' };
    }
    return { success: true, message: 'Donation completed' };
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

  requestConversion: async (_userId: string, amountGcoin: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/gcoin/convert/request', { amount: amountGcoin });
    if (response?.data?.success === false) {
      return { success: false, message: response?.data?.error || 'Request failed' };
    }
    return { success: true, message: 'Request submitted' };
  },

  getConversionRequests: async (): Promise<GcoinConversionRequest[]> => {
    const response = await api.get('/gcoin/conversions');
    const data = extractData<any[]>(response);
    return Array.isArray(data) ? data.map(mapGcoinConversionRequest) : [];
  },

  processConversion: async (requestId: string, action: 'approve' | 'reject', adminId: string, note?: string): Promise<void> => {
    await api.post(`/gcoin/conversions/${requestId}`, { action, adminId, note });
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
,
  getAdminSummary: async (): Promise<any> => {
    const response = await api.get('/gcoin/admin/summary');
    return extractData<any>(response);
  }
,
  getFraudReports: async (): Promise<any> => {
    const response = await api.get('/gcoin/admin/fraud');
    return extractData<any>(response);
  }
};
