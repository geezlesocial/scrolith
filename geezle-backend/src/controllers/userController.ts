import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prismaClient';

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T) =>
  res.json({ success: true, data, timestamp: nowIso() });

const fail = (res: Response, status: number, message: string, code = 'ERR_USER') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const canAccessUser = (req: Request, userId: string) => {
  const user = req.user as { id?: string; email?: string; role?: string } | undefined;
  if (!user?.id) return false;
  const isDevUser = (user.id === 'dev-user-id-123' || user.email === 'dev@example.com') && process.env.NODE_ENV !== 'production';
  if (isDevUser) return true;
  if (user.id === userId) return true;
  const role = normalizeRole(user.role);
  return role.includes('admin');
};

const toProfileResponse = (profile: any) => ({
  user_id: profile.userId,
  title: profile.title || '',
  bio: profile.bio || '',
  location: profile.location || '',
  languages: Array.isArray(profile.languages) ? profile.languages : [],
  skills: Array.isArray(profile.skills) ? profile.skills : [],
  hourly_rate: Number(profile.hourlyRate || 0),
  portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : [],
  experience: Array.isArray(profile.experienceItems) ? profile.experienceItems : [],
  education: Array.isArray(profile.educationItems) ? profile.educationItems : [],
  certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
  intro_video_url: profile.introVideoUrl || '',
  rating: Number(profile.rating || 0),
  completed_jobs: Number(profile.completedJobs || 0),
  response_rate: Number(profile.responseRate || 0),
  response_time: profile.responseTime || null
});

const toSettingsResponse = (settings: any) => ({
  email_notifications: Boolean(settings.emailNotifications),
  in_app_notifications: Boolean(settings.inAppNotifications),
  marketing_emails: Boolean(settings.marketingEmails),
  two_factor_enabled: Boolean(settings.twoFactorEnabled),
  login_alerts: Boolean(settings.loginAlerts)
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
    return ok(res, toProfileResponse(profile));
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
    const skills = pick(req.body, 'skills', 'skills');
    const languages = pick(req.body, 'languages', 'languages');
    const portfolio = pick(req.body, 'portfolio', 'portfolio');
    const experience = pick(req.body, 'experience', 'experience');
    const education = pick(req.body, 'education', 'education');
    const certifications = pick(req.body, 'certifications', 'certifications');

    if (title !== undefined) data.title = title || '';
    if (bio !== undefined) data.bio = bio || '';
    if (location !== undefined) data.location = location || '';
    if (hourlyRate !== undefined) data.hourlyRate = Number(hourlyRate || 0);
    if (introVideoUrl !== undefined) data.introVideoUrl = introVideoUrl || '';
    if (skills !== undefined) data.skills = normalizeArray(skills);
    if (languages !== undefined) data.languages = normalizeArray(languages);
    if (portfolio !== undefined) data.portfolio = normalizeArray(portfolio);
    if (experience !== undefined) data.experienceItems = normalizeArray(experience);
    if (education !== undefined) data.educationItems = normalizeArray(education);
    if (certifications !== undefined) data.certifications = normalizeArray(certifications);

    const updated = await prisma.profile.update({
      where: { userId },
      data
    });

    return ok(res, toProfileResponse(updated));
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
    const marketingEmails = pick(req.body, 'marketingEmails', 'marketing_emails');
    const twoFactorEnabled = pick(req.body, 'twoFactorEnabled', 'two_factor_enabled');
    const loginAlerts = pick(req.body, 'loginAlerts', 'login_alerts');

    if (emailNotifications !== undefined) data.emailNotifications = Boolean(emailNotifications);
    if (inAppNotifications !== undefined) data.inAppNotifications = Boolean(inAppNotifications);
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

    const updated = await prisma.user.update({
      where: { id: userId },
      data
    });

    return ok(res, {
      id: updated.id,
      name: updated.name,
      email: updated.email,
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
        avatar: true,
        profilePhotoFileId: true,
        role: true,
        country: true,
        createdAt: true
      }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    return ok(res, {
      id: user.id,
      name: user.name || '',
      email: user.email,
      avatar: user.avatar || '',
      profile_photo_file_id: user.profilePhotoFileId || null,
      role: user.role,
      country: user.country || '',
      created_at: user.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('getUserBasics error:', error);
    return fail(res, 500, error?.message || 'Failed to load user', 'ERR_INTERNAL');
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
