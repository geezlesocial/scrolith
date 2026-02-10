import api from './api';

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

export interface WithdrawalRequest {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  paymentMethodId: string;
  notes?: string;
  estimatedCompletion?: string;
  createdAt: string;
}

export interface CreateWithdrawalData {
  amount: number;
  paymentMethodId: string;
  notes?: string;
  details?: Record<string, any>;
}

export interface PayoutAccountDetails {
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  routingNumber?: string;
  iban?: string;
  swiftBic?: string;
  paypalEmail?: string;
  stripeAccountId?: string;
  preferredMethod?: string;
  country: string;
  currency: string;
  [key: string]: any;
}

export interface PayoutMethodField {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'email' | 'number' | 'select' | 'note';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  description?: string;
}

export interface PayoutMethodOption {
  id: string;
  name: string;
  enabled: boolean;
  note?: string;
  fields?: PayoutMethodField[];
}

export interface WithdrawalsResponse {
  withdrawals: WithdrawalRequest[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const mapWithdrawal = (w: any): WithdrawalRequest => {
  const amount = Number(w?.amount ?? 0);
  const fee = Number(w?.fee ?? 0);
  const netAmount = Number(w?.netAmount ?? w?.net_amount ?? (amount - fee));
  return {
    id: w.id,
    amount,
    fee,
    netAmount,
    status: (w?.status || '').toString().toLowerCase() as WithdrawalRequest['status'],
    paymentMethodId: w?.paymentMethodId || w?.method || 'bank_transfer',
    notes: w?.details?.notes,
    estimatedCompletion: w?.processed_at || w?.processedAt,
    createdAt: w?.created_at || w?.createdAt || new Date().toISOString()
  };
};

export const withdrawalsApi = {
  createWithdrawal: async (data: CreateWithdrawalData): Promise<WithdrawalRequest> => {
    const response = await api.post<ApiResponse<WithdrawalRequest>>('/withdrawal/request', data);
    const raw = handleApiResponse<any>(response);
    return mapWithdrawal(raw);
  },

  getPayoutAccount: async (): Promise<PayoutAccountDetails> => {
    const response = await api.get<ApiResponse<PayoutAccountDetails>>('/withdrawal/account');
    return handleApiResponse(response);
  },

  savePayoutAccount: async (data: PayoutAccountDetails): Promise<PayoutAccountDetails> => {
    const response = await api.post<ApiResponse<PayoutAccountDetails>>('/withdrawal/account', data);
    return handleApiResponse(response);
  },

  getPayoutMethods: async (): Promise<PayoutMethodOption[]> => {
    const response = await api.get<ApiResponse<{ methods: PayoutMethodOption[] }>>('/withdrawal/methods');
    const data = handleApiResponse<any>(response);
    return Array.isArray(data?.methods) ? data.methods : [];
  },

  getWithdrawals: async (params: {
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<WithdrawalsResponse> => {
    const response = await api.get<ApiResponse<WithdrawalsResponse>>('/withdrawal/me', { params });
    const raw = handleApiResponse<any>(response);
    const list = Array.isArray(raw?.withdrawals) ? raw.withdrawals : Array.isArray(raw) ? raw : [];
    return {
      withdrawals: list.map(mapWithdrawal),
      pagination: raw?.pagination
    };
  }
};
