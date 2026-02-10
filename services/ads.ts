
import { AdCampaign, UserRole } from '../types';

const ADS_KEY = 'scrolith_ads';

const MOCK_ADS: AdCampaign[] = [
    {
        id: 'ad-1',
        title: 'Pro Design Tools',
        clientName: 'Adobe',
        creativeUrl: 'https://images.unsplash.com/photo-1626785774573-4b799314346d?auto=format&fit=crop&w=400&q=80',
        targetUrl: 'https://adobe.com',
        placement: 'feed',
        targetRoles: [UserRole.FREELANCER],
        impressions: 12500,
        clicks: 450,
        ctr: 3.6,
        startDate: '2023-10-01',
        endDate: '2024-10-01',
        status: 'active'
    },
    {
        id: 'ad-2',
        title: 'Hiring Sprint',
        clientName: 'Toptal',
        creativeUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80',
        targetUrl: 'https://toptal.com',
        placement: 'sidebar',
        targetRoles: [UserRole.FREELANCER, UserRole.EMPLOYER],
        impressions: 8900,
        clicks: 120,
        ctr: 1.3,
        startDate: '2023-11-01',
        endDate: '2024-01-01',
        status: 'active'
    }
];

async function tryBackend(path: string, opts: any = {}) {
    try {
        const res = await fetch(path, opts);
        if (!res.ok) throw new Error('bad_response');
        return await res.json();
    } catch (e) { return null; }
}

export const AdService = {
    getAds: async (role?: UserRole): Promise<AdCampaign[]> => {
        return new Promise(resolve => {
            const ads: AdCampaign[] = JSON.parse(localStorage.getItem(ADS_KEY) || JSON.stringify(MOCK_ADS));
            const active = ads.filter(a => a.status === 'active');

            if (role) {
                resolve(active.filter(a => a.targetRoles.includes(role)));
            } else {
                resolve(active);
            }
        });
    },

    getAllCampaigns: async (): Promise<AdCampaign[]> => {
        const backend = await tryBackend('/api/admin/community/ads/list', { method: 'GET' });
        if (backend && backend.success) return backend.data;
        return JSON.parse(localStorage.getItem(ADS_KEY) || JSON.stringify(MOCK_ADS));
    },

    saveCampaign: async (campaign: AdCampaign): Promise<void> => {
        try {
            if (campaign.id) {
                const backend = await tryBackend(`/api/admin/community/ads/${campaign.id}`, { method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify(campaign) });
                if (backend && backend.success) return;
            } else {
                const backend = await tryBackend('/api/admin/community/ads/create', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(campaign) });
                if (backend && backend.success) return;
            }
        } catch (e) { /* swallow and fallback */ }

        const ads: AdCampaign[] = JSON.parse(localStorage.getItem(ADS_KEY) || JSON.stringify(MOCK_ADS));
        const idx = ads.findIndex(a => a.id === campaign.id);
        if(idx >= 0) ads[idx] = campaign;
        else ads.push(campaign);
        localStorage.setItem(ADS_KEY, JSON.stringify(ads));
    },

    deleteCampaign: async (id: string): Promise<void> => {
        const backend = await tryBackend(`/api/admin/community/ads/${id}`, { method: 'DELETE' });
        if (backend && backend.success) return;
        const ads: AdCampaign[] = JSON.parse(localStorage.getItem(ADS_KEY) || JSON.stringify(MOCK_ADS));
        const filtered = ads.filter(a => a.id !== id);
        localStorage.setItem(ADS_KEY, JSON.stringify(filtered));
    }
};
