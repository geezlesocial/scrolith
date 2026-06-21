import api from './api';
import { Plan } from '../types';

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

export interface UserPlanSummary {
  planId: string | null;
  planName: string | null;
  interval: string | null;
  price: number | null;
  currency: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  active: boolean;
  isPro: boolean;
  featureCodes: string[];
}

export interface UserPlansSnapshot {
  freelancer: UserPlanSummary;
  employer: UserPlanSummary;
  kycVerified: boolean;
}

export const plansApi = {
  listPlans: async (params?: { type?: string }): Promise<Plan[]> => {
    const response = await api.get<ApiResponse<Plan[]>>('/plans', { params });
    return handleApiResponse(response);
  },
  getMyPlans: async (): Promise<UserPlansSnapshot> => {
    const response = await api.get<ApiResponse<UserPlansSnapshot>>('/plans/me');
    return handleApiResponse(response);
  },
  purchasePlan: async (planId: string): Promise<UserPlansSnapshot> => {
    try {
      const response = await api.post<ApiResponse<UserPlansSnapshot>>('/plans/purchase', { planId });
      return handleApiResponse(response);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to purchase plan';
      throw new Error(message);
    }
  }
};
