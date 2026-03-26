import prisma from '../utils/prismaClient';

export type StaffContext = {
  isAdmin: boolean;
  staffId?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  roleActive?: boolean;
  roleName?: string;
  permissions: Set<string>;
};

type PermissionSeed = {
  key: string;
  label: string;
  groupName: string;
};

type RoleSeed = {
  name: string;
  description: string;
  isSystemRole: boolean;
  permissionKeys: string[];
};

export const DEFAULT_PERMISSION_SEEDS: PermissionSeed[] = [
  { key: 'users.read', label: 'View users', groupName: 'Users & Support' },
  { key: 'users.update_status', label: 'Update user status', groupName: 'Users & Support' },
  { key: 'support.tickets.read', label: 'View support tickets', groupName: 'Users & Support' },
  { key: 'support.tickets.reply', label: 'Reply to support tickets', groupName: 'Users & Support' },
  { key: 'support.tickets.assign', label: 'Assign support tickets', groupName: 'Users & Support' },
  { key: 'support.tickets.close', label: 'Close support tickets', groupName: 'Users & Support' },

  { key: 'community.posts.read', label: 'Read community posts', groupName: 'Community & Forum' },
  { key: 'community.posts.moderate', label: 'Moderate community posts', groupName: 'Community & Forum' },
  { key: 'community.comments.moderate', label: 'Moderate community comments', groupName: 'Community & Forum' },
  { key: 'community.reports.read', label: 'View community reports', groupName: 'Community & Forum' },
  { key: 'community.reports.resolve', label: 'Resolve community reports', groupName: 'Community & Forum' },

  { key: 'chat.read_any', label: 'Read all chats', groupName: 'Messaging Moderation' },
  { key: 'chat.message_any', label: 'Send moderator chat messages', groupName: 'Messaging Moderation' },
  { key: 'chat.warn_user', label: 'Send warning templates', groupName: 'Messaging Moderation' },
  { key: 'chat.audit.read', label: 'View chat moderation audit logs', groupName: 'Messaging Moderation' },
  { key: 'chat.records.read', label: 'Read message records', groupName: 'Messaging Moderation' },
  { key: 'chat.records.export', label: 'Export message records', groupName: 'Messaging Moderation' },
  { key: 'chat.retention.manage', label: 'Manage message retention policy', groupName: 'Messaging Moderation' },

  { key: 'cms.pages.read', label: 'Read CMS pages', groupName: 'Content' },
  { key: 'cms.pages.create', label: 'Create CMS pages', groupName: 'Content' },
  { key: 'cms.pages.update', label: 'Update CMS pages', groupName: 'Content' },
  { key: 'cms.pages.publish', label: 'Publish CMS pages', groupName: 'Content' },
  { key: 'cms.blog.read', label: 'Read blog content', groupName: 'Content' },
  { key: 'cms.blog.create', label: 'Create blog posts', groupName: 'Content' },
  { key: 'cms.blog.update', label: 'Update blog posts', groupName: 'Content' },
  { key: 'cms.blog.publish', label: 'Publish blog posts', groupName: 'Content' },

  { key: 'rbac.roles.read', label: 'Read RBAC roles', groupName: 'Staff & RBAC' },
  { key: 'rbac.roles.create', label: 'Create RBAC roles', groupName: 'Staff & RBAC' },
  { key: 'rbac.roles.update', label: 'Update RBAC roles', groupName: 'Staff & RBAC' },
  { key: 'rbac.roles.delete', label: 'Delete RBAC roles', groupName: 'Staff & RBAC' },
  { key: 'policies.read', label: 'Read policy center', groupName: 'Staff & RBAC' },
  { key: 'policies.rules.create', label: 'Create policy rules', groupName: 'Staff & RBAC' },
  { key: 'policies.rules.update', label: 'Update policy rules', groupName: 'Staff & RBAC' },
  { key: 'policies.rules.delete', label: 'Deactivate policy rules', groupName: 'Staff & RBAC' },
  { key: 'policies.overrides.read', label: 'Read user permission overrides', groupName: 'Staff & RBAC' },
  { key: 'policies.overrides.manage', label: 'Manage user permission overrides', groupName: 'Staff & RBAC' },
  { key: 'feature_flags.read', label: 'Read feature control center', groupName: 'Staff & RBAC' },
  { key: 'feature_flags.write', label: 'Create and update feature flags', groupName: 'Staff & RBAC' },
  { key: 'feature_flags.kill_switch', label: 'Toggle feature flag kill switches', groupName: 'Staff & RBAC' },
  { key: 'feature_flags.audit.read', label: 'Read feature flag audit and exposure logs', groupName: 'Staff & RBAC' },
  { key: 'moderation.policies.read', label: 'Read moderation policies', groupName: 'Moderation & Trust' },
  { key: 'moderation.policies.write', label: 'Create and update moderation policies', groupName: 'Moderation & Trust' },
  { key: 'moderation.appeals.manage', label: 'Manage moderation appeals', groupName: 'Moderation & Trust' },
  { key: 'trust.read', label: 'Read trust center', groupName: 'Moderation & Trust' },
  { key: 'trust.write', label: 'Create trust signals and recompute trust profiles', groupName: 'Moderation & Trust' },
  { key: 'staff.read', label: 'Read staff members', groupName: 'Staff & RBAC' },
  { key: 'staff.create', label: 'Create staff members', groupName: 'Staff & RBAC' },
  { key: 'staff.update', label: 'Update staff members', groupName: 'Staff & RBAC' },
  { key: 'staff.reset_password', label: 'Reset staff passwords', groupName: 'Staff & RBAC' },
  { key: 'staff.force_2fa', label: 'Enforce staff 2FA', groupName: 'Staff & RBAC' }
];

const ALL_PERMISSION_KEYS = DEFAULT_PERMISSION_SEEDS.map((permission) => permission.key);

const DEFAULT_ROLE_SEEDS: RoleSeed[] = [
  {
    name: 'Admin',
    description: 'Full platform administration access',
    isSystemRole: true,
    permissionKeys: ALL_PERMISSION_KEYS
  },
  {
    name: 'Moderator',
    description: 'Community and chat moderation access',
    isSystemRole: true,
    permissionKeys: [
      'users.read',
      'community.posts.read',
      'community.posts.moderate',
      'community.comments.moderate',
      'community.reports.read',
      'community.reports.resolve',
      'chat.read_any',
      'chat.message_any',
      'chat.warn_user',
      'chat.audit.read',
      'chat.records.read',
      'chat.records.export',
      'moderation.policies.read',
      'moderation.appeals.manage',
      'trust.read'
    ]
  },
  {
    name: 'Customer Support',
    description: 'Support ticket and user support access',
    isSystemRole: true,
    permissionKeys: [
      'users.read',
      'support.tickets.read',
      'support.tickets.reply',
      'support.tickets.assign',
      'support.tickets.close',
      'chat.read_any',
      'chat.records.read'
    ]
  },
  {
    name: 'Author/Editor/Writer',
    description: 'Content and publishing management access',
    isSystemRole: true,
    permissionKeys: [
      'cms.pages.read',
      'cms.pages.create',
      'cms.pages.update',
      'cms.pages.publish',
      'cms.blog.read',
      'cms.blog.create',
      'cms.blog.update',
      'cms.blog.publish'
    ]
  }
];

let seeded = false;

export const isAdminRole = (role?: string | null) => {
  const normalized = String(role || '').toLowerCase();
  return normalized.includes('admin');
};

const normalizeUsernameBase = (email?: string | null, userId?: string | null) => {
  const fromEmail = String(email || '')
    .toLowerCase()
    .trim();
  if (fromEmail) return fromEmail;
  return `staff-${String(userId || '').toLowerCase()}`;
};

const buildUniqueStaffUsername = async (baseInput: string) => {
  let candidate = String(baseInput || '').trim().toLowerCase();
  if (!candidate) candidate = `staff-${Math.random().toString(36).slice(2, 10)}`;
  const hasAt = candidate.includes('@');
  const normalizedBase = hasAt ? candidate : `${candidate}@staff.local`;
  let finalCandidate = normalizedBase;
  let counter = 1;
  while (await prisma.staffUser.findUnique({ where: { username: finalCandidate } })) {
    counter += 1;
    if (hasAt) {
      const [local, domain = 'staff.local'] = normalizedBase.split('@');
      finalCandidate = `${local}+${counter}@${domain}`;
    } else {
      finalCandidate = `${normalizedBase.replace('@staff.local', '')}+${counter}@staff.local`;
    }
  }
  return finalCandidate;
};

export const ensureAdminStaffProfile = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  await ensureRbacSeeded();

  const existing = await prisma.staffUser.findUnique({ where: { userId }, select: { id: true } });
  if (existing?.id) return existing.id;

  const [user, adminRole] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    }),
    prisma.staffRole.findUnique({ where: { name: 'Admin' }, select: { id: true, isActive: true } })
  ]);

  if (!user || !isAdminRole(String(user.role || '')) || !adminRole?.id || !adminRole.isActive) {
    return null;
  }

  const email = String(user.email || '').toLowerCase().trim() || `admin-${user.id}@staff.local`;
  const username = await buildUniqueStaffUsername(normalizeUsernameBase(user.email, user.id));
  const fullName = String(user.name || '').trim() || email.split('@')[0] || 'Administrator';

  const created = await prisma.staffUser.create({
    data: {
      userId: user.id,
      fullName,
      email,
      username,
      roleId: adminRole.id,
      status: 'ACTIVE',
      forcePasswordReset: false,
      require2FA: false
    },
    select: { id: true }
  });

  return created.id;
};

export const ensureRbacSeeded = async () => {
  if (seeded) return;

  for (const permission of DEFAULT_PERMISSION_SEEDS) {
    await prisma.staffPermission.upsert({
      where: { key: permission.key },
      create: {
        key: permission.key,
        label: permission.label,
        groupName: permission.groupName
      },
      update: {
        label: permission.label,
        groupName: permission.groupName
      }
    });
  }

  const permissionMap = new Map(
    (
      await prisma.staffPermission.findMany({
        select: { id: true, key: true }
      })
    ).map((permission) => [permission.key, permission.id])
  );

  for (const role of DEFAULT_ROLE_SEEDS) {
    const storedRole = await prisma.staffRole.upsert({
      where: { name: role.name },
      create: {
        name: role.name,
        description: role.description,
        isSystemRole: role.isSystemRole,
        isActive: true
      },
      update: {
        description: role.description,
        isSystemRole: role.isSystemRole,
        isActive: true
      }
    });

    const permissionIds = Array.from(
      new Set(role.permissionKeys.map((key) => permissionMap.get(key)).filter(Boolean) as string[])
    );

    await prisma.staffRolePermission.deleteMany({ where: { roleId: storedRole.id } });

    if (permissionIds.length) {
      await prisma.staffRolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: storedRole.id,
          permissionId
        })),
        skipDuplicates: true
      });
    }
  }

  seeded = true;
};

export const getStaffContext = async (userId: string, role?: string | null): Promise<StaffContext> => {
  if (isAdminRole(role)) {
    return {
      isAdmin: true,
      status: 'ACTIVE',
      roleActive: true,
      roleName: 'Admin',
      permissions: new Set(ALL_PERMISSION_KEYS)
    };
  }

  const staff = await prisma.staffUser.findUnique({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: { key: true }
              }
            }
          }
        }
      }
    }
  });

  if (!staff) {
    return {
      isAdmin: false,
      permissions: new Set<string>()
    };
  }

  return {
    isAdmin: false,
    staffId: staff.id,
    status: staff.status,
    roleActive: staff.role?.isActive ?? false,
    roleName: staff.role?.name,
    permissions: new Set(staff.role?.rolePermissions?.map((entry) => entry.permission.key) || [])
  };
};

export const hasPermission = async (
  userId: string,
  role: string | null | undefined,
  permissionKey: string
): Promise<boolean> => {
  const context = await getStaffContext(userId, role);
  if (context.isAdmin) return true;
  if (!context.staffId) return false;
  if (context.status !== 'ACTIVE') return false;
  if (!context.roleActive) return false;
  return context.permissions.has(permissionKey);
};
