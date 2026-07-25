import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../utils/prismaClient';
import {
  applyUserModerationActionController,
  getUserModerationSummaryController
} from '../../controllers/accountModeration.controller';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac.middleware';
import { extractRequestAuditMeta, writeAdminAuditEvent } from '../../services/adminAudit.service';

const router = express.Router();
const getPrisma = () => prisma;

type StatusOverride = {
  status: string;
  flags?: {
    isBanned?: boolean;
    isRestricted?: boolean;
    isSuspended?: boolean;
  };
};

const statusOverrides = new Map<string, StatusOverride>();
const deletedUserIds = new Set<string>();
const memoryUsers: any[] = [];

const normalizeRole = (role: string | undefined) =>
  (role || 'guest').toString().toLowerCase();

const normalizeKycStatus = (value: unknown) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (['PENDING', 'VERIFIED', 'REJECTED', 'UNDER_REVIEW'].includes(normalized)) {
    return normalized;
  }
  return null;
};

const toResponseUser = (user: any) => {
  const settings = user?.settings || null;
  const existingCapabilities = user?.callCapabilities || user?.call_capabilities || {};
  const { settings: _settings, ...publicUser } = user || {};
  const override = statusOverrides.get(user.id);
  const isActive = user?.isActive ?? user?.is_active ?? true;
  const status =
    override?.status || user?.status || (isActive ? 'active' : 'inactive');

  const flags = {
    ...(user?.flags || {}),
    ...(override?.flags || {}),
    isBanned: status === 'banned' || override?.flags?.isBanned,
    isRestricted: status === 'restricted' || override?.flags?.isRestricted,
    isSuspended: status === 'suspended' || override?.flags?.isSuspended
  };

  return {
    ...publicUser,
    role: normalizeRole(user?.role),
    isActive,
    isVerified: Boolean(user?.isVerified),
    kycStatus: user?.kycStatus ? String(user.kycStatus).toLowerCase() : 'pending',
    status,
    flags,
    callCapabilities: {
      videoCallsEnabled:
        settings?.videoCallsEnabled !== undefined
          ? settings.videoCallsEnabled !== false
          : existingCapabilities?.videoCallsEnabled !== false,
      videoCallsUpdatedAt: settings?.videoCallsUpdatedAt
        ? new Date(settings.videoCallsUpdatedAt).toISOString()
        : existingCapabilities?.videoCallsUpdatedAt || null,
      videoCallsUpdatedById: settings?.videoCallsUpdatedById || existingCapabilities?.videoCallsUpdatedById || null,
      videoCallsAdminReason: settings?.videoCallsAdminReason || existingCapabilities?.videoCallsAdminReason || null
    },
    createdAt: user?.createdAt ? new Date(user.createdAt).toISOString() : user?.createdAt,
    updatedAt: user?.updatedAt ? new Date(user.updatedAt).toISOString() : user?.updatedAt
  };
};

const applyStatusOverride = (userId: string, status?: string) => {
  if (!status) return { isActive: undefined };

  const normalized = status.toString().toLowerCase();
  let isActive: boolean | undefined;
  let override: StatusOverride | null = null;

  if (normalized === 'active') {
    isActive = true;
  } else if (normalized === 'inactive') {
    isActive = false;
  } else if (normalized === 'suspended') {
    isActive = false;
    override = { status: 'suspended', flags: { isSuspended: true } };
  } else if (normalized === 'banned') {
    isActive = false;
    override = { status: 'banned', flags: { isBanned: true } };
  } else if (normalized === 'restricted') {
    isActive = true;
    override = { status: 'restricted', flags: { isRestricted: true } };
  } else {
    override = { status: normalized };
  }

  if (override) {
    statusOverrides.set(userId, override);
  } else {
    statusOverrides.delete(userId);
  }

  return { isActive, status: normalized };
};

const ensureMemoryUser = (req: express.Request) => {
  if (!req.user) return;
  if (memoryUsers.find(u => u.id === req.user?.id)) return;
  memoryUsers.push({
    id: req.user.id,
    email: req.user.email,
    name: req.user.email?.split('@')[0] || 'Admin',
    role: req.user.role || 'admin',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
};

// Platform admins bypass requirePermission; staff need users.* keys.
router.get('/', requireAnyPermission('users.read', 'users.update', 'users.moderate'), async (req, res) => {
  const prismaClient = getPrisma();

  try {
    let users: any[] = [];
    if (prismaClient) {
      users = await prismaClient.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          role: true,
          avatar: true,
          profilePhotoFileId: true,
          kycStatus: true,
          isVerified: true,
          freelancerPlanActive: true,
          employerPlanActive: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          settings: {
            select: {
              videoCallsEnabled: true,
              videoCallsUpdatedAt: true,
              videoCallsUpdatedById: true,
              videoCallsAdminReason: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      ensureMemoryUser(req);
      users = memoryUsers;
    }

    const filtered = users.filter(u => !deletedUserIds.has(u.id));
    res.json({ success: true, data: filtered.map(toResponseUser) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load users' });
  }
});

router.put('/:id', requireAnyPermission('users.update', 'users.update_status', 'users.moderate'), async (req, res) => {
  const userId = req.params.id;
  const { name, username, email, role, avatar, profilePhotoFileId, status, isActive, isVerified, kycStatus } = req.body || {};
  const prismaClient = getPrisma();

  try {
    // Detect official Scrolitha platform identity (admin may manage photo/email/verified badge).
    let isScrolithaTarget = false;
    if (prismaClient) {
      try {
        const target = await prismaClient.user.findUnique({
          where: { id: userId },
          select: { username: true, email: true }
        });
        const uname = String(target?.username || '').toLowerCase();
        const mail = String(target?.email || '').toLowerCase();
        isScrolithaTarget =
          uname === 'scrolitha' ||
          mail === 'scrolitha@system.scrolith.internal' ||
          mail.endsWith('@system.scrolith.internal');
      } catch {
        isScrolithaTarget = false;
      }
    }

    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim() || null;
    if (email !== undefined) {
      const nextEmail = String(email).trim();
      if (nextEmail) {
        const existingEmail = prismaClient
          ? await prismaClient.user.findUnique({ where: { email: nextEmail }, select: { id: true } })
          : null;
        if (existingEmail && existingEmail.id !== userId) {
          return res.status(400).json({ success: false, error: 'Email already in use' });
        }
        updates.email = nextEmail;
      }
    }
    if (username !== undefined) {
      // Reserved system handle for Scrolitha — username is not editable.
      if (isScrolithaTarget) {
        updates.username = 'scrolitha';
      } else {
        const nextUsername = String(username).trim();
        if (nextUsername) {
          const existingUsername = prismaClient
            ? await prismaClient.user.findUnique({ where: { username: nextUsername }, select: { id: true } })
            : null;
          if (existingUsername && existingUsername.id !== userId) {
            return res.status(400).json({ success: false, error: 'Username already in use' });
          }
          updates.username = nextUsername;
        } else {
          updates.username = null;
        }
      }
    }
    if (avatar !== undefined) updates.avatar = avatar;
    if (profilePhotoFileId !== undefined) updates.profilePhotoFileId = profilePhotoFileId || null;
    if (role && !isScrolithaTarget) updates.role = role.toString().toUpperCase();

    // Phase 20.2: block side-channel KYC / verification mutations for human accounts.
    // Scrolitha is a platform AI identity — admin may toggle the public verified badge
    // (isVerified) without the human KYC workflow.
    const normalizedKycStatus = normalizeKycStatus(kycStatus);
    if (isScrolithaTarget) {
      if (isVerified !== undefined) {
        updates.isVerified = Boolean(isVerified);
      }
      if (normalizedKycStatus === 'VERIFIED') {
        updates.isVerified = true;
      } else if (normalizedKycStatus && normalizedKycStatus !== 'VERIFIED') {
        updates.isVerified = false;
      }
    } else {
      const attemptsKycBypass =
        normalizedKycStatus !== null ||
        isVerified !== undefined;
      if (attemptsKycBypass) {
        try {
          const { blockSideChannelKycMutation } = require('../../services/kyc/kyc.decision.service');
          await blockSideChannelKycMutation({
            targetUserId: userId,
            actorUserId: (req as any).user?.id || null,
            attemptedKycStatus: normalizedKycStatus,
            attemptedIsVerified: isVerified === undefined ? null : Boolean(isVerified)
          });
        } catch {
          /* audit best-effort */
        }
        return res.status(403).json({
          success: false,
          error:
            'KYC verification status cannot be changed via generic user update. Use the KYC decision workflow.',
          code: 'KYC_SIDE_CHANNEL_BLOCKED'
        });
      }
    }

    if (status !== undefined || isActive !== undefined) {
      const statusResult = applyStatusOverride(userId, status ?? (isActive ? 'active' : 'inactive'));
      if (statusResult.isActive !== undefined) {
        updates.isActive = statusResult.isActive;
      }
    }

    let updated: any;
    if (prismaClient) {
      updated = await prismaClient.user.update({
        where: { id: userId },
        data: updates,
        include: {
          settings: {
            select: {
              videoCallsEnabled: true,
              videoCallsUpdatedAt: true,
              videoCallsUpdatedById: true,
              videoCallsAdminReason: true
            }
          }
        }
      });
      if (isScrolithaTarget) {
        try {
          const { clearScrolithaPlatformIdentityCache } = require('../../services/scrolitha/scrolitha.platformIdentity');
          clearScrolithaPlatformIdentityCache();
        } catch {
          /* best-effort */
        }
      }
    } else {
      ensureMemoryUser(req);
      const idx = memoryUsers.findIndex(u => u.id === userId);
      if (idx < 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      memoryUsers[idx] = {
        ...memoryUsers[idx],
        ...updates,
        kycStatus: updates.kycStatus ?? memoryUsers[idx].kycStatus ?? 'PENDING',
        isVerified: updates.isVerified ?? memoryUsers[idx].isVerified ?? false,
        updatedAt: new Date().toISOString()
      };
      updated = memoryUsers[idx];
    }

    return res.json({ success: true, data: toResponseUser(updated) });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

router.patch('/:id/call-capabilities', requireAnyPermission('users.update', 'users.moderate'), async (req, res) => {
  const userId = String(req.params.id || '').trim();
  const prismaClient = getPrisma();
  const rawEnabled = req.body?.videoCallsEnabled ?? req.body?.video_calls_enabled;
  const reason = String(req.body?.reason || req.body?.videoCallsAdminReason || '')
    .trim()
    .slice(0, 500);

  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID is required' });
  }
  if (typeof rawEnabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'videoCallsEnabled must be a boolean'
    });
  }

  try {
    if (prismaClient) {
      const target = await prismaClient.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const actorId = String((req as any).user?.id || req.body?.adminId || '').trim() || null;
      await prismaClient.userSettings.upsert({
        where: { userId },
        update: {
          videoCallsEnabled: rawEnabled,
          videoCallsUpdatedAt: new Date(),
          videoCallsUpdatedById: actorId,
          videoCallsAdminReason: reason || null
        },
        create: {
          userId,
          videoCallsEnabled: rawEnabled,
          videoCallsUpdatedAt: new Date(),
          videoCallsUpdatedById: actorId,
          videoCallsAdminReason: reason || null
        }
      });

      void (async () => {
        try {
          const meta = await extractRequestAuditMeta(req);
          await writeAdminAuditEvent({
            ...meta,
            moduleKey: 'users',
            actionKey: rawEnabled ? 'video_calls_enabled' : 'video_calls_disabled',
            entityType: 'user',
            entityId: userId,
            severity: rawEnabled ? 'info' : 'warning',
            status: 'success',
            message: rawEnabled
              ? 'Admin enabled video calling for user account.'
              : 'Admin disabled video calling for user account.',
            metadata: {
              videoCallsEnabled: rawEnabled,
              reason: reason || null
            }
          });
        } catch {
          /* best-effort audit */
        }
      })();

      const updated = await prismaClient.user.findUnique({
        where: { id: userId },
        include: {
          settings: {
            select: {
              videoCallsEnabled: true,
              videoCallsUpdatedAt: true,
              videoCallsUpdatedById: true,
              videoCallsAdminReason: true
            }
          }
        }
      });

      return res.json({ success: true, data: toResponseUser(updated) });
    }

    ensureMemoryUser(req);
    const idx = memoryUsers.findIndex((u) => u.id === userId);
    if (idx < 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    memoryUsers[idx] = {
      ...memoryUsers[idx],
      callCapabilities: {
        videoCallsEnabled: rawEnabled,
        videoCallsUpdatedAt: new Date().toISOString(),
        videoCallsUpdatedById: String((req as any).user?.id || req.body?.adminId || '') || null,
        videoCallsAdminReason: reason || null
      },
      updatedAt: new Date().toISOString()
    };
    return res.json({ success: true, data: toResponseUser(memoryUsers[idx]) });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update call capabilities' });
  }
});

router.get(
  '/:id/moderation',
  requireAnyPermission('users.read', 'users.moderate', 'community.accounts.moderate'),
  getUserModerationSummaryController
);

router.post(
  '/:id/moderation',
  requireAnyPermission('users.moderate', 'community.accounts.moderate'),
  applyUserModerationActionController
);

router.post('/:id/password', requireAnyPermission('users.update', 'users.moderate'), async (req, res) => {
  const userId = req.params.id;
  const { password } = req.body || {};
  const prismaClient = getPrisma();

  if (!password || typeof password !== 'string' || password.trim().length < 6) {
    res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    return;
  }

  try {
    const hashed = await bcrypt.hash(password.trim(), 10);

    if (prismaClient) {
      await prismaClient.user.update({
        where: { id: userId },
        data: { passwordHash: hashed }
      });
    } else {
      ensureMemoryUser(req);
      const idx = memoryUsers.findIndex(u => u.id === userId);
      if (idx < 0) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      memoryUsers[idx] = { ...memoryUsers[idx], updatedAt: new Date().toISOString() };
    }

    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
});

router.post('/:id/status', requireAnyPermission('users.update_status', 'users.moderate', 'users.update'), async (req, res) => {
  const userId = req.params.id;
  const { status } = req.body || {};
  const prismaClient = getPrisma();

  try {
    const statusResult = applyStatusOverride(userId, status);

    // Guard: never leave zero active platform admins after a deactivate/ban/suspend.
    if (prismaClient && statusResult.isActive === false) {
      const target = await prismaClient.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true }
      });
      const role = String(target?.role || '').toUpperCase();
      if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        const activeAdmins = await prismaClient.user.count({
          where: {
            isActive: true,
            role: { in: ['ADMIN', 'SUPER_ADMIN'] as any }
          }
        });
        const targetIsActiveAdmin = Boolean(target?.isActive);
        if (targetIsActiveAdmin && activeAdmins <= 1) {
          return res.status(400).json({
            success: false,
            error: 'Cannot deactivate the last active admin account'
          });
        }
      }
    }

    if (prismaClient && statusResult.isActive !== undefined) {
      await prismaClient.user.update({
        where: { id: userId },
        data: { isActive: statusResult.isActive }
      });
    } else if (!prismaClient) {
      ensureMemoryUser(req);
      const idx = memoryUsers.findIndex(u => u.id === userId);
      if (idx >= 0 && statusResult.isActive !== undefined) {
        memoryUsers[idx] = {
          ...memoryUsers[idx],
          isActive: statusResult.isActive,
          updatedAt: new Date().toISOString()
        };
      }
    }

    return res.json({
      success: true,
      message: 'User status updated',
      data: {
        userId,
        status: statusResult.status,
        isActive: statusResult.isActive,
        // Soft status only — inactive users remain listed in GET /admin/users
        remainsListed: true
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

router.delete('/:id', requireAnyPermission('users.delete', 'users.moderate'), async (req, res) => {
  const userId = req.params.id;
  const prismaClient = getPrisma();

  try {
    // Soft-delete only: deactivate and keep row so admins can reactivate.
    // Hard delete is intentionally disabled to prevent mass account loss.
    if (prismaClient) {
      const target = await prismaClient.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true }
      });
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const role = String(target.role || '').toUpperCase();
      if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && target.isActive) {
        const activeAdmins = await prismaClient.user.count({
          where: {
            isActive: true,
            role: { in: ['ADMIN', 'SUPER_ADMIN'] as any }
          }
        });
        if (activeAdmins <= 1) {
          return res.status(400).json({
            success: false,
            error: 'Cannot deactivate the last active admin account'
          });
        }
      }
      await prismaClient.user.update({
        where: { id: userId },
        data: { isActive: false }
      });
      applyStatusOverride(userId, 'inactive');
    } else {
      ensureMemoryUser(req);
      const idx = memoryUsers.findIndex(u => u.id === userId);
      if (idx >= 0) {
        memoryUsers[idx] = {
          ...memoryUsers[idx],
          isActive: false,
          updatedAt: new Date().toISOString()
        };
      }
    }

    return res.json({
      success: true,
      message: 'User deactivated (soft-delete). Account remains listed as inactive.',
      data: { userId, isActive: false, remainsListed: true }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

export default router;
