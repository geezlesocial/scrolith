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
  { key: 'users.update', label: 'Update user profiles', groupName: 'Users & Support' },
  { key: 'users.update_status', label: 'Update user status', groupName: 'Users & Support' },
  { key: 'users.delete', label: 'Delete users', groupName: 'Users & Support' },
  { key: 'users.moderate', label: 'Moderate user accounts', groupName: 'Users & Support' },
  { key: 'users.wallets.manage', label: 'Manage user wallets and Gcoin', groupName: 'Users & Support' },
  { key: 'marketing.subscribers.read', label: 'View subscribers', groupName: 'Users & Support' },
  { key: 'marketing.subscribers.manage', label: 'Manage subscribers', groupName: 'Users & Support' },
  { key: 'marketing.analytics.read', label: 'View subscriber analytics', groupName: 'Users & Support' },
  { key: 'support.tickets.read', label: 'View support tickets', groupName: 'Users & Support' },
  { key: 'support.tickets.reply', label: 'Reply to support tickets', groupName: 'Users & Support' },
  { key: 'support.tickets.assign', label: 'Assign support tickets', groupName: 'Users & Support' },
  { key: 'support.tickets.close', label: 'Close support tickets', groupName: 'Users & Support' },

  { key: 'community.posts.read', label: 'Read community posts', groupName: 'Community & Forum' },
  { key: 'community.posts.moderate', label: 'Moderate community posts', groupName: 'Community & Forum' },
  { key: 'community.comments.moderate', label: 'Moderate community comments', groupName: 'Community & Forum' },
  { key: 'community.reports.read', label: 'View community reports', groupName: 'Community & Forum' },
  { key: 'community.reports.resolve', label: 'Resolve community reports', groupName: 'Community & Forum' },
  { key: 'community.accounts.moderate', label: 'Warn, strike, and restrict community accounts', groupName: 'Community & Forum' },

  { key: 'chat.read_any', label: 'Read all chats', groupName: 'Messaging Moderation' },
  { key: 'chat.message_any', label: 'Send moderator chat messages', groupName: 'Messaging Moderation' },
  { key: 'chat.warn_user', label: 'Send warning templates', groupName: 'Messaging Moderation' },
  { key: 'chat.audit.read', label: 'View chat moderation audit logs', groupName: 'Messaging Moderation' },
  { key: 'chat.records.read', label: 'Read message records', groupName: 'Messaging Moderation' },
  { key: 'chat.records.export', label: 'Export message records', groupName: 'Messaging Moderation' },
  { key: 'chat.retention.manage', label: 'Manage message retention policy', groupName: 'Messaging Moderation' },

  // Phase 29.4 — Enterprise Messaging Groups admin
  { key: 'messaging.groups.read', label: 'View messaging groups admin', groupName: 'Messaging Groups' },
  { key: 'messaging.groups.moderate', label: 'Moderate messaging groups', groupName: 'Messaging Groups' },
  { key: 'messaging.groups.admin', label: 'Full messaging groups administration', groupName: 'Messaging Groups' },
  { key: 'messaging.groups.export', label: 'Export messaging groups data', groupName: 'Messaging Groups' },

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
  { key: 'discovery.read', label: 'Read discovery studio', groupName: 'Discovery & Search' },
  { key: 'discovery.search_rules.manage', label: 'Manage search ranking rules', groupName: 'Discovery & Search' },
  { key: 'discovery.feed_recipes.manage', label: 'Manage feed recipes', groupName: 'Discovery & Search' },
  { key: 'journeys.read', label: 'Read notification and journey center', groupName: 'Notifications & Journeys' },
  { key: 'journeys.templates.manage', label: 'Manage notification templates', groupName: 'Notifications & Journeys' },
  { key: 'journeys.flows.manage', label: 'Manage journey flows', groupName: 'Notifications & Journeys' },
  { key: 'journeys.runs.manage', label: 'Launch journey runs', groupName: 'Notifications & Journeys' },
  { key: 'journeys.quiet_hours.read', label: 'Read user quiet hours', groupName: 'Notifications & Journeys' },
  { key: 'config.read', label: 'Read config and rollback center', groupName: 'System Control' },
  { key: 'config.write', label: 'Create config snapshots and release notes', groupName: 'System Control' },
  { key: 'config.rollback', label: 'Run config rollback operations', groupName: 'System Control' },
  { key: 'realtime.read', label: 'Read realtime ops center', groupName: 'System Control' },
  { key: 'realtime.incidents.manage', label: 'Manage realtime incidents', groupName: 'System Control' },
  { key: 'realtime.replay.manage', label: 'Replay realtime deliveries', groupName: 'System Control' },
  { key: 'moderation.policies.read', label: 'Read moderation policies', groupName: 'Moderation & Trust' },
  { key: 'moderation.policies.write', label: 'Create and update moderation policies', groupName: 'Moderation & Trust' },
  { key: 'moderation.appeals.manage', label: 'Manage moderation appeals', groupName: 'Moderation & Trust' },
  { key: 'trust.read', label: 'Read trust center', groupName: 'Moderation & Trust' },
  { key: 'trust.write', label: 'Create trust signals and recompute trust profiles', groupName: 'Moderation & Trust' },
  { key: 'staff.read', label: 'Read staff members', groupName: 'Staff & RBAC' },
  { key: 'staff.create', label: 'Create staff members', groupName: 'Staff & RBAC' },
  { key: 'staff.update', label: 'Update staff members', groupName: 'Staff & RBAC' },
  { key: 'staff.reset_password', label: 'Reset staff passwords', groupName: 'Staff & RBAC' },
  { key: 'staff.force_2fa', label: 'Enforce staff 2FA', groupName: 'Staff & RBAC' },

  { key: 'listings.read', label: 'Read marketplace listings governance data', groupName: 'Enterprise Governance' },
  { key: 'listings.manage', label: 'Manage marketplace listings governance actions', groupName: 'Enterprise Governance' },
  { key: 'listings.approve', label: 'Approve marketplace listing actions', groupName: 'Enterprise Governance' },
  { key: 'jobs.read', label: 'Read jobs governance data', groupName: 'Enterprise Governance' },
  { key: 'jobs.manage', label: 'Manage job governance actions', groupName: 'Enterprise Governance' },
  { key: 'gigs.read', label: 'Read gigs governance data', groupName: 'Enterprise Governance' },
  { key: 'gigs.manage', label: 'Manage gig governance actions', groupName: 'Enterprise Governance' },
  { key: 'payouts.read', label: 'Read payout governance data', groupName: 'Enterprise Governance' },
  { key: 'payouts.release', label: 'Release payouts', groupName: 'Enterprise Governance' },
  { key: 'disputes.read', label: 'Read disputes governance data', groupName: 'Enterprise Governance' },
  { key: 'disputes.manage', label: 'Manage disputes', groupName: 'Enterprise Governance' },
  { key: 'invoices.read', label: 'Read invoices governance data', groupName: 'Enterprise Governance' },
  { key: 'invoices.approve', label: 'Approve invoices', groupName: 'Enterprise Governance' },
  { key: 'procurement.read', label: 'Read procurement workflows', groupName: 'Enterprise Governance' },
  { key: 'procurement.manage', label: 'Manage procurement workflows', groupName: 'Enterprise Governance' },
  { key: 'budgets.read', label: 'Read budget controls', groupName: 'Enterprise Governance' },
  { key: 'budgets.manage', label: 'Manage budget controls', groupName: 'Enterprise Governance' },
  { key: 'kyc.read', label: 'Read KYC governance data (legacy)', groupName: 'Enterprise Governance' },
  { key: 'kyc.review', label: 'Review KYC decisions (legacy)', groupName: 'Enterprise Governance' },
  // Phase 20.2 least-privilege KYC permissions
  { key: 'kyc.case.read', label: 'Read KYC cases and queue', groupName: 'KYC Identity' },
  { key: 'kyc.document.view', label: 'View KYC identity documents', groupName: 'KYC Identity' },
  { key: 'kyc.review.recommend', label: 'Recommend KYC outcomes without final decision', groupName: 'KYC Identity' },
  { key: 'kyc.decision.approve', label: 'Approve KYC verification', groupName: 'KYC Identity' },
  { key: 'kyc.decision.reject', label: 'Reject KYC verification', groupName: 'KYC Identity' },
  { key: 'kyc.decision.resubmit', label: 'Request KYC resubmission', groupName: 'KYC Identity' },
  { key: 'kyc.decision.revoke', label: 'Revoke KYC verification', groupName: 'KYC Identity' },
  { key: 'kyc.config.read', label: 'Read KYC form configuration', groupName: 'KYC Identity' },
  { key: 'kyc.config.write', label: 'Update KYC form configuration', groupName: 'KYC Identity' },
  { key: 'kyc.audit.read', label: 'Read KYC audit events', groupName: 'KYC Identity' },
  { key: 'kyc.export', label: 'Export KYC data under policy control', groupName: 'KYC Identity' },
  { key: 'kyc.delete', label: 'Delete KYC data under policy control', groupName: 'KYC Identity' },
  { key: 'live.read', label: 'Read live governance data', groupName: 'Enterprise Governance' },
  { key: 'live.manage', label: 'Manage live governance actions', groupName: 'Enterprise Governance' },
  { key: 'cms.read', label: 'Read enterprise CMS governance data', groupName: 'Enterprise Governance' },
  { key: 'cms.manage', label: 'Manage enterprise CMS governance actions', groupName: 'Enterprise Governance' },
  { key: 'ai.read', label: 'Read enterprise AI governance data', groupName: 'Enterprise Governance' },
  { key: 'ai.manage', label: 'Manage enterprise AI governance actions', groupName: 'Enterprise Governance' },
  { key: 'settings.read', label: 'Read enterprise settings', groupName: 'Enterprise Governance' },
  { key: 'settings.update', label: 'Update enterprise settings', groupName: 'Enterprise Governance' },
  { key: 'settings.enterprise_change', label: 'Change governed enterprise settings', groupName: 'Enterprise Governance' },
  { key: 'approvals.read', label: 'Read approval policies and requests', groupName: 'Enterprise Governance' },
  { key: 'approvals.review', label: 'Review approval requests', groupName: 'Enterprise Governance' },
  { key: 'approvals.manage', label: 'Manage approval policies', groupName: 'Enterprise Governance' },
  { key: 'audit.read', label: 'Read enterprise audit logs', groupName: 'Enterprise Governance' },
  { key: 'security.alerts.read', label: 'Read security alerts', groupName: 'Enterprise Governance' },
  { key: 'security.alerts.manage', label: 'Manage security alerts', groupName: 'Enterprise Governance' },
  { key: 'security.login_approval.manage', label: 'Manage emergency login-approval waivers', groupName: 'Enterprise Governance' },
  { key: 'compliance.read', label: 'Read compliance cases', groupName: 'Enterprise Operations' },
  { key: 'compliance.manage', label: 'Manage compliance cases', groupName: 'Enterprise Operations' },
  { key: 'risk.read', label: 'Read risk rules and scores', groupName: 'Enterprise Operations' },
  { key: 'risk.manage', label: 'Manage risk rules and actions', groupName: 'Enterprise Operations' },
  { key: 'holds.manage', label: 'Manage holds and releases', groupName: 'Enterprise Operations' },
  { key: 'appeals.read', label: 'Read appeals', groupName: 'Enterprise Operations' },
  { key: 'appeals.manage', label: 'Manage appeals', groupName: 'Enterprise Operations' },
  { key: 'talent_cloud.read', label: 'Read private talent cloud', groupName: 'Enterprise Operations' },
  { key: 'talent_cloud.manage', label: 'Manage private talent cloud', groupName: 'Enterprise Operations' },
  { key: 'integrations.read', label: 'Read integrations', groupName: 'Enterprise Operations' },
  { key: 'integrations.manage', label: 'Manage integrations', groupName: 'Enterprise Operations' },
  { key: 'webhooks.read', label: 'Read webhook deliveries', groupName: 'Enterprise Operations' },
  { key: 'webhooks.manage', label: 'Manage webhook deliveries', groupName: 'Enterprise Operations' },
  { key: 'api_keys.read', label: 'Read API keys', groupName: 'Enterprise Operations' },
  { key: 'api_keys.manage', label: 'Manage API keys', groupName: 'Enterprise Operations' },
  { key: 'scrolitha.read', label: 'Read Scrolitha enterprise outputs', groupName: 'Enterprise Operations' },
  { key: 'scrolitha.manage', label: 'Manage Scrolitha enterprise controls', groupName: 'Enterprise Operations' },
  { key: 'managed_delivery.read', label: 'Read managed delivery operations', groupName: 'Enterprise Operations' },
  { key: 'managed_delivery.manage', label: 'Manage managed delivery operations', groupName: 'Enterprise Operations' }
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
      'community.accounts.moderate',
      'chat.read_any',
      'chat.message_any',
      'chat.warn_user',
      'chat.audit.read',
      'chat.records.read',
      'chat.records.export',
      'messaging.groups.read',
      'messaging.groups.moderate',
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
      'chat.records.read',
      'messaging.groups.read'
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
  },
  {
    name: 'Owner',
    description: 'Enterprise workspace owner with full governance visibility and control',
    isSystemRole: true,
    permissionKeys: ALL_PERMISSION_KEYS
  },
  {
    name: 'Finance Admin',
    description: 'Governs invoices, payouts, and finance approvals',
    isSystemRole: true,
    permissionKeys: [
      'staff.read',
      'payouts.read',
      'payouts.release',
      'procurement.read',
      'procurement.manage',
      'budgets.read',
      'budgets.manage',
      'invoices.read',
      'invoices.approve',
      'compliance.read',
      'compliance.manage',
      'risk.read',
      'risk.manage',
      'holds.manage',
      'appeals.read',
      'appeals.manage',
      'talent_cloud.read',
      'talent_cloud.manage',
      'integrations.read',
      'integrations.manage',
      'webhooks.read',
      'webhooks.manage',
      'api_keys.read',
      'api_keys.manage',
      'scrolitha.read',
      'scrolitha.manage',
      'managed_delivery.read',
      'managed_delivery.manage',
      'approvals.read',
      'approvals.review',
      'audit.read',
      'settings.read'
    ]
  },
  {
    name: 'Recruiter',
    description: 'Governs jobs, gigs, and talent operations',
    isSystemRole: true,
    permissionKeys: [
      'staff.read',
      'jobs.read',
      'jobs.manage',
      'gigs.read',
      'gigs.manage',
      'listings.read',
      'audit.read'
    ]
  },
  {
    name: 'Hiring Manager',
    description: 'Approves talent and requisition related activity',
    isSystemRole: true,
    permissionKeys: [
      'jobs.read',
      'jobs.manage',
      'gigs.read',
      'listings.read',
      'procurement.read',
      'approvals.read',
      'approvals.review',
      'audit.read'
    ]
  },
  {
    name: 'Legal',
    description: 'Handles disputes, compliance reviews, and governed settings visibility',
    isSystemRole: true,
    permissionKeys: [
      'disputes.read',
      'disputes.manage',
      'kyc.read',
      'kyc.review',
      'kyc.case.read',
      'kyc.document.view',
      'kyc.review.recommend',
      'kyc.decision.approve',
      'kyc.decision.reject',
      'kyc.decision.resubmit',
      'kyc.decision.revoke',
      'kyc.config.read',
      'kyc.audit.read',
      'invoices.read',
      'compliance.read',
      'appeals.read',
      'approvals.read',
      'audit.read',
      'settings.read',
      'security.alerts.read'
    ]
  },
  {
    name: 'KYC Reviewer',
    description: 'Reviews KYC cases and documents; cannot issue final approval by default',
    isSystemRole: true,
    permissionKeys: [
      'kyc.case.read',
      'kyc.document.view',
      'kyc.review.recommend',
      'kyc.config.read',
      'kyc.audit.read'
    ]
  },
  {
    name: 'Support',
    description: 'Support operations with governed visibility into user and listing issues',
    isSystemRole: true,
    permissionKeys: [
      'users.read',
      'support.tickets.read',
      'support.tickets.reply',
      'support.tickets.assign',
      'support.tickets.close',
      'listings.read',
      'disputes.read',
      'procurement.read',
      'compliance.read',
      'audit.read'
    ]
  },
  {
    name: 'Moderator',
    description: 'Enterprise moderation role with governance visibility',
    isSystemRole: true,
    permissionKeys: [
      'community.posts.read',
      'community.posts.moderate',
      'community.comments.moderate',
      'community.reports.read',
      'community.reports.resolve',
      'community.accounts.moderate',
      'listings.read',
      'audit.read',
      'security.alerts.read',
      'compliance.read',
      'appeals.read'
    ]
  },
  {
    name: 'Analyst',
    description: 'Read-only governance and audit visibility',
    isSystemRole: true,
    permissionKeys: ['audit.read', 'approvals.read', 'security.alerts.read', 'settings.read', 'staff.read', 'procurement.read', 'budgets.read', 'invoices.read', 'risk.read', 'compliance.read', 'talent_cloud.read', 'integrations.read', 'webhooks.read', 'scrolitha.read', 'managed_delivery.read']
  }
];

let seeded = false;

export const isAdminRole = (role?: string | null) => {
  const normalized = String(role || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  // admin, superadmin, super_admin, platform_admin, site_admin, etc.
  return (
    normalized === 'admin' ||
    normalized === 'superadmin' ||
    normalized === 'super_admin' ||
    normalized === 'owner' ||
    normalized.includes('admin')
  );
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
