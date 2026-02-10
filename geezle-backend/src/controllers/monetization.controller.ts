import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { notifyUser } from '../utils/notify';

const MONETIZATION_SETTINGS_SCOPE = 'monetization_settings';
const DAY_MS = 24 * 60 * 60 * 1000;

type MonetizationSettings = {
  enabled: boolean;
  requirements: {
    minPosts: number;
    minFollowers: number;
    minAge: number;
    violationFreeDays: number;
    requireKycApproved: boolean;
  };
  review: {
    defaultReapplyCooldownDays: number;
    autoEnableOnApprove: boolean;
  };
};

const DEFAULT_MONETIZATION_SETTINGS: MonetizationSettings = {
  enabled: true,
  requirements: {
    minPosts: 30,
    minFollowers: 2000,
    minAge: 18,
    violationFreeDays: 30,
    requireKycApproved: true
  },
  review: {
    defaultReapplyCooldownDays: 30,
    autoEnableOnApprove: true
  }
};

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
};

const normalizeNumber = (value: unknown, fallback: number, min = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
};

const normalizeSettings = (value: unknown): MonetizationSettings => {
  const source = asObject(value);
  const req = asObject(source.requirements);
  const review = asObject(source.review);
  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_MONETIZATION_SETTINGS.enabled),
    requirements: {
      minPosts: normalizeNumber(req.minPosts, DEFAULT_MONETIZATION_SETTINGS.requirements.minPosts, 0),
      minFollowers: normalizeNumber(req.minFollowers, DEFAULT_MONETIZATION_SETTINGS.requirements.minFollowers, 0),
      minAge: normalizeNumber(req.minAge, DEFAULT_MONETIZATION_SETTINGS.requirements.minAge, 13),
      violationFreeDays: normalizeNumber(
        req.violationFreeDays,
        DEFAULT_MONETIZATION_SETTINGS.requirements.violationFreeDays,
        0
      ),
      requireKycApproved: normalizeBoolean(
        req.requireKycApproved,
        DEFAULT_MONETIZATION_SETTINGS.requirements.requireKycApproved
      )
    },
    review: {
      defaultReapplyCooldownDays: normalizeNumber(
        review.defaultReapplyCooldownDays,
        DEFAULT_MONETIZATION_SETTINGS.review.defaultReapplyCooldownDays,
        0
      ),
      autoEnableOnApprove: normalizeBoolean(
        review.autoEnableOnApprove,
        DEFAULT_MONETIZATION_SETTINGS.review.autoEnableOnApprove
      )
    }
  };
};

const loadMonetizationSettings = async (): Promise<MonetizationSettings> => {
  const existing = await prisma.appSetting.findUnique({ where: { scope: MONETIZATION_SETTINGS_SCOPE } });
  if (!existing) return DEFAULT_MONETIZATION_SETTINGS;
  return normalizeSettings(existing.data);
};

const saveMonetizationSettings = async (incoming: unknown): Promise<MonetizationSettings> => {
  const current = await loadMonetizationSettings();
  const source = asObject(incoming);
  const next = normalizeSettings({
    ...current,
    ...source,
    requirements: {
      ...current.requirements,
      ...asObject(source.requirements)
    },
    review: {
      ...current.review,
      ...asObject(source.review)
    }
  });
  await prisma.appSetting.upsert({
    where: { scope: MONETIZATION_SETTINGS_SCOPE },
    create: { scope: MONETIZATION_SETTINGS_SCOPE, data: next as any },
    update: { data: next as any }
  });
  return next;
};

const buildNotification = async (params: {
  recipientId: string;
  actorId?: string | null;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, any>;
}) => {
  const meta = {
    ...(params.metadata || {}),
    action_url: params.actionUrl || null,
    actionUrl: params.actionUrl || null
  };
  const created = await prisma.notification.create({
    data: {
      userId: params.recipientId,
      actorId: params.actorId || null,
      type: params.type,
      title: params.title,
      body: params.message,
      meta: meta as any,
      isRead: false
    }
  });
  notifyUser(params.recipientId, {
    id: created.id,
    type: created.type,
    title: created.title || 'Notification',
    body: created.body || '',
    action_url: params.actionUrl || undefined,
    meta,
    createdAt: created.createdAt.toISOString()
  });
  return created;
};

const mapApplication = (application: any) => {
  if (!application) return null;
  return {
    id: application.id,
    userId: application.userId,
    status: application.status,
    fullName: application.fullName,
    tinNumber: application.tinNumber,
    country: application.country,
    age: application.age,
    email: application.email,
    phone: application.phone,
    adminNote: application.adminNote || null,
    reviewedByAdminId: application.reviewedByAdminId || null,
    reviewedAt: application.reviewedAt || null,
    reapplyAllowedAt: application.reapplyAllowedAt || null,
    eligibilitySnapshot: application.eligibilitySnapshot || null,
    submittedAt: application.createdAt || null,
    createdAt: application.createdAt || null,
    updatedAt: application.updatedAt || null,
    user: application.user
      ? {
          id: application.user.id,
          name: application.user.name,
          username: application.user.username,
          email: application.user.email,
          avatar: application.user.avatar,
          kycStatus: application.user.kycStatus
        }
      : null,
    reviewedByAdmin: application.reviewedByAdmin
      ? {
          id: application.reviewedByAdmin.id,
          name: application.reviewedByAdmin.name,
          username: application.reviewedByAdmin.username,
          email: application.reviewedByAdmin.email
        }
      : null
  };
};

const computeEligibility = async (userId: string, settings: MonetizationSettings) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, kycStatus: true, isActive: true }
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const [postsCount, followersCount, lastViolation] = await Promise.all([
    prisma.communityPost.count({
      where: {
        authorId: userId,
        status: 'active'
      }
    }),
    prisma.userFollow.count({
      where: { followeeId: userId }
    }),
    prisma.accountViolation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, type: true, severity: true, reason: true }
    })
  ]);

  const kycApproved = String(user.kycStatus || '').toUpperCase() === 'APPROVED';
  const postsMet = postsCount >= settings.requirements.minPosts;
  const followersMet = followersCount >= settings.requirements.minFollowers;
  const kycMet = settings.requirements.requireKycApproved ? kycApproved : true;
  const now = Date.now();
  const lastViolationAt = lastViolation?.createdAt ? new Date(lastViolation.createdAt) : null;
  const daysSinceViolation = lastViolationAt ? Math.floor((now - lastViolationAt.getTime()) / DAY_MS) : null;
  const violationMet =
    !lastViolationAt || daysSinceViolation === null
      ? true
      : daysSinceViolation >= settings.requirements.violationFreeDays;
  const nextEligibleAt =
    lastViolationAt && !violationMet
      ? new Date(lastViolationAt.getTime() + settings.requirements.violationFreeDays * DAY_MS)
      : null;

  const isEligible =
    settings.enabled &&
    user.isActive !== false &&
    postsMet &&
    followersMet &&
    kycMet &&
    violationMet;

  return {
    isEligible,
    requirements: {
      posts: {
        current: postsCount,
        required: settings.requirements.minPosts,
        met: postsMet
      },
      followers: {
        current: followersCount,
        required: settings.requirements.minFollowers,
        met: followersMet
      },
      kyc: {
        status: String(user.kycStatus || 'PENDING'),
        required: settings.requirements.requireKycApproved ? 'APPROVED' : 'ANY',
        met: kycMet
      },
      violations: {
        lastViolationAt: lastViolationAt ? lastViolationAt.toISOString() : null,
        daysRequired: settings.requirements.violationFreeDays,
        daysSinceViolation,
        met: violationMet,
        nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null,
        latest: lastViolation
          ? {
              id: lastViolation.id,
              type: lastViolation.type || null,
              severity: lastViolation.severity || null,
              reason: lastViolation.reason || null
            }
          : null
      }
    }
  };
};

const emitStatusUpdate = async (userId: string) => {
  const profile = await prisma.monetizationProfile.findUnique({
    where: { userId },
    select: { isEnabled: true, enabledAt: true, disabledAt: true, disabledReason: true, updatedAt: true }
  });
  const payload = {
    userId,
    monetization: profile
      ? {
          isEnabled: Boolean(profile.isEnabled),
          enabledAt: profile.enabledAt ? profile.enabledAt.toISOString() : null,
          disabledAt: profile.disabledAt ? profile.disabledAt.toISOString() : null,
          disabledReason: profile.disabledReason || null,
          updatedAt: profile.updatedAt ? profile.updatedAt.toISOString() : null
        }
      : { isEnabled: false, enabledAt: null, disabledAt: null, disabledReason: null, updatedAt: null }
  };
  realtime.emitToUser(userId, 'monetization:status_updated', payload);
};

const getLatestApplication = async (userId: string) => {
  return prisma.monetizationApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const parseOptionalDate = (value: unknown): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const hasProvidedValue = (value: unknown) =>
  !(value === undefined || value === null || String(value).trim() === '');

export const getMyMonetization = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const settings = await loadMonetizationSettings();
    const [eligibility, latestApplication, profile] = await Promise.all([
      computeEligibility(userId, settings),
      getLatestApplication(userId),
      prisma.monetizationProfile.findUnique({
        where: { userId },
        select: { isEnabled: true, enabledAt: true, disabledAt: true, disabledReason: true, updatedAt: true }
      })
    ]);

    return res.json({
      success: true,
      data: {
        settings,
        eligibility,
        application: latestApplication
          ? {
              id: latestApplication.id,
              status: latestApplication.status,
              adminNote: latestApplication.adminNote || null,
              reapplyAllowedAt: latestApplication.reapplyAllowedAt || null,
              submittedAt: latestApplication.createdAt,
              reviewedAt: latestApplication.reviewedAt || null
            }
          : null,
        monetization: profile
          ? {
              isEnabled: Boolean(profile.isEnabled),
              enabledAt: profile.enabledAt || null,
              disabledAt: profile.disabledAt || null,
              disabledReason: profile.disabledReason || null,
              updatedAt: profile.updatedAt || null
            }
          : {
              isEnabled: false,
              enabledAt: null,
              disabledAt: null,
              disabledReason: null,
              updatedAt: null
            }
      }
    });
  } catch (error: any) {
    console.error('[monetization] getMyMonetization failed', error);
    const message = String(error?.message || '');
    if (message === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' });
    }
    return res.status(500).json({ success: false, error: 'Failed to load monetization', code: 'ERR_INTERNAL' });
  }
};

export const submitMonetizationApplication = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const settings = await loadMonetizationSettings();
    if (!settings.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Monetization applications are currently disabled',
        code: 'FEATURE_DISABLED'
      });
    }

    const body = asObject(req.body);
    const fullName = String(body.fullName || '').trim();
    const tinNumber = String(body.tinNumber || '').trim();
    const country = String(body.country || '').trim();
    const age = parsePositiveInt(body.age, 0);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();

    if (!fullName || !tinNumber || !country || !email || !phone || !age) {
      return res.status(400).json({
        success: false,
        error: 'fullName, tinNumber, country, age, email, and phone are required',
        code: 'VALIDATION_ERROR'
      });
    }
    if (age < settings.requirements.minAge) {
      return res.status(400).json({
        success: false,
        error: `Applicant must be at least ${settings.requirements.minAge} years old`,
        code: 'AGE_NOT_ELIGIBLE'
      });
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address', code: 'VALIDATION_ERROR' });
    }
    const phonePattern = /^\+?[0-9()\-. ]{7,20}$/;
    if (!phonePattern.test(phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number', code: 'VALIDATION_ERROR' });
    }
    const tinPattern = /^[A-Za-z0-9_.\-\/]{6,40}$/;
    if (!tinPattern.test(tinNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid TIN number', code: 'VALIDATION_ERROR' });
    }

    const [pendingApplication, latestApplication, eligibility, profile] = await Promise.all([
      prisma.monetizationApplication.findFirst({
        where: { userId, status: { in: ['PENDING', 'SUBMITTED'] as any } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true }
      }),
      getLatestApplication(userId),
      computeEligibility(userId, settings),
      prisma.monetizationProfile.findUnique({
        where: { userId },
        select: { isEnabled: true, disabledAt: true, disabledReason: true }
      })
    ]);

    if (pendingApplication) {
      return res.status(409).json({
        success: false,
        error: 'You already have an application under review',
        code: 'APPLICATION_PENDING'
      });
    }

    if (profile?.isEnabled || latestApplication?.status === 'APPROVED') {
      return res.status(409).json({
        success: false,
        error: 'Monetization is already active for this account',
        code: 'ALREADY_APPROVED'
      });
    }

    if (latestApplication?.status === 'SUSPENDED') {
      const suspendedReapplyAt = latestApplication.reapplyAllowedAt
        ? new Date(latestApplication.reapplyAllowedAt)
        : null;
      if (suspendedReapplyAt && suspendedReapplyAt.getTime() > Date.now()) {
        return res.status(409).json({
          success: false,
          error: 'Reapply cooldown is active',
          code: 'REAPPLY_COOLDOWN',
          reapplyAllowedAt: latestApplication.reapplyAllowedAt
        });
      }
      if (!suspendedReapplyAt) {
        return res.status(403).json({
          success: false,
          error: 'Monetization is currently suspended. Contact support for review.',
          code: 'SUSPENDED'
        });
      }
    }

    if (
      latestApplication?.status === 'REJECTED' &&
      latestApplication.reapplyAllowedAt &&
      new Date(latestApplication.reapplyAllowedAt).getTime() > Date.now()
    ) {
      return res.status(409).json({
        success: false,
        error: 'Reapply cooldown is active',
        code: 'REAPPLY_COOLDOWN',
        reapplyAllowedAt: latestApplication.reapplyAllowedAt
      });
    }

    if (!eligibility.isEligible) {
      return res.status(400).json({
        success: false,
        error: 'You do not currently meet monetization eligibility requirements',
        code: 'NOT_ELIGIBLE',
        data: { eligibility }
      });
    }

    const snapshot = {
      ...eligibility.requirements,
      settings
    };

    const created = await prisma.monetizationApplication.create({
      data: {
        userId,
        status: 'PENDING' as any,
        fullName,
        tinNumber,
        country,
        age,
        email,
        phone,
        eligibilitySnapshot: snapshot as any
      }
    });

    await buildNotification({
      recipientId: userId,
      type: 'monetization_application_submitted',
      title: 'Monetization application submitted',
      message: 'Your monetization application was submitted and is now pending review.',
      actionUrl: '/freelancer/dashboard?tab=community&section=earnings',
      metadata: {
        entityType: 'monetization_application',
        entityId: created.id,
        status: created.status
      }
    });

    realtime.emitToUser(userId, 'monetization:application_updated', {
      application: mapApplication(created)
    });
    await emitStatusUpdate(userId);

    return res.status(201).json({ success: true, data: mapApplication(created) });
  } catch (error: any) {
    console.error('[monetization] submitMonetizationApplication failed', error);
    const message = String(error?.message || '');
    if (message === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' });
    }
    return res
      .status(500)
      .json({ success: false, error: 'Failed to submit monetization application', code: 'ERR_INTERNAL' });
  }
};

export const listMyMonetizationApplications = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const limit = Math.max(1, Math.min(50, parsePositiveInt(req.query.limit, 20)));
    const applications = await prisma.monetizationApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return res.json({ success: true, data: applications.map(mapApplication) });
  } catch (error) {
    console.error('[monetization] listMyMonetizationApplications failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load applications', code: 'ERR_INTERNAL' });
  }
};

export const getMonetizationSettingsAdmin = async (_req: Request, res: Response) => {
  try {
    const settings = await loadMonetizationSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('[monetization] getMonetizationSettingsAdmin failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load settings', code: 'ERR_INTERNAL' });
  }
};

export const updateMonetizationSettingsAdmin = async (req: Request, res: Response) => {
  try {
    const settings = await saveMonetizationSettings(req.body || {});
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('[monetization] updateMonetizationSettingsAdmin failed', error);
    return res.status(500).json({ success: false, error: 'Failed to update settings', code: 'ERR_INTERNAL' });
  }
};

export const listMonetizationApplicationsAdmin = async (req: Request, res: Response) => {
  try {
    const statusFilter = String(req.query.status || 'all').trim().toUpperCase();
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, parsePositiveInt(req.query.page, 1));
    const limit = Math.max(1, Math.min(100, parsePositiveInt(req.query.limit, 20)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (statusFilter && statusFilter !== 'ALL') where.status = statusFilter;
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { user: { id: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { username: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.monetizationApplication.count({ where }),
      prisma.monetizationApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              avatar: true,
              kycStatus: true
            }
          },
          reviewedByAdmin: {
            select: { id: true, name: true, email: true, username: true }
          }
        }
      })
    ]);

    return res.json({
      success: true,
      data: {
        items: rows.map(mapApplication),
        total,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('[monetization] listMonetizationApplicationsAdmin failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load applications', code: 'ERR_INTERNAL' });
  }
};

export const getMonetizationApplicationAdmin = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, error: 'Application id is required', code: 'VALIDATION_ERROR' });
    }
    const row = await prisma.monetizationApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            avatar: true,
            kycStatus: true
          }
        },
        reviewedByAdmin: {
          select: { id: true, name: true, email: true, username: true }
        }
      }
    });
    if (!row) {
      return res.status(404).json({ success: false, error: 'Application not found', code: 'NOT_FOUND' });
    }
    const settings = await loadMonetizationSettings();
    const eligibility = await computeEligibility(row.userId, settings);
    return res.json({
      success: true,
      data: {
        ...mapApplication(row),
        currentEligibility: eligibility
      }
    });
  } catch (error) {
    console.error('[monetization] getMonetizationApplicationAdmin failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load application', code: 'ERR_INTERNAL' });
  }
};

export const approveMonetizationApplicationAdmin = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const actorId = String(req.user?.id || '').trim() || null;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Application id is required', code: 'VALIDATION_ERROR' });
    }
    const settings = await loadMonetizationSettings();
    const body = asObject(req.body);
    const note = String(body.note || '').trim();
    const enableMonetization = body.enableMonetization === undefined
      ? settings.review.autoEnableOnApprove
      : normalizeBoolean(body.enableMonetization, true);

    const existing = await prisma.monetizationApplication.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true }
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Application not found', code: 'NOT_FOUND' });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const application = await tx.monetizationApplication.update({
        where: { id },
        data: {
          status: 'APPROVED' as any,
          adminNote: note || null,
          reviewedByAdminId: actorId,
          reviewedAt: now,
          reapplyAllowedAt: null
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              avatar: true,
              kycStatus: true
            }
          },
          reviewedByAdmin: {
            select: { id: true, name: true, email: true, username: true }
          }
        }
      });

      if (enableMonetization) {
        await tx.monetizationProfile.upsert({
          where: { userId: application.userId },
          create: {
            userId: application.userId,
            isEnabled: true,
            enabledAt: now,
            disabledAt: null,
            disabledReason: null
          },
          update: {
            isEnabled: true,
            enabledAt: now,
            disabledAt: null,
            disabledReason: null
          }
        });
      }
      return application;
    });

    await buildNotification({
      recipientId: updated.userId,
      actorId,
      type: 'monetization_approved',
      title: 'Monetization approved',
      message: 'Your monetization application has been approved.',
      actionUrl: '/freelancer/dashboard?tab=community&section=earnings',
      metadata: {
        entityType: 'monetization_application',
        entityId: updated.id,
        status: 'APPROVED',
        adminNote: note || null
      }
    });

    realtime.emitToUser(updated.userId, 'monetization:application_updated', {
      application: mapApplication(updated)
    });
    await emitStatusUpdate(updated.userId);

    return res.json({ success: true, data: mapApplication(updated) });
  } catch (error) {
    console.error('[monetization] approveMonetizationApplicationAdmin failed', error);
    return res.status(500).json({ success: false, error: 'Failed to approve application', code: 'ERR_INTERNAL' });
  }
};

export const rejectMonetizationApplicationAdmin = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const actorId = String(req.user?.id || '').trim() || null;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Application id is required', code: 'VALIDATION_ERROR' });
    }

    const body = asObject(req.body);
    const note = String(body.note || '').trim();
    if (!note) {
      return res.status(400).json({ success: false, error: 'Rejection note is required', code: 'VALIDATION_ERROR' });
    }

    const settings = await loadMonetizationSettings();
    const now = new Date();
    const requestedReapplyAtRaw = body.reapplyAllowedAt ?? body.reapplyAt ?? null;
    const requestedReapplyAt = parseOptionalDate(requestedReapplyAtRaw);
    if (hasProvidedValue(requestedReapplyAtRaw) && !requestedReapplyAt) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reapplyAllowedAt date',
        code: 'VALIDATION_ERROR'
      });
    }
    const cooldownDays = parsePositiveInt(body.reapplyAfterDays, settings.review.defaultReapplyCooldownDays);
    const reapplyAllowedAt = requestedReapplyAt
      ? requestedReapplyAt.getTime() > now.getTime()
        ? requestedReapplyAt
        : now
      : new Date(Date.now() + cooldownDays * DAY_MS);

    const updated = await prisma.monetizationApplication.update({
      where: { id },
      data: {
        status: 'REJECTED' as any,
        adminNote: note,
        reviewedByAdminId: actorId,
        reviewedAt: now,
        reapplyAllowedAt
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            avatar: true,
            kycStatus: true
          }
        },
        reviewedByAdmin: {
          select: { id: true, name: true, email: true, username: true }
        }
      }
    });

    await buildNotification({
      recipientId: updated.userId,
      actorId,
      type: 'monetization_rejected',
      title: 'Monetization application update',
      message: 'Your monetization application was rejected. Review the admin note before reapplying.',
      actionUrl: '/freelancer/dashboard?tab=community&section=earnings',
      metadata: {
        entityType: 'monetization_application',
        entityId: updated.id,
        status: 'REJECTED',
        adminNote: note,
        reapplyAllowedAt: reapplyAllowedAt.toISOString()
      }
    });

    realtime.emitToUser(updated.userId, 'monetization:application_updated', {
      application: mapApplication(updated)
    });
    await emitStatusUpdate(updated.userId);

    return res.json({ success: true, data: mapApplication(updated) });
  } catch (error: any) {
    console.error('[monetization] rejectMonetizationApplicationAdmin failed', error);
    if (String(error?.code || '') === 'P2025') {
      return res.status(404).json({ success: false, error: 'Application not found', code: 'NOT_FOUND' });
    }
    return res.status(500).json({ success: false, error: 'Failed to reject application', code: 'ERR_INTERNAL' });
  }
};

export const disableUserMonetizationAdmin = async (req: Request, res: Response) => {
  try {
    const actorId = String(req.user?.id || '').trim() || null;
    const userId = String(req.params.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required', code: 'VALIDATION_ERROR' });
    }
    const body = asObject(req.body);
    const reason = String(body.reason || '').trim() || 'Disabled by admin';
    const now = new Date();
    const disableUntilRaw = body.disableUntil ?? null;
    const disableUntil = parseOptionalDate(disableUntilRaw);
    if (hasProvidedValue(disableUntilRaw) && !disableUntil) {
      return res.status(400).json({
        success: false,
        error: 'Invalid disableUntil date',
        code: 'VALIDATION_ERROR'
      });
    }
    const reapplyAllowedAt = disableUntil && disableUntil.getTime() > now.getTime() ? disableUntil : null;

    await prisma.$transaction(async (tx) => {
      await tx.monetizationProfile.upsert({
        where: { userId },
        create: {
          userId,
          isEnabled: false,
          disabledAt: now,
          disabledReason: reason,
          enabledAt: null
        },
        update: {
          isEnabled: false,
          disabledAt: now,
          disabledReason: reason
        }
      });
      await tx.monetizationApplication.updateMany({
        where: { userId, status: 'APPROVED' as any },
        data: {
          status: 'SUSPENDED' as any,
          reviewedByAdminId: actorId,
          reviewedAt: now,
          adminNote: reason,
          reapplyAllowedAt
        }
      });
    });

    const latestApplication = await getLatestApplication(userId);

    await buildNotification({
      recipientId: userId,
      actorId,
      type: 'monetization_disabled',
      title: 'Monetization disabled',
      message: reapplyAllowedAt
        ? `Your monetization access was disabled by admin. Reason: ${reason}. Reapply after ${reapplyAllowedAt.toLocaleString()}.`
        : `Your monetization access was disabled by admin. Reason: ${reason}`,
      actionUrl: '/freelancer/dashboard?tab=community&section=earnings',
      metadata: {
        entityType: 'monetization_profile',
        entityId: userId,
        reason,
        disableUntil: reapplyAllowedAt ? reapplyAllowedAt.toISOString() : null
      }
    });

    if (latestApplication) {
      realtime.emitToUser(userId, 'monetization:application_updated', {
        application: mapApplication(latestApplication)
      });
    }
    await emitStatusUpdate(userId);

    return res.json({
      success: true,
      data: {
        userId,
        isEnabled: false,
        disabledAt: now,
        reason,
        disableUntil: reapplyAllowedAt
      }
    });
  } catch (error) {
    console.error('[monetization] disableUserMonetizationAdmin failed', error);
    return res.status(500).json({ success: false, error: 'Failed to disable monetization', code: 'ERR_INTERNAL' });
  }
};
