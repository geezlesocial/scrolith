import api from './api';
import { AdCampaign, UserRole } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const AdService = {
  getAds: async (role?: UserRole): Promise<AdCampaign[]> => {
    const response = await api.get('/ads', { params: role ? { role } : undefined });
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  getAllCampaigns: async (): Promise<AdCampaign[]> => {
    const response = await api.get('/ads/campaigns');
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  saveCampaign: async (campaign: AdCampaign): Promise<void> => {
    await api.post('/ads/campaigns', campaign);
  },

  deleteCampaign: async (id: string): Promise<void> => {
    await api.delete(`/ads/campaigns/${id}`);
  }
};
