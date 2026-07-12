import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import realtime from '../utils/realtime';
import { extractLocationMutation, toLocationResponse } from '../services/location/location.service';
import { computeUserTrustScore, getTrustScoreSettings } from '../services/trustScore.service';
import { serializeGig } from './gigs.controller';
import { getStorefrontSettings, isUserStorefrontEnabled } from '../services/storefront.service';
import { syncFileUsages } from '../utils/fileUsage';
import { FileVisibility } from '@prisma/client';

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

const extractFileIdFromMediaUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Bare storage id
  if (/^[a-z0-9_-]{12,}$/i.test(raw) && !raw.includes('/') && !raw.includes(':')) return raw;
  if (raw.toLowerCase().startsWith('disk:')) return raw;
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(raw, 'https://api.scrolith.com');
    const marker = '/api/files/content/';
    const idx = url.pathname.toLowerCase().indexOf(marker);
    if (idx >= 0) {
      const encoded = url.pathname.slice(idx + marker.length).split('/').filter(Boolean)[0] || '';
      return decodeURIComponent(encoded).trim();
    }
  } catch {
    // ignore parse errors
  }
  return '';
};

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

const toProfileResponse = (
  profile: any,
  options?: { includePrivateDob?: boolean; professionalIdentity?: any | null; userCountry?: string | null }
) => ({
  user_id: profile.userId,
  title: profile.title || '',
  bio: profile.bio || '',
  location: profile.location || '',
  ...toLocationResponse({
    location: profile.location || '',
    formattedAddress: profile.formattedAddress || profile.location || null,
    country: profile.country || options?.userCountry || null,
    countryCode: profile.countryCode || null,
    state: profile.state || null,
    city: profile.city || null,
    region: profile.region || null,
    postalCode: profile.postalCode || null,
    latitude: profile.latitude ?? null,
    longitude: profile.longitude ?? null,
    placeId: profile.placeId || null,
    locationSource: profile.locationSource || null
  }),
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
  response_time: profile.responseTime || null,
  professional_identity: options?.professionalIdentity ?? null,
  professionalIdentity: options?.professionalIdentity ?? null
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

const isMissingPrismaTableError = (error: unknown) => {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'P2021' || code === 'P2022';
};

const withPrismaFallback = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await promise;
  } catch (error) {
    if (isMissingPrismaTableError(error)) {
      return fallback;
    }
    throw error;
  }
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildProfessionalIdentity = async (profile: any, user: any) => {
  const userId = String(profile?.userId || user?.id || '').trim();
  if (!userId) return null;

  const certifications = normalizeArray(profile?.certifications);
  const verifiedCertificationCount = certifications.filter((item: any) => Boolean(item?.isVerified || item?.is_verified)).length;
  const pro = resolveUserProStatus(user || {});
  const kycStatus = String(user?.kycStatus || '').toLowerCase();
  const isVerified = Boolean(user?.isVerified || kycStatus === 'verified' || kycStatus === 'approved');

  const [reviewAggregate, featuredMemberships, membershipCount, proofCount, verifiedProofCount] = await Promise.all([
    withPrismaFallback(
      prisma.review.aggregate({
        where: {
          subjectId: userId,
          status: 'PUBLISHED'
        },
        _avg: { rating: true },
        _count: { id: true }
      }),
      { _avg: { rating: 0 }, _count: { id: 0 } } as any
    ),
    withPrismaFallback(
      prisma.clubMembership.findMany({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        take: 3,
        include: {
          club: {
            select: {
              id: true,
              name: true,
              visibility: true,
              memberCount: true,
              coverImage: true
            }
          }
        }
      }),
      [] as any[]
    ),
    withPrismaFallback(prisma.clubMembership.count({ where: { userId } }), 0),
    withPrismaFallback(prisma.portfolioProof.count({ where: { userId } }), 0),
    withPrismaFallback(prisma.portfolioProof.count({ where: { userId, verifiedAt: { not: null } } }), 0)
  ]);

  const reviewCount = toFiniteNumber(reviewAggregate?._count?.id, 0);
  const averageRating = toFiniteNumber(reviewAggregate?._avg?.rating, Number(profile?.rating || 0));
  const completedJobs = toFiniteNumber(profile?.completedJobs, 0);
  const responseRate = toFiniteNumber(profile?.responseRate, 0);
  const responseTimeHours = profile?.responseTime ?? null;
  const topSkills = normalizeArray(profile?.skills)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  const featuredClubs = featuredMemberships
    .map((membership) => {
      const club = membership?.club;
      if (!club?.id) return null;
      return {
        id: club.id,
        name: club.name || 'Community club',
        visibility: String(club.visibility || 'PUBLIC').toLowerCase() === 'private' ? 'private' : 'public',
        memberCount: toFiniteNumber(club.memberCount, 0),
        member_count: toFiniteNumber(club.memberCount, 0),
        coverImage: club.coverImage || '',
        cover_image: club.coverImage || '',
        joinedAt: membership.joinedAt ? new Date(membership.joinedAt).toISOString() : null,
        joined_at: membership.joinedAt ? new Date(membership.joinedAt).toISOString() : null
      };
    })
    .filter(Boolean);

  const badges = [
    isVerified ? 'Verified identity' : '',
    pro.freelancerIsPro ? 'Pro freelancer' : '',
    averageRating >= 4.8 && reviewCount >= 3 ? 'Top reviewed' : '',
    verifiedProofCount > 0 ? 'Proof of work' : '',
    membershipCount > 0 ? 'Community active' : ''
  ].filter(Boolean);

  const trustTier =
    averageRating >= 4.8 && completedJobs >= 10
      ? 'elite'
      : averageRating >= 4.5 || completedJobs >= 5 || isVerified
      ? 'established'
      : 'growing';

  return {
    isVerified,
    is_verified: isVerified,
    kycStatus,
    kyc_status: kycStatus,
    verificationStatus: isVerified ? 'verified' : kycStatus || 'pending',
    verification_status: isVerified ? 'verified' : kycStatus || 'pending',
    isProFreelancer: pro.freelancerIsPro,
    is_pro_freelancer: pro.freelancerIsPro,
    isProEmployer: pro.employerIsPro,
    is_pro_employer: pro.employerIsPro,
    trustTier,
    trust_tier: trustTier,
    reviewCount,
    review_count: reviewCount,
    averageRating,
    average_rating: averageRating,
    completedJobs,
    completed_jobs: completedJobs,
    responseRate,
    response_rate: responseRate,
    responseTimeHours,
    response_time_hours: responseTimeHours,
    certificationCount: certifications.length,
    certification_count: certifications.length,
    verifiedCertificationCount,
    verified_certification_count: verifiedCertificationCount,
    portfolioProofCount: proofCount,
    portfolio_proof_count: proofCount,
    verifiedPortfolioProofCount: verifiedProofCount,
    verified_portfolio_proof_count: verifiedProofCount,
    clubCount: membershipCount,
    club_count: membershipCount,
    featuredClubs,
    featured_clubs: featuredClubs,
    topSkills,
    top_skills: topSkills,
    badges
  };
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
      formattedAddress: '',
      country: '',
      countryCode: '',
      state: '',
      city: '',
      region: '',
      postalCode: '',
      latitude: null,
      longitude: null,
      placeId: null,
      locationSource: 'manual',
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

const buildUserStorefrontMerchantSummary = (params: {
  user: any;
  profile: any;
  professionalIdentity: any | null;
  trustScore: any | null;
  services: any[];
  featuredServices: any[];
}) => {
  const { user, profile, professionalIdentity, trustScore, services, featuredServices } = params;
  const prices = services
    .map((entry) => Number(entry?.price))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const priceFrom = prices.length ? Number(Math.min(...prices).toFixed(2)) : null;

  return {
    title: profile?.title || user?.name || 'Storefront',
    subtitle: profile?.bio ? String(profile.bio).trim().slice(0, 220) : '',
    location: profile?.location || null,
    category: services[0]?.category?.name || services[0]?.categoryId || null,
    currency: 'USD',
    priceFrom,
    price_from: priceFrom,
    serviceCount: services.length,
    service_count: services.length,
    featuredCount: featuredServices.length,
    featured_count: featuredServices.length,
    rating: toFiniteNumber(professionalIdentity?.averageRating ?? profile?.rating, 0),
    completedJobs: toFiniteNumber(professionalIdentity?.completedJobs ?? profile?.completedJobs, 0),
    completed_jobs: toFiniteNumber(professionalIdentity?.completedJobs ?? profile?.completedJobs, 0),
    responseRate: toFiniteNumber(professionalIdentity?.responseRate ?? profile?.responseRate, 0),
    response_rate: toFiniteNumber(professionalIdentity?.responseRate ?? profile?.responseRate, 0),
    responseTimeHours:
      professionalIdentity?.responseTimeHours ??
      profile?.responseTime ??
      null,
    response_time_hours:
      professionalIdentity?.responseTimeHours ??
      profile?.responseTime ??
      null,
    trustScore: trustScore?.overallScore ?? trustScore?.overall_score ?? null,
    trust_score: trustScore?.overallScore ?? trustScore?.overall_score ?? null,
    trustTier: trustScore?.trustTier ?? trustScore?.trust_tier ?? null,
    trust_tier: trustScore?.trustTier ?? trustScore?.trust_tier ?? null
  };
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    const profile = await getOrCreateProfile(userId);
    const professionalIdentity = await buildProfessionalIdentity(profile, user);
    return ok(
      res,
      toProfileResponse(profile, {
        includePrivateDob: canAccessUser(req, userId),
        professionalIdentity,
        userCountry: user.country || null
      })
    );
  } catch (error: any) {
    console.error('getUserProfile error:', error);
    return fail(res, 500, error?.message || 'Failed to load profile', 'ERR_INTERNAL');
  }
};

export const getUserTrustScore = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    const settings = await getTrustScoreSettings();
    if (!settings.enabled || !settings.showOnProfiles) {
      return ok(res, null);
    }

    const score = await computeUserTrustScore(userId, {
      user,
      profile: user.profile,
      settings
    });

    return ok(res, score);
  } catch (error: any) {
    console.error('getUserTrustScore error:', error);
    return fail(res, 500, error?.message || 'Failed to load trust score', 'ERR_INTERNAL');
  }
};

export const getUserStorefront = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_NOT_FOUND');

    const storefrontSettings = await getStorefrontSettings();
    const enabled = isUserStorefrontEnabled(storefrontSettings, user.role);
    const canManage = canAccessUser(req, userId);

    const services = enabled
      ? await prisma.gig.findMany({
          where: {
            userId,
            status: 'ACTIVE',
            adminStatus: 'APPROVED',
            isActive: true
          },
          orderBy: [
            { isFeatured: 'desc' },
            { isTopSelected: 'desc' },
            { isRecommended: 'desc' },
            { updatedAt: 'desc' }
          ],
          include: {
            category: true,
            user: {
              include: {
                profile: true
              }
            }
          }
        })
      : [];

    const catalogServices = services.slice(0, storefrontSettings.maxCatalogItems);
    const featuredPool = services.filter(
      (entry) => entry.isFeatured || entry.isTopSelected || entry.isRecommended
    );
    const featuredSource = featuredPool.length ? featuredPool : services;
    const featuredServices = featuredSource.slice(0, storefrontSettings.maxFeaturedItems);

    const trustSettings = await getTrustScoreSettings();
    const trustScore =
      enabled && trustSettings.enabled && storefrontSettings.modules.merchantSummary
        ? await computeUserTrustScore(userId, {
            user,
            profile: user.profile,
            settings: trustSettings
          })
        : null;
    const professionalIdentity = enabled
      ? await buildProfessionalIdentity(user.profile, user)
      : null;

    return ok(res, {
      userId,
      user_id: userId,
      enabled,
      canManage,
      can_manage: canManage,
      settings: storefrontSettings,
      merchantSummary:
        enabled && storefrontSettings.modules.merchantSummary
          ? buildUserStorefrontMerchantSummary({
              user,
              profile: user.profile,
              professionalIdentity,
              trustScore,
              services,
              featuredServices
            })
          : null,
      merchant_summary:
        enabled && storefrontSettings.modules.merchantSummary
          ? buildUserStorefrontMerchantSummary({
              user,
              profile: user.profile,
              professionalIdentity,
              trustScore,
              services,
              featuredServices
            })
          : null,
      featuredServices: enabled
        ? featuredServices.map((entry) => serializeGig(entry, trustSettings))
        : [],
      featured_services: enabled
        ? featuredServices.map((entry) => serializeGig(entry, trustSettings))
        : [],
      services: enabled
        ? catalogServices.map((entry) => serializeGig(entry, trustSettings))
        : []
    });
  } catch (error: any) {
    console.error('getUserStorefront error:', error);
    return fail(res, 500, error?.message || 'Failed to load storefront', 'ERR_INTERNAL');
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
    const locationInput = extractLocationMutation(req.body || {});

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
    if (locationInput.hasChanges) Object.assign(data, locationInput.data);

    const updated = await prisma.$transaction(async (tx) => {
      const profileRow = await tx.profile.update({
        where: { userId },
        data
      });

      if (locationInput.hasChanges && Object.prototype.hasOwnProperty.call(locationInput.data, 'country')) {
        await tx.user.update({
          where: { id: userId },
          data: { country: locationInput.data.country || null }
        });
      }

      return profileRow;
    });

    // Pin cover media so storage GC does not delete identity assets still referenced by Profile.
    if (coverPhotoUrl !== undefined) {
      const coverFileId = extractFileIdFromMediaUrl(String(updated.coverPhotoUrl || coverPhotoUrl || ''));
      try {
        await syncFileUsages(
          'profile_cover',
          userId,
          coverFileId ? [coverFileId] : [],
          'Profile Cover Photo'
        );
        if (coverFileId && !coverFileId.toLowerCase().startsWith('disk:')) {
          await prisma.file
            .updateMany({
              where: { id: coverFileId },
              data: { visibility: FileVisibility.PUBLIC }
            })
            .catch(() => undefined);
        }
      } catch (usageError) {
        console.warn('updateUserProfile cover file usage sync failed:', (usageError as any)?.message || usageError);
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const professionalIdentity = user ? await buildProfessionalIdentity(updated, user) : null;
    return ok(
      res,
      toProfileResponse(updated, {
        includePrivateDob: canAccessUser(req, userId),
        professionalIdentity,
        userCountry: user?.country || null
      })
    );
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
