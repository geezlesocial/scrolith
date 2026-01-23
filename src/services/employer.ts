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

const mapOverview = (data: any): EmployerOverview => ({
  activeContracts: Number(data.active_contracts ?? data.activeContracts ?? 0),
  openJobs: Number(data.open_jobs ?? data.openJobs ?? 0),
  proposalsReceived: Number(data.proposals_received ?? data.proposalsReceived ?? 0),
  escrowBalance: Number(data.escrow_balance ?? data.escrowBalance ?? 0),
  spendThisMonth: Number(data.spend_this_month ?? data.spendThisMonth ?? 0),
  unreadMessages: Number(data.unread_messages ?? data.unreadMessages ?? 0),
  unreadNotifications: Number(data.unread_notifications ?? data.unreadNotifications ?? 0),
  quickActions: data.quick_actions ?? data.quickActions
});

export interface EmployerOverview {
  activeContracts: number;
  openJobs: number;
  proposalsReceived: number;
  escrowBalance: number;
  spendThisMonth: number;
  unreadMessages: number;
  unreadNotifications: number;
  quickActions?: {
    canPostJob: boolean;
    canBrowseGigs: boolean;
    canCreateBrief: boolean;
  };
}

export const employerApi = {
  getOverview: async (): Promise<EmployerOverview> => {
    const response = await api.get<ApiResponse<EmployerOverview>>('/employer/overview');
    const data = handleApiResponse<any>(response);
    return mapOverview(data);
  }
};

export const EmployerService = {
  getOverview: async (): Promise<EmployerOverview> => {
    return employerApi.getOverview();
  }
};
