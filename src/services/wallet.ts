import api from './api';
import { withUserFacingPaymentMethodName } from '../utils/paymentGatewayDisplay';

export const getWallet = async () => {
  const res = await api.get('/wallet/me');
  return res.data?.data;
};

export const getTransactions = async () => {
  const res = await api.get('/wallet/me/transactions');
  return res.data?.data || [];
};

export default { getWallet, getTransactions };
 

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const handleApiResponse = <T>(response: any): T => {
  if (response?.data?.success === false) {
    throw new Error(response.data.error || 'API request failed');
  }
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && response.data.success !== false) return response.data as T;
  return response as T;
};

const mapWallet = (wallet: any) => {
  const available = Number(wallet?.available_balance ?? wallet?.availableBalance ?? 0);
  const pending = Number(wallet?.pending_clearance ?? wallet?.pendingClearance ?? 0);
  const escrow = Number(wallet?.escrow_balance ?? wallet?.escrowBalance ?? 0);
  const displayAvailable = Number(wallet?.display_available_balance ?? available);
  const displayPending = Number(wallet?.display_pending_clearance ?? pending);
  const displayEscrow = Number(wallet?.display_escrow_balance ?? escrow);
  return {
    ...wallet,
    id: wallet?.id,
    user_id: wallet?.user_id ?? wallet?.userId,
    userId: wallet?.userId ?? wallet?.user_id,
    available_balance: available,
    availableBalance: available,
    pending_clearance: pending,
    pendingClearance: pending,
    escrow_balance: escrow,
    escrowBalance: escrow,
    display_available_balance: displayAvailable,
    display_pending_clearance: displayPending,
    display_escrow_balance: displayEscrow,
    frozen: Boolean(wallet?.frozen),
    currency: wallet?.currency ?? 'USD',
    display_currency: wallet?.display_currency ?? wallet?.currency ?? 'USD',
    updated_at: wallet?.updated_at ?? wallet?.updatedAt
  };
};

const mapTransaction = (tx: any) => ({
  ...tx,
  id: tx?.id,
  wallet_id: tx?.wallet_id ?? tx?.walletId,
  walletId: tx?.walletId ?? tx?.wallet_id,
  user_id: tx?.user_id ?? tx?.userId,
  userId: tx?.userId ?? tx?.user_id,
  type: tx?.type,
  amount: Number(tx?.amount ?? 0),
  description: tx?.description ?? '',
  status: (tx?.status ?? '').toString().toLowerCase(),
  reference_id: tx?.reference_id ?? tx?.referenceId ?? undefined,
  referenceId: tx?.referenceId ?? tx?.reference_id ?? undefined,
  created_at: tx?.created_at ?? tx?.createdAt ?? '',
  createdAt: tx?.createdAt ?? tx?.created_at ?? '',
  admin_note: tx?.admin_note ?? tx?.adminNote ?? undefined,
  adminNote: tx?.adminNote ?? tx?.admin_note ?? undefined
});

export interface WalletBalances {
  available: number;
  pendingClearance: number;
  escrowHeld: number;
  total: number;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
  reference?: string;
}

export interface WalletInfo {
  balances: WalletBalances;
  availableBalance: number;
  pendingAmount: number;
  escrowHeld: number;
  totalEarnings: number;
  transactions: WalletTransaction[];
  currency?: string;
  displayCurrency?: string;
  paymentMethods?: Array<{
    id: string;
    type: string;
    last4: string;
    bankName?: string;
    isDefault: boolean;
  }>;
}

export interface TransactionsResponse {
  transactions: WalletTransaction[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const walletApi = {
  getWalletInfo: async (): Promise<WalletInfo> => {
    const response = await api.get<ApiResponse<any>>('/wallet/me');
    const data = handleApiResponse<any>(response);
    const available = Number(data.available_balance ?? data.availableBalance ?? 0);
    const pending = Number(data.pending_clearance ?? data.pendingClearance ?? 0);
    const escrow = Number(data.escrow_balance ?? data.escrowBalance ?? 0);
    const total = available + pending + escrow;
    return {
      balances: {
        available,
        pendingClearance: pending,
        escrowHeld: escrow,
        total
      },
      availableBalance: available,
      pendingAmount: pending,
      escrowHeld: escrow,
      totalEarnings: total,
      transactions: [],
      currency: data.currency ?? 'USD',
      displayCurrency: data.display_currency ?? data.currency ?? 'USD'
    };
  },

  getTransactions: async (params: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<TransactionsResponse> => {
    const response = await api.get<ApiResponse<TransactionsResponse>>('/wallet/me/transactions', { params });
    const data = handleApiResponse<any>(response);
    const txs = Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data) ? data : [];
    return {
      transactions: txs.map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount ?? 0),
        description: tx.description ?? '',
        status: tx.status ?? '',
        createdAt: tx.created_at ?? tx.createdAt ?? '',
        reference: tx.reference_id ?? tx.referenceId
      })),
      pagination: data?.pagination
    };
  }
};

// High-level service expected by admin UI components
export const WalletService = {
  getPlatformFinancials: async (): Promise<any> => {
    const response = await api.get('/wallet/platform-financials', { params: { role: 'admin' } });
    const data = handleApiResponse<any>(response);
    return {
      ...data,
      totalEscrow: Number(data?.totalEscrow ?? data?.total_escrow ?? 0),
      totalClearedUserFunds: Number(data?.totalClearedUserFunds ?? data?.total_cleared_user_funds ?? 0),
      totalPendingClearance: Number(data?.totalPendingClearance ?? data?.total_pending_clearance ?? 0),
      platformRevenue: Number(data?.platformRevenue ?? data?.platform_revenue ?? 0),
      refundPool: Number(data?.refundPool ?? data?.refund_pool ?? 0),
      total_escrow: Number(data?.total_escrow ?? data?.totalEscrow ?? 0),
      total_cleared_user_funds: Number(data?.total_cleared_user_funds ?? data?.totalClearedUserFunds ?? 0),
      total_pending_clearance: Number(data?.total_pending_clearance ?? data?.totalPendingClearance ?? 0),
      platform_revenue: Number(data?.platform_revenue ?? data?.platformRevenue ?? 0),
      refund_pool: Number(data?.refund_pool ?? data?.refundPool ?? 0)
    };
  },

  getActivityMetrics: async (days = 7): Promise<any[]> => {
    const response = await api.get('/admin/analytics/activity', { params: { range: `${days}` } });
    return handleApiResponse(response);
  },

  getRevenueBreakdown: async (days = 30): Promise<any[]> => {
    const response = await api.get('/admin/analytics/revenue-breakdown', { params: { range: `${days}` } });
    return handleApiResponse(response);
  },

  getCommissionSettings: async (): Promise<any> => {
    const response = await api.get('/wallet/settings/commission', { params: { role: 'admin' } });
    const data = handleApiResponse<any>(response);
    return {
      ...data,
      freelancerFeeType: data?.freelancerFeeType ?? data?.freelancer_fee_type ?? 'percentage',
      freelancerFeeValue: Number(data?.freelancerFeeValue ?? data?.freelancer_fee_value ?? 0),
      employerFeeType: data?.employerFeeType ?? data?.employer_fee_type ?? 'percentage',
      employerFeeValue: Number(data?.employerFeeValue ?? data?.employer_fee_value ?? 0),
      minimumFee: Number(data?.minimumFee ?? data?.minimum_fee ?? 0),
      maxAdjustment: Number(data?.maxAdjustment ?? data?.max_adjustment ?? 100000),
      freelancer_fee_type: data?.freelancer_fee_type ?? data?.freelancerFeeType ?? 'percentage',
      freelancer_fee_value: Number(data?.freelancer_fee_value ?? data?.freelancerFeeValue ?? 0),
      employer_fee_type: data?.employer_fee_type ?? data?.employerFeeType ?? 'percentage',
      employer_fee_value: Number(data?.employer_fee_value ?? data?.employerFeeValue ?? 0),
      minimum_fee: Number(data?.minimum_fee ?? data?.minimumFee ?? 0),
      max_adjustment: Number(data?.max_adjustment ?? data?.maxAdjustment ?? 100000)
    };
  },

  saveCommissionSettings: async (settings: any): Promise<any> => {
    // Prefer camelCase values (UI updates camelCase state only)
    const payload = {
      freelancer_fee_type: settings?.freelancerFeeType ?? settings?.freelancer_fee_type ?? 'percentage',
      freelancer_fee_value: Number(settings?.freelancerFeeValue ?? settings?.freelancer_fee_value ?? 0),
      employer_fee_type: settings?.employerFeeType ?? settings?.employer_fee_type ?? 'percentage',
      employer_fee_value: Number(settings?.employerFeeValue ?? settings?.employer_fee_value ?? 0),
      minimum_fee: Number(settings?.minimumFee ?? settings?.minimum_fee ?? 0),
      max_adjustment: Number(settings?.maxAdjustment ?? settings?.max_adjustment ?? 100000)
    };
    const response = await api.post('/wallet/settings/commission', payload, { params: { role: 'admin' } });
    return handleApiResponse(response);
  },

  getAllWallets: async (): Promise<any[]> => {
    const response = await api.get('/admin/wallets');
    const data = handleApiResponse<any>(response);
    return Array.isArray(data) ? data.map(mapWallet) : [];
  },

  getAllTransactions: async (): Promise<any[]> => {
    const response = await api.get('/wallet/admin/transactions', { params: { role: 'admin' } });
    const data = handleApiResponse<any>(response);
    const d = data as unknown;
    let list: unknown[] = [];
    if (d && typeof d === 'object') {
      const obj = d as Record<string, unknown>;
      if (Array.isArray(obj.transactions)) list = obj.transactions as unknown[];
      else if (Array.isArray(d)) list = d as unknown[];
    }
    return Array.isArray(list) ? list.map((t) => mapTransaction(t as Record<string, unknown>)) : [];
  },

  // Backwards-compatible adapters (aliases) expected by UI
  getWallet: async (userId?: string): Promise<any> => {
    const target = userId && userId !== 'me' ? `/wallet/${userId}` : '/wallet/me';
    const response = await api.get(target);
    const data = handleApiResponse<any>(response);
    return mapWallet(data);
  },

  getUserTransactions: async (userId: string): Promise<any[]> => {
    // Try a user-scoped endpoint, fall back to current transactions
    try {
      const response = await api.get(`/wallet/${userId}/transactions`);
      const data = handleApiResponse(response);
      const d = data as unknown;
      let list: unknown[] = [];
      if (d && typeof d === 'object') {
        const obj = d as Record<string, unknown>;
        if (Array.isArray(obj.transactions)) list = obj.transactions as unknown[];
        else if (Array.isArray(d)) list = d as unknown[];
      }
      return Array.isArray(list) ? list.map((t) => mapTransaction(t as Record<string, unknown>)) : [];
    } catch (e) {
      return WalletService.getAllTransactions();
    }
  },

  requestWithdrawal: async (userId: string, amount: number, method: any, details?: Record<string, any>): Promise<any> => {
    const response = await api.post('/withdrawal/request', { userId, amount, method, details });
    return handleApiResponse(response);
  },
  addFunds: async (amount: number): Promise<any> => {
    const response = await api.post('/wallet/topup/initiate', { amount, provider: 'auto' });
    return handleApiResponse(response);
  },

  getFundingGateways: async (): Promise<any[]> => {
    try {
      const response = await api.get('/wallet/gateways');
      const data = handleApiResponse<any>(response);
      return Array.isArray(data) ? data.map((gateway: any) => withUserFacingPaymentMethodName(gateway)) : [];
    } catch (e) {
      try {
        const response = await api.get('/payments/methods/active');
        const data = handleApiResponse<any>(response);
        return Array.isArray(data) ? data.map((gateway: any) => withUserFacingPaymentMethodName(gateway)) : [];
      } catch {
        return [];
      }
    }
  },

  initiateTopup: async (payload: { amount: number; currency?: string; country?: string; provider?: string }): Promise<any> => {
    const response = await api.post('/wallet/topup/initiate', payload);
    return handleApiResponse(response);
  },

  getTopupStatus: async (intentId: string): Promise<any> => {
    const response = await api.get(`/wallet/topup/status/${intentId}`);
    return handleApiResponse(response);
  },

  getTopupProviders: async (params: { currency?: string; country?: string } = {}): Promise<any> => {
    const response = await api.get('/wallet/topup/providers', { params });
    return handleApiResponse(response);
  },

  getUserEscrows: async (userId: string, role?: string): Promise<any> => {
    const qs = role ? `?role=${encodeURIComponent(role)}` : '';
    const response = await api.get(`/wallet/${userId}/escrows${qs}`);
    return handleApiResponse(response);
  },

  adminFreezeWallet: async (userId: string, reason?: string): Promise<void> => {
    await api.post(`/wallet/${userId}/freeze`, { reason }, { params: { role: 'admin' } });
  },

  adminUnfreezeWallet: async (userId: string): Promise<void> => {
    await api.post(`/wallet/${userId}/unfreeze`, undefined, { params: { role: 'admin' } });
  },

  adminAdjustBalance: async (userId: string, amount: number, reason?: string): Promise<any> => {
    const response = await api.post(`/wallet/${userId}/adjust`, { amount, reason }, { params: { role: 'admin' } });
    return handleApiResponse(response);
  },

  adminReverseTransaction: async (transactionId: string, adminId?: string): Promise<void> => {
    await api.post(`/wallet/transactions/${transactionId}/reverse`, { adminId }, { params: { role: 'admin' } });
  },

  getWithdrawalRequests: async (params: { status?: string } = {}): Promise<any[]> => {
    const response = await api.get('/admin/withdrawals', { params });
    const data = handleApiResponse<any>(response);
    const list = Array.isArray(data) ? data : Array.isArray(data?.withdrawals) ? data.withdrawals : [];
    return list.map((w: any) => ({
      ...w,
      id: w?.id,
      user_id: w?.user_id ?? w?.userId,
      userId: w?.userId ?? w?.user_id,
      user_name: w?.user_name ?? w?.userName,
      userName: w?.userName ?? w?.user_name,
      method: w?.method ?? w?.paymentMethodId ?? w?.payment_method_id ?? 'bank_transfer',
      details: w?.details ?? {},
      amount: Number(w?.amount ?? 0),
      status: (w?.status || '').toString().toLowerCase(),
      requested_at: w?.requested_at ?? w?.created_at ?? w?.createdAt ?? w?.requestedAt ?? w?.createdAt,
      created_at: w?.created_at ?? w?.createdAt ?? w?.requested_at ?? w?.requestedAt
    }));
  },

  approveWithdrawal: async (id: string): Promise<any> => {
    const response = await api.post(`/admin/withdrawals/${id}/approve`, {});
    return handleApiResponse(response);
  },

  rejectWithdrawal: async (id: string): Promise<any> => {
    const response = await api.post(`/admin/withdrawals/${id}/reject`, {});
    return handleApiResponse(response);
  },

  markWithdrawalPaid: async (id: string): Promise<any> => {
    const response = await api.post(`/admin/withdrawals/${id}/mark-paid`, {});
    return handleApiResponse(response);
  }
  ,
  getPayoutAccountsAdmin: async (): Promise<any[]> => {
    const response = await api.get('/admin/withdrawals/payout-accounts');
    const data = handleApiResponse<any>(response);
    return Array.isArray(data) ? data : [];
  },
  getPayoutAccountAdmin: async (userId: string): Promise<any> => {
    const response = await api.get(`/admin/withdrawals/payout-accounts/${userId}`);
    return handleApiResponse<any>(response);
  },
  getPayoutMethodsAdmin: async (): Promise<any> => {
    const response = await api.get('/admin/withdrawals/methods');
    return handleApiResponse<any>(response);
  },
  savePayoutMethodsAdmin: async (methods: any[]): Promise<any> => {
    const response = await api.post('/admin/withdrawals/methods', { methods });
    return handleApiResponse<any>(response);
  }
};
