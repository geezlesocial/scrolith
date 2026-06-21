
import api from './api';
import {
    MarketingCampaign,
    Affiliate,
    Coupon,
    EmailProviderConfig,
    MarketingPopupSubscribeConfig,
    AffiliateApplication,
    AffiliateDashboardData,
    AffiliateProgramSettings
} from '../types';
import { MOCK_COUPONS } from '../constants';

const extractData = <T>(response: any): T => {
    if (response?.data?.data !== undefined) return response.data.data as T;
    if (response?.data !== undefined) return response.data as T;
    return response as T;
};

let coupons: Coupon[] = [...MOCK_COUPONS];
let emailConfig: EmailProviderConfig = {
    provider: 'smtp',
    host: 'smtp.mailtrap.io',
    port: 2525,
    username: 'user',
    password: 'password',
    fromName: 'Scrolith',
    fromEmail: 'no-reply@Scrolith.com'
};

export const MarketingService = {
    // --- Email Marketing ---
    getCampaigns: async (): Promise<MarketingCampaign[]> => {
        const response = await api.get('/admin/marketing/campaigns');
        const data = extractData<MarketingCampaign[]>(response);
        return Array.isArray(data) ? data : [];
    },

    saveCampaign: async (campaign: MarketingCampaign): Promise<MarketingCampaign> => {
        const response = await api.post('/admin/marketing/campaigns', campaign);
        return extractData<MarketingCampaign>(response);
    },

    deleteCampaign: async (id: string): Promise<void> => {
        await api.delete(`/admin/marketing/campaigns/${id}`);
    },

    sendCampaign: async (id: string): Promise<MarketingCampaign> => {
        const response = await api.post(`/admin/marketing/campaigns/${id}/send`);
        return extractData<MarketingCampaign>(response);
    },

    simulateSendCampaign: async (id: string): Promise<void> => {
        await MarketingService.sendCampaign(id);
    },

    getEmailConfig: async (): Promise<EmailProviderConfig> => {
        return new Promise(resolve => setTimeout(() => resolve({ ...emailConfig }), 200));
    },

    saveEmailConfig: async (config: EmailProviderConfig): Promise<void> => {
        return new Promise(resolve => {
            emailConfig = config;
            resolve();
        });
    },

    // --- Affiliates ---
    getAffiliates: async (): Promise<Affiliate[]> => {
        const response = await api.get('/admin/marketing/affiliates');
        const data = extractData<Affiliate[]>(response);
        return Array.isArray(data) ? data : [];
    },

    updateAffiliateStatus: async (id: string, status: Affiliate['status']): Promise<void> => {
        await api.patch(`/admin/marketing/affiliates/${id}/status`, { status });
    },

    getAffiliateSettings: async (): Promise<AffiliateProgramSettings> => {
        const response = await api.get('/admin/marketing/affiliates/settings');
        return extractData<AffiliateProgramSettings>(response);
    },

    saveAffiliateSettings: async (settings: Partial<AffiliateProgramSettings>): Promise<AffiliateProgramSettings> => {
        const response = await api.put('/admin/marketing/affiliates/settings', settings);
        return extractData<AffiliateProgramSettings>(response);
    },

    getAffiliateApplications: async (): Promise<AffiliateApplication[]> => {
        const response = await api.get('/admin/marketing/affiliates/applications');
        const data = extractData<AffiliateApplication[]>(response);
        return Array.isArray(data) ? data : [];
    },

    approveAffiliateApplication: async (id: string, reviewNote?: string): Promise<void> => {
        await api.post(`/admin/marketing/affiliates/applications/${id}/approve`, { reviewNote });
    },

    rejectAffiliateApplication: async (id: string, reviewNote?: string): Promise<void> => {
        await api.post(`/admin/marketing/affiliates/applications/${id}/reject`, { reviewNote });
    },

    // --- Coupons ---
    getCoupons: async (): Promise<Coupon[]> => {
        return new Promise(resolve => setTimeout(() => resolve([...coupons]), 200));
    },

    saveCoupon: async (coupon: Coupon): Promise<Coupon> => {
        return new Promise(resolve => {
            const idx = coupons.findIndex(c => c.id === coupon.id);
            if (idx >= 0) coupons[idx] = coupon;
            else coupons.unshift(coupon);
            resolve(coupon);
        });
    },

    deleteCoupon: async (id: string): Promise<void> => {
        return new Promise(resolve => {
            coupons = coupons.filter(c => c.id !== id);
            resolve();
        });
    },

    // --- Applications ---
    submitApplication: async (data: any): Promise<any> => {
        const response = await api.post('/marketing/affiliate/apply', data || {});
        return extractData<any>(response);
    },

    getMyAffiliateDashboard: async (): Promise<AffiliateDashboardData> => {
        const response = await api.get('/marketing/affiliate/me');
        return extractData<AffiliateDashboardData>(response);
    },

    linkReferralCode: async (referralCode: string): Promise<any> => {
        const response = await api.post('/marketing/affiliate/link', { referralCode });
        return extractData<any>(response);
    },

    requestAffiliateWithdrawal: async (amount?: number): Promise<any> => {
        const response = await api.post('/marketing/affiliate/withdraw', amount ? { amount } : {});
        return extractData<any>(response);
    },

    // --- Popup Subscribe Config (Admin) ---
    getPopupSubscribeConfig: async (): Promise<MarketingPopupSubscribeConfig> => {
        const response = await api.get('/admin/marketing/popup-subscribe');
        return extractData<MarketingPopupSubscribeConfig>(response);
    },

    savePopupSubscribeConfig: async (config: MarketingPopupSubscribeConfig): Promise<MarketingPopupSubscribeConfig> => {
        const response = await api.post('/admin/marketing/popup-subscribe', config);
        return extractData<MarketingPopupSubscribeConfig>(response);
    },

    // --- Public Marketing ---
    getPublicPopupSubscribeConfig: async (): Promise<MarketingPopupSubscribeConfig> => {
        const response = await api.get('/marketing/popup-subscribe');
        return extractData<MarketingPopupSubscribeConfig>(response);
    },

    getPopupBanners: async (role?: string): Promise<MarketingCampaign[]> => {
        const response = await api.get('/marketing/popup-banners', { params: role ? { role } : undefined });
        const data = extractData<MarketingCampaign[]>(response);
        return Array.isArray(data) ? data : [];
    },

    subscribeToNewsletter: async (payload: { email: string; name?: string; source?: string }): Promise<void> => {
        await api.post('/marketing/subscribe', payload);
    }
};

