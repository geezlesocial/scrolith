import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../utils/prismaClient';
import {
  applyUserModerationActionController,
  getUserModerationSummaryController
} from '../../controllers/accountModeration.controller';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac.middleware';

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
    ...user,
    role: normalizeRole(user?.role),
    isActive,
    isVerified: Boolean(user?.isVerified),
    kycStatus: user?.kycStatus ? String(user.kycStatus).toLowerCase() : 'pending',
    status,
    flags,
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
          updatedAt: true
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
    if (avatar !== undefined) updates.avatar = avatar;
    if (profilePhotoFileId !== undefined) updates.profilePhotoFileId = profilePhotoFileId || null;
    if (role) updates.role = role.toString().toUpperCase();

    // Phase 20.2: block side-channel KYC / verification mutations.
    // Final KYC decisions must go through POST /api/admin/kyc/:id/status.
    const normalizedKycStatus = normalizeKycStatus(kycStatus);
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
        data: updates
      });
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

    res.json({ success: true, message: 'User status updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

router.delete('/:id', requireAnyPermission('users.delete', 'users.moderate'), async (req, res) => {
  const userId = req.params.id;
  const prismaClient = getPrisma();

  try {
    if (prismaClient) {
      try {
        await prismaClient.user.delete({ where: { id: userId } });
      } catch {
        await prismaClient.user.update({
          where: { id: userId },
          data: { isActive: false }
        });
        deletedUserIds.add(userId);
      }
    } else {
      ensureMemoryUser(req);
      const idx = memoryUsers.findIndex(u => u.id === userId);
      if (idx >= 0) {
        memoryUsers.splice(idx, 1);
      }
    }

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

export default router;
