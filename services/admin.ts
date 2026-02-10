
import { User, Subscriber, StaffMember, StaffRole, Plan, SupportTicket, FraudAlert, MediaItem, ListingCategory, Gig, Job, FraudLog, ChurnRisk, GrowthForecast, OptimizationProposal, AnomalyAlert, MarketingROI } from '../types';
import { MOCK_GIGS, MOCK_JOBS, CATEGORIES } from '../constants';

// Laravel API Base URL
const API_BASE = '/api/admin/commerce';

// --- Local Storage Fallback Keys ---
const ADMIN_STAFF_KEY = 'atmyworks_staff';
const ADMIN_ROLES_KEY = 'atmyworks_staff_roles';
const LOCAL_GIGS_KEY = 'scrolith_admin_gigs';
const LOCAL_JOBS_KEY = 'scrolith_admin_jobs';
const LOCAL_CATS_KEY = 'scrolith_admin_categories';

// --- Helper Functions ---

const getLocalCategories = (): ListingCategory[] => {
    try {
        const stored = localStorage.getItem(LOCAL_CATS_KEY);
        if (stored) return JSON.parse(stored);
    } catch(e) {}
    
    // Use rich CATEGORIES from constants as default fallback
    // Don't overwrite immediately if it was a read error, but here we initialize
    if (!localStorage.getItem(LOCAL_CATS_KEY)) {
        localStorage.setItem(LOCAL_CATS_KEY, JSON.stringify(CATEGORIES));
    }
    return CATEGORIES;
};

const api = {
    get: async (endpoint: string) => {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            const json = await res.json();
            // Handle Laravel Pagination: if response.data exists and is array, return it, else return response
            return Array.isArray(json.data) ? json.data : json;
        } catch (e) {
            // Silently fail to trigger fallback in demo mode
            // console.debug(`[Mock Mode] GET ${endpoint} - Using local data`);
            throw e; // Re-throw to trigger fallback logic in service methods
        }
    },
    post: async (endpoint: string, data: any) => {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return await res.json();
        } catch (e) {
            // console.debug(`[Mock Mode] POST ${endpoint} failed, using fallback`);
            throw e;
        }
    },
    put: async (endpoint: string, data: any) => {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return await res.json();
        } catch (e) {
            throw e;
        }
    },
    delete: async (endpoint: string) => {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return true;
        } catch (e) {
            throw e;
        }
    }
};

export const AdminService = {
    // --- USERS (Mocked for now) ---
    getUsers: async (): Promise<User[]> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const stored = localStorage.getItem('scrolith_user'); 
                const users: User[] = [
                    { id: 'u1', name: 'John Freelancer', email: 'john@example.com', role: 'freelancer' as any, status: 'active', avatar: 'https://ui-avatars.com/api/?name=John+Freelancer' },
                    { id: 'client-1', name: 'Alice Client', email: 'alice@example.com', role: 'employer' as any, status: 'active', avatar: 'https://ui-avatars.com/api/?name=Alice+Client' },
                    { id: 'admin-1', name: 'Super Admin', email: 'admin@scrolith.com', role: 'admin' as any, status: 'active', avatar: 'https://ui-avatars.com/api/?name=Admin' }
                ];
                if (stored) {
                    const current = JSON.parse(stored);
                    if (!users.find(u => u.id === current.id)) users.push(current);
                }
                resolve(users);
            }, 300);
        });
    },

    getSubscribers: async (): Promise<Subscriber[]> => {
        return Promise.resolve([
            { id: 'sub-1', email: 'fan@example.com', source: 'footer', status: 'verified', subscribedAt: '2023-10-01' },
            { id: 'sub-2', email: 'lead@business.com', source: 'popup', status: 'pending', subscribedAt: '2023-10-05' },
        ]);
    },

    getSubscriberAnalytics: async (): Promise<any> => {
        return Promise.resolve({
            total: 1240,
            verified: 850,
            pending: 340,
            unsubscribed: 50,
            sources: { popup: 780, footer: 460 },
            growth: { today: 12, week: 85, month: 320 },
            conversion: { popup: 4.2, footer: 1.8 } 
        });
    },

    updateUserDetail: async (userId: string, data: Partial<User>, adminId: string): Promise<User> => {
        const stored = localStorage.getItem('scrolith_user');
        if (stored) {
            const current = JSON.parse(stored);
            if (current.id === userId) {
                const updated = { ...current, ...data };
                localStorage.setItem('scrolith_user', JSON.stringify(updated));
            }
        }
        return { id: userId, ...data } as User;
    },

    updateUserStatus: async (userId: string, status: any, adminId: string): Promise<void> => {},
    deleteUser: async (userId: string, adminId: string): Promise<void> => {},

    // --- STAFF (Local Storage) ---
    getStaff: async (): Promise<StaffMember[]> => {
        return new Promise(resolve => {
            const stored = localStorage.getItem(ADMIN_STAFF_KEY);
            resolve(stored ? JSON.parse(stored) : []);
        });
    },

    getRoles: async (): Promise<StaffRole[]> => {
        return new Promise(resolve => {
            const stored = localStorage.getItem(ADMIN_ROLES_KEY);
            resolve(stored ? JSON.parse(stored) : [
                { id: 'role-super', name: 'Super Admin', level: 100, permissions: { all: true } },
                { id: 'role-support', name: 'Support Agent', level: 10, permissions: { tickets: true } },
                { id: 'role-manager', name: 'Manager', level: 50, permissions: { users: true, content: true } }
            ]);
        });
    },

    saveStaff: async (staff: Partial<StaffMember>): Promise<StaffMember> => {
        return new Promise(resolve => {
            const all = JSON.parse(localStorage.getItem(ADMIN_STAFF_KEY) || '[]');
            const newStaff = { ...staff, id: staff.id || `staff-${Date.now()}` } as StaffMember;
            const idx = all.findIndex((s: StaffMember) => s.id === newStaff.id);
            if (idx >= 0) all[idx] = newStaff;
            else all.push(newStaff);
            localStorage.setItem(ADMIN_STAFF_KEY, JSON.stringify(all));
            resolve(newStaff);
        });
    },

    deleteStaff: async (id: string): Promise<void> => {
        const all = JSON.parse(localStorage.getItem(ADMIN_STAFF_KEY) || '[]');
        localStorage.setItem(ADMIN_STAFF_KEY, JSON.stringify(all.filter((s: StaffMember) => s.id !== id)));
    },

    // --- COMMERCE (Hybrid: Laravel API + Fallback) ---
    // Routes: /admin/commerce/gigs, /admin/commerce/jobs, etc.

    getAdminGigs: async (): Promise<Gig[]> => {
        try {
            return await api.get('/gigs');
        } catch (e) {
            // Fallback
            const stored = localStorage.getItem(LOCAL_GIGS_KEY);
            if (stored) return JSON.parse(stored);
            localStorage.setItem(LOCAL_GIGS_KEY, JSON.stringify(MOCK_GIGS));
            return [...MOCK_GIGS];
        }
    },

    saveGig: async (gig: Gig): Promise<void> => {
        try {
            if (gig.id && !gig.id.startsWith('gig-')) { // Assume real DB ID
                 await api.put(`/gigs/${gig.id}`, gig);
            } else {
                 await api.post('/gigs', gig);
            }
        } catch (e) {
            // Fallback
            const stored = localStorage.getItem(LOCAL_GIGS_KEY);
            const gigs: Gig[] = stored ? JSON.parse(stored) : [...MOCK_GIGS];
            const idx = gigs.findIndex(g => g.id === gig.id);
            const toSave = { ...gig, id: gig.id || `gig-${Date.now()}` };
            if (idx >= 0) gigs[idx] = toSave;
            else gigs.unshift(toSave);
            localStorage.setItem(LOCAL_GIGS_KEY, JSON.stringify(gigs));
        }
    },

    deleteGig: async (id: string): Promise<void> => {
        try {
            await api.delete(`/gigs/${id}`);
        } catch (e) {
            const stored = localStorage.getItem(LOCAL_GIGS_KEY);
            const gigs: Gig[] = stored ? JSON.parse(stored) : [...MOCK_GIGS];
            localStorage.setItem(LOCAL_GIGS_KEY, JSON.stringify(gigs.filter(g => g.id !== id)));
        }
    },

    getAdminJobs: async (): Promise<Job[]> => {
        try {
            return await api.get('/jobs');
        } catch (e) {
             const stored = localStorage.getItem(LOCAL_JOBS_KEY);
             if (stored) return JSON.parse(stored);
             localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(MOCK_JOBS));
             return [...MOCK_JOBS];
        }
    },

    saveJob: async (job: Job): Promise<void> => {
        try {
            if (job.id && !job.id.startsWith('job-')) {
                await api.put(`/jobs/${job.id}`, job);
            } else {
                await api.post('/jobs', job);
            }
        } catch (e) {
             const stored = localStorage.getItem(LOCAL_JOBS_KEY);
             const jobs: Job[] = stored ? JSON.parse(stored) : [...MOCK_JOBS];
             const idx = jobs.findIndex(j => j.id === job.id);
             const toSave = { ...job, id: job.id || `job-${Date.now()}` };
             if (idx >= 0) jobs[idx] = toSave;
             else jobs.unshift(toSave);
             localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs));
        }
    },

    deleteJob: async (id: string): Promise<void> => {
        try {
            await api.delete(`/jobs/${id}`);
        } catch (e) {
            const stored = localStorage.getItem(LOCAL_JOBS_KEY);
            const jobs: Job[] = stored ? JSON.parse(stored) : [...MOCK_JOBS];
            localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs.filter(j => j.id !== id)));
        }
    },

    approveListing: async (type: 'gig' | 'job', id: string, status: string): Promise<void> => {
        // Optimistically update local
        if (type === 'gig') {
            const gigs = await AdminService.getAdminGigs();
            const gig = gigs.find(g => g.id === id);
            if (gig) {
                gig.status = status as any;
                gig.adminStatus = status === 'active' ? 'approved' : status as any;
                await AdminService.saveGig(gig);
            }
        } else {
            const jobs = await AdminService.getAdminJobs();
            const job = jobs.find(j => j.id === id);
            if (job) {
                job.status = status as any;
                await AdminService.saveJob(job);
            }
        }
    },

    // --- CATEGORIES (Hybrid) ---

    getGigCategories: async (): Promise<ListingCategory[]> => {
        try {
            return await api.get('/categories?type=gig');
        } catch (e) {
            return getLocalCategories().filter(c => c.type === 'gig');
        }
    },

    getJobCategories: async (): Promise<ListingCategory[]> => {
         try {
            return await api.get('/categories?type=job');
        } catch (e) {
            return getLocalCategories().filter(c => c.type === 'job');
        }
    },

    saveListingCategory: async (cat: ListingCategory): Promise<void> => {
        const endpoint = '/categories';
        try {
            if (cat.id && !cat.id.startsWith('cat-')) {
                await api.put(`${endpoint}/${cat.id}`, cat);
            } else {
                await api.post(endpoint, cat);
            }
        } catch (e) {
            // Fallback
            const all = getLocalCategories();
            const idx = all.findIndex(c => c.id === cat.id);
            if (idx >= 0) all[idx] = cat;
            else all.push(cat);
            localStorage.setItem(LOCAL_CATS_KEY, JSON.stringify(all));
        }
    },

    deleteListingCategory: async (id: string): Promise<void> => {
        try {
            await api.delete(`/categories/${id}`);
        } catch (e) {
            const all = getLocalCategories();
            localStorage.setItem(LOCAL_CATS_KEY, JSON.stringify(all.filter(c => c.id !== id)));
        }
    },

    // --- PLANS ---
    getPlans: async (): Promise<Plan[]> => {
        try {
            return await api.get('/plans');
        } catch (e) {
            return [
                { id: 'p1', name: 'Basic', type: 'freelancer', price: 0, interval: 'monthly', currency: 'USD', isActive: true, isPopular: false, features: [] },
                { id: 'p2', name: 'Pro', type: 'freelancer', price: 10, interval: 'monthly', currency: 'USD', isActive: true, isPopular: true, features: [] }
            ];
        }
    },
    
    savePlan: async (plan: Plan): Promise<void> => {
        try {
             if (plan.id && !plan.id.startsWith('plan-')) await api.put(`/plans/${plan.id}`, plan);
             else await api.post('/plans', plan);
        } catch (e) {
             // Mock save success
        }
    },

    // --- AI / Analytics (Mocked) ---
    getAIAnalytics: async (): Promise<any> => {
        return {
            totalConversations: 1250,
            costEstimate: 12.50,
            avgResponseTime: 450,
            safetyStats: { spamTriggers: 5 },
            topRoles: [{ role: 'freelancer', count: 800 }, { role: 'employer', count: 450 }],
            conversionImpact: { aiGigsCreated: 120, aiHireRate: 15, revenueUplift: 4500 }
        };
    },

    getFraudAlerts: async (): Promise<FraudAlert[]> => {
        return [
            { id: 'fa1', userId: 'u-suspicious', userName: 'Bot User', userRole: 'freelancer', score: 85, riskLevel: 'Critical', reason: 'High velocity', contentSnippet: '', action: 'Auto-Frozen', reviewed: false, timestamp: new Date().toISOString() }
        ];
    },

    getFraudLogs: async (): Promise<FraudLog[]> => Promise.resolve([]),
    getChurnRisks: async (): Promise<ChurnRisk[]> => Promise.resolve([]),
    getGrowthForecast: async (): Promise<GrowthForecast[]> => Promise.resolve([]),
    getOptimizationProposals: async (): Promise<OptimizationProposal[]> => Promise.resolve([]),
    getAnomalyAlerts: async (): Promise<AnomalyAlert[]> => Promise.resolve([]),
    getMarketingROI: async (): Promise<MarketingROI[]> => Promise.resolve([]),

    // --- FILES ---
    getAllFiles: async (): Promise<MediaItem[]> => [],
    deleteFile: async (id: string, adminId: string): Promise<void> => {},
};
