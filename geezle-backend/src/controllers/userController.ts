import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import realtime from '../utils/realtime';

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T) =>
  res.json({ success: true, data, timestamp: nowIso() });

const fail = (res: Response, status: number, message: string, code = 'ERR_USER') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();
const normalizeUsername = (value?: string) => (value || '').toString().trim().toLowerCase();
const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'root',
  'system',
  'settings',
  'billing',
  'payments',
  'security',
  'auth',
  'login',
  'signup',
  'register',
  'me',
  'profile',
  'dashboard'
]);

const validateUsername = (username: string) => {
  if (!username) return { ok: false, reason: 'Username is required' };
  if (!USERNAME_REGEX.test(username)) {
    return { ok: false, reason: 'Username must be 3-30 characters, lowercase letters, numbers, dot, dash, or underscore.' };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, reason: 'That username is reserved' };
  }
  return { ok: true, reason: '' };
};

const canAccessUser = (req: Request, userId: string) => {
  const user = req.user as { id?: string; email?: string; role?: string } | undefined;
  if (!user?.id) return false;
  const isDevUser = (user.id === 'dev-user-id-123' || user.email === 'dev@example.com') && process.env.NODE_ENV !== 'production';
  if (isDevUser) return true;
  if (user.id === userId) return true;
  const role = normalizeRole(user.role);
  return role.includes('admin');
};

const formatBirthMonthDay = (value?: Date | string | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
};

const toProfileResponse = (profile: any, options?: { includePrivateDob?: boolean }) => ({
  user_id: profile.userId,
  title: profile.title || '',
  bio: profile.bio || '',
  location: profile.location || '',
  gender: profile.gender || '',
  date_of_birth:
    options?.includePrivateDob && profile.dateOfBirth
      ? new Date(profile.dateOfBirth).toISOString().slice(0, 10)
      : null,
  birth_month_day:
    profile.showBirthMonthDayPublic === false
      ? ''
      : formatBirthMonthDay(profile.dateOfBirth),
  show_birth_month_day_public: profile.showBirthMonthDayPublic !== false,
  languages: Array.isArray(profile.languages) ? profile.languages : [],
  skills: Array.isArray(profile.skills) ? profile.skills : [],
  hourly_rate: Number(profile.hourlyRate || 0),
  portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : [],
  experience: Array.isArray(profile.experienceItems) ? profile.experienceItems : [],
  education: Array.isArray(profile.educationItems) ? profile.educationItems : [],
  certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
  intro_video_url: profile.introVideoUrl || '',
  cover_photo_url: profile.coverPhotoUrl || '',
  rating: Number(profile.rating || 0),
  completed_jobs: Number(profile.completedJobs || 0),
  response_rate: Number(profile.responseRate || 0),
  response_time: profile.responseTime || null
});

const toSettingsResponse = (settings: any) => ({
  email_notifications: Boolean(settings.emailNotifications),
  in_app_notifications: Boolean(settings.inAppNotifications),
  message_requests_notifications: Boolean(settings.messageRequestsNotifications ?? true),
  allow_in_mail: Boolean(settings.allowInMail ?? true),
  mention_notifications: Boolean(settings.notifyMentions ?? true),
  followed_post_notifications: Boolean(settings.notifyFollowedPosts ?? true),
  follow_notifications: Boolean(settings.notifyFollowedYou ?? true),
  comment_notifications: Boolean(settings.notifyCommentsOnPosts ?? true),
  reaction_notifications: Boolean(settings.notifyReactionsOnPosts ?? true),
  repost_notifications: Boolean(settings.notifyReposts ?? true),
  job_application_notifications: Boolean(settings.notifyJobApplications ?? true),
  application_update_notifications: Boolean(settings.notifyApplicationUpdates ?? true),
  notify_mentions: Boolean(settings.notifyMentions ?? true),
  notify_followed_posts: Boolean(settings.notifyFollowedPosts ?? true),
  notify_followed_you: Boolean(settings.notifyFollowedYou ?? true),
  notify_comments_on_posts: Boolean(settings.notifyCommentsOnPosts ?? true),
  notify_reactions_on_posts: Boolean(settings.notifyReactionsOnPosts ?? true),
  notify_reposts: Boolean(settings.notifyReposts ?? true),
  notify_job_applications: Boolean(settings.notifyJobApplications ?? true),
  notify_application_updates: Boolean(settings.notifyApplicationUpdates ?? true),
  marketing_emails: Boolean(settings.marketingEmails),
  two_factor_enabled: Boolean(settings.twoFactorEnabled),
  login_alerts: Boolean(settings.loginAlerts),
  jobApplicationNotifications: Boolean(settings.notifyJobApplications ?? true),
  applicationUpdateNotifications: Boolean(settings.notifyApplicationUpdates ?? true),
  notifyJobApplications: Boolean(settings.notifyJobApplications ?? true),
  notifyApplicationUpdates: Boolean(settings.notifyApplicationUpdates ?? true),
  messageRequestsNotifications: Boolean(settings.messageRequestsNotifications ?? true),
  allowInMail: Boolean(settings.allowInMail ?? true)
});

const normalizeArray = (value: any) => {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  return [];
};

const pick = (body: any, camel: string, snake: string) => {
  if (body && body[camel] !== undefined) return body[camel];
  if (body && body[snake] !== undefined) return body[snake];
  return undefined;
};

const parseLimit = (value: any, fallback = 10) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

const parseDays = (value: any, fallback = 7) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
};

const getOrCreateProfile = async (userId: string) => {
  return prisma.profile.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      title: '',
      bio: '',
      location: '',
      skills: [],
      hourlyRate: 0,
      languages: [],
      introVideoUrl: '',
      coverPhotoUrl: '',
      portfolio: [],
      experienceItems: [],
      educationItems: [],
      certifications: []
    }
  });
};

const getOrCreateSettings = async (userId: string) => {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      emailNotifications: true,
      inAppNotifications: true,
      messageRequestsNotifications: true,
      allowInMail: true,
      notifyMentions: true,
      notifyFollowedPosts: true,
      notifyFollowedYou: true,
      notifyCommentsOnPosts: true,
      notifyReactionsOnPosts: true,
      notifyReposts: true,
      notifyJobApplications: true,
      notifyApplicationUpdates: true,
      marketingEmails: true,
      twoFactorEnabled: false,
      loginAlerts: true
    }
  });
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    const profile = await getOrCreateProfile(userId);
    return ok(res, toProfileResponse(profile, { includePrivateDob: canAccessUser(req, userId) }));
  } catch (error: any) {
    console.error('getUserProfile error:', error);
    return fail(res, 500, error?.message || 'Failed to load profile', 'ERR_INTERNAL');
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    await getOrCreateProfile(userId);

    const data: any = {};

    const title = pick(req.body, 'title', 'title');
    const bio = pick(req.body, 'bio', 'bio');
    const location = pick(req.body, 'location', 'location');
    const hourlyRate = pick(req.body, 'hourlyRate', 'hourly_rate');
    const introVideoUrl = pick(req.body, 'introVideoUrl', 'intro_video_url');
    const coverPhotoUrl = pick(req.body, 'coverPhotoUrl', 'cover_photo_url');
    const skills = pick(req.body, 'skills', 'skills');
    const languages = pick(req.body, 'languages', 'languages');
    const gender = pick(req.body, 'gender', 'gender');
    const dateOfBirth = pick(req.body, 'dateOfBirth', 'date_of_birth');
    const showBirthMonthDayPublic = pick(req.body, 'showBirthMonthDayPublic', 'show_birth_month_day_public');
    const portfolio = pick(req.body, 'portfolio', 'portfolio');
    const experience = pick(req.body, 'experience', 'experience');
    const education = pick(req.body, 'education', 'education');
    const certifications = pick(req.body, 'certifications', 'certifications');

    if (title !== undefined) data.title = title || '';
    if (bio !== undefined) data.bio = bio || '';
    if (location !== undefined) data.location = location || '';
    if (hourlyRate !== undefined) data.hourlyRate = Number(hourlyRate || 0);
    if (introVideoUrl !== undefined) data.introVideoUrl = introVideoUrl || '';
    if (coverPhotoUrl !== undefined) data.coverPhotoUrl = coverPhotoUrl || '';
    if (skills !== undefined) data.skills = normalizeArray(skills);
    if (languages !== undefined) data.languages = normalizeArray(languages);
    if (gender !== undefined) data.gender = (gender || '').toString().trim() || null;
    if (dateOfBirth !== undefined) {
      const parsed = dateOfBirth ? new Date(String(dateOfBirth)) : null;
      data.dateOfBirth = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
    if (showBirthMonthDayPublic !== undefined) data.showBirthMonthDayPublic = Boolean(showBirthMonthDayPublic);
    if (portfolio !== undefined) data.portfolio = normalizeArray(portfolio);
    if (experience !== undefined) data.experienceItems = normalizeArray(experience);
    if (education !== undefined) data.educationItems = normalizeArray(education);
    if (certifications !== undefined) data.certifications = normalizeArray(certifications);

    const updated = await prisma.profile.update({
      where: { userId },
      data
    });

    return ok(res, toProfileResponse(updated, { includePrivateDob: canAccessUser(req, userId) }));
  } catch (error: any) {
    console.error('updateUserProfile error:', error);
    return fail(res, 500, error?.message || 'Failed to update profile', 'ERR_INTERNAL');
  }
};

export const getUserSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    const settings = await getOrCreateSettings(userId);
    return ok(res, toSettingsResponse(settings));
  } catch (error: any) {
    console.error('getUserSettings error:', error);
    return fail(res, 500, error?.message || 'Failed to load settings', 'ERR_INTERNAL');
  }
};

export const updateUserSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    await getOrCreateSettings(userId);

    const data: any = {};
    const emailNotifications = pick(req.body, 'emailNotifications', 'email_notifications');
    const inAppNotifications = pick(req.body, 'inAppNotifications', 'in_app_notifications');
    const mentionNotifications =
      pick(req.body, 'mentionNotifications', 'mention_notifications') ??
      pick(req.body, 'notifyMentions', 'notify_mentions');
    const messageRequestsNotifications =
      pick(req.body, 'messageRequestsNotifications', 'message_requests_notifications');
    const allowInMail = pick(req.body, 'allowInMail', 'allow_in_mail');
    const followedPostNotifications =
      pick(req.body, 'followedPostNotifications', 'followed_post_notifications') ??
      pick(req.body, 'notifyFollowedPosts', 'notify_followed_posts');
    const followNotifications =
      pick(req.body, 'followNotifications', 'follow_notifications') ??
      pick(req.body, 'notifyFollowedYou', 'notify_followed_you');
    const commentNotifications =
      pick(req.body, 'commentNotifications', 'comment_notifications') ??
      pick(req.body, 'notifyCommentsOnPosts', 'notify_comments_on_posts');
    const reactionNotifications =
      pick(req.body, 'reactionNotifications', 'reaction_notifications') ??
      pick(req.body, 'notifyReactionsOnPosts', 'notify_reactions_on_posts');
    const repostNotifications =
      pick(req.body, 'repostNotifications', 'repost_notifications') ??
      pick(req.body, 'notifyReposts', 'notify_reposts');
    const jobApplicationNotifications =
      pick(req.body, 'jobApplicationNotifications', 'job_application_notifications') ??
      pick(req.body, 'notifyJobApplications', 'notify_job_applications');
    const applicationUpdateNotifications =
      pick(req.body, 'applicationUpdateNotifications', 'application_update_notifications') ??
      pick(req.body, 'notifyApplicationUpdates', 'notify_application_updates');
    const marketingEmails = pick(req.body, 'marketingEmails', 'marketing_emails');
    const twoFactorEnabled = pick(req.body, 'twoFactorEnabled', 'two_factor_enabled');
    const loginAlerts = pick(req.body, 'loginAlerts', 'login_alerts');

    if (emailNotifications !== undefined) data.emailNotifications = Boolean(emailNotifications);
    if (inAppNotifications !== undefined) data.inAppNotifications = Boolean(inAppNotifications);
    if (messageRequestsNotifications !== undefined) data.messageRequestsNotifications = Boolean(messageRequestsNotifications);
    if (allowInMail !== undefined) data.allowInMail = Boolean(allowInMail);
    if (mentionNotifications !== undefined) data.notifyMentions = Boolean(mentionNotifications);
    if (followedPostNotifications !== undefined) data.notifyFollowedPosts = Boolean(followedPostNotifications);
    if (followNotifications !== undefined) data.notifyFollowedYou = Boolean(followNotifications);
    if (commentNotifications !== undefined) data.notifyCommentsOnPosts = Boolean(commentNotifications);
    if (reactionNotifications !== undefined) data.notifyReactionsOnPosts = Boolean(reactionNotifications);
    if (repostNotifications !== undefined) data.notifyReposts = Boolean(repostNotifications);
    if (jobApplicationNotifications !== undefined) data.notifyJobApplications = Boolean(jobApplicationNotifications);
    if (applicationUpdateNotifications !== undefined) data.notifyApplicationUpdates = Boolean(applicationUpdateNotifications);
    if (marketingEmails !== undefined) data.marketingEmails = Boolean(marketingEmails);
    if (twoFactorEnabled !== undefined) data.twoFactorEnabled = Boolean(twoFactorEnabled);
    if (loginAlerts !== undefined) data.loginAlerts = Boolean(loginAlerts);

    const updated = await prisma.userSettings.update({
      where: { userId },
      data
    });

    return ok(res, toSettingsResponse(updated));
  } catch (error: any) {
    console.error('updateUserSettings error:', error);
    return fail(res, 500, error?.message || 'Failed to update settings', 'ERR_INTERNAL');
  }
};

export const changeUserPassword = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return fail(res, 400, 'oldPassword and newPassword are required', 'ERR_BAD_REQUEST');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      return fail(res, 400, 'Password update not available', 'ERR_BAD_REQUEST');
    }

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) return fail(res, 400, 'Current password is incorrect', 'ERR_INVALID_PASSWORD');

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashed } });

    return ok(res, { updated: true });
  } catch (error: any) {
    console.error('changeUserPassword error:', error);
    return fail(res, 500, error?.message || 'Failed to change password', 'ERR_INTERNAL');
  }
};

export const updateUserBasics = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    const data: any = {};
    if (req.body?.name !== undefined) data.name = req.body.name;
    if (req.body?.email !== undefined) data.email = req.body.email;
    if (req.body?.avatar !== undefined) data.avatar = req.body.avatar;
    if (req.body?.profilePhotoFileId !== undefined) data.profilePhotoFileId = req.body.profilePhotoFileId;
    if (req.body?.username !== undefined) {
      const normalized = normalizeUsername(req.body.username);
      if (!normalized) {
        data.username = null;
      } else {
        const validation = validateUsername(normalized);
        if (!validation.ok) return fail(res, 400, validation.reason, 'ERR_USERNAME_INVALID');
        const existing = await prisma.user.findFirst({
          where: { username: normalized, NOT: { id: userId } }
        });
        if (existing) return fail(res, 409, 'Username not available', 'ERR_USERNAME_TAKEN');
        data.username = normalized;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data
    });

    return ok(res, {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      username: updated.username || '',
      avatar: updated.avatar,
      profile_photo_file_id: updated.profilePhotoFileId || null
    });
  } catch (error: any) {
    console.error('updateUserBasics error:', error);
    return fail(res, 500, error?.message || 'Failed to update user', 'ERR_INTERNAL');
  }
};

export const getUserBasics = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        avatar: true,
        profilePhotoFileId: true,
        role: true,
        country: true,
        createdAt: true,
        kycStatus: true,
        freelancerPlanId: true,
        freelancerPlanName: true,
        freelancerPlanInterval: true,
        freelancerPlanPrice: true,
        freelancerPlanCurrency: true,
        freelancerPlanActive: true,
        freelancerPlanPurchasedAt: true,
        freelancerPlanExpiresAt: true,
        employerPlanId: true,
        employerPlanName: true,
        employerPlanInterval: true,
        employerPlanPrice: true,
        employerPlanCurrency: true,
        employerPlanActive: true,
        employerPlanPurchasedAt: true,
        employerPlanExpiresAt: true
      }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    const pro = resolveUserProStatus(user);
    return ok(res, {
      id: user.id,
      name: user.name || '',
      email: user.email,
      username: user.username || '',
      avatar: user.avatar || '',
      profile_photo_file_id: user.profilePhotoFileId || null,
      role: user.role,
      country: user.country || '',
      created_at: user.createdAt.toISOString(),
      kyc_status: user.kycStatus ? user.kycStatus.toString().toLowerCase() : undefined,
      kycStatus: user.kycStatus ? user.kycStatus.toString().toLowerCase() : undefined,
      is_pro_freelancer: pro.freelancerIsPro,
      isProFreelancer: pro.freelancerIsPro,
      is_pro_employer: pro.employerIsPro,
      isProEmployer: pro.employerIsPro,
      freelancer_plan_id: user.freelancerPlanId ?? null,
      freelancerPlanId: user.freelancerPlanId ?? null,
      freelancer_plan_name: user.freelancerPlanName ?? null,
      freelancerPlanName: user.freelancerPlanName ?? null,
      freelancer_plan_interval: user.freelancerPlanInterval ?? null,
      freelancerPlanInterval: user.freelancerPlanInterval ?? null,
      freelancer_plan_price: user.freelancerPlanPrice ?? null,
      freelancerPlanPrice: user.freelancerPlanPrice ?? null,
      freelancer_plan_currency: user.freelancerPlanCurrency ?? null,
      freelancerPlanCurrency: user.freelancerPlanCurrency ?? null,
      freelancer_plan_active: Boolean(user.freelancerPlanActive),
      freelancerPlanActive: Boolean(user.freelancerPlanActive),
      freelancer_plan_purchased_at: user.freelancerPlanPurchasedAt ? user.freelancerPlanPurchasedAt.toISOString() : null,
      freelancerPlanPurchasedAt: user.freelancerPlanPurchasedAt ? user.freelancerPlanPurchasedAt.toISOString() : null,
      freelancer_plan_expires_at: user.freelancerPlanExpiresAt ? user.freelancerPlanExpiresAt.toISOString() : null,
      freelancerPlanExpiresAt: user.freelancerPlanExpiresAt ? user.freelancerPlanExpiresAt.toISOString() : null,
      employer_plan_id: user.employerPlanId ?? null,
      employerPlanId: user.employerPlanId ?? null,
      employer_plan_name: user.employerPlanName ?? null,
      employerPlanName: user.employerPlanName ?? null,
      employer_plan_interval: user.employerPlanInterval ?? null,
      employerPlanInterval: user.employerPlanInterval ?? null,
      employer_plan_price: user.employerPlanPrice ?? null,
      employerPlanPrice: user.employerPlanPrice ?? null,
      employer_plan_currency: user.employerPlanCurrency ?? null,
      employerPlanCurrency: user.employerPlanCurrency ?? null,
      employer_plan_active: Boolean(user.employerPlanActive),
      employerPlanActive: Boolean(user.employerPlanActive),
      employer_plan_purchased_at: user.employerPlanPurchasedAt ? user.employerPlanPurchasedAt.toISOString() : null,
      employerPlanPurchasedAt: user.employerPlanPurchasedAt ? user.employerPlanPurchasedAt.toISOString() : null,
      employer_plan_expires_at: user.employerPlanExpiresAt ? user.employerPlanExpiresAt.toISOString() : null,
      employerPlanExpiresAt: user.employerPlanExpiresAt ? user.employerPlanExpiresAt.toISOString() : null
    });
  } catch (error: any) {
    console.error('getUserBasics error:', error);
    return fail(res, 500, error?.message || 'Failed to load user', 'ERR_INTERNAL');
  }
};

export const checkUsernameAvailability = async (req: Request, res: Response) => {
  try {
    const raw = req.params.username;
    const normalized = normalizeUsername(raw);
    const validation = validateUsername(normalized);
    if (!validation.ok) {
      return ok(res, { available: false, username: normalized, reason: validation.reason });
    }

    const existing = await prisma.user.findFirst({ where: { username: normalized } });
    const requesterId = (req.user as { id?: string } | undefined)?.id;
    const available = !existing || (requesterId && existing.id === requesterId);
    return ok(res, { available, username: normalized, reason: available ? 'available' : 'taken' });
  } catch (error: any) {
    console.error('checkUsernameAvailability error:', error);
    return fail(res, 500, error?.message || 'Failed to check username', 'ERR_INTERNAL');
  }
};

export const getUserByUsername = async (req: Request, res: Response) => {
  try {
    const raw = req.params.username;
    const normalized = normalizeUsername(raw);
    const validation = validateUsername(normalized);
    if (!validation.ok) return fail(res, 400, validation.reason, 'ERR_USERNAME_INVALID');

    const user = await prisma.user.findUnique({
      where: { username: normalized },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        avatar: true,
        profilePhotoFileId: true,
        role: true,
        country: true,
        createdAt: true,
        kycStatus: true,
        freelancerPlanId: true,
        freelancerPlanName: true,
        freelancerPlanInterval: true,
        freelancerPlanPrice: true,
        freelancerPlanCurrency: true,
        freelancerPlanActive: true,
        freelancerPlanPurchasedAt: true,
        freelancerPlanExpiresAt: true,
        employerPlanId: true,
        employerPlanName: true,
        employerPlanInterval: true,
        employerPlanPrice: true,
        employerPlanCurrency: true,
        employerPlanActive: true,
        employerPlanPurchasedAt: true,
        employerPlanExpiresAt: true
      }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    const pro = resolveUserProStatus(user);
    return ok(res, {
      id: user.id,
      name: user.name || '',
      email: user.email,
      username: user.username || '',
      avatar: user.avatar || '',
      profile_photo_file_id: user.profilePhotoFileId || null,
      role: user.role,
      country: user.country || '',
      created_at: user.createdAt.toISOString(),
      kyc_status: user.kycStatus ? user.kycStatus.toString().toLowerCase() : undefined,
      kycStatus: user.kycStatus ? user.kycStatus.toString().toLowerCase() : undefined,
      is_pro_freelancer: pro.freelancerIsPro,
      isProFreelancer: pro.freelancerIsPro,
      is_pro_employer: pro.employerIsPro,
      isProEmployer: pro.employerIsPro,
      freelancer_plan_id: user.freelancerPlanId ?? null,
      freelancerPlanId: user.freelancerPlanId ?? null,
      freelancer_plan_name: user.freelancerPlanName ?? null,
      freelancerPlanName: user.freelancerPlanName ?? null,
      freelancer_plan_interval: user.freelancerPlanInterval ?? null,
      freelancerPlanInterval: user.freelancerPlanInterval ?? null,
      freelancer_plan_price: user.freelancerPlanPrice ?? null,
      freelancerPlanPrice: user.freelancerPlanPrice ?? null,
      freelancer_plan_currency: user.freelancerPlanCurrency ?? null,
      freelancerPlanCurrency: user.freelancerPlanCurrency ?? null,
      freelancer_plan_active: Boolean(user.freelancerPlanActive),
      freelancerPlanActive: Boolean(user.freelancerPlanActive),
      freelancer_plan_purchased_at: user.freelancerPlanPurchasedAt ? user.freelancerPlanPurchasedAt.toISOString() : null,
      freelancerPlanPurchasedAt: user.freelancerPlanPurchasedAt ? user.freelancerPlanPurchasedAt.toISOString() : null,
      freelancer_plan_expires_at: user.freelancerPlanExpiresAt ? user.freelancerPlanExpiresAt.toISOString() : null,
      freelancerPlanExpiresAt: user.freelancerPlanExpiresAt ? user.freelancerPlanExpiresAt.toISOString() : null,
      employer_plan_id: user.employerPlanId ?? null,
      employerPlanId: user.employerPlanId ?? null,
      employer_plan_name: user.employerPlanName ?? null,
      employerPlanName: user.employerPlanName ?? null,
      employer_plan_interval: user.employerPlanInterval ?? null,
      employerPlanInterval: user.employerPlanInterval ?? null,
      employer_plan_price: user.employerPlanPrice ?? null,
      employerPlanPrice: user.employerPlanPrice ?? null,
      employer_plan_currency: user.employerPlanCurrency ?? null,
      employerPlanCurrency: user.employerPlanCurrency ?? null,
      employer_plan_active: Boolean(user.employerPlanActive),
      employerPlanActive: Boolean(user.employerPlanActive),
      employer_plan_purchased_at: user.employerPlanPurchasedAt ? user.employerPlanPurchasedAt.toISOString() : null,
      employerPlanPurchasedAt: user.employerPlanPurchasedAt ? user.employerPlanPurchasedAt.toISOString() : null,
      employer_plan_expires_at: user.employerPlanExpiresAt ? user.employerPlanExpiresAt.toISOString() : null,
      employerPlanExpiresAt: user.employerPlanExpiresAt ? user.employerPlanExpiresAt.toISOString() : null
    });
  } catch (error: any) {
    console.error('getUserByUsername error:', error);
    return fail(res, 500, error?.message || 'Failed to load user', 'ERR_INTERNAL');
  }
};

export const logProfileView = async (req: Request, res: Response) => {
  try {
    const viewedUserId = req.params.userId;
    if (!viewedUserId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    const viewerId = (req.user as { id?: string } | undefined)?.id || null;

    if (viewerId && viewerId === viewedUserId) {
      return ok(res, { logged: false, reason: 'self' });
    }

    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24);
    if (viewerId) {
      const existing = await prisma.profileView.findFirst({
        where: { viewerId, viewedUserId, createdAt: { gte: cutoff } }
      });
      if (existing) return ok(res, { logged: false, reason: 'recent' });
    }

    const createdView = await prisma.profileView.create({
      data: {
        viewerId,
        viewedUserId
      }
    });

    const payload = {
      viewerId,
      viewedUserId,
      createdAt: createdView.createdAt.toISOString()
    };
    try {
      realtime.emitToUser(viewedUserId, 'community:profile_view_logged', payload);
    } catch {}
    if (viewerId) {
      try {
        realtime.emitToUser(viewerId, 'community:profile_view_logged', payload);
      } catch {}
    }

    return ok(res, { logged: true });
  } catch (error: any) {
    console.error('logProfileView error:', error);
    return fail(res, 500, error?.message || 'Failed to log profile view', 'ERR_INTERNAL');
  }
};

export const listProfileViewers = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    const limit = parseLimit(req.query.limit, 8);
    const days = parseDays(req.query.days, 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const views = await prisma.profileView.findMany({
      where: { viewedUserId: userId, viewerId: { not: null }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        viewer: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            role: true,
            profile: { select: { title: true } }
          }
        }
      }
    });

    const viewers = views
      .filter((view) => view.viewer)
      .map((view) => ({
        id: view.viewer?.id,
        name: view.viewer?.name || 'Member',
        username: view.viewer?.username || '',
        avatar: view.viewer?.avatar || '',
        role: view.viewer?.role,
        title: view.viewer?.profile?.title || '',
        viewed_at: view.createdAt.toISOString()
      }));

    return ok(res, { viewers });
  } catch (error: any) {
    console.error('listProfileViewers error:', error);
    return fail(res, 500, error?.message || 'Failed to load profile viewers', 'ERR_INTERNAL');
  }
};

export const listProfilesViewed = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!canAccessUser(req, userId)) return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');

    const limit = parseLimit(req.query.limit, 8);
    const days = parseDays(req.query.days, 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const views = await prisma.profileView.findMany({
      where: { viewerId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        viewedUser: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            role: true,
            profile: { select: { title: true } }
          }
        }
      }
    });

    const viewed = views.map((view) => ({
      id: view.viewedUser?.id,
      name: view.viewedUser?.name || 'Member',
      username: view.viewedUser?.username || '',
      avatar: view.viewedUser?.avatar || '',
      role: view.viewedUser?.role,
      title: view.viewedUser?.profile?.title || '',
      viewed_at: view.createdAt.toISOString()
    }));

    return ok(res, { viewed });
  } catch (error: any) {
    console.error('listProfilesViewed error:', error);
    return fail(res, 500, error?.message || 'Failed to load profile viewing history', 'ERR_INTERNAL');
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
  (req.params as any).userId = user.id;
  return getUserProfile(req, res);
};

export const updateMyProfile = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
  (req.params as any).userId = user.id;
  return updateUserProfile(req, res);
};

export const getMySettings = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
  (req.params as any).userId = user.id;
  return getUserSettings(req, res);
};

export const updateMySettings = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
  (req.params as any).userId = user.id;
  return updateUserSettings(req, res);
};
