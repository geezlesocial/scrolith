import api from './api';
import { AdCampaign, AdsRuntimeConfig, UserRole } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const unwrapApiErrorValue = (value: any): any => {
  if (!value) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value.error && typeof value.error === 'object') {
      const nested = unwrapApiErrorValue(value.error);
      if (typeof nested === 'string' && nested.trim()) return nested;
    }
    if (typeof value.message === 'string' && value.message.trim()) return value.message;
    if (typeof value.error === 'string' && value.error.trim()) return value.error;
    if (typeof value.detail === 'string' && value.detail.trim()) return value.detail;
  }
  return value;
};

const extractApiErrorMessage = (error: any, fallback: string) => {
  const payload = error?.response?.data || {};
  const candidates = [
    unwrapApiErrorValue(payload?.error),
    unwrapApiErrorValue(payload?.message),
    unwrapApiErrorValue(payload?.data?.error),
    unwrapApiErrorValue(payload?.data?.message),
    unwrapApiErrorValue(error?.message)
  ];
  const picked = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  const normalized = String(picked || '').trim();
  if (normalized && !/^request failed with status code\s+\d+/i.test(normalized)) {
    return normalized;
  }
  return fallback || normalized;
};

const extractApiErrorCode = (error: any): string => {
  const payload = error?.response?.data || {};
  const candidates = [
    payload?.error?.code,
    payload?.code,
    payload?.errorCode,
    payload?.data?.error?.code,
    payload?.data?.code,
    payload?.data?.errorCode
  ];
  const picked = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return String(picked || '');
};

const normalizePricingModel = (value: any): 'CPM' | 'CPC' => {
  return String(value || '').toUpperCase() === 'CPC' ? 'CPC' : 'CPM';
};

const normalizeTargeting = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
};

const toAdPayload = (payload: Partial<AdCampaign>) => {
  const incomingTargeting = normalizeTargeting((payload as any).targeting);
  const placementsSource =
    Array.isArray((payload as any).placements) && (payload as any).placements.length > 0
      ? ((payload as any).placements as string[])
      : payload.placement
        ? [String(payload.placement)]
        : Array.isArray(incomingTargeting.placements)
          ? incomingTargeting.placements
          : [];
  const placements = Array.from(
    new Set(
      placementsSource
        .map((placement) => String(placement || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
  const primaryPlacement = placements[0] || String(payload.placement || 'community_feed');

  const pricingModel = normalizePricingModel(
    (payload as any).pricingModel || (payload as any).computeOption || incomingTargeting.pricingModel
  );
  const targetCountries = Array.from(
    new Set(
      (Array.isArray((payload as any).targetCountries)
        ? (payload as any).targetCountries
        : Array.isArray(incomingTargeting.targetCountries)
          ? incomingTargeting.targetCountries
          : []
      )
        .map((entry: any) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
  const targetAudienceRaw = String(
    (payload as any).targetAudience || incomingTargeting.targetAudience || 'users'
  )
    .trim()
    .toLowerCase();
  const targetAudience =
    targetAudienceRaw === 'businesses' || targetAudienceRaw === 'all' ? targetAudienceRaw : 'users';
  const dailySpendRaw =
    (payload as any).dailySpend ?? incomingTargeting.dailySpend ?? null;
  const dailySpend =
    dailySpendRaw === null || dailySpendRaw === undefined || dailySpendRaw === ''
      ? null
      : Number(dailySpendRaw);

  const targeting = {
    ...incomingTargeting,
    placements,
    pricingModel,
    targetCountries,
    targetAudience,
    dailySpend: Number.isFinite(dailySpend) && dailySpend > 0 ? dailySpend : null
  };

  return {
    title: payload.title,
    body: payload.body,
    objective: payload.objective,
    destinationType: payload.destinationType,
    destinationUrl: payload.destinationUrl,
    ctaText: payload.ctaText,
    placement: primaryPlacement,
    placements,
    pricingModel,
    computeOption: pricingModel,
    targetCountries,
    targetAudience,
    dailySpend: targeting.dailySpend,
    targeting,
    mediaFileIds: payload.mediaFileIds || [],
    budget: payload.budget || 0,
    currency: payload.currency || 'USD',
    durationDays: payload.durationDays,
    startAt: (payload as any).startAt,
    endAt: (payload as any).endAt
  };
};

export const AdService = {
  // Public ads listing (frontend)
  getAds: async (
    roleOrOptions?: UserRole | { role?: UserRole; placement?: string; limit?: number }
  ): Promise<AdCampaign[]> => {
    const params =
      roleOrOptions && typeof roleOrOptions === 'object'
        ? {
            role: roleOrOptions.role,
            placement: roleOrOptions.placement,
            limit: roleOrOptions.limit
          }
        : roleOrOptions
          ? { role: roleOrOptions }
          : undefined;
    const response = await api.get('/community/ads', { params });
    const data = extractData<AdCampaign[]>(response);
    return Array.isArray(data) ? data : [];
  },

  createAdDraft: async (payload: Partial<AdCampaign>): Promise<AdCampaign | null> => {
    try {
      const response = await api.post('/community/ads/draft', toAdPayload(payload));
      const data = extractData<AdCampaign>(response);
      return data || null;
    } catch (error: any) {
      throw new Error(extractApiErrorMessage(error, 'Unable to create ad draft.'));
    }
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

  getRuntimeConfig: async (): Promise<AdsRuntimeConfig | null> => {
    try {
      const response = await api.get('/community/ads/runtime-config');
      const data = extractData<AdsRuntimeConfig>(response);
      return data || null;
    } catch {
      return null;
    }
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

  payAd: async (
    id: string,
    paymentMethod?: any
  ): Promise<{ success: boolean; message?: string; code?: string; data?: any }> => {
    try {
      const response = await api.post(`/community/ads/${id}/pay`, paymentMethod || {});
      const success = response?.data?.success ?? true;
      const message = extractApiErrorMessage({ response }, '');
      const code = String(
        response?.data?.code ||
        response?.data?.errorCode ||
        response?.data?.error?.code ||
        response?.data?.data?.code ||
        ''
      );
      const data = extractData<any>(response);
      return { success, message, code, data };
    } catch (error: any) {
      return {
        success: false,
        code: extractApiErrorCode(error),
        message: extractApiErrorMessage(error, 'Unable to process payment.')
      };
    }
  },

  pauseOwnAd: async (id: string): Promise<any> => {
    const response = await api.post(`/community/ads/${id}/pause`, {});
    return extractData<any>(response);
  },

  resumeOwnAd: async (id: string): Promise<any> => {
    const response = await api.post(`/community/ads/${id}/resume`, {});
    return extractData<any>(response);
  },

  submitAd: async (
    id: string,
    payload?: Record<string, any>
  ): Promise<{ success: boolean; message?: string; code?: string; data?: any }> => {
    try {
      const response = await api.post(`/community/ads/${id}/submit`, payload || {});
      const success = response?.data?.success ?? true;
      const message = extractApiErrorMessage({ response }, '');
      const code = String(
        response?.data?.code ||
        response?.data?.errorCode ||
        response?.data?.error?.code ||
        response?.data?.data?.code ||
        ''
      );
      const data = extractData<any>(response);
      return { success, message, code, data };
    } catch (error: any) {
      return {
        success: false,
        code: extractApiErrorCode(error),
        message: extractApiErrorMessage(error, 'Unable to submit ad.')
      };
    }
  },

  recordImpression: async (id: string): Promise<void> => {
    await api.post(`/community/ads/${id}/impression`, {});
  },

  recordClick: async (id: string): Promise<void> => {
    await api.post(`/community/ads/${id}/click`, {});
  },

  getConfig: async (): Promise<any> => {
    try {
      const response = await api.get('/community/ads/config');
      return extractData<any>(response);
    } catch (error: any) {
      // Backward-compatible fallback for older deployments where only admin route exists.
      const response = await api.get('/community/admin/ads/config');
      return extractData<any>(response);
    }
  },

  updateConfig: async (data: any): Promise<any> => {
    const response = await api.put('/community/admin/ads/config', data);
    return extractData<any>(response);
  },

  updateAd: async (id: string, campaign: Partial<AdCampaign>): Promise<AdCampaign | null> => {
    try {
      const payload = toAdPayload(campaign as Partial<AdCampaign>) as any;
      // Prevent frontend from attempting to change status via creator update
      if (payload.status) delete payload.status;
      const response = await api.put(`/community/ads/${id}`, payload);
      const data = extractData<AdCampaign>(response);
      return data || null;
    } catch (error: any) {
      throw new Error(extractApiErrorMessage(error, 'Unable to update ad.'));
    }
  },

  // Save campaign: create draft or update via available endpoints
  saveCampaign: async (campaign: AdCampaign): Promise<void> => {
    if (!campaign.id) {
      // create draft
      const response = await api.post('/community/ads/draft', toAdPayload(campaign));
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
      // Drafts should be updated, never auto-submitted.
      await api.put(`/community/ads/${campaign.id}`, toAdPayload(campaign));
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
