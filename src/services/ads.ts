import api from './api';
import { AdCampaign, UserRole } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const AdService = {
  // Public ads listing (frontend)
  getAds: async (role?: UserRole): Promise<AdCampaign[]> => {
    const response = await api.get('/community/ads', { params: role ? { role } : undefined });
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  createAdDraft: async (payload: Partial<AdCampaign>): Promise<AdCampaign | null> => {
    const response = await api.post('/community/ads/draft', {
      title: payload.title,
      body: payload.body,
      objective: payload.objective,
      destinationType: payload.destinationType,
      destinationUrl: payload.destinationUrl,
      ctaText: payload.ctaText,
      placement: payload.placement,
      targeting: (payload as any).targeting,
      mediaFileIds: payload.mediaFileIds || [],
      budget: payload.budget || 0,
      currency: payload.currency || 'USD',
      durationDays: payload.durationDays
    });
    const data = extractData<AdCampaign>(response);
    return data || null;
  },

  // Admin: get review queue / all campaigns for admin panel
  getAllCampaigns: async (): Promise<AdCampaign[]> => {
    const response = await api.get('/community/admin/ads');
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  getReviewQueue: async (): Promise<AdCampaign[]> => {
    const response = await api.get('/community/admin/ads/review-queue');
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  approveAd: async (id: string): Promise<void> => {
    await api.post(`/community/admin/ads/${id}/approve`, {});
  },

  rejectAd: async (id: string, refund: boolean = false): Promise<void> => {
    await api.post(`/community/admin/ads/${id}/reject`, { refund });
  },

  pauseAd: async (id: string): Promise<void> => {
    await api.post(`/community/admin/ads/${id}/pause`, {});
  },

  resumeAd: async (id: string): Promise<void> => {
    await api.post(`/community/admin/ads/${id}/resume`, {});
  },

  getAnalytics: async (): Promise<any> => {
    const response = await api.get('/community/admin/ads/analytics');
    return extractData<any>(response);
  },

  getAd: async (id: string): Promise<AdCampaign | null> => {
    const response = await api.get(`/community/ads/${id}`);
    const data = extractData<AdCampaign>(response);
    return data || null;
  },

  // Get ads belonging to current authenticated user
  getMyAds: async (): Promise<AdCampaign[]> => {
    const response = await api.get('/community/ads/me');
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  getAdPerformance: async (id: string): Promise<any> => {
    const response = await api.get(`/community/ads/${id}/performance`);
    return extractData<any>(response);
  },

  payAd: async (id: string, paymentMethod?: any): Promise<{ success: boolean; message?: string; data?: any }> => {
    const response = await api.post(`/community/ads/${id}/pay`, paymentMethod || {});
    const success = response?.data?.success ?? true;
    const message = response?.data?.message || response?.data?.error;
    const data = extractData<any>(response);
    return { success, message, data };
  },

  pauseOwnAd: async (id: string): Promise<any> => {
    const response = await api.post(`/community/ads/${id}/pause`, {});
    return extractData<any>(response);
  },

  resumeOwnAd: async (id: string): Promise<any> => {
    const response = await api.post(`/community/ads/${id}/resume`, {});
    return extractData<any>(response);
  },

  submitAd: async (id: string): Promise<{ success: boolean; message?: string; data?: any }> => {
    const response = await api.post(`/community/ads/${id}/submit`, {});
    const success = response?.data?.success ?? true;
    const message = response?.data?.message || response?.data?.error;
    const data = extractData<any>(response);
    return { success, message, data };
  },

  recordImpression: async (id: string): Promise<void> => {
    await api.post(`/community/ads/${id}/impression`, {});
  },

  recordClick: async (id: string): Promise<void> => {
    await api.post(`/community/ads/${id}/click`, {});
  },

  getConfig: async (): Promise<any> => {
    const response = await api.get('/community/admin/ads/config');
    return extractData<any>(response);
  },

  updateConfig: async (data: any): Promise<any> => {
    const response = await api.put('/community/admin/ads/config', data);
    return extractData<any>(response);
  },

  updateAd: async (id: string, campaign: Partial<AdCampaign>): Promise<AdCampaign | null> => {
    const payload = { ...campaign } as any;
    // Prevent frontend from attempting to change status via creator update
    if (payload.status) delete payload.status;
    const response = await api.put(`/community/ads/${id}`, payload);
    const data = extractData<AdCampaign>(response);
    return data || null;
  },

  // Save campaign: create draft or update via available endpoints
  saveCampaign: async (campaign: AdCampaign): Promise<void> => {
    if (!campaign.id) {
      // create draft
      const response = await api.post('/community/ads/draft', {
        title: campaign.title,
        body: campaign.body,
        objective: (campaign as any).objective,
        destinationType: (campaign as any).destinationType,
        destinationUrl: (campaign as any).destinationUrl,
        ctaText: (campaign as any).ctaText,
        placement: campaign.placement,
        targeting: campaign.targeting,
        mediaFileIds: campaign.mediaFileIds || [],
        budget: campaign.budget || 0,
        currency: campaign.currency || 'USD',
        durationDays: (campaign as any).durationDays
      });
      const data = extractData<AdCampaign>(response);
      return data;
    }

    // For existing campaigns, attempt admin actions based on status
    if (campaign.status === 'ACTIVE' || campaign.status === 'active') {
      // nothing to do for activation here; admin approve endpoint exists
      await api.post(`/community/admin/ads/${campaign.id}/approve`);
    } else if (campaign.status === 'PAUSED' || campaign.status === 'paused') {
      await api.post(`/community/admin/ads/${campaign.id}/pause`);
    } else if (campaign.status === 'DRAFT' || campaign.status === 'draft') {
      // basic update via re-create draft endpoint is not available; fallback to submit
      await api.post(`/community/ads/${campaign.id}/submit`);
    } else {
      // fallback: try to POST to draft endpoint
      const response = await api.post('/community/ads/draft', campaign);
      const data = extractData<AdCampaign>(response);
      return data;
    }
  },

  // Delete campaign: attempt creator delete first, fall back to admin reject
  deleteCampaign: async (id: string, refund: boolean = false): Promise<void> => {
    try {
      await api.delete(`/community/ads/${id}`);
      return;
    } catch (err: any) {
      // If creator delete is not allowed (403) or endpoint missing (404), try admin reject
      try {
        await api.post(`/community/admin/ads/${id}/reject`, { refund });
        return;
      } catch (adminErr) {
        throw adminErr;
      }
    }
  }
};
