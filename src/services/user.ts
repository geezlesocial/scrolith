import api from './api';
import { User, UserProfile, UserSettings } from '../types';
import { resolveAssetUrl } from '../utils/assetUrl';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const toArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.results)) return value.results;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapProfile = (p: any): UserProfile => {
  const hourlyRate = Number(p.hourly_rate ?? p.hourlyRate ?? 0);
  const introVideoUrl = p.intro_video_url ?? p.introVideoUrl ?? '';
  const coverPhotoUrl = p.cover_photo_url ?? p.coverPhotoUrl ?? '';
  const profilePhotoFileId = p.profile_photo_file_id ?? p.profilePhotoFileId;
  const avatarUrl = p.avatar_url ?? p.avatarUrl ?? p.avatar ?? undefined;
  const resolvedAvatar = avatarUrl ? resolveAssetUrl(String(avatarUrl)) : undefined;
  const resolvedCover = coverPhotoUrl ? resolveAssetUrl(String(coverPhotoUrl)) : undefined;
  return {
    user_id: p.user_id ?? p.userId,
    userId: p.user_id ?? p.userId,
    title: p.title ?? '',
    bio: p.bio ?? '',
    location: p.location ?? '',
    languages: toArray(p.languages),
    skills: toArray(p.skills),
    hourly_rate: hourlyRate,
    hourlyRate,
    portfolio: toArray(p.portfolio ?? p.portfolioItems ?? p.portfolio_items),
    experience: toArray(p.experience ?? p.experienceItems ?? p.experience_items),
    education: toArray(p.education ?? p.educationItems ?? p.education_items),
    certifications: toArray(p.certifications),
    intro_video_url: introVideoUrl,
    introVideoUrl,
    cover_photo_url: resolvedCover,
    coverPhotoUrl: resolvedCover,
    gender: p.gender ?? '',
    date_of_birth: p.date_of_birth ?? p.dateOfBirth ?? null,
    dateOfBirth: p.dateOfBirth ?? p.date_of_birth ?? null,
    birth_month_day: p.birth_month_day ?? p.birthMonthDay ?? '',
    birthMonthDay: p.birthMonthDay ?? p.birth_month_day ?? '',
    show_birth_month_day_public:
      p.show_birth_month_day_public ?? p.showBirthMonthDayPublic ?? true,
    showBirthMonthDayPublic:
      p.showBirthMonthDayPublic ?? p.show_birth_month_day_public ?? true,
    profile_photo_file_id: profilePhotoFileId,
    profilePhotoFileId: profilePhotoFileId,
    avatar_url: resolvedAvatar,
    avatarUrl: resolvedAvatar,
    rating: Number(p.rating ?? 0),
    completedJobs: Number(p.completed_jobs ?? p.completedJobs ?? 0),
    responseRate: Number(p.response_rate ?? p.responseRate ?? 0),
    responseTime: p.response_time ?? p.responseTime ?? undefined
  };
};

const mapUser = (u: any): User => {
  const rawAvatar = u.avatar ?? u.avatar_url ?? u.avatarUrl ?? undefined;
  const resolvedAvatar = rawAvatar ? resolveAssetUrl(String(rawAvatar)) : undefined;
  const normalizedKyc = String(u.kyc_status ?? u.kycStatus ?? '').toLowerCase();
  const isVerified = Boolean(u.isVerified ?? u.is_verified ?? normalizedKyc === 'verified');
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    username: u.username ?? u.user_name ?? u.userName,
    avatar: resolvedAvatar,
  profilePhotoFileId: u.profile_photo_file_id ?? u.profilePhotoFileId,
  profile_photo_file_id: u.profile_photo_file_id ?? u.profilePhotoFileId,
  isVerified,
  is_verified: isVerified,
  kycStatus: (u.kyc_status ?? u.kycStatus) as any,
  kyc_status: (u.kyc_status ?? u.kycStatus) as any,
  isProFreelancer: Boolean(u.isProFreelancer ?? u.is_pro_freelancer),
  is_pro_freelancer: Boolean(u.isProFreelancer ?? u.is_pro_freelancer),
  isProEmployer: Boolean(u.isProEmployer ?? u.is_pro_employer),
  is_pro_employer: Boolean(u.isProEmployer ?? u.is_pro_employer),
  freelancerPlanId: u.freelancerPlanId ?? u.freelancer_plan_id ?? null,
  freelancer_plan_id: u.freelancerPlanId ?? u.freelancer_plan_id ?? null,
  freelancerPlanName: u.freelancerPlanName ?? u.freelancer_plan_name ?? null,
  freelancer_plan_name: u.freelancerPlanName ?? u.freelancer_plan_name ?? null,
  freelancerPlanInterval: u.freelancerPlanInterval ?? u.freelancer_plan_interval ?? null,
  freelancer_plan_interval: u.freelancerPlanInterval ?? u.freelancer_plan_interval ?? null,
  freelancerPlanPrice: u.freelancerPlanPrice ?? u.freelancer_plan_price ?? null,
  freelancer_plan_price: u.freelancerPlanPrice ?? u.freelancer_plan_price ?? null,
  freelancerPlanCurrency: u.freelancerPlanCurrency ?? u.freelancer_plan_currency ?? null,
  freelancer_plan_currency: u.freelancerPlanCurrency ?? u.freelancer_plan_currency ?? null,
  freelancerPlanActive: Boolean(u.freelancerPlanActive ?? u.freelancer_plan_active),
  freelancer_plan_active: Boolean(u.freelancerPlanActive ?? u.freelancer_plan_active),
  freelancerPlanPurchasedAt: u.freelancerPlanPurchasedAt ?? u.freelancer_plan_purchased_at ?? null,
  freelancer_plan_purchased_at: u.freelancerPlanPurchasedAt ?? u.freelancer_plan_purchased_at ?? null,
  freelancerPlanExpiresAt: u.freelancerPlanExpiresAt ?? u.freelancer_plan_expires_at ?? null,
  freelancer_plan_expires_at: u.freelancerPlanExpiresAt ?? u.freelancer_plan_expires_at ?? null,
  employerPlanId: u.employerPlanId ?? u.employer_plan_id ?? null,
  employer_plan_id: u.employerPlanId ?? u.employer_plan_id ?? null,
  employerPlanName: u.employerPlanName ?? u.employer_plan_name ?? null,
  employer_plan_name: u.employerPlanName ?? u.employer_plan_name ?? null,
  employerPlanInterval: u.employerPlanInterval ?? u.employer_plan_interval ?? null,
  employer_plan_interval: u.employerPlanInterval ?? u.employer_plan_interval ?? null,
  employerPlanPrice: u.employerPlanPrice ?? u.employer_plan_price ?? null,
  employer_plan_price: u.employerPlanPrice ?? u.employer_plan_price ?? null,
  employerPlanCurrency: u.employerPlanCurrency ?? u.employer_plan_currency ?? null,
  employer_plan_currency: u.employerPlanCurrency ?? u.employer_plan_currency ?? null,
  employerPlanActive: Boolean(u.employerPlanActive ?? u.employer_plan_active),
  employer_plan_active: Boolean(u.employerPlanActive ?? u.employer_plan_active),
  employerPlanPurchasedAt: u.employerPlanPurchasedAt ?? u.employer_plan_purchased_at ?? null,
  employer_plan_purchased_at: u.employerPlanPurchasedAt ?? u.employer_plan_purchased_at ?? null,
  employerPlanExpiresAt: u.employerPlanExpiresAt ?? u.employer_plan_expires_at ?? null,
  employer_plan_expires_at: u.employerPlanExpiresAt ?? u.employer_plan_expires_at ?? null
  };
};

const mapSettings = (s: any): UserSettings => ({
  email_notifications: Boolean(s.email_notifications ?? s.emailNotifications),
  in_app_notifications: Boolean(s.in_app_notifications ?? s.inAppNotifications),
  message_requests_notifications: Boolean(
    s.message_requests_notifications ?? s.messageRequestsNotifications ?? true
  ),
  allow_in_mail: Boolean(s.allow_in_mail ?? s.allowInMail ?? true),
  mention_notifications: Boolean(
    s.mention_notifications ?? s.notify_mentions ?? s.notifyMentions ?? s.mentionNotifications ?? true
  ),
  followed_post_notifications: Boolean(
    s.followed_post_notifications ??
      s.notify_followed_posts ??
      s.notifyFollowedPosts ??
      s.followedPostNotifications ??
      true
  ),
  follow_notifications: Boolean(
    s.follow_notifications ?? s.notify_followed_you ?? s.notifyFollowedYou ?? s.followNotifications ?? true
  ),
  comment_notifications: Boolean(
    s.comment_notifications ??
      s.notify_comments_on_posts ??
      s.notifyCommentsOnPosts ??
      s.commentNotifications ??
      true
  ),
  reaction_notifications: Boolean(
    s.reaction_notifications ??
      s.notify_reactions_on_posts ??
      s.notifyReactionsOnPosts ??
      s.reactionNotifications ??
      true
  ),
  repost_notifications: Boolean(
    s.repost_notifications ?? s.notify_reposts ?? s.notifyReposts ?? s.repostNotifications ?? true
  ),
  job_application_notifications: Boolean(
    s.job_application_notifications ??
      s.notify_job_applications ??
      s.notifyJobApplications ??
      s.jobApplicationNotifications ??
      true
  ),
  application_update_notifications: Boolean(
    s.application_update_notifications ??
      s.notify_application_updates ??
      s.notifyApplicationUpdates ??
      s.applicationUpdateNotifications ??
      true
  ),
  notify_mentions: Boolean(s.notify_mentions ?? s.notifyMentions ?? s.mention_notifications ?? true),
  notify_followed_posts: Boolean(s.notify_followed_posts ?? s.notifyFollowedPosts ?? s.followed_post_notifications ?? true),
  notify_followed_you: Boolean(s.notify_followed_you ?? s.notifyFollowedYou ?? s.follow_notifications ?? true),
  notify_comments_on_posts: Boolean(
    s.notify_comments_on_posts ?? s.notifyCommentsOnPosts ?? s.comment_notifications ?? true
  ),
  notify_reactions_on_posts: Boolean(
    s.notify_reactions_on_posts ?? s.notifyReactionsOnPosts ?? s.reaction_notifications ?? true
  ),
  notify_reposts: Boolean(s.notify_reposts ?? s.notifyReposts ?? s.repost_notifications ?? true),
  notify_job_applications: Boolean(
    s.notify_job_applications ?? s.notifyJobApplications ?? s.job_application_notifications ?? true
  ),
  notify_application_updates: Boolean(
    s.notify_application_updates ?? s.notifyApplicationUpdates ?? s.application_update_notifications ?? true
  ),
  marketing_emails: Boolean(s.marketing_emails ?? s.marketingEmails),
  two_factor_enabled: Boolean(s.two_factor_enabled ?? s.twoFactorEnabled),
  login_alerts: Boolean(s.login_alerts ?? s.loginAlerts),
  emailNotifications: Boolean(s.email_notifications ?? s.emailNotifications),
  inAppNotifications: Boolean(s.in_app_notifications ?? s.inAppNotifications),
  messageRequestsNotifications: Boolean(
    s.message_requests_notifications ?? s.messageRequestsNotifications ?? true
  ),
  allowInMail: Boolean(s.allow_in_mail ?? s.allowInMail ?? true),
  mentionNotifications: Boolean(
    s.mention_notifications ?? s.notify_mentions ?? s.notifyMentions ?? s.mentionNotifications ?? true
  ),
  followedPostNotifications: Boolean(
    s.followed_post_notifications ??
      s.notify_followed_posts ??
      s.notifyFollowedPosts ??
      s.followedPostNotifications ??
      true
  ),
  followNotifications: Boolean(
    s.follow_notifications ?? s.notify_followed_you ?? s.notifyFollowedYou ?? s.followNotifications ?? true
  ),
  commentNotifications: Boolean(
    s.comment_notifications ??
      s.notify_comments_on_posts ??
      s.notifyCommentsOnPosts ??
      s.commentNotifications ??
      true
  ),
  reactionNotifications: Boolean(
    s.reaction_notifications ??
      s.notify_reactions_on_posts ??
      s.notifyReactionsOnPosts ??
      s.reactionNotifications ??
      true
  ),
  repostNotifications: Boolean(
    s.repost_notifications ?? s.notify_reposts ?? s.notifyReposts ?? s.repostNotifications ?? true
  ),
  jobApplicationNotifications: Boolean(
    s.job_application_notifications ??
      s.notify_job_applications ??
      s.notifyJobApplications ??
      s.jobApplicationNotifications ??
      true
  ),
  applicationUpdateNotifications: Boolean(
    s.application_update_notifications ??
      s.notify_application_updates ??
      s.notifyApplicationUpdates ??
      s.applicationUpdateNotifications ??
      true
  ),
  notifyMentions: Boolean(s.notifyMentions ?? s.notify_mentions ?? s.mention_notifications ?? true),
  notifyFollowedPosts: Boolean(s.notifyFollowedPosts ?? s.notify_followed_posts ?? s.followed_post_notifications ?? true),
  notifyFollowedYou: Boolean(s.notifyFollowedYou ?? s.notify_followed_you ?? s.follow_notifications ?? true),
  notifyCommentsOnPosts: Boolean(
    s.notifyCommentsOnPosts ?? s.notify_comments_on_posts ?? s.comment_notifications ?? true
  ),
  notifyReactionsOnPosts: Boolean(
    s.notifyReactionsOnPosts ?? s.notify_reactions_on_posts ?? s.reaction_notifications ?? true
  ),
  notifyReposts: Boolean(s.notifyReposts ?? s.notify_reposts ?? s.repost_notifications ?? true),
  notifyJobApplications: Boolean(
    s.notifyJobApplications ?? s.notify_job_applications ?? s.job_application_notifications ?? true
  ),
  notifyApplicationUpdates: Boolean(
    s.notifyApplicationUpdates ?? s.notify_application_updates ?? s.application_update_notifications ?? true
  ),
  marketingEmails: Boolean(s.marketing_emails ?? s.marketingEmails),
  twoFactorEnabled: Boolean(s.two_factor_enabled ?? s.twoFactorEnabled),
  loginAlerts: Boolean(s.login_alerts ?? s.loginAlerts)
});

const toProfilePayload = (profile: Partial<UserProfile>) => {
  const p = profile as unknown as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(p, key);

  if (has('user_id') || has('userId')) {
    payload.user_id = (p['user_id'] as string | undefined) ?? (p['userId'] as string | undefined);
  }
  if (has('title')) payload.title = (p['title'] as string | undefined) ?? '';
  if (has('bio')) payload.bio = (p['bio'] as string | undefined) ?? '';
  if (has('location')) payload.location = (p['location'] as string | undefined) ?? '';
  if (has('languages')) payload.languages = Array.isArray(profile.languages) ? profile.languages : [];
  if (has('skills')) payload.skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (has('hourlyRate') || has('hourly_rate')) {
    payload.hourly_rate = Number(
      (p['hourlyRate'] as number | string | undefined) ?? (p['hourly_rate'] as number | string | undefined) ?? 0
    );
  }
  if (has('introVideoUrl') || has('intro_video_url')) {
    payload.intro_video_url = (p['introVideoUrl'] as string | undefined) ?? (p['intro_video_url'] as string | undefined) ?? '';
  }
  if (has('coverPhotoUrl') || has('cover_photo_url')) {
    payload.cover_photo_url = (p['coverPhotoUrl'] as string | undefined) ?? (p['cover_photo_url'] as string | undefined) ?? '';
  }
  if (has('gender')) payload.gender = (p['gender'] as string | undefined) ?? '';
  if (has('dateOfBirth') || has('date_of_birth')) {
    payload.date_of_birth =
      (p['dateOfBirth'] as string | undefined) ??
      (p['date_of_birth'] as string | undefined) ??
      null;
  }
  if (has('showBirthMonthDayPublic') || has('show_birth_month_day_public')) {
    payload.show_birth_month_day_public =
      (p['showBirthMonthDayPublic'] as boolean | undefined) ??
      (p['show_birth_month_day_public'] as boolean | undefined) ??
      true;
  }
  if (has('profile_photo_file_id') || has('profilePhotoFileId')) {
    payload.profile_photo_file_id =
      (p['profile_photo_file_id'] as string | undefined) ?? (p['profilePhotoFileId'] as string | undefined) ?? null;
  }
  if (has('avatar_url') || has('avatarUrl') || has('avatar')) {
    payload.avatar_url =
      (p['avatar_url'] as string | undefined) ??
      (p['avatarUrl'] as string | undefined) ??
      (p['avatar'] as string | undefined) ??
      null;
  }
  if (has('portfolio')) payload.portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  if (has('experience')) payload.experience = Array.isArray(profile.experience) ? profile.experience : [];
  if (has('education')) payload.education = Array.isArray(profile.education) ? profile.education : [];
  if (has('certifications')) payload.certifications = Array.isArray(profile.certifications) ? profile.certifications : [];

  return payload;
};

const toSettingsPayload = (settings: Partial<UserSettings>) => ({
  email_notifications: settings.email_notifications ?? settings.emailNotifications,
  in_app_notifications: settings.in_app_notifications ?? settings.inAppNotifications,
  message_requests_notifications:
    settings.message_requests_notifications ?? settings.messageRequestsNotifications,
  allow_in_mail: settings.allow_in_mail ?? settings.allowInMail,
  mention_notifications:
    settings.mention_notifications ??
    settings.notify_mentions ??
    settings.notifyMentions ??
    settings.mentionNotifications,
  followed_post_notifications:
    settings.followed_post_notifications ??
    settings.notify_followed_posts ??
    settings.notifyFollowedPosts ??
    settings.followedPostNotifications,
  follow_notifications:
    settings.follow_notifications ??
    settings.notify_followed_you ??
    settings.notifyFollowedYou ??
    settings.followNotifications,
  comment_notifications:
    settings.comment_notifications ??
    settings.notify_comments_on_posts ??
    settings.notifyCommentsOnPosts ??
    settings.commentNotifications,
  reaction_notifications:
    settings.reaction_notifications ??
    settings.notify_reactions_on_posts ??
    settings.notifyReactionsOnPosts ??
    settings.reactionNotifications,
  repost_notifications:
    settings.repost_notifications ??
    settings.notify_reposts ??
    settings.notifyReposts ??
    settings.repostNotifications,
  notify_mentions:
    settings.notify_mentions ??
    settings.notifyMentions ??
    settings.mention_notifications ??
    settings.mentionNotifications,
  notify_followed_posts:
    settings.notify_followed_posts ??
    settings.notifyFollowedPosts ??
    settings.followed_post_notifications ??
    settings.followedPostNotifications,
  notify_followed_you:
    settings.notify_followed_you ??
    settings.notifyFollowedYou ??
    settings.follow_notifications ??
    settings.followNotifications,
  notify_comments_on_posts:
    settings.notify_comments_on_posts ??
    settings.notifyCommentsOnPosts ??
    settings.comment_notifications ??
    settings.commentNotifications,
  notify_reactions_on_posts:
    settings.notify_reactions_on_posts ??
    settings.notifyReactionsOnPosts ??
    settings.reaction_notifications ??
    settings.reactionNotifications,
  notify_reposts:
    settings.notify_reposts ??
    settings.notifyReposts ??
    settings.repost_notifications ??
    settings.repostNotifications,
  job_application_notifications:
    settings.job_application_notifications ??
    settings.notify_job_applications ??
    settings.notifyJobApplications ??
    settings.jobApplicationNotifications,
  application_update_notifications:
    settings.application_update_notifications ??
    settings.notify_application_updates ??
    settings.notifyApplicationUpdates ??
    settings.applicationUpdateNotifications,
  notify_job_applications:
    settings.notify_job_applications ??
    settings.notifyJobApplications ??
    settings.job_application_notifications ??
    settings.jobApplicationNotifications,
  notify_application_updates:
    settings.notify_application_updates ??
    settings.notifyApplicationUpdates ??
    settings.application_update_notifications ??
    settings.applicationUpdateNotifications,
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
  },

  checkUsernameAvailability: async (username: string): Promise<{ available: boolean; username: string; reason?: string }> => {
    const response = await api.get(`/users/username/availability/${encodeURIComponent(username)}`);
    return extractData<{ available: boolean; username: string; reason?: string }>(response);
  },

  getUserByUsername: async (username: string): Promise<User> => {
    const response = await api.get(`/users/username/${encodeURIComponent(username)}`);
    return mapUser(extractData<User>(response));
  },

  logProfileView: async (userId: string): Promise<void> => {
    await api.post(`/users/${userId}/views`);
  },

  getProfileViewers: async (userId: string, limit = 8): Promise<{ viewers: any[] }> => {
    const response = await api.get(`/users/${userId}/viewers`, { params: { limit, days: 7 } });
    const data = extractData<{ viewers: any[] }>(response);
    const viewers = Array.isArray(data.viewers)
      ? data.viewers.map((viewer) => ({
          ...viewer,
          avatar: viewer?.avatar ? resolveAssetUrl(String(viewer.avatar)) : viewer?.avatar
        }))
      : [];
    return { viewers };
  },

  getProfilesViewed: async (userId: string, limit = 8): Promise<{ viewed: any[] }> => {
    const response = await api.get(`/users/${userId}/viewing`, { params: { limit, days: 7 } });
    const data = extractData<{ viewed: any[] }>(response);
    const viewed = Array.isArray(data.viewed)
      ? data.viewed.map((entry) => ({
          ...entry,
          avatar: entry?.avatar ? resolveAssetUrl(String(entry.avatar)) : entry?.avatar
        }))
      : [];
    return { viewed };
  },

  getMonetizationStatus: async (): Promise<any> => {
    const response = await api.get('/monetization/me');
    return extractData<any>(response);
  },

  applyMonetization: async (payload: {
    fullName: string;
    tinNumber: string;
    country: string;
    age: number;
    email: string;
    phone: string;
  }): Promise<any> => {
    const response = await api.post('/monetization/apply', payload);
    return extractData<any>(response);
  },

  getMonetizationApplications: async (limit = 20): Promise<any[]> => {
    const response = await api.get('/monetization/applications', { params: { limit } });
    const data = extractData<any>(response);
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : [];
  }
};
