import api from './api';
import { AuthService } from './authService';
import type {
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
  EmailProviderConfig,
  AdminDashboardStats,
  ApiResponse,
  MessengerVoiceConfig,
  Currency,
  FxSystemConfig,
  FxProviderRecord,
  FxSnapshotRecord,
  FxManualOverrideRecord,
  FxLockRecord,
  FxHealth
} from '../types';
import type {
  MarketplaceCategory,
  MarketplaceListing,
  MarketplaceReport,
  MarketplaceSettings,
  MarketplaceListingFormValues
} from '../types/marketplace';

const ADMIN_BASE = '/admin';
const SYSTEM_BACKUP_TIMEOUT_MS = 30 * 60 * 1000;

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const getAuthHeaders = async () => {
  const token = await AuthService.getToken();
  const user = AuthService.getStoredUser();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (user?.id) headers['x-user-id'] = String(user.id);
  headers['x-user-role'] = user?.role ? String(user.role).toLowerCase() : 'admin';
  return headers;
};

const adminGet = async <T>(endpoint: string, params?: Record<string, any>): Promise<T> => {
  const response = await api.get(`${ADMIN_BASE}${endpoint}`, { params, headers: await getAuthHeaders() });
  return extractData<T>(response);
};

const adminPost = async <T>(endpoint: string, data?: any): Promise<T> => {
  const response = await api.post(`${ADMIN_BASE}${endpoint}`, data, { headers: await getAuthHeaders() });
  return extractData<T>(response);
};

const adminPut = async <T>(endpoint: string, data?: any): Promise<T> => {
  const response = await api.put(`${ADMIN_BASE}${endpoint}`, data, { headers: await getAuthHeaders() });
  return extractData<T>(response);
};

const adminDelete = async <T>(endpoint: string): Promise<T> => {
  const response = await api.delete(`${ADMIN_BASE}${endpoint}`, { headers: await getAuthHeaders() });
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
    params,
    headers: await getAuthHeaders()
  });
  return response.data as ApiResponse<T>;
};

const getAdminFormConfig = async <T>(): Promise<T> => {
  const response = await api.get(`${ADMIN_BASE}/forms/config`, { headers: await getAuthHeaders() });
  return extractData<T>(response);
};

const saveAdminFormConfig = async <T>(payload: any): Promise<T> => {
  const response = await api.post(`${ADMIN_BASE}/forms/config`, payload, { headers: await getAuthHeaders() });
  return extractData<T>(response);
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
  const adminReason = gig?.admin_reason ?? gig?.adminReason;
  const isFeatured = gig?.is_featured ?? gig?.isFeatured;
  const isTopSelected = gig?.is_top_selected ?? gig?.isTopSelected;
  const isRecommended = gig?.is_recommended ?? gig?.isRecommended;
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
    is_featured: isFeatured,
    isFeatured,
    is_top_selected: isTopSelected,
    isTopSelected,
    is_recommended: isRecommended,
    isRecommended,
    orders_count: ordersCount,
    ordersCount,
    adminReason,
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
  const adminReason = job?.admin_reason ?? job?.adminReason;
  const isFeatured = job?.is_featured ?? job?.isFeatured;
  const isTopSelected = job?.is_top_selected ?? job?.isTopSelected;
  const isRecommended = job?.is_recommended ?? job?.isRecommended;

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
    isVisible,
    is_featured: isFeatured,
    isFeatured,
    is_top_selected: isTopSelected,
    isTopSelected,
    is_recommended: isRecommended,
    isRecommended,
    adminReason
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
  getSystemDemoAccountsOverview: async (): Promise<any> => {
    return adminGet<any>('/system-demo-accounts/overview');
  },

  seedSystemDemoAccounts: async (count = 50): Promise<any> => {
    return adminPost<any>('/system-demo-accounts/seed', { count });
  },

  updateSystemDemoAccountsConfig: async (payload: {
    enabled?: boolean;
    aiEnabled?: boolean;
    cadenceMinutes?: number;
    maxPostsPerRun?: number;
    maxLikesPerRun?: number;
  }): Promise<any> => {
    return adminPut<any>('/system-demo-accounts/config', payload);
  },

  toggleSystemDemoAccountAutomation: async (accountId: string, enabled: boolean): Promise<any> => {
    return adminPost<any>(`/system-demo-accounts/accounts/${encodeURIComponent(accountId)}/toggle`, { enabled });
  },

  runSystemDemoAccountsCycle: async (): Promise<any> => {
    return adminPost<any>('/system-demo-accounts/run-once', {});
  },

  getMessengerVoiceConfig: async (): Promise<MessengerVoiceConfig> => {
    const data = await adminGet<MessengerVoiceConfig>('/messenger/voice/config');
    return {
      enabledVoiceCalls: Boolean(data?.enabledVoiceCalls ?? true),
      enabledConferenceCalls: Boolean(data?.enabledConferenceCalls ?? true),
      enabledVoiceNotes: Boolean(data?.enabledVoiceNotes ?? true),
      maxParticipants: Number(data?.maxParticipants ?? 8),
      maxVoiceNoteDurationSeconds: Number(data?.maxVoiceNoteDurationSeconds ?? 180),
      blockedUserIds: Array.isArray(data?.blockedUserIds) ? data.blockedUserIds : []
    } as MessengerVoiceConfig;
  },

  updateMessengerVoiceConfig: async (payload: Partial<MessengerVoiceConfig>): Promise<MessengerVoiceConfig> => {
    const data = await adminPut<MessengerVoiceConfig>('/messenger/voice/config', payload);
    return {
      enabledVoiceCalls: Boolean(data?.enabledVoiceCalls ?? true),
      enabledConferenceCalls: Boolean(data?.enabledConferenceCalls ?? true),
      enabledVoiceNotes: Boolean(data?.enabledVoiceNotes ?? true),
      maxParticipants: Number(data?.maxParticipants ?? 8),
      maxVoiceNoteDurationSeconds: Number(data?.maxVoiceNoteDurationSeconds ?? 180),
      blockedUserIds: Array.isArray(data?.blockedUserIds) ? data.blockedUserIds : []
    } as MessengerVoiceConfig;
  },

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

  getUserModerationStatus: async (userId: string): Promise<any> => {
    return adminGet<any>(`/users/${encodeURIComponent(userId)}/moderation`);
  },

  applyUserModerationAction: async (
    userId: string,
    payload: {
      action: 'warning' | 'strike' | 'restriction' | 'ban';
      reason?: string;
      userMessage?: string;
      severity?: string;
      restrictedFeatures?: string[];
      restrictionHours?: number;
      source?: string;
      sourceId?: string;
      sourceLabel?: string;
      reportId?: string;
      postId?: string;
    },
    adminId: string
  ): Promise<any> => {
    return adminPost<any>(`/users/${encodeURIComponent(userId)}/moderation`, { ...payload, adminId });
  },

  updateUserPassword: async (userId: string, password: string, adminId: string): Promise<void> => {
    await adminPost(`/users/${userId}/password`, { password, adminId });
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
    if (staff.id) {
      return adminPut<StaffMember>(`/staff/${encodeURIComponent(String(staff.id))}`, staff);
    }
    return adminPost<StaffMember>('/staff', staff);
  },

  deleteStaff: async (id: string): Promise<void> => {
    await adminDelete(`/staff/${id}`);
  },

  getRbacRoles: async (params?: { activeOnly?: boolean }): Promise<any[]> => {
    const query: Record<string, any> = {};
    if (params?.activeOnly !== undefined) query.activeOnly = params.activeOnly;
    const data = await adminGet<any[]>('/rbac/roles', query);
    return Array.isArray(data) ? data : [];
  },

  getRbacPermissions: async (): Promise<{ permissions: any[]; groups: any[] }> => {
    const data = await adminGet<{ permissions: any[]; groups: any[] }>('/rbac/permissions');
    return data || { permissions: [], groups: [] };
  },

  getPolicySummary: async (): Promise<any> => {
    return adminGet<any>('/policies/summary');
  },

  getPolicyCatalog: async (): Promise<any> => {
    return adminGet<any>('/policies/catalog');
  },

  getPolicyRules: async (params?: {
    namespaceKey?: string;
    resourceKey?: string;
    permissionKey?: string;
    query?: string;
    activeOnly?: boolean;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/policies/rules', params || {});
    return Array.isArray(data) ? data : [];
  },

  createPolicyRule: async (payload: {
    namespaceKey: string;
    resourceKey?: string | null;
    key: string;
    label: string;
    description?: string | null;
    permissionKey: string;
    effect?: 'ALLOW' | 'DENY';
    conditions?: any;
    priority?: number;
    isActive?: boolean;
    isSystemRule?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/policies/rules', payload);
  },

  updatePolicyRule: async (
    id: string,
    payload: {
      namespaceKey: string;
      resourceKey?: string | null;
      key: string;
      label: string;
      description?: string | null;
      permissionKey: string;
      effect?: 'ALLOW' | 'DENY';
      conditions?: any;
      priority?: number;
      isActive?: boolean;
      isSystemRule?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/policies/rules/${encodeURIComponent(id)}`, payload);
  },

  deactivatePolicyRule: async (id: string): Promise<any> => {
    return adminDelete<any>(`/policies/rules/${encodeURIComponent(id)}`);
  },

  getUserPermissionOverrides: async (identifier: string): Promise<any> => {
    return adminGet<any>('/policies/overrides', { identifier });
  },

  createUserPermissionOverride: async (payload: {
    identifier: string;
    permissionKey: string;
    resourceType?: string | null;
    resourceId?: string | null;
    effect?: 'ALLOW' | 'DENY';
    reason?: string | null;
    expiresAt?: string | null;
    isActive?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/policies/overrides', payload);
  },

  updateUserPermissionOverride: async (
    id: string,
    payload: {
      identifier?: string;
      permissionKey?: string;
      resourceType?: string | null;
      resourceId?: string | null;
      effect?: 'ALLOW' | 'DENY';
      reason?: string | null;
      expiresAt?: string | null;
      isActive?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/policies/overrides/${encodeURIComponent(id)}`, payload);
  },

  deactivateUserPermissionOverride: async (id: string): Promise<any> => {
    return adminDelete<any>(`/policies/overrides/${encodeURIComponent(id)}`);
  },

  getFeatureControlSummary: async (): Promise<any> => {
    return adminGet<any>('/feature-control/summary');
  },

  getFeatureFlags: async (params?: {
    query?: string;
    category?: string;
    activeOnly?: boolean;
    killSwitch?: boolean;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/feature-control/flags', params || {});
    return Array.isArray(data) ? data : [];
  },

  createFeatureFlag: async (payload: {
    key: string;
    label: string;
    description?: string | null;
    category?: string | null;
    defaultValue?: boolean;
    isActive?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/feature-control/flags', payload);
  },

  updateFeatureFlag: async (
    id: string,
    payload: {
      key: string;
      label: string;
      description?: string | null;
      category?: string | null;
      defaultValue?: boolean;
      isActive?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/feature-control/flags/${encodeURIComponent(id)}`, payload);
  },

  toggleFeatureKillSwitch: async (id: string, enabled: boolean): Promise<any> => {
    return adminPost<any>(`/feature-control/flags/${encodeURIComponent(id)}/kill-switch`, { enabled });
  },

  getFeatureAudiences: async (flagId: string): Promise<any[]> => {
    const data = await adminGet<any[]>(`/feature-control/flags/${encodeURIComponent(flagId)}/audiences`);
    return Array.isArray(data) ? data : [];
  },

  createFeatureAudience: async (
    flagId: string,
    payload: {
      key: string;
      label: string;
      roleScope?: string[] | string;
      countryScope?: string[] | string;
      platformScope?: string[] | string;
      appVersions?: string[] | string;
      metadata?: any;
      isActive?: boolean;
    }
  ): Promise<any> => {
    return adminPost<any>(`/feature-control/flags/${encodeURIComponent(flagId)}/audiences`, payload);
  },

  updateFeatureAudience: async (
    id: string,
    payload: {
      flagId: string;
      key: string;
      label: string;
      roleScope?: string[] | string;
      countryScope?: string[] | string;
      platformScope?: string[] | string;
      appVersions?: string[] | string;
      metadata?: any;
      isActive?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/feature-control/audiences/${encodeURIComponent(id)}`, payload);
  },

  getFeatureRules: async (flagId: string): Promise<any[]> => {
    const data = await adminGet<any[]>(`/feature-control/flags/${encodeURIComponent(flagId)}/rules`);
    return Array.isArray(data) ? data : [];
  },

  createFeatureRule: async (
    flagId: string,
    payload: {
      audienceId?: string | null;
      rolloutPercent?: number;
      value?: boolean;
      startAt?: string | null;
      endAt?: string | null;
      priority?: number;
      isActive?: boolean;
      conditions?: any;
    }
  ): Promise<any> => {
    return adminPost<any>(`/feature-control/flags/${encodeURIComponent(flagId)}/rules`, payload);
  },

  updateFeatureRule: async (
    id: string,
    payload: {
      flagId: string;
      audienceId?: string | null;
      rolloutPercent?: number;
      value?: boolean;
      startAt?: string | null;
      endAt?: string | null;
      priority?: number;
      isActive?: boolean;
      conditions?: any;
    }
  ): Promise<any> => {
    return adminPut<any>(`/feature-control/rules/${encodeURIComponent(id)}`, payload);
  },

  deactivateFeatureRule: async (id: string): Promise<any> => {
    return adminDelete<any>(`/feature-control/rules/${encodeURIComponent(id)}`);
  },

  getFeatureFlagAudit: async (params?: { flagId?: string; limit?: number }): Promise<any[]> => {
    const data = await adminGet<any[]>('/feature-control/audit', params || {});
    return Array.isArray(data) ? data : [];
  },

  getFeatureExposures: async (params?: {
    flagId?: string;
    userId?: string;
    sessionKey?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/feature-control/exposures', params || {});
    return Array.isArray(data) ? data : [];
  },

  resolveFeatureFlag: async (payload: {
    key: string;
    userId?: string | null;
    sessionKey?: string | null;
    role?: string | null;
    country?: string | null;
    platform?: string | null;
    appVersion?: string | null;
    metadata?: any;
  }): Promise<any> => {
    return adminPost<any>('/feature-control/resolve', payload);
  },

  getDiscoverySummary: async (): Promise<any> => {
    return adminGet<any>('/discovery/summary');
  },

  getDiscoverySearchRules: async (params?: {
    scope?: string;
    targetType?: string;
    query?: string;
    activeOnly?: boolean;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/discovery/search-rules', params || {});
    return Array.isArray(data) ? data : [];
  },

  createDiscoverySearchRule: async (payload: {
    key: string;
    label: string;
    description?: string | null;
    scope?: string;
    targetType?: string;
    targetId?: string | null;
    queryPattern?: string | null;
    action?: string;
    value?: number;
    priority?: number;
    metadata?: any;
    isActive?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/discovery/search-rules', payload);
  },

  updateDiscoverySearchRule: async (
    id: string,
    payload: {
      key: string;
      label: string;
      description?: string | null;
      scope?: string;
      targetType?: string;
      targetId?: string | null;
      queryPattern?: string | null;
      action?: string;
      value?: number;
      priority?: number;
      metadata?: any;
      isActive?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/discovery/search-rules/${encodeURIComponent(id)}`, payload);
  },

  deactivateDiscoverySearchRule: async (id: string): Promise<any> => {
    return adminDelete<any>(`/discovery/search-rules/${encodeURIComponent(id)}`);
  },

  getDiscoveryFeedRecipes: async (params?: { activeOnly?: boolean }): Promise<any[]> => {
    const data = await adminGet<any[]>('/discovery/feed-recipes', params || {});
    return Array.isArray(data) ? data : [];
  },

  createDiscoveryFeedRecipe: async (payload: {
    key: string;
    label: string;
    description?: string | null;
    mode: string;
    weights?: any;
    queryTakeMultiplier?: number;
    queryTakeCap?: number;
    isActive?: boolean;
    isSystemRecipe?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/discovery/feed-recipes', payload);
  },

  updateDiscoveryFeedRecipe: async (
    id: string,
    payload: {
      key: string;
      label: string;
      description?: string | null;
      mode: string;
      weights?: any;
      queryTakeMultiplier?: number;
      queryTakeCap?: number;
      isActive?: boolean;
      isSystemRecipe?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/discovery/feed-recipes/${encodeURIComponent(id)}`, payload);
  },

  getJourneySummary: async (): Promise<any> => {
    return adminGet<any>('/journeys/summary');
  },

  getNotificationTemplates: async (params?: {
    query?: string;
    category?: string;
    activeOnly?: boolean;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/journeys/templates', params || {});
    return Array.isArray(data) ? data : [];
  },

  createNotificationTemplate: async (payload: {
    key: string;
    label: string;
    description?: string | null;
    type?: string;
    category?: string;
    titleTemplate: string;
    bodyTemplate: string;
    pushTitleTemplate?: string | null;
    pushBodyTemplate?: string | null;
    emailSubjectTemplate?: string | null;
    emailTextTemplate?: string | null;
    actionUrlTemplate?: string | null;
    defaultMeta?: any;
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    isSystemTemplate?: boolean;
    isActive?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/journeys/templates', payload);
  },

  updateNotificationTemplate: async (
    id: string,
    payload: {
      key: string;
      label: string;
      description?: string | null;
      type?: string;
      category?: string;
      titleTemplate: string;
      bodyTemplate: string;
      pushTitleTemplate?: string | null;
      pushBodyTemplate?: string | null;
      emailSubjectTemplate?: string | null;
      emailTextTemplate?: string | null;
      actionUrlTemplate?: string | null;
      defaultMeta?: any;
      inAppEnabled?: boolean;
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      isSystemTemplate?: boolean;
      isActive?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/journeys/templates/${encodeURIComponent(id)}`, payload);
  },

  deactivateNotificationTemplate: async (id: string): Promise<any> => {
    return adminDelete<any>(`/journeys/templates/${encodeURIComponent(id)}`);
  },

  getJourneyFlows: async (params?: {
    query?: string;
    activeOnly?: boolean;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/journeys/flows', params || {});
    return Array.isArray(data) ? data : [];
  },

  createJourneyFlow: async (payload: {
    key: string;
    label: string;
    description?: string | null;
    triggerType?: string;
    audienceType?: string;
    audienceConfig?: any;
    metadata?: any;
    isSystemFlow?: boolean;
    isActive?: boolean;
    steps: any[];
  }): Promise<any> => {
    return adminPost<any>('/journeys/flows', payload);
  },

  updateJourneyFlow: async (
    id: string,
    payload: {
      key: string;
      label: string;
      description?: string | null;
      triggerType?: string;
      audienceType?: string;
      audienceConfig?: any;
      metadata?: any;
      isSystemFlow?: boolean;
      isActive?: boolean;
      steps: any[];
    }
  ): Promise<any> => {
    return adminPut<any>(`/journeys/flows/${encodeURIComponent(id)}`, payload);
  },

  deactivateJourneyFlow: async (id: string): Promise<any> => {
    return adminDelete<any>(`/journeys/flows/${encodeURIComponent(id)}`);
  },

  getJourneyRuns: async (params?: {
    status?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/journeys/runs', params || {});
    return Array.isArray(data) ? data : [];
  },

  triggerJourneyRun: async (payload: {
    flowId?: string;
    flowKey?: string;
    identifier: string;
    context?: any;
  }): Promise<any> => {
    return adminPost<any>('/journeys/runs', payload);
  },

  getJourneyQuietHours: async (identifier: string): Promise<any> => {
    return adminGet<any>('/journeys/quiet-hours', { identifier });
  },

  getModerationTrustSummary: async (): Promise<any> => {
    return adminGet<any>('/moderation-policies/summary');
  },

  getContentPolicies: async (params?: {
    contentType?: string;
    query?: string;
    activeOnly?: boolean;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/moderation-policies', params || {});
    return Array.isArray(data) ? data : [];
  },

  createContentPolicy: async (payload: {
    key: string;
    label: string;
    description?: string | null;
    contentType: string;
    severity?: string;
    action?: string;
    thresholds?: any;
    metadata?: any;
    isActive?: boolean;
    isSystemPolicy?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/moderation-policies', payload);
  },

  updateContentPolicy: async (
    id: string,
    payload: {
      key: string;
      label: string;
      description?: string | null;
      contentType: string;
      severity?: string;
      action?: string;
      thresholds?: any;
      metadata?: any;
      isActive?: boolean;
      isSystemPolicy?: boolean;
    }
  ): Promise<any> => {
    return adminPut<any>(`/moderation-policies/${encodeURIComponent(id)}`, payload);
  },

  getModerationCases: async (params?: {
    status?: string;
    contentType?: string;
    query?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/moderation-policies/cases', params || {});
    return Array.isArray(data) ? data : [];
  },

  getModerationAppeals: async (params?: {
    status?: string;
    query?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/moderation-policies/appeals', params || {});
    return Array.isArray(data) ? data : [];
  },

  resolveModerationAppeal: async (
    id: string,
    payload: { status: 'APPROVED' | 'RESOLVED' | 'REJECTED'; resolutionNotes?: string | null }
  ): Promise<any> => {
    return adminPost<any>(`/moderation-policies/appeals/${encodeURIComponent(id)}/resolve`, payload);
  },

  getTrustProfiles: async (params?: {
    riskLevel?: string;
    query?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/trust/users', params || {});
    return Array.isArray(data) ? data : [];
  },

  getTrustProfileDetails: async (userId: string): Promise<any> => {
    return adminGet<any>(`/trust/users/${encodeURIComponent(userId)}`);
  },

  recomputeTrustProfile: async (userId: string): Promise<any> => {
    return adminPost<any>(`/trust/users/${encodeURIComponent(userId)}/recompute`, {});
  },

  getRiskSignals: async (params?: {
    status?: string;
    severity?: string;
    query?: string;
    userId?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/trust/signals', params || {});
    return Array.isArray(data) ? data : [];
  },

  createRiskSignal: async (payload: {
    identifier: string;
    signalType: string;
    severity?: string;
    source?: string;
    status?: string;
    reason: string;
    metadata?: any;
    expiresAt?: string | null;
  }): Promise<any> => {
    return adminPost<any>('/trust/signals', payload);
  },

  updateRiskSignal: async (
    id: string,
    payload: {
      signalType?: string;
      severity?: string;
      source?: string;
      status?: string;
      reason?: string;
      metadata?: any;
      expiresAt?: string | null;
    }
  ): Promise<any> => {
    return adminPut<any>(`/trust/signals/${encodeURIComponent(id)}`, payload);
  },

  createRbacRole: async (payload: {
    name: string;
    description?: string;
    permissionKeys: string[];
    isActive?: boolean;
  }): Promise<any> => {
    return adminPost<any>('/rbac/roles', payload);
  },

  updateRbacRole: async (
    id: string,
    payload: { name: string; description?: string; permissionKeys: string[]; isActive?: boolean }
  ): Promise<any> => {
    return adminPut<any>(`/rbac/roles/${encodeURIComponent(id)}`, payload);
  },

  cloneRbacRole: async (id: string, payload?: { name?: string }): Promise<any> => {
    return adminPost<any>(`/rbac/roles/${encodeURIComponent(id)}/clone`, payload || {});
  },

  deactivateRbacRole: async (id: string): Promise<void> => {
    await adminDelete(`/rbac/roles/${encodeURIComponent(id)}`);
  },

  resetStaffPassword: async (id: string, password: string): Promise<void> => {
    await adminPost(`/staff/${encodeURIComponent(id)}/reset-password`, { password });
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

  async getMarketplaceSettings(): Promise<MarketplaceSettings | null> {
    const data = await adminGet<MarketplaceSettings | null>('/marketplace/settings');
    return data || null;
  },

  async saveMarketplaceSettings(payload: Partial<MarketplaceSettings>): Promise<boolean> {
    const response = await adminRequest<any>('put', '/marketplace/settings', payload);
    return Boolean(response?.success);
  },

  async getMarketplaceCategories(): Promise<MarketplaceCategory[]> {
    const data = await adminGet<MarketplaceCategory[]>('/marketplace/categories');
    return Array.isArray(data) ? data : [];
  },

  async saveMarketplaceCategory(category: MarketplaceCategory): Promise<boolean> {
    const response = await adminRequest<MarketplaceCategory>('post', '/marketplace/categories', category);
    return Boolean(response?.success);
  },

  async updateMarketplaceCategory(id: string, category: Partial<MarketplaceCategory>): Promise<boolean> {
    const response = await adminRequest<MarketplaceCategory>('put', `/marketplace/categories/${id}`, category);
    return Boolean(response?.success);
  },

  async deleteMarketplaceCategory(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/marketplace/categories/${id}`);
    return Boolean(response?.success);
  },

  async getMarketplaceListings(filters?: {
    status?: string;
    reviewStatus?: string;
    categoryId?: string;
    sellerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<MarketplaceListing[]> {
    const data = await adminGet<MarketplaceListing[]>('/marketplace/listings', filters);
    return Array.isArray(data) ? data : [];
  },

  async getMarketplaceListing(id: string): Promise<MarketplaceListing | null> {
    const data = await adminGet<MarketplaceListing>(`/marketplace/listings/${id}`);
    return data || null;
  },

  async saveMarketplaceListing(payload: MarketplaceListingFormValues | Record<string, unknown>): Promise<boolean> {
    const response = await adminRequest<MarketplaceListing>('post', '/marketplace/listings', payload);
    return Boolean(response?.success);
  },

  async updateMarketplaceListing(id: string, payload: MarketplaceListingFormValues | Record<string, unknown>): Promise<boolean> {
    const response = await adminRequest<MarketplaceListing>('put', `/marketplace/listings/${id}`, payload);
    return Boolean(response?.success);
  },

  async deleteMarketplaceListing(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/marketplace/listings/${id}`);
    return Boolean(response?.success);
  },

  async approveMarketplaceListing(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('post', `/marketplace/listings/${id}/approve`);
    return Boolean(response?.success);
  },

  async rejectMarketplaceListing(id: string, reason?: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('post', `/marketplace/listings/${id}/reject`, { reason });
    return Boolean(response?.success);
  },

  async suspendMarketplaceListing(id: string, reason?: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('post', `/marketplace/listings/${id}/suspend`, { reason });
    return Boolean(response?.success);
  },

  async restoreMarketplaceListing(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('post', `/marketplace/listings/${id}/restore`);
    return Boolean(response?.success);
  },

  async featureMarketplaceListing(id: string, featured = true): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('post', `/marketplace/listings/${id}/${featured ? 'feature' : 'unfeature'}`);
    return Boolean(response?.success);
  },

  async getMarketplaceReports(): Promise<MarketplaceReport[]> {
    const data = await adminGet<MarketplaceReport[]>('/marketplace/reports');
    return Array.isArray(data) ? data : [];
  },

  async resolveMarketplaceReport(id: string, payload?: Record<string, unknown>): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('post', `/marketplace/reports/${id}/resolve`, payload);
    return Boolean(response?.success);
  },

  async approveListing(type: 'gig' | 'job', id: string, status: string, notes?: string): Promise<boolean> {
    const action = status === 'active' || status === 'approved' ? 'approve' : 'reject';
    const response = await adminRequest<{ id: string }>(
      'post',
      `/gigs-jobs/${type === 'gig' ? 'gigs' : 'jobs'}/${id}/approve`,
      {
        action,
        notes: notes || `Status changed to ${status}`
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

  async syncStandardListingCategories(): Promise<boolean> {
    const response = await adminRequest<any>('post', '/gigs-jobs/categories/sync-standard');
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

  // ---- Languages / Translations (frontend-first with admin endpoint fallback) ----
  async getLanguages(): Promise<any[]> {
    try {
      const data = await adminGet<any[]>('/translations/languages');
      if (Array.isArray(data)) return data;
    } catch (e) {
      // fallthrough to localStorage fallback
    }
    const raw = localStorage.getItem('admin:languages');
    return raw ? JSON.parse(raw) : [];
  },

  async saveLanguage(lang: { id?: string; name: string; code: string; flutterCode?: string; isDefault?: boolean; translations?: Record<string,string> }): Promise<any> {
    try {
      const payload = { ...lang };
      let result: any = null;
      if (lang.id) {
        result = await adminPut(`/translations/languages/${lang.id}`, payload);
      } else {
        result = await adminPost('/translations/languages', payload);
      }

      // If English was just created/updated, attempt to automatically import/sync platform content.
      const code = (payload.code || '').toString().toLowerCase();
      const langId = result?.id || lang.id;
      if (code === 'en' && langId) {
        // Try server-side app sync first
        try {
          await this.syncForApp(langId);
        } catch (e) {
          // ignore
        }

        // Try fetching known metadata files from the public root as a fallback and import into the language
          const candidates = ['/metadata.json', '/metadata-1.json', '/Scrolith/metadata.json', '/Scrolith/metadata-1.json'];
          let imported = false;
          for (const p of candidates) {
            try {
              const resp = await fetch(p, { cache: 'no-store' });
              if (!resp.ok) continue;
              const parsed = await resp.json();
              if (parsed && typeof parsed === 'object') {
                // Try server import endpoint with JSON payload
                try {
                  await adminPost(`/translations/languages/${encodeURIComponent(langId)}/import`, parsed);
                  imported = true;
                  break;
                } catch (e) {
                  // Fallback: merge into localStorage languages
                  const list = await this.getLanguages();
                  const next = (list || []).map((l: any) => l.id === langId ? { ...l, translations: parsed } : l);
                  localStorage.setItem('admin:languages', JSON.stringify(next));
                  imported = true;
                  break;
                }
              }
            } catch (err) {
              // ignore and try next candidate
            }
          }

          // If no metadata import succeeded, as a last-resort try to extract visible strings from the running app DOM
          if (!imported && typeof window !== 'undefined' && typeof document !== 'undefined') {
            try {
              const texts = new Set<string>();
              const nodes = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
              for (const node of nodes) {
                // skip script/style and hidden elements
                if (!node.offsetParent) continue;
                const tag = node.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
                const t = (node.innerText || '').trim();
                if (t && t.length > 1 && t.length < 200) {
                  // Ignore purely numeric or punctuation-only strings
                  if (/^[\d\s\W]+$/.test(t)) continue;
                  texts.add(t);
                }
              }
              const mapping: Record<string,string> = {};
              texts.forEach(t => mapping[t] = t);

              // Try server import, else persist to localStorage
              try {
                await adminPost(`/translations/languages/${encodeURIComponent(langId)}/import`, mapping);
              } catch (e) {
                const list = await this.getLanguages();
                const next = (list || []).map((l: any) => l.id === langId ? { ...l, translations: mapping } : l);
                localStorage.setItem('admin:languages', JSON.stringify(next));
              }
            } catch (err) {
              // ignore extraction failures
            }
          }
      }

      return result;
    } catch (e) {
      // Fallback: persist in localStorage when server is not available
      const list = await this.getLanguages();
      const id = lang.id || `lang_${Date.now()}`;
      const next = list.filter((l: any) => l.id !== id).concat([{ ...lang, id }]);
      localStorage.setItem('admin:languages', JSON.stringify(next));
      return { ...lang, id };
    }
  },

  async deleteLanguage(id: string): Promise<boolean> {
    try {
      await adminDelete(`/translations/languages/${id}`);
      return true;
    } catch (e) {
      const list = await this.getLanguages();
      const next = (list || []).filter((l: any) => l.id !== id);
      localStorage.setItem('admin:languages', JSON.stringify(next));
      return true;
    }
  },

  async importTranslations(langId: string, file: File): Promise<any> {
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await adminPost(`/translations/languages/${encodeURIComponent(langId)}/import`, form);
      return resp;
    } catch (e) {
      // fallback: read file locally and store under language
      const text = await file.text();
      let parsed: Record<string,string> = {};
      try { parsed = JSON.parse(text); } catch (_) {
        // try naive ARB parsing (ARB is JSON-like)
        try { parsed = JSON.parse(text); } catch (__) { parsed = {}; }
      }
      const list = await this.getLanguages();
      const next = (list || []).map((l: any) => l.id === langId ? { ...l, translations: parsed } : l);
      localStorage.setItem('admin:languages', JSON.stringify(next));
      return { success: true };
    }
  },

  async exportArb(langId: string): Promise<string | null> {
    try {
      const resp = await adminGet<string>(`/translations/languages/${encodeURIComponent(langId)}/export`);
      return resp as string;
    } catch (e) {
      const list = await this.getLanguages();
      const lang = (list || []).find((l: any) => l.id === langId);
      if (!lang) return null;
      const content = JSON.stringify(lang.translations || {}, null, 2);
      return content;
    }
  },

  async translateByGoogle(texts: string[], targetLang: string): Promise<string[]> {
    // Attempts to call admin endpoint which may proxy Google Translate; otherwise returns inputs as-is
    try {
      const resp = await adminPost('/translations/translate', { texts, targetLang });
      return resp?.translations || texts;
    } catch (e) {
      // no backend => return original texts so front-end can copy keys into values instead
      return texts.map(t => t);
    }
  },

  async syncForApp(langId: string): Promise<boolean> {
    try {
      const resp = await adminPost(`/translations/languages/${encodeURIComponent(langId)}/sync_app`);
      return Boolean(resp?.success);
    } catch (e) {
      // fallback: no-op
      return false;
    }
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
    const data = await adminPost<SystemConfig>('/system/settings', settings);
    // adminPost/extractData returns the inner `data` payload when server responds { success:true, data: ... }
    return data ?? settings;
  },

  getActiveCurrencies: async (): Promise<Currency[]> => {
    const response = await api.get('/currencies/active');
    const data = extractData<Currency[]>(response);
    return Array.isArray(data) ? data : [];
  },

  getFxConfig: async (): Promise<FxSystemConfig> => {
    return adminGet<FxSystemConfig>('/fx/config');
  },

  updateFxConfig: async (payload: Partial<FxSystemConfig>): Promise<FxSystemConfig> => {
    return adminPut<FxSystemConfig>('/fx/config', payload);
  },

  getFxProviders: async (): Promise<FxProviderRecord[]> => {
    const data = await adminGet<FxProviderRecord[]>('/fx/providers');
    return Array.isArray(data) ? data : [];
  },

  updateFxProvider: async (
    code: string,
    payload: Partial<Pick<FxProviderRecord, 'enabled' | 'priority' | 'baseUrl' | 'settingsJson'>>
  ): Promise<FxProviderRecord> => {
    return adminPut<FxProviderRecord>(`/fx/providers/${encodeURIComponent(code)}`, payload);
  },

  getFxHealth: async (): Promise<FxHealth> => {
    return adminGet<FxHealth>('/fx/health');
  },

  getFxLocks: async (params?: {
    limit?: number;
    entityType?: string;
    entityId?: string;
  }): Promise<FxLockRecord[]> => {
    const data = await adminGet<FxLockRecord[]>('/fx/locks', params || {});
    return Array.isArray(data) ? data : [];
  },

  getFxSnapshots: async (params?: {
    limit?: number;
    providerCode?: string;
    baseCurrency?: string;
  }): Promise<FxSnapshotRecord[]> => {
    const data = await adminGet<FxSnapshotRecord[]>('/fx/snapshots', params || {});
    return Array.isArray(data) ? data : [];
  },

  runFxSync: async (payload?: {
    providerCode?: string;
    baseCurrency?: string;
  }): Promise<any> => {
    return adminPost<any>('/fx/sync', payload || {});
  },

  approveFxSnapshot: async (id: string, payload?: { freeze?: boolean }): Promise<FxSnapshotRecord> => {
    return adminPost<FxSnapshotRecord>(`/fx/snapshots/${encodeURIComponent(id)}/approve`, payload || {});
  },

  setFxSnapshotFrozen: async (id: string, frozen = true): Promise<FxSnapshotRecord> => {
    return adminPost<FxSnapshotRecord>(`/fx/snapshots/${encodeURIComponent(id)}/freeze`, { frozen });
  },

  getFxOverrides: async (params?: {
    limit?: number;
    status?: string;
  }): Promise<FxManualOverrideRecord[]> => {
    const data = await adminGet<FxManualOverrideRecord[]>('/fx/overrides', params || {});
    return Array.isArray(data) ? data : [];
  },

  createFxOverride: async (payload: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    reason: string;
    status?: string;
  }): Promise<FxManualOverrideRecord> => {
    return adminPost<FxManualOverrideRecord>('/fx/overrides', payload);
  },

  approveFxOverride: async (id: string): Promise<FxManualOverrideRecord> => {
    return adminPost<FxManualOverrideRecord>(`/fx/overrides/${encodeURIComponent(id)}/approve`, {});
  },

  testEmailSettings: async (payload: { to: string; config?: EmailProviderConfig }): Promise<any> => {
    return adminPost<any>('/system/email/test', payload);
  },

  clearRuntimeCache: async (): Promise<{ cleared: string[]; results: Array<{ key: string; ok: boolean; detail?: string }> }> => {
    return adminPost<any>('/system/cache/clear', {});
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

  getConfigRollbackSummary: async (): Promise<any> => {
    return adminGet<any>('/config/summary');
  },

  getConfigScopes: async (): Promise<any[]> => {
    const data = await adminGet<any[]>('/config/scopes');
    return Array.isArray(data) ? data : [];
  },

  getCurrentConfigPayload: async (scope: string): Promise<any> => {
    return adminGet<any>('/config/current', { scope });
  },

  getConfigSnapshots: async (params?: { scope?: string; limit?: number }): Promise<any[]> => {
    const data = await adminGet<any[]>('/config/snapshots', params || {});
    return Array.isArray(data) ? data : [];
  },

  createConfigSnapshot: async (payload: {
    scope: string;
    reason?: string | null;
    label?: string | null;
    source?: string | null;
    metadata?: any;
  }): Promise<any> => {
    return adminPost<any>('/config/snapshots', payload);
  },

  getConfigChanges: async (params?: { scope?: string; limit?: number }): Promise<any[]> => {
    const data = await adminGet<any[]>('/config/changes', params || {});
    return Array.isArray(data) ? data : [];
  },

  getConfigRollbacks: async (params?: { scope?: string; limit?: number }): Promise<any[]> => {
    const data = await adminGet<any[]>('/config/rollbacks', params || {});
    return Array.isArray(data) ? data : [];
  },

  rollbackConfigScope: async (payload: {
    scope: string;
    targetVersion: number;
    notes?: string | null;
    metadata?: any;
  }): Promise<any> => {
    return adminPost<any>('/config/rollback', payload);
  },

  getConfigReleaseRollouts: async (params?: { limit?: number }): Promise<any[]> => {
    const data = await adminGet<any[]>('/config/releases', params || {});
    return Array.isArray(data) ? data : [];
  },

  createConfigReleaseRollout: async (payload: {
    scope: string;
    releaseKey: string;
    label: string;
    notes?: string | null;
    metadata?: any;
  }): Promise<any> => {
    return adminPost<any>('/config/releases', payload);
  },

  getRealtimeOpsSummary: async (): Promise<any> => {
    return adminGet<any>('/realtime/summary');
  },

  getRealtimeRuntime: async (): Promise<any> => {
    return adminGet<any>('/realtime/runtime');
  },

  getRealtimeSocketSessions: async (params?: {
    namespace?: string;
    query?: string;
    activeOnly?: boolean;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/realtime/socket-sessions', params || {});
    return Array.isArray(data) ? data : [];
  },

  getRealtimePresenceLeases: async (params?: {
    namespace?: string;
    query?: string;
    activeOnly?: boolean;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/realtime/presence', params || {});
    return Array.isArray(data) ? data : [];
  },

  getRealtimeDeliveries: async (params?: {
    namespace?: string;
    eventName?: string;
    status?: string;
    query?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/realtime/deliveries', params || {});
    return Array.isArray(data) ? data : [];
  },

  replayRealtimeDelivery: async (deliveryId: string): Promise<any> => {
    return adminPost<any>(`/realtime/deliveries/${encodeURIComponent(deliveryId)}/replay`, {});
  },

  getRealtimeIncidents: async (params?: {
    status?: string;
    severity?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/realtime/incidents', params || {});
    return Array.isArray(data) ? data : [];
  },

  createRealtimeIncident: async (payload: {
    code: string;
    severity?: string;
    source?: string;
    message: string;
    details?: any;
  }): Promise<any> => {
    return adminPost<any>('/realtime/incidents', payload);
  },

  resolveRealtimeIncident: async (
    incidentId: string,
    payload?: {
      notes?: string | null;
      status?: string;
    }
  ): Promise<any> => {
    return adminPut<any>(`/realtime/incidents/${encodeURIComponent(incidentId)}/resolve`, payload || {});
  },

  getRealtimeReplayJobs: async (params?: {
    status?: string;
    limit?: number;
  }): Promise<any[]> => {
    const data = await adminGet<any[]>('/realtime/replays', params || {});
    return Array.isArray(data) ? data : [];
  },

  getMonetizationSettings: async (): Promise<any> => {
    return adminGet<any>('/monetization/settings');
  },

  saveMonetizationSettings: async (settings: any): Promise<any> => {
    return adminPut<any>('/monetization/settings', settings);
  },

  getMonetizationApplications: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; total: number; page: number; limit: number }> => {
    const data = await adminGet<any>('/monetization/applications', params);
    if (Array.isArray(data)) {
      return { items: data, total: data.length, page: 1, limit: data.length || 20 };
    }
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      total: Number(data?.total ?? 0),
      page: Number(data?.page ?? 1),
      limit: Number(data?.limit ?? 20)
    };
  },

  getMonetizationApplication: async (id: string): Promise<any> => {
    return adminGet<any>(`/monetization/applications/${encodeURIComponent(id)}`);
  },

  approveMonetizationApplication: async (id: string, payload?: { note?: string; enableMonetization?: boolean }): Promise<any> => {
    return adminPost<any>(`/monetization/applications/${encodeURIComponent(id)}/approve`, payload || {});
  },

  rejectMonetizationApplication: async (
    id: string,
    payload: { note: string; reapplyAfterDays?: number; reapplyAllowedAt?: string; reapplyAt?: string }
  ): Promise<any> => {
    return adminPost<any>(`/monetization/applications/${encodeURIComponent(id)}/reject`, payload);
  },

  disableUserMonetization: async (
    userId: string,
    payload?: { reason?: string; disableUntil?: string }
  ): Promise<any> => {
    return adminPost<any>(`/monetization/users/${encodeURIComponent(userId)}/disable`, payload || {});
  },

  getAIAnalytics: async (): Promise<any> => {
    try {
      return await adminGet<any>('/ai/analytics');
    } catch (legacyError) {
      try {
        return await adminGet<any>('/scrolitha/analytics');
      } catch (scrolithaError) {
        return await adminGet<any>('/analytics/activity');
      }
    }
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
,

  // Update admin profile (persist on server)
  updateProfile: async (data: any): Promise<any> => {
    const res = await adminPut<any>('/profile', data);
    return res;
  },

  // ---- Favorites & Carts ----
  async getFavorites(params?: { entityType?: string; userId?: string }): Promise<any[]> {
    const data = await adminGet<any[]>('/favorites', params);
    return Array.isArray(data) ? data : [];
  },

  async deleteFavorite(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/favorites/${id}`);
    return Boolean(response?.success);
  },

  async getCarts(params?: { userId?: string }): Promise<any[]> {
    const data = await adminGet<any[]>('/carts', params);
    return Array.isArray(data) ? data : [];
  },

  async getCartById(id: string): Promise<any> {
    const data = await adminGet<any>(`/carts/${id}`);
    return data || null;
  },

  async deleteCart(id: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/carts/${id}`);
    return Boolean(response?.success);
  },

  async deleteCartItem(itemId: string): Promise<boolean> {
    const response = await adminRequest<{ id: string }>('delete', `/carts/items/${itemId}`);
    return Boolean(response?.success);
  },

  // ---- Moderator Console ----
  async getModerationConversations(params?: { page?: number; limit?: number; search?: string }): Promise<any> {
    const response = await api.get('/moderation/chat/conversations', {
      params,
      headers: await getAuthHeaders()
    });
    return extractData<any>(response) || { items: [], page: 1, limit: 20, total: 0, hasMore: false };
  },

  async getModerationConversationMessages(
    conversationId: string,
    params?: { page?: number; limit?: number }
  ): Promise<any> {
    const response = await api.get(`/moderation/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
      params,
      headers: await getAuthHeaders()
    });
    return extractData<any>(response) || { items: [], page: 1, limit: 50, total: 0, hasMore: false };
  },

  async sendModerationConversationMessage(
    conversationId: string,
    payload: { message: string; type?: 'MODERATOR_WARNING' | 'MODERATOR_MESSAGE' }
  ): Promise<any> {
    const response = await api.post(
      `/moderation/chat/conversations/${encodeURIComponent(conversationId)}/message`,
      payload,
      { headers: await getAuthHeaders() }
    );
    return extractData<any>(response);
  },

  async getModerationAudit(params?: { page?: number; limit?: number; conversationId?: string; staffId?: string }): Promise<any> {
    const response = await api.get('/moderation/chat/audit', {
      params,
      headers: await getAuthHeaders()
    });
    return extractData<any>(response) || { items: [], page: 1, limit: 20, total: 0, hasMore: false };
  },

  async getMessageRecords(params?: {
    page?: number;
    limit?: number;
    conversationId?: string;
    action?: string;
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }): Promise<any> {
    const response = await api.get('/moderation/chat/records', {
      params,
      headers: await getAuthHeaders()
    });
    return extractData<any>(response) || { items: [], page: 1, limit: 50, total: 0, hasMore: false };
  },

  async exportMessageRecords(
    params?: {
      conversationId?: string;
      action?: string;
      actorId?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      format?: 'csv' | 'json';
    }
  ): Promise<Blob> {
    const response = await api.get('/moderation/chat/records/export', {
      params,
      headers: await getAuthHeaders(),
      responseType: 'blob'
    });
    return response.data as Blob;
  },

  async getMessageRetentionPolicy(): Promise<{ retentionMonths: number; retentionYears: number; updatedAt: string | null }> {
    const response = await api.get('/moderation/chat/records/retention', {
      headers: await getAuthHeaders()
    });
    return extractData<any>(response) || { retentionMonths: 72, retentionYears: 6, updatedAt: null };
  },

  async updateMessageRetentionPolicy(retentionMonths: number): Promise<{ retentionMonths: number; retentionYears: number }> {
    const response = await api.put(
      '/moderation/chat/records/retention',
      { retentionMonths },
      { headers: await getAuthHeaders() }
    );
    return extractData<any>(response);
  },

  // ---- App Distribution Management ----
  async getAppDistributionConfig(): Promise<any> {
    return adminGet<any>('/apps/config');
  },

  async saveAppDistributionConfig(payload: any): Promise<any> {
    return adminPut<any>('/apps/config', payload);
  },

  async getAppDistributionAnalytics(params?: { rangeDays?: number }): Promise<any> {
    return adminGet<any>('/apps/analytics', params || {});
  },

  async getAppDistributionEvents(params?: { limit?: number }): Promise<any[]> {
    const data = await adminGet<any[]>('/apps/events', params || {});
    return Array.isArray(data) ? data : [];
  },

  async getAppCampaigns(): Promise<any[]> {
    const data = await adminGet<any[]>('/apps/campaigns');
    return Array.isArray(data) ? data : [];
  },

  async sendAppCampaign(payload: {
    id?: string;
    name?: string;
    title: string;
    body: string;
    mediaType?: 'none' | 'image' | 'video';
    mediaUrl?: string;
    actionUrl?: string;
    targetPlatform?: 'all' | 'android' | 'desktop';
    targetRole?: 'all' | 'freelancer' | 'employer' | 'admin';
    deliveryInApp?: boolean;
    deliveryPush?: boolean;
    userIds?: string[];
  }): Promise<any> {
    return adminPost<any>('/apps/campaigns/send', payload);
  },

  async updateAppCampaign(
    id: string,
    payload: {
      name?: string;
      title?: string;
      body?: string;
      mediaType?: 'none' | 'image' | 'video';
      mediaUrl?: string;
      actionUrl?: string;
      targetPlatform?: 'all' | 'android' | 'desktop';
      targetRole?: 'all' | 'freelancer' | 'employer' | 'admin';
      deliveryInApp?: boolean;
      deliveryPush?: boolean;
    }
  ): Promise<any> {
    return adminPut<any>(`/apps/campaigns/${encodeURIComponent(id)}`, payload);
  },

  async deleteAppCampaign(id: string): Promise<{ id: string }> {
    return adminDelete<{ id: string }>(`/apps/campaigns/${encodeURIComponent(id)}`);
  },

  async resendAppCampaign(
    id: string,
    payload?: {
      title?: string;
      body?: string;
      mediaType?: 'none' | 'image' | 'video';
      mediaUrl?: string;
      actionUrl?: string;
      targetPlatform?: 'all' | 'android' | 'desktop';
      targetRole?: 'all' | 'freelancer' | 'employer' | 'admin';
      deliveryInApp?: boolean;
      deliveryPush?: boolean;
      userIds?: string[];
    }
  ): Promise<any> {
    return adminPost<any>(`/apps/campaigns/${encodeURIComponent(id)}/resend`, payload || {});
  },

  // ---- System Backup Module ----
  async getSystemBackupMeta(): Promise<{
    sections: string[];
    runtime?: {
      storageDriver?: string;
      durable?: boolean;
      importLimitBytes?: number;
      maxSingleFileBytes?: number;
      maxTotalFileSnapshotBytes?: number;
      databaseChunkBytes?: number | null;
    };
  }> {
    return adminGet<{
      sections: string[];
      runtime?: {
        storageDriver?: string;
        durable?: boolean;
        importLimitBytes?: number;
        maxSingleFileBytes?: number;
        maxTotalFileSnapshotBytes?: number;
        databaseChunkBytes?: number | null;
      };
    }>('/system-backups/meta');
  },

  async getSystemBackups(): Promise<any[]> {
    const data = await adminGet<any[]>('/system-backups');
    return Array.isArray(data) ? data : [];
  },

  async getSystemBackupJobs(): Promise<any[]> {
    const data = await adminGet<any[]>('/system-backups/jobs');
    return Array.isArray(data) ? data : [];
  },

  async createSystemBackup(payload: {
    mode: 'full' | 'partial';
    sections?: string[];
    customTables?: string[];
    includeFiles?: boolean;
    notes?: string;
  }): Promise<any> {
    const response = await api.post(`${ADMIN_BASE}/system-backups/create`, payload, {
      headers: await getAuthHeaders(),
      timeout: SYSTEM_BACKUP_TIMEOUT_MS
    });
    return extractData<any>(response);
  },

  async downloadSystemBackup(backupId: string): Promise<Blob> {
    const response = await api.get(`${ADMIN_BASE}/system-backups/${encodeURIComponent(backupId)}/download`, {
      headers: await getAuthHeaders(),
      responseType: 'blob',
      timeout: SYSTEM_BACKUP_TIMEOUT_MS
    });
    return response.data as Blob;
  },

  async verifySystemBackup(backupId: string): Promise<any> {
    const response = await api.post(
      `${ADMIN_BASE}/system-backups/${encodeURIComponent(backupId)}/verify`,
      {},
      {
        headers: await getAuthHeaders(),
        timeout: SYSTEM_BACKUP_TIMEOUT_MS
      }
    );
    return extractData<any>(response);
  },

  async importSystemBackup(file: File, notes?: string): Promise<any> {
    const form = new FormData();
    form.append('file', file);
    if (notes && notes.trim()) form.append('notes', notes.trim());
    const headers = await getAuthHeaders();
    const response = await api.post(`${ADMIN_BASE}/system-backups/import`, form, {
      headers: {
        ...headers,
        'Content-Type': 'multipart/form-data'
      },
      timeout: SYSTEM_BACKUP_TIMEOUT_MS
    });
    return extractData<any>(response);
  },

  async restoreSystemBackup(
    backupId: string,
    payload: {
      scrolithLicense: string;
      adminEmail: string;
      adminPassword: string;
      mode?: 'replace' | 'append';
      sections?: string[];
      customTables?: string[];
      includeFiles?: boolean;
    }
  ): Promise<any> {
    const response = await api.post(`${ADMIN_BASE}/system-backups/${encodeURIComponent(backupId)}/restore`, payload, {
      headers: await getAuthHeaders(),
      timeout: SYSTEM_BACKUP_TIMEOUT_MS
    });
    return extractData<any>(response);
  },

  async deleteSystemBackup(backupId: string): Promise<{ deletedCount: number; deleted: any[] }> {
    return adminDelete<{ deletedCount: number; deleted: any[] }>(`/system-backups/${encodeURIComponent(backupId)}`);
  },

  async deleteSystemBackups(backupIds: string[]): Promise<{ deletedCount: number; deleted: any[] }> {
    return adminPost<{ deletedCount: number; deleted: any[] }>('/system-backups/delete-batch', { backupIds });
  },

  // ---- Form Builder ----
  async getFormConfig(): Promise<any> {
    return getAdminFormConfig<any>();
  },

  async saveFormConfig(payload: any): Promise<any> {
    return saveAdminFormConfig<any>(payload);
  }
};

export const GigsJobsService = AdminService;

