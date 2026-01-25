import api from "./api";

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
}

export const freelancerApi = {
  getOverview: async (): Promise<FreelancerOverview> => {
    const response = await api.get('/freelancer/overview');
    return response.data.data;
  },
};