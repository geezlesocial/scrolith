import express from 'express';
import prisma from '../../utils/prismaClient';
import { ensureRbacSeeded } from '../../services/rbac.service';
import { requirePermission } from '../../middleware/rbac.middleware';

const router = express.Router();

type RolePayload = {
  name?: string;
  description?: string;
  permissionKeys?: string[];
  isActive?: boolean;
  isSystemRole?: boolean;
};

const normalizePermissionKeys = (input: unknown): string[] =>
  Array.from(
    new Set(
      Array.isArray(input)
        ? input
            .map((entry) => String(entry || '').trim())
            .filter((entry) => entry.length > 0)
        : []
    )
  );

const toRoleLevel = (name: string) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('admin')) return 100;
  if (normalized.includes('moderator')) return 70;
  if (normalized.includes('support')) return 60;
  if (normalized.includes('author') || normalized.includes('editor') || normalized.includes('writer')) return 50;
  return 10;
};

const mapRole = (role: any) => {
  const permissionKeys = (role?.rolePermissions || []).map((entry: any) => entry.permission?.key).filter(Boolean);
  const permissions = permissionKeys.reduce((acc: Record<string, boolean>, key: string) => {
    acc[key] = true;
    return acc;
  }, {});
  return {
    id: role.id,
    name: role.name,
    description: role.description || '',
    isSystemRole: Boolean(role.isSystemRole),
    isActive: Boolean(role.isActive),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissionKeys,
    permissionsCount: permissionKeys.length,
    assignedStaffCount: Number(role?._count?.staffUsers || 0),
    level: toRoleLevel(role.name),
    permissions
  };
};

const readRoles = async (activeOnly = false) => {
  await ensureRbacSeeded();
  return prisma.staffRole.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: {
      rolePermissions: {
        include: {
          permission: {
            select: { key: true }
          }
        }
      },
      _count: {
        select: { staffUsers: true }
      }
    },
    orderBy: [{ isSystemRole: 'desc' }, { name: 'asc' }]
  });
};

router.get('/permissions', requirePermission('rbac.roles.read'), async (_req, res) => {
  try {
    await ensureRbacSeeded();
    const permissions = await prisma.staffPermission.findMany({
      orderBy: [{ groupName: 'asc' }, { key: 'asc' }]
    });
    const grouped = permissions.reduce((acc: Record<string, any[]>, permission) => {
      const group = permission.groupName || 'General';
      if (!acc[group]) acc[group] = [];
      acc[group].push({
        id: permission.id,
        key: permission.key,
        label: permission.label,
        groupName: permission.groupName
      });
      return acc;
    }, {});
    return res.json({
      success: true,
      data: {
        permissions: permissions.map((permission) => ({
          id: permission.id,
          key: permission.key,
          label: permission.label,
          groupName: permission.groupName
        })),
        groups: Object.entries(grouped).map(([groupName, items]) => ({ groupName, permissions: items }))
      }
    });
  } catch (error) {
    console.error('[rbac] list permissions failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load permissions', code: 'ERR_INTERNAL' });
  }
});

router.get('/roles', requirePermission('rbac.roles.read'), async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || '').toLowerCase() === 'true';
    const roles = await readRoles(activeOnly);
    return res.json({ success: true, data: roles.map(mapRole) });
  } catch (error) {
    console.error('[rbac] list roles failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load roles', code: 'ERR_INTERNAL' });
  }
});

router.post('/roles', requirePermission('rbac.roles.create'), async (req, res) => {
  try {
    const body = (req.body || {}) as RolePayload;
    const name = String(body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Role name is required', code: 'VALIDATION_ERROR' });
    }

    await ensureRbacSeeded();

    const existing = await prisma.staffRole.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' }
      },
      select: { id: true }
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Role already exists', code: 'ROLE_EXISTS' });
    }

    const permissionKeys = normalizePermissionKeys(body.permissionKeys);
    const permissions = permissionKeys.length
      ? await prisma.staffPermission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } })
      : [];

    const created = await prisma.$transaction(async (tx) => {
      const role = await tx.staffRole.create({
        data: {
          name,
          description: body.description?.trim() || null,
          isActive: body.isActive !== false,
          isSystemRole: Boolean(body.isSystemRole)
        }
      });

      if (permissions.length) {
        await tx.staffRolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true
        });
      }

      return tx.staffRole.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: {
              permission: { select: { key: true } }
            }
          },
          _count: {
            select: { staffUsers: true }
          }
        }
      });
    });

    return res.status(201).json({ success: true, data: mapRole(created) });
  } catch (error) {
    console.error('[rbac] create role failed', error);
    return res.status(500).json({ success: false, error: 'Failed to create role', code: 'ERR_INTERNAL' });
  }
});

router.post('/roles/:id/clone', requirePermission('rbac.roles.create'), async (req, res) => {
  try {
    const source = await prisma.staffRole.findUnique({
      where: { id: req.params.id },
      include: {
        rolePermissions: {
          include: {
            permission: { select: { key: true } }
          }
        }
      }
    });
    if (!source) {
      return res.status(404).json({ success: false, error: 'Role not found', code: 'NOT_FOUND' });
    }

    const requestedName = String(req.body?.name || '').trim();
    const baseName = requestedName || `${source.name} (Copy)`;
    let finalName = baseName;
    let counter = 1;
    while (await prisma.staffRole.findUnique({ where: { name: finalName } })) {
      counter += 1;
      finalName = `${baseName} ${counter}`;
    }

    const permissionKeys = source.rolePermissions.map((entry) => entry.permission.key);
    const permissions = permissionKeys.length
      ? await prisma.staffPermission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } })
      : [];

    const cloned = await prisma.$transaction(async (tx) => {
      const createdRole = await tx.staffRole.create({
        data: {
          name: finalName,
          description: source.description || '',
          isSystemRole: false,
          isActive: source.isActive
        }
      });
      if (permissions.length) {
        await tx.staffRolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: createdRole.id, permissionId: permission.id })),
          skipDuplicates: true
        });
      }
      return tx.staffRole.findUnique({
        where: { id: createdRole.id },
        include: {
          rolePermissions: {
            include: {
              permission: { select: { key: true } }
            }
          },
          _count: {
            select: { staffUsers: true }
          }
        }
      });
    });

    return res.status(201).json({ success: true, data: mapRole(cloned) });
  } catch (error) {
    console.error('[rbac] clone role failed', error);
    return res.status(500).json({ success: false, error: 'Failed to clone role', code: 'ERR_INTERNAL' });
  }
});

router.put('/roles/:id', requirePermission('rbac.roles.update'), async (req, res) => {
  try {
    const roleId = req.params.id;
    const body = (req.body || {}) as RolePayload;
    const role = await prisma.staffRole.findUnique({ where: { id: roleId } });
    if (!role) {
      return res.status(404).json({ success: false, error: 'Role not found', code: 'NOT_FOUND' });
    }

    const nextName = String(body.name || role.name).trim();
    if (!nextName) {
      return res.status(400).json({ success: false, error: 'Role name is required', code: 'VALIDATION_ERROR' });
    }

    const duplicate = await prisma.staffRole.findFirst({
      where: {
        name: { equals: nextName, mode: 'insensitive' },
        id: { not: roleId }
      }
    });
    if (duplicate) {
      return res.status(409).json({ success: false, error: 'Role already exists', code: 'ROLE_EXISTS' });
    }

    const permissionKeys = normalizePermissionKeys(body.permissionKeys);
    const permissions = permissionKeys.length
      ? await prisma.staffPermission.findMany({
          where: { key: { in: permissionKeys } },
          select: { id: true }
        })
      : [];

    const updated = await prisma.$transaction(async (tx) => {
      await tx.staffRole.update({
        where: { id: roleId },
        data: {
          name: nextName,
          description: body.description?.trim() || null,
          isActive: body.isActive === undefined ? role.isActive : Boolean(body.isActive)
        }
      });

      await tx.staffRolePermission.deleteMany({ where: { roleId } });
      if (permissions.length) {
        await tx.staffRolePermission.createMany({
          data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
          skipDuplicates: true
        });
      }

      return tx.staffRole.findUnique({
        where: { id: roleId },
        include: {
          rolePermissions: {
            include: {
              permission: { select: { key: true } }
            }
          },
          _count: {
            select: { staffUsers: true }
          }
        }
      });
    });

    return res.json({ success: true, data: mapRole(updated) });
  } catch (error) {
    console.error('[rbac] update role failed', error);
    return res.status(500).json({ success: false, error: 'Failed to update role', code: 'ERR_INTERNAL' });
  }
});

router.delete('/roles/:id', requirePermission('rbac.roles.delete'), async (req, res) => {
  try {
    const roleId = req.params.id;
    const role = await prisma.staffRole.findUnique({
      where: { id: roleId },
      include: { _count: { select: { staffUsers: true } } }
    });
    if (!role) {
      return res.status(404).json({ success: false, error: 'Role not found', code: 'NOT_FOUND' });
    }

    if (role.name.toLowerCase() === 'admin') {
      return res.status(400).json({ success: false, error: 'Admin role cannot be deactivated', code: 'ROLE_PROTECTED' });
    }

    if (role._count.staffUsers > 0) {
      return res.status(409).json({
        success: false,
        error: 'Role is assigned to staff members. Reassign staff before deactivating.',
        code: 'ROLE_IN_USE'
      });
    }

    await prisma.staffRole.update({
      where: { id: roleId },
      data: { isActive: false }
    });

    return res.json({ success: true, data: { id: roleId, isActive: false } });
  } catch (error) {
    console.error('[rbac] deactivate role failed', error);
    return res.status(500).json({ success: false, error: 'Failed to deactivate role', code: 'ERR_INTERNAL' });
  }
});

export default router;
