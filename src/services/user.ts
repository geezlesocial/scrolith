import api from './api';
import { User, UserProfile, UserSettings } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const mapProfile = (p: any): UserProfile => {
  const hourlyRate = Number(p.hourly_rate ?? p.hourlyRate ?? 0);
  const introVideoUrl = p.intro_video_url ?? p.introVideoUrl ?? '';
  const profilePhotoFileId = p.profile_photo_file_id ?? p.profilePhotoFileId;
  const avatarUrl = p.avatar_url ?? p.avatarUrl ?? p.avatar ?? undefined;
  return {
    user_id: p.user_id ?? p.userId,
    userId: p.user_id ?? p.userId,
    title: p.title ?? '',
    bio: p.bio ?? '',
    location: p.location ?? '',
    languages: Array.isArray(p.languages) ? p.languages : [],
    skills: Array.isArray(p.skills) ? p.skills : [],
    hourly_rate: hourlyRate,
    hourlyRate,
    portfolio: Array.isArray(p.portfolio) ? p.portfolio : [],
    experience: Array.isArray(p.experience) ? p.experience : [],
    education: Array.isArray(p.education) ? p.education : [],
    certifications: Array.isArray(p.certifications) ? p.certifications : [],
    intro_video_url: introVideoUrl,
    introVideoUrl,
    profile_photo_file_id: profilePhotoFileId,
    profilePhotoFileId: profilePhotoFileId,
    avatar_url: avatarUrl,
    avatarUrl,
    rating: Number(p.rating ?? 0),
    completedJobs: Number(p.completed_jobs ?? p.completedJobs ?? 0),
    responseRate: Number(p.response_rate ?? p.responseRate ?? 0),
    responseTime: p.response_time ?? p.responseTime ?? undefined
  };
};

const mapUser = (u: any): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar ?? undefined,
  profilePhotoFileId: u.profile_photo_file_id ?? u.profilePhotoFileId
});

const mapSettings = (s: any): UserSettings => ({
  email_notifications: Boolean(s.email_notifications ?? s.emailNotifications),
  in_app_notifications: Boolean(s.in_app_notifications ?? s.inAppNotifications),
  marketing_emails: Boolean(s.marketing_emails ?? s.marketingEmails),
  two_factor_enabled: Boolean(s.two_factor_enabled ?? s.twoFactorEnabled),
  login_alerts: Boolean(s.login_alerts ?? s.loginAlerts),
  emailNotifications: Boolean(s.email_notifications ?? s.emailNotifications),
  inAppNotifications: Boolean(s.in_app_notifications ?? s.inAppNotifications),
  marketingEmails: Boolean(s.marketing_emails ?? s.marketingEmails),
  twoFactorEnabled: Boolean(s.two_factor_enabled ?? s.twoFactorEnabled),
  loginAlerts: Boolean(s.login_alerts ?? s.loginAlerts)
});

const toProfilePayload = (profile: Partial<UserProfile>) => {
  const p = profile as unknown as Record<string, unknown>;
  return {
    user_id: (p['user_id'] as string | undefined) ?? (p['userId'] as string | undefined),
    title: (p['title'] as string | undefined) ?? '',
    bio: (profile.bio as string | undefined) ?? '',
    location: (profile.location as string | undefined) ?? '',
    languages: Array.isArray(profile.languages) ? (profile.languages as string[]) : [],
    skills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
    hourly_rate: Number((p['hourlyRate'] as number | string | undefined) ?? (p['hourly_rate'] as number | string | undefined) ?? 0),
    intro_video_url: (p['introVideoUrl'] as string | undefined) ?? (p['intro_video_url'] as string | undefined) ?? null,
    profile_photo_file_id: (p['profile_photo_file_id'] as string | undefined) ?? (p['profilePhotoFileId'] as string | undefined) ?? null,
    avatar_url: (p['avatar_url'] as string | undefined) ?? (p['avatarUrl'] as string | undefined) ?? (p['avatar'] as string | undefined) ?? null,
    portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : [],
    experience: Array.isArray(profile.experience) ? profile.experience : [],
    education: Array.isArray(profile.education) ? profile.education : [],
    certifications: Array.isArray(profile.certifications) ? profile.certifications : []
  };
};

const toSettingsPayload = (settings: Partial<UserSettings>) => ({
  email_notifications: settings.email_notifications ?? settings.emailNotifications,
  in_app_notifications: settings.in_app_notifications ?? settings.inAppNotifications,
  marketing_emails: settings.marketing_emails ?? settings.marketingEmails,
  two_factor_enabled: settings.two_factor_enabled ?? settings.twoFactorEnabled,
  login_alerts: settings.login_alerts ?? settings.loginAlerts
});

export const UserService = {
  getMyProfile: async (): Promise<UserProfile> => {
    const response = await api.get('/profile/me');
    return mapProfile(extractData<UserProfile>(response));
  },

  updateMyProfile: async (data: Partial<UserProfile>): Promise<UserProfile> => {
    const response = await api.put('/profile/me', toProfilePayload(data));
    return mapProfile(extractData<UserProfile>(response));
  },

  getUserBasic: async (userId: string): Promise<User> => {
    const response = await api.get(`/users/${userId}`);
    return mapUser(extractData<User>(response));
  },
  getProfile: async (userId: string): Promise<UserProfile> => {
    const response = await api.get(`/users/${userId}/profile`);
    return mapProfile(extractData<UserProfile>(response));
  },

  updateProfile: async (userId: string, data: Partial<UserProfile>): Promise<UserProfile> => {
    const response = await api.put(`/users/${userId}/profile`, toProfilePayload(data));
    return mapProfile(extractData<UserProfile>(response));
  },

  getSettings: async (userId: string): Promise<UserSettings> => {
    const response = await api.get(`/users/${userId}/settings`);
    return mapSettings(extractData<UserSettings>(response));
  },

  getMySettings: async (): Promise<UserSettings> => {
    const response = await api.get('/settings/me');
    return mapSettings(extractData<UserSettings>(response));
  },

  updateSettings: async (userId: string, settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.put(`/users/${userId}/settings`, toSettingsPayload(settings));
    return mapSettings(extractData<UserSettings>(response));
  },

  updateMySettings: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.put('/settings/me', toSettingsPayload(settings));
    return mapSettings(extractData<UserSettings>(response));
  },

  changePassword: async (userId: string, oldPass: string, newPass: string): Promise<void> => {
    await api.post(`/users/${userId}/password`, { oldPassword: oldPass, newPassword: newPass });
  },

  updateEmail: async (userId: string, newEmail: string): Promise<void> => {
    await api.put(`/users/${userId}`, { email: newEmail });
  },

  updateCredentials: async (
    userId: string,
    data: { name?: string; email?: string; username?: string; password?: string; avatar?: string; profilePhotoFileId?: string }
  ): Promise<User> => {
    const response = await api.put(`/users/${userId}`, data);
    return extractData<User>(response);
  }
};
