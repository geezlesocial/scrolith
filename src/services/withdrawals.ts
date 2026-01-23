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

export const withdrawalsApi = {
  createWithdrawal: async (data: CreateWithdrawalData): Promise<WithdrawalRequest> => {
    const response = await api.post<ApiResponse<WithdrawalRequest>>('/withdrawal/request', data);
    return handleApiResponse(response);
  },

  getWithdrawals: async (params: {
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<WithdrawalsResponse> => {
    const response = await api.get<ApiResponse<WithdrawalsResponse>>('/withdrawal/me', { params });
    return handleApiResponse(response);
  }
};
