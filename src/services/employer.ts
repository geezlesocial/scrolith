import api from "./api";

export interface EmployerOverview {
  activeContracts: number;
  openJobs: number;
  proposalsReceived: number;
  escrowBalance: number;
  spendThisMonth: number;
  unreadMessages: number;
  unreadNotifications: number;
}

export const employerApi = {
  getOverview: async (): Promise<EmployerOverview> => {
    const response = await api.get('/employer/overview');
    return response.data.data;
  },
};