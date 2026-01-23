import api from './api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ApiError {
  success: false;
  error: string;
  code?: string;
}

const handleApiResponse = <T>(response: any): T => {
  if (response?.data?.success === false) {
    throw new Error(response.data.error || 'API request failed');
  }
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && response.data.success !== false) return response.data as T;
  return response as T;
};

const mapOverview = (data: any): FreelancerOverview => ({
  activeOrders: Number(data.active_orders ?? data.activeOrders ?? 0),
  revisionOrders: Number(data.revision_orders ?? data.revisionOrders ?? 0),
  earningsThisMonth: Number(data.earnings_this_month ?? data.earningsThisMonth ?? 0),
  walletBalance: Number(data.wallet_balance ?? data.walletBalance ?? 0),
  gigViews: Number(data.gig_views ?? data.gigViews ?? 0),
  gigClicks: Number(data.gig_clicks ?? data.gigClicks ?? 0),
  rating: Number(data.rating ?? 0),
  reviews: Number(data.reviews ?? 0),
  unreadMessages: Number(data.unread_messages ?? data.unreadMessages ?? 0),
  unreadNotifications: Number(data.unread_notifications ?? data.unreadNotifications ?? 0),
  quickActions: data.quick_actions ?? data.quickActions
});

export interface FreelancerOverview {
  activeOrders: number;
  revisionOrders: number;
  earningsThisMonth: number;
  walletBalance: number;
  gigViews: number;
  gigClicks: number;
  rating: number;
  reviews: number;
  unreadMessages: number;
  unreadNotifications: number;
  quickActions?: {
    canCreateGig: boolean;
    canWithdraw: boolean;
    pendingKyc: boolean;
  };
}

export const freelancerApi = {
  getOverview: async (): Promise<FreelancerOverview> => {
    const response = await api.get<ApiResponse<FreelancerOverview>>('/freelancer/overview');
    const data = handleApiResponse<any>(response);
    return mapOverview(data);
  }
};
