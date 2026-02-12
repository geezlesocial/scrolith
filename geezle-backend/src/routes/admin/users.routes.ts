import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const router = express.Router();

let prisma: PrismaClient | null = null;
const getPrisma = () => {
  if (prisma) return prisma;
  try {
    prisma = new PrismaClient();
    return prisma;
  } catch {
    return null;
  }
};

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

router.get('/', async (req, res) => {
  const prismaClient = getPrisma();

  try {
    let users: any[] = [];
    if (prismaClient) {
      users = await prismaClient.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
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

router.put('/:id', async (req, res) => {
  const userId = req.params.id;
  const { name, email, role, avatar, status, isActive } = req.body || {};
  const prismaClient = getPrisma();

  try {
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (avatar !== undefined) updates.avatar = avatar;
    if (role) updates.role = role.toString().toUpperCase();

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
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      memoryUsers[idx] = { ...memoryUsers[idx], ...updates, updatedAt: new Date().toISOString() };
      updated = memoryUsers[idx];
    }

    res.json({ success: true, data: toResponseUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

router.post('/:id/password', async (req, res) => {
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

router.post('/:id/status', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
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
