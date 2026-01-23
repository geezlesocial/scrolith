import api from './api';
import {
  User,
  UserRole,
  Subscriber,
  StaffMember,
  StaffRole,
  Plan,
  FraudAlert,
  MediaItem,
  ListingCategory,
  Gig,
  Job,
  FraudLog,
  ChurnRisk,
  GrowthForecast,
  OptimizationProposal,
  AnomalyAlert,
  MarketingROI,
  SystemConfig,
  PlatformSettings,
  AdminDashboardStats,
  ApiResponse
} from '../types';

const ADMIN_BASE = '/admin';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const adminGet = async <T>(endpoint: string, params?: Record<string, any>): Promise<T> => {
  const response = await api.get(`${ADMIN_BASE}${endpoint}`, { params });
  return extractData<T>(response);
};

const adminPost = async <T>(endpoint: string, data?: any): Promise<T> => {
  const response = await api.post(`${ADMIN_BASE}${endpoint}`, data);
  return extractData<T>(response);
};

const adminPut = async <T>(endpoint: string, data?: any): Promise<T> => {
  const response = await api.put(`${ADMIN_BASE}${endpoint}`, data);
  return extractData<T>(response);
};

const adminDelete = async <T>(endpoint: string): Promise<T> => {
  const response = await api.delete(`${ADMIN_BASE}${endpoint}`);
  return extractData<T>(response);
};

const adminRequest = async <T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  endpoint: string,
  data?: any,
  params?: Record<string, any>
): Promise<ApiResponse<T>> => {
  const response = await api.request({
    method,
    url: `${ADMIN_BASE}${endpoint}`,
    data,
    params
  });
  return response.data as ApiResponse<T>;
};

const normalizeGigPackage = (pkg: any) => ({
  ...pkg,
  delivery_days: pkg?.delivery_days ?? pkg?.deliveryDays ?? 0,
  deliveryDays: pkg?.deliveryDays ?? pkg?.delivery_days ?? 0
});

const normalizeGigExtra = (extra: any) => ({
  ...extra,
  additional_days: extra?.additional_days ?? extra?.additionalDays ?? 0,
  additionalDays: extra?.additionalDays ?? extra?.additional_days ?? 0,
  applies_to: extra?.applies_to ?? extra?.appliesTo ?? 'all',
  appliesTo: extra?.appliesTo ?? extra?.applies_to ?? 'all'
});

const normalizeGig = (gig: any): Gig => {
  const adminStatus = gig?.admin_status ?? gig?.adminStatus;
  const pricingMode = gig?.pricing_mode ?? gig?.pricingMode;
  const freelancerName = gig?.freelancer_name ?? gig?.freelancerName;
  const freelancerId = gig?.freelancer_id ?? gig?.freelancerId;
  const freelancerAvatar = gig?.freelancer_avatar ?? gig?.freelancerAvatar;
  const createdAt = gig?.created_at ?? gig?.createdAt;
  const updatedAt = gig?.updated_at ?? gig?.updatedAt;
  const isVisible = gig?.is_visible ?? gig?.isVisible;
  const isActive = gig?.is_active ?? gig?.isActive;
  const ordersCount = gig?.orders_count ?? gig?.ordersCount;
  const image = gig?.image ?? (Array.isArray(gig?.images) ? gig.images[0] : '') ?? '';

  return {
    ...gig,
    image,
    admin_status: adminStatus,
    adminStatus,
    pricing_mode: pricingMode,
    pricingMode,
    freelancer_name: freelancerName,
    freelancerName,
    freelancer_id: freelancerId,
    freelancerId,
    freelancer_avatar: freelancerAvatar,
    freelancerAvatar,
    created_at: createdAt,
    createdAt,
    updated_at: updatedAt,
    updatedAt,
    is_visible: isVisible,
    isVisible,
    is_active: isActive,
    isActive,
    orders_count: ordersCount,
    ordersCount,
    packages: Array.isArray(gig?.packages) ? gig.packages.map(normalizeGigPackage) : [],
    extras: Array.isArray(gig?.extras) ? gig.extras.map(normalizeGigExtra) : []
  } as Gig;
};

const normalizeJob = (job: any): Job => {
  const adminStatus = job?.admin_status ?? job?.adminStatus;
  const clientName = job?.client_name ?? job?.clientName;
  const postedTime = job?.posted_time ?? job?.postedTime;
  const experienceLevel = job?.experience_level ?? job?.experienceLevel;
  const isActive = job?.is_active ?? job?.isActive;
  const isVisible = job?.is_visible ?? job?.isVisible;

  return {
    ...job,
    admin_status: adminStatus,
    adminStatus,
    client_name: clientName,
    clientName,
    posted_time: postedTime,
    postedTime,
    experience_level: experienceLevel,
    experienceLevel,
    is_active: isActive,
    isActive,
    is_visible: isVisible,
    isVisible
  } as Job;
};

const normalizeCategory = (category: any): ListingCategory => ({
  ...category,
  sort_order: category?.sort_order ?? category?.sortOrder ?? 0,
  sortOrder: category?.sortOrder ?? category?.sort_order ?? 0,
  subcategories: Array.isArray(category?.subcategories)
    ? category.subcategories.map((sub: any) => ({
        ...sub,
        sort_order: sub?.sort_order ?? sub?.sortOrder ?? 0,
        sortOrder: sub?.sortOrder ?? sub?.sort_order ?? 0
      }))
    : []
});

const normalizePlan = (plan: any): Plan => ({
  ...plan,
  is_active: plan?.is_active ?? plan?.isActive ?? false,
  isActive: plan?.isActive ?? plan?.is_active ?? false,
  is_popular: plan?.is_popular ?? plan?.isPopular ?? false,
  isPopular: plan?.isPopular ?? plan?.is_popular ?? false
});

const normalizeUser = (user: any): User => {
  const roleValue = (user?.role ?? user?.role_name ?? 'guest').toString().toLowerCase();
  const isActive = user?.isActive ?? user?.is_active;
  const status = user?.status ?? (isActive === false ? 'inactive' : 'active');
  const flags = user?.flags
    ? {
        isBanned: user.flags?.isBanned ?? user.flags?.is_banned,
        isRestricted: user.flags?.isRestricted ?? user.flags?.is_restricted,
        isSuspended: user.flags?.isSuspended ?? user.flags?.is_suspended,
        isVerified: user.flags?.isVerified ?? user.flags?.is_verified,
        isFeatured: user.flags?.isFeatured ?? user.flags?.is_featured,
        requiresKyc: user.flags?.requiresKyc ?? user.flags?.requires_kyc
      }
    : undefined;

  return {
    ...user,
    role: roleValue as UserRole,
    isActive,
    status,
    flags,
    profilePhotoFileId: user?.profilePhotoFileId ?? user?.profile_photo_file_id
  } as User;
};

const normalizeSubscriber = (subscriber: any): Subscriber => ({
  ...subscriber,
  subscribed_at: subscriber?.subscribed_at ?? subscriber?.subscribedAt,
  subscribedAt: subscriber?.subscribedAt ?? subscriber?.subscribed_at,
  verifiedAt: subscriber?.verifiedAt ?? subscriber?.verified_at,
  unsubscribedAt: subscriber?.unsubscribedAt ?? subscriber?.unsubscribed_at
});

const normalizeFraudAlert = (alert: any): FraudAlert => {
  const userId = alert?.user_id ?? alert?.userId ?? '';
  const userName = alert?.user_name ?? alert?.userName ?? '';
  const userRole = alert?.user_role ?? alert?.userRole ?? 'guest';
  const riskLevel = alert?.risk_level ?? alert?.riskLevel ?? 'Low';
  const contentSnippet = alert?.content_snippet ?? alert?.contentSnippet ?? '';

  return {
    ...alert,
    user_id: userId,
    userId,
    user_name: userName,
    userName,
    user_role: userRole,
    userRole,
    score: Number(alert?.score ?? 0),
    risk_level: riskLevel,
    riskLevel,
    reason: alert?.reason ?? '',
    content_snippet: contentSnippet,
    contentSnippet,
    action: alert?.action ?? 'Allow',
    reviewed: Boolean(alert?.reviewed ?? false),
    timestamp: alert?.timestamp ?? new Date().toISOString()
  } as FraudAlert;
};

const normalizeFraudLog = (log: any): FraudLog => {
  const riskScore = Number(log?.risk_score ?? log?.riskScore ?? 0);
  const riskLevel = log?.risk_level ?? log?.riskLevel ?? 'Low';
  const actionTaken = log?.action_taken ?? log?.actionTaken ?? 'Allow';

  return {
    ...log,
    risk_score: riskScore,
    riskScore,
    risk_level: riskLevel,
    riskLevel,
    reasons: Array.isArray(log?.reasons) ? log.reasons : [],
    action_taken: actionTaken,
    actionTaken,
    timestamp: log?.timestamp ?? new Date().toISOString()
  } as FraudLog;
};

export const AdminService = {
  getUsers: async (): Promise<User[]> => {
    const data = await adminGet<User[]>('/users');
    return Array.isArray(data) ? data.map(normalizeUser) : [];
  },

  getSubscribers: async (): Promise<Subscriber[]> => {
    const data = await adminGet<Subscriber[]>('/marketing/subscribers');
    return Array.isArray(data) ? data.map(normalizeSubscriber) : [];
  },

  getSubscriberAnalytics: async (): Promise<any> => {
    return adminGet<any>('/marketing/subscribers/analytics');
  },

  deleteSubscriber: async (id: string): Promise<void> => {
    await adminDelete(`/marketing/subscribers/${id}`);
  },

  updateUserDetail: async (userId: string, data: Partial<User>, adminId: string): Promise<User> => {
    return adminPut<User>(`/users/${userId}`, { ...data, adminId });
  },

  updateUserStatus: async (userId: string, status: any, adminId: string): Promise<void> => {
    await adminPost(`/users/${userId}/status`, { status, adminId });
  },

  deleteUser: async (userId: string, adminId: string): Promise<void> => {
    await adminDelete(`/users/${userId}?adminId=${encodeURIComponent(adminId)}`);
  },

  getStaff: async (): Promise<StaffMember[]> => {
    const data = await adminGet<StaffMember[]>('/staff');
    return Array.isArray(data) ? data : [];
  },

  getRoles: async (): Promise<StaffRole[]> => {
    const data = await adminGet<StaffRole[]>('/staff/roles');
    return Array.isArray(data) ? data : [];
  },

  saveStaff: async (staff: Partial<StaffMember>): Promise<StaffMember> => {
    return adminPost<StaffMember>('/staff', staff);
  },

  deleteStaff: async (id: string): Promise<void> => {
    await adminDelete(`/staff/${id}`);
  },

  async getAdminGigs(filters?: {
    status?: string;
    adminStatus?: string;
    search?: string;
    category?: string;
    subcategory?: string;
    page?: number;
    limit?: number;
  }): Promise<Gig[]> {
    const data = await adminGet<Gig[]>('/gigs-jobs/gigs', filters);
    return Array.isArray(data) ? data.map(normalizeGig) : [];
  },

  async getAdminJobs(filters?: {
    status?: string;
    adminStatus?: string;
    search?: string;
    category?: string;
    subcategory?: string;
    page?: number;
    limit?: number;
  }): Promise<Job[]> {
    const data = await adminGet<Job[]>('/gigs-jobs/jobs', filters);
    return Array.isArray(data) ? data.map(normalizeJob) : [];
  },

  async getGigCategories(): Promise<ListingCategory[]> {
    const data = await adminGet<ListingCategory[]>('/gigs-jobs/categories/gigs');
    return Array.isArray(data) ? data.map(normalizeCategory) : [];
  },

  async getJobCategories(): Promise<ListingCategory[]> {
    const data = await adminGet<ListingCategory[]>('/gigs-jobs/categories/jobs');
    return Array.isArray(data) ? data.map(normalizeCategory) : [];
  },

  async getPlans(): Promise<Plan[]> {
    const data = await adminGet<Plan[]>('/gigs-jobs/plans');
    return Array.isArray(data) ? data.map(normalizePlan) : [];
  },

  async getGigsJobsStats(): Promise<AdminDashboardStats | null> {
    const data = await adminGet<AdminDashboardStats | null>('/gigs-jobs/dashboard/stats');
    return data || null;
  },

  async approveListing(type: 'gig' | 'job', id: string, status: string): Promise<boolean> {
    const action = status === 'active' || status === 'approved' ? 'approve' : 'reject';
    const response = await adminRequest<{ id: string }>(
      'post',
      `/gigs-jobs/${type === 'gig' ? 'gigs' : 'jobs'}/${id}/approve`,
      {
        action,
        notes: `Status changed to ${status}`
      }
    );
    return Boolean(response?.success);
  },

  async deleteGig(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/gigs-jobs/gigs/${id}`);
    return Boolean(response?.success);
  },

  async deleteJob(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/gigs-jobs/jobs/${id}`);
    return Boolean(response?.success);
  },

  async saveListingCategory(category: ListingCategory): Promise<boolean> {
    const response = await adminRequest<ListingCategory>('post', '/gigs-jobs/categories', category);
    return Boolean(response?.success);
  },

  async deleteListingCategory(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/gigs-jobs/categories/${id}`);
    return Boolean(response?.success);
  },

  async savePlan(plan: Plan): Promise<boolean> {
    const response = await adminRequest<Plan>('post', '/gigs-jobs/plans', plan);
    return Boolean(response?.success);
  },

  async saveGig(gig: Gig): Promise<boolean> {
    const response = await adminRequest<Gig>('post', '/gigs-jobs/gigs', gig);
    return Boolean(response?.success);
  },

  async saveJob(job: Job): Promise<boolean> {
    const response = await adminRequest<Job>('post', '/gigs-jobs/jobs', job);
    return Boolean(response?.success);
  },

  async getDashboardStats(): Promise<any> {
    return adminGet<any>('/gigs-jobs/dashboard/stats');
  },

  getOverviewStats: async (timeRange: 'today' | 'week' | 'month' | 'year' = 'week'): Promise<any> => {
    return adminGet<any>(`/overview?range=${timeRange}`);
  },

  getRecentActivity: async (): Promise<any[]> => {
    const data = await adminGet<any[]>('/activity');
    return Array.isArray(data) ? data : [];
  },

  getSystemSettings: async (): Promise<SystemConfig> => {
    return adminGet<SystemConfig>('/system/settings');
  },

  saveSystemSettings: async (settings: SystemConfig): Promise<SystemConfig> => {
    const data = await adminPost<any>('/system/settings', settings);
    // adminPost/extractData returns the inner `data` payload when server responds { success:true, data: ... }
    return (data as any) ?? settings;
  },

  getPlatformSettings: async (): Promise<PlatformSettings> => {
    return adminGet<PlatformSettings>('/platform/settings');
  },

  savePlatformSettings: async (settings: PlatformSettings): Promise<boolean> => {
    const data = await adminPost<{ success?: boolean }>('/platform/settings', settings);
    return Boolean(data?.success);
  },

  getSettings: async (): Promise<PlatformSettings> => {
    return AdminService.getPlatformSettings();
  },

  saveSettings: async (settings: PlatformSettings): Promise<boolean> => {
    return AdminService.savePlatformSettings(settings);
  },

  getAIAnalytics: async (): Promise<any> => {
    return adminGet<any>('/ai/analytics');
  },

  getFraudAlerts: async (): Promise<FraudAlert[]> => {
    const data = await adminGet<FraudAlert[]>('/fraud/alerts');
    return Array.isArray(data) ? data.map(normalizeFraudAlert) : [];
  },

  getFraudLogs: async (): Promise<FraudLog[]> => {
    const data = await adminGet<FraudLog[]>('/fraud/logs');
    return Array.isArray(data) ? data.map(normalizeFraudLog) : [];
  },

  getChurnRisks: async (): Promise<ChurnRisk[]> => {
    const data = await adminGet<ChurnRisk[]>('/analytics/churn');
    return Array.isArray(data) ? data : [];
  },

  getGrowthForecast: async (): Promise<GrowthForecast[]> => {
    const data = await adminGet<GrowthForecast[]>('/analytics/growth');
    return Array.isArray(data) ? data : [];
  },

  getOptimizationProposals: async (): Promise<OptimizationProposal[]> => {
    const data = await adminGet<OptimizationProposal[]>('/analytics/optimization');
    return Array.isArray(data) ? data : [];
  },

  getAnomalyAlerts: async (): Promise<AnomalyAlert[]> => {
    const data = await adminGet<AnomalyAlert[]>('/analytics/anomalies');
    return Array.isArray(data) ? data : [];
  },

  getMarketingROI: async (): Promise<MarketingROI[]> => {
    const data = await adminGet<MarketingROI[]>('/marketing/roi');
    return Array.isArray(data) ? data : [];
  },

  getAllFiles: async (): Promise<MediaItem[]> => {
    const data = await adminGet<MediaItem[]>('/files');
    return Array.isArray(data) ? data : [];
  },

  deleteFile: async (id: string, adminId: string): Promise<void> => {
    await adminDelete(`/files/${id}?adminId=${encodeURIComponent(adminId)}`);
  },

  async testConnection(): Promise<ApiResponse> {
    try {
      const response = await api.get(`${ADMIN_BASE}/test`);
      return extractData<ApiResponse>(response);
    } catch (error) {
      return {
        success: false,
        error: 'Connection failed',
        timestamp: new Date().toISOString()
      };
    }
  },

  async getApiInfo(): Promise<ApiResponse> {
    try {
      const response = await api.get(`${ADMIN_BASE}`);
      return extractData<ApiResponse>(response);
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch API info',
        timestamp: new Date().toISOString()
      };
    }
  }
};

export const GigsJobsService = AdminService;
