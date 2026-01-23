
import { MarketingCampaign, Affiliate, Coupon, EmailProviderConfig } from '../types';
import { MOCK_CAMPAIGNS, MOCK_AFFILIATES, MOCK_COUPONS } from '../constants';

let campaigns: MarketingCampaign[] = [...MOCK_CAMPAIGNS];
let affiliates: Affiliate[] = [...MOCK_AFFILIATES];
let coupons: Coupon[] = [...MOCK_COUPONS];
let emailConfig: EmailProviderConfig = {
    provider: 'smtp',
    host: 'smtp.mailtrap.io',
    port: 2525,
    username: 'user',
    password: 'password',
    fromName: 'Geezle',
    fromEmail: 'no-reply@geezle.com'
};

export const MarketingService = {
    // --- Email Marketing ---
    getCampaigns: async (): Promise<MarketingCampaign[]> => {
        return new Promise(resolve => setTimeout(() => resolve([...campaigns]), 200));
    },

    saveCampaign: async (campaign: MarketingCampaign): Promise<MarketingCampaign> => {
        return new Promise(resolve => {
            const idx = campaigns.findIndex(c => c.id === campaign.id);
            if (idx >= 0) campaigns[idx] = campaign;
            else campaigns.unshift(campaign);
            resolve(campaign);
        });
    },

    deleteCampaign: async (id: string): Promise<void> => {
        return new Promise(resolve => {
            campaigns = campaigns.filter(c => c.id !== id);
            resolve();
        });
    },

    simulateSendCampaign: async (id: string): Promise<void> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const idx = campaigns.findIndex(c => c.id === id);
                if (idx >= 0) {
                    campaigns[idx].status = 'completed';
                    // Simulate random stats
                    campaigns[idx].stats = {
                        sent: Math.floor(Math.random() * 5000) + 1000,
                        opened: Math.floor(Math.random() * 2000),
                        clicked: Math.floor(Math.random() * 500)
                    };
                }
                resolve();
            }, 2000); // 2 second delay to simulate sending
        });
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
        return new Promise(resolve => setTimeout(() => resolve([...affiliates]), 200));
    },

    updateAffiliateStatus: async (id: string, status: Affiliate['status']): Promise<void> => {
        return new Promise(resolve => {
            const idx = affiliates.findIndex(a => a.id === id);
            if (idx >= 0) affiliates[idx].status = status;
            resolve();
        });
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
    submitApplication: async (data: any): Promise<void> => {
        return new Promise(resolve => setTimeout(() => {
            console.log("Affiliate Application Submitted:", data);
            resolve();
        }, 1000));
    }
};
