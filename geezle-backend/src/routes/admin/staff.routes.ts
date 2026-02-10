import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../../utils/prismaClient';
import { ensureAdminStaffProfile, ensureRbacSeeded, isAdminRole } from '../../services/rbac.service';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';

const router = express.Router();

type StaffPayload = {
  id?: string;
  fullName?: string;
  name?: string;
  email?: string;
  username?: string;
  password?: string;
  roleId?: string;
  status?: string;
  forcePasswordReset?: boolean;
  force_password_reset?: boolean;
  require2FA?: boolean;
  require_2fa?: boolean;
  twoFactorEnabled?: boolean;
  two_factor_enabled?: boolean;
};

const toRoleLevel = (name: string) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('admin')) return 100;
  if (normalized.includes('moderator')) return 70;
  if (normalized.includes('support')) return 60;
  if (normalized.includes('author') || normalized.includes('editor') || normalized.includes('writer')) return 50;
  return 10;
};

const toUserRole = (roleName: string): 'ADMIN' | 'MODERATOR' | 'USER' => {
  const normalized = String(roleName || '').toLowerCase();
  if (normalized.includes('admin')) return 'ADMIN';
  if (normalized.includes('moderator') || normalized.includes('support')) return 'MODERATOR';
  return 'USER';
};

const toStaffStatus = (value?: string | null): 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' => {
  const normalized = String(value || 'active').toLowerCase();
  if (normalized === 'suspended') return 'SUSPENDED';
  if (normalized === 'inactive') return 'INACTIVE';
  return 'ACTIVE';
};

const toApiStatus = (value?: string | null): 'active' | 'suspended' | 'inactive' => {
  const normalized = String(value || 'ACTIVE').toUpperCase();
  if (normalized === 'SUSPENDED') return 'suspended';
  if (normalized === 'INACTIVE') return 'inactive';
  return 'active';
};

const mapStaff = (staff: any) => ({
  id: staff.id,
  user_id: staff.userId,
  userId: staff.userId,
  name: staff.fullName,
  fullName: staff.fullName,
  email: staff.email,
  username: staff.username,
  role_id: staff.roleId,
  roleId: staff.roleId,
  role_name: staff.role?.name || '',
  roleName: staff.role?.name || '',
  role_level: toRoleLevel(staff.role?.name || ''),
  roleLevel: toRoleLevel(staff.role?.name || ''),
  status: toApiStatus(staff.status),
  avatar: staff.user?.avatar || '',
  is_active: staff.status === 'ACTIVE',
  isActive: staff.status === 'ACTIVE',
  require_2fa: Boolean(staff.require2FA),
  require2FA: Boolean(staff.require2FA),
  two_factor_enabled: Boolean(staff.require2FA),
  twoFactorEnabled: Boolean(staff.require2FA),
  force_password_reset: Boolean(staff.forcePasswordReset),
  forcePasswordReset: Boolean(staff.forcePasswordReset),
  last_login_at: staff.lastLoginAt ? staff.lastLoginAt.toISOString() : null,
  lastLoginAt: staff.lastLoginAt ? staff.lastLoginAt.toISOString() : null,
  created_at: staff.createdAt ? staff.createdAt.toISOString() : null,
  createdAt: staff.createdAt ? staff.createdAt.toISOString() : null,
  updated_at: staff.updatedAt ? staff.updatedAt.toISOString() : null,
  updatedAt: staff.updatedAt ? staff.updatedAt.toISOString() : null
});

const findRole = async (roleId?: string) => {
  if (!roleId) return null;
  return prisma.staffRole.findUnique({
    where: { id: roleId }
  });
};

const getBoolean = (payload: StaffPayload, keys: (keyof StaffPayload)[], fallback = false) => {
  for (const key of keys) {
    if (payload[key] !== undefined) return Boolean(payload[key]);
  }
  return fallback;
};

const writeAuditLog = async (
  req: express.Request,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, any>
) => {
  try {
    const context = await resolveStaffContext(req);
    let staffId = context?.staffId;
    if (!staffId && isAdminRole(req.user?.role)) {
      staffId = await ensureAdminStaffProfile(String(req.user?.id || ''));
    }
    if (!staffId) return;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    await prisma.moderationAuditLog.create({
      data: {
        staffId,
        action,
        targetType,
        targetId: targetId || null,
        metadata: metadata || null,
        ipAddress: forwarded || req.ip || null,
        userAgent: String(req.headers['user-agent'] || '')
      }
    });
  } catch (error) {
    console.warn('[staff] failed to write audit log', error);
  }
};

router.get('/', requirePermission('staff.read'), async (_req, res) => {
  try {
    await ensureRbacSeeded();
    const staffUsers = await prisma.staffUser.findMany({
      include: {
        role: true,
        user: {
          select: { avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: staffUsers.map(mapStaff) });
  } catch (error) {
    console.error('[staff] list failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load staff', code: 'ERR_INTERNAL' });
  }
});

router.get('/roles', requirePermission('staff.read'), async (_req, res) => {
  try {
    await ensureRbacSeeded();
    const roles = await prisma.staffRole.findMany({
      where: { isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: { select: { key: true } }
          }
        }
      },
      orderBy: [{ isSystemRole: 'desc' }, { name: 'asc' }]
    });
    const payload = roles.map((role) => {
      const permissionKeys = role.rolePermissions.map((entry) => entry.permission.key);
      return {
        id: role.id,
        name: role.name,
        description: role.description || '',
        isActive: role.isActive,
        isSystemRole: role.isSystemRole,
        permissions: permissionKeys.reduce((acc: Record<string, boolean>, key) => {
          acc[key] = true;
          return acc;
        }, {}),
        permissionKeys,
        permissionsCount: permissionKeys.length,
        level: toRoleLevel(role.name)
      };
    });
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('[staff] list roles failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load roles', code: 'ERR_INTERNAL' });
  }
});

router.post('/', async (req, res) => {
  const payload = (req.body || {}) as StaffPayload;
  if (payload.id) {
    return requirePermission('staff.update')(req, res, async () => {
      try {
        const staffId = String(payload.id || '').trim();
        if (!staffId) {
          return res.status(400).json({ success: false, error: 'Staff id is required', code: 'VALIDATION_ERROR' });
        }

        await ensureRbacSeeded();
        const existing = await prisma.staffUser.findUnique({
          where: { id: staffId },
          include: { role: true, user: true }
        });
        if (!existing) {
          return res.status(404).json({ success: false, error: 'Staff member not found', code: 'NOT_FOUND' });
        }

        const fullName = String(payload.fullName || payload.name || existing.fullName).trim();
        const email = String(payload.email || existing.email).trim().toLowerCase();
        const username = String(payload.username || existing.username).trim().toLowerCase();
        const roleId = String(payload.roleId || existing.roleId).trim();
        const status = toStaffStatus(payload.status || existing.status);
        const forcePasswordReset = getBoolean(
          payload,
          ['forcePasswordReset', 'force_password_reset'],
          Boolean(existing.forcePasswordReset)
        );
        const require2FA = getBoolean(
          payload,
          ['require2FA', 'require_2fa', 'twoFactorEnabled', 'two_factor_enabled'],
          Boolean(existing.require2FA)
        );

        const role = await findRole(roleId);
        if (!role || !role.isActive) {
          return res.status(400).json({ success: false, error: 'Selected role is invalid or inactive', code: 'ROLE_INVALID' });
        }

        const usernameConflict = await prisma.staffUser.findFirst({
          where: {
            username,
            id: { not: staffId }
          },
          select: { id: true }
        });
        if (usernameConflict) {
          return res.status(409).json({ success: false, error: 'Username already exists', code: 'USERNAME_EXISTS' });
        }

        const userEmailConflict = await prisma.user.findFirst({
          where: {
            email,
            id: { not: existing.userId }
          },
          select: { id: true }
        });
        if (userEmailConflict) {
          return res.status(409).json({ success: false, error: 'Email already exists', code: 'EMAIL_EXISTS' });
        }

        const password = String(payload.password || '');
        const hasPasswordUpdate = password.length > 0;
        if (hasPasswordUpdate && password.length < 8) {
          return res.status(400).json({ success: false, error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' });
        }

        const passwordHash = hasPasswordUpdate ? await bcrypt.hash(password, 10) : existing.passwordHash;
        const userRole = toUserRole(role.name);
        const isActive = status === 'ACTIVE';

        const updated = await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              name: fullName,
              email,
              username,
              role: userRole,
              isActive,
              ...(hasPasswordUpdate ? { passwordHash, refreshToken: null } : {})
            }
          });

          return tx.staffUser.update({
            where: { id: staffId },
            data: {
              fullName,
              email,
              username,
              roleId,
              status,
              require2FA,
              forcePasswordReset: hasPasswordUpdate ? true : forcePasswordReset,
              ...(hasPasswordUpdate ? { passwordHash } : {})
            },
            include: {
              role: true,
              user: {
                select: { avatar: true }
              }
            }
          });
        });

        await writeAuditLog(req, 'STAFF_UPDATED', 'staff', staffId, {
          roleId,
          status,
          require2FA,
          forcePasswordReset: updated.forcePasswordReset,
          passwordChanged: hasPasswordUpdate,
          legacyPost: true
        });

        return res.json({ success: true, data: mapStaff(updated) });
      } catch (error) {
        console.error('[staff] legacy update failed', error);
        return res.status(500).json({ success: false, error: 'Failed to update staff member', code: 'ERR_INTERNAL' });
      }
    });
  }

  return requirePermission('staff.create')(req, res, async () => {
    try {
      await ensureRbacSeeded();

      const fullName = String(payload.fullName || payload.name || '').trim();
      const email = String(payload.email || '').trim().toLowerCase();
      const username = String(payload.username || '').trim().toLowerCase();
      const roleId = String(payload.roleId || '').trim();
      const password = String(payload.password || '');
      const status = toStaffStatus(payload.status);
      const forcePasswordReset = getBoolean(payload, ['forcePasswordReset', 'force_password_reset'], true);
      const require2FA = getBoolean(payload, ['require2FA', 'require_2fa', 'twoFactorEnabled', 'two_factor_enabled'], false);

      if (!fullName || !email || !username || !roleId || !password) {
        return res
          .status(400)
          .json({ success: false, error: 'fullName, email, username, roleId, and password are required', code: 'VALIDATION_ERROR' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' });
      }

      const role = await findRole(roleId);
      if (!role || !role.isActive) {
        return res.status(400).json({ success: false, error: 'Selected role is invalid or inactive', code: 'ROLE_INVALID' });
      }

      const existingUsername = await prisma.staffUser.findUnique({ where: { username } });
      if (existingUsername) {
        return res.status(409).json({ success: false, error: 'Username already exists', code: 'USERNAME_EXISTS' });
      }

      const existingUserByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingUserByEmail?.staffProfile) {
        return res.status(409).json({ success: false, error: 'Email already assigned to staff', code: 'EMAIL_EXISTS' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userRole = toUserRole(role.name);
      const isActive = status === 'ACTIVE';

      const staff = await prisma.$transaction(async (tx) => {
        const user = existingUserByEmail
          ? await tx.user.update({
              where: { id: existingUserByEmail.id },
              data: {
                name: fullName,
                email,
                username,
                passwordHash,
                role: userRole,
                isActive,
                refreshToken: null
              }
            })
          : await tx.user.create({
              data: {
                name: fullName,
                email,
                username,
                passwordHash,
                role: userRole,
                isActive,
                isVerified: true
              }
            });

        return tx.staffUser.create({
          data: {
            userId: user.id,
            fullName,
            email,
            username,
            passwordHash,
            roleId,
            status,
            forcePasswordReset,
            require2FA
          },
          include: {
            role: true,
            user: {
              select: { avatar: true }
            }
          }
        });
      });

      await writeAuditLog(req, 'STAFF_CREATED', 'staff', staff.id, {
        userId: staff.userId,
        roleId,
        status,
        require2FA,
        forcePasswordReset
      });

      return res.status(201).json({ success: true, data: mapStaff(staff) });
    } catch (error) {
      console.error('[staff] create failed', error);
      return res.status(500).json({ success: false, error: 'Failed to create staff member', code: 'ERR_INTERNAL' });
    }
  });
});

router.put('/:id', requirePermission('staff.update'), async (req, res) => {
  try {
    const staffId = req.params.id;
    const payload = (req.body || {}) as StaffPayload;
    await ensureRbacSeeded();

    const existing = await prisma.staffUser.findUnique({
      where: { id: staffId },
      include: { role: true, user: true }
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Staff member not found', code: 'NOT_FOUND' });
    }

    const fullName = String(payload.fullName || payload.name || existing.fullName).trim();
    const email = String(payload.email || existing.email).trim().toLowerCase();
    const username = String(payload.username || existing.username).trim().toLowerCase();
    const roleId = String(payload.roleId || existing.roleId).trim();
    const status = toStaffStatus(payload.status || existing.status);
    const forcePasswordReset = getBoolean(
      payload,
      ['forcePasswordReset', 'force_password_reset'],
      Boolean(existing.forcePasswordReset)
    );
    const require2FA = getBoolean(
      payload,
      ['require2FA', 'require_2fa', 'twoFactorEnabled', 'two_factor_enabled'],
      Boolean(existing.require2FA)
    );

    if (!fullName || !email || !username || !roleId) {
      return res
        .status(400)
        .json({ success: false, error: 'fullName, email, username, and roleId are required', code: 'VALIDATION_ERROR' });
    }

    const role = await findRole(roleId);
    if (!role || !role.isActive) {
      return res.status(400).json({ success: false, error: 'Selected role is invalid or inactive', code: 'ROLE_INVALID' });
    }

    const usernameConflict = await prisma.staffUser.findFirst({
      where: {
        username,
        id: { not: staffId }
      },
      select: { id: true }
    });
    if (usernameConflict) {
      return res.status(409).json({ success: false, error: 'Username already exists', code: 'USERNAME_EXISTS' });
    }

    const userEmailConflict = await prisma.user.findFirst({
      where: {
        email,
        id: { not: existing.userId }
      },
      select: { id: true }
    });
    if (userEmailConflict) {
      return res.status(409).json({ success: false, error: 'Email already exists', code: 'EMAIL_EXISTS' });
    }

    const password = String(payload.password || '');
    const hasPasswordUpdate = password.length > 0;
    if (hasPasswordUpdate && password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' });
    }

    const passwordHash = hasPasswordUpdate ? await bcrypt.hash(password, 10) : existing.passwordHash;
    const userRole = toUserRole(role.name);
    const isActive = status === 'ACTIVE';

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          name: fullName,
          email,
          username,
          role: userRole,
          isActive,
          ...(hasPasswordUpdate ? { passwordHash, refreshToken: null } : {})
        }
      });

      return tx.staffUser.update({
        where: { id: staffId },
        data: {
          fullName,
          email,
          username,
          roleId,
          status,
          require2FA,
          forcePasswordReset: hasPasswordUpdate ? true : forcePasswordReset,
          ...(hasPasswordUpdate ? { passwordHash } : {})
        },
        include: {
          role: true,
          user: {
            select: { avatar: true }
          }
        }
      });
    });

    await writeAuditLog(req, 'STAFF_UPDATED', 'staff', staffId, {
      roleId,
      status,
      require2FA,
      forcePasswordReset: updated.forcePasswordReset,
      passwordChanged: hasPasswordUpdate
    });

    return res.json({ success: true, data: mapStaff(updated) });
  } catch (error) {
    console.error('[staff] update failed', error);
    return res.status(500).json({ success: false, error: 'Failed to update staff member', code: 'ERR_INTERNAL' });
  }
});

router.post('/:id/reset-password', requirePermission('staff.reset_password'), async (req, res) => {
  try {
    const staffId = req.params.id;
    const newPassword = String(req.body?.password || req.body?.newPassword || '');
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' });
    }

    const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff) {
      return res.status(404).json({ success: false, error: 'Staff member not found', code: 'NOT_FOUND' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.staffUser.update({
        where: { id: staffId },
        data: {
          passwordHash,
          forcePasswordReset: true
        }
      }),
      prisma.user.update({
        where: { id: staff.userId },
        data: {
          passwordHash,
          refreshToken: null
        }
      })
    ]);

    await writeAuditLog(req, 'STAFF_PASSWORD_RESET', 'staff', staffId, {
      userId: staff.userId
    });

    return res.json({ success: true, data: { id: staffId, forcePasswordReset: true } });
  } catch (error) {
    console.error('[staff] reset password failed', error);
    return res.status(500).json({ success: false, error: 'Failed to reset password', code: 'ERR_INTERNAL' });
  }
});

router.delete('/:id', requirePermission('staff.update'), async (req, res) => {
  try {
    const staffId = req.params.id;
    const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff) {
      return res.status(404).json({ success: false, error: 'Staff member not found', code: 'NOT_FOUND' });
    }

    await prisma.$transaction([
      prisma.staffUser.update({
        where: { id: staffId },
        data: {
          status: 'INACTIVE',
          forcePasswordReset: true
        }
      }),
      prisma.user.update({
        where: { id: staff.userId },
        data: {
          isActive: false,
          refreshToken: null
        }
      })
    ]);

    await writeAuditLog(req, 'STAFF_DEACTIVATED', 'staff', staffId, { userId: staff.userId });

    return res.json({ success: true, data: { id: staffId, status: 'inactive' } });
  } catch (error) {
    console.error('[staff] deactivate failed', error);
    return res.status(500).json({ success: false, error: 'Failed to deactivate staff member', code: 'ERR_INTERNAL' });
  }
});

export default router;
