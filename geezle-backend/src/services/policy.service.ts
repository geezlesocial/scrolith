import prisma from '../utils/prismaClient';

type PolicyResourceSeed = {
  key: string;
  label: string;
  description?: string;
};

type PolicyNamespaceSeed = {
  key: string;
  label: string;
  description?: string;
  resources: PolicyResourceSeed[];
};

type PolicyRuleFilters = {
  namespaceKey?: string;
  resourceKey?: string;
  activeOnly?: boolean;
  query?: string;
  permissionKey?: string;
};

type SavePolicyRuleInput = {
  id?: string;
  namespaceKey?: string;
  resourceKey?: string | null;
  key?: string;
  label?: string;
  description?: string | null;
  permissionKey?: string;
  effect?: string;
  conditions?: unknown;
  priority?: number;
  isActive?: boolean;
  isSystemRule?: boolean;
};

type SaveUserPermissionOverrideInput = {
  identifier?: string;
  permissionKey?: string;
  resourceType?: string | null;
  resourceId?: string | null;
  effect?: string;
  reason?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
};

const DEFAULT_POLICY_NAMESPACES: PolicyNamespaceSeed[] = [
  {
    key: 'community',
    label: 'Community',
    description: 'Posts, comments, forums, and social engagement controls.',
    resources: [
      { key: 'posts', label: 'Posts', description: 'Community posts and feed items.' },
      { key: 'comments', label: 'Comments', description: 'Replies and threaded community comments.' },
      { key: 'profiles', label: 'Profiles', description: 'Profile visibility and follow behavior.' }
    ]
  },
  {
    key: 'messaging',
    label: 'Messaging',
    description: 'Realtime messaging, threads, and delivery controls.',
    resources: [
      { key: 'conversations', label: 'Conversations', description: 'Direct and group conversations.' },
      { key: 'voice', label: 'Voice Notes & Calls', description: 'Voice notes and call participation.' }
    ]
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    description: 'Marketplace participation for gigs, jobs, and orders.',
    resources: [
      { key: 'gigs', label: 'Gigs', description: 'Gig visibility, ordering, and sharing.' },
      { key: 'jobs', label: 'Jobs', description: 'Job visibility, applications, and alerts.' },
      { key: 'orders', label: 'Orders', description: 'Order participation and collaboration.' }
    ]
  },
  {
    key: 'files',
    label: 'Files & Media',
    description: 'Uploads, downloads, attachments, and media previews.',
    resources: [
      { key: 'uploads', label: 'Uploads', description: 'User-generated uploads and attachments.' },
      { key: 'media', label: 'Media Library', description: 'Media preview and download permissions.' }
    ]
  },
  {
    key: 'live',
    label: 'Live',
    description: 'Live rooms, presence, chat, and realtime participation.',
    resources: [
      { key: 'rooms', label: 'Live Rooms', description: 'Live room discovery and join permissions.' },
      { key: 'chat', label: 'Live Chat', description: 'Realtime chat in live sessions.' }
    ]
  }
];

const DEFAULT_PERMISSION_SUGGESTIONS = [
  'community.posts.view',
  'community.posts.comment',
  'community.posts.react',
  'community.posts.share',
  'community.profiles.follow',
  'community.profiles.message',
  'messaging.conversations.view',
  'messaging.messages.send',
  'messaging.voice.use',
  'marketplace.gigs.view',
  'marketplace.gigs.order',
  'marketplace.jobs.view',
  'marketplace.jobs.apply',
  'marketplace.orders.collaborate',
  'files.uploads.create',
  'files.media.view',
  'files.media.download',
  'live.rooms.join',
  'live.rooms.host',
  'live.chat.send'
];

let policySeeded = false;

const cleanString = (value: unknown) => String(value || '').trim();

const normalizeOptionalString = (value: unknown) => {
  const next = cleanString(value);
  return next.length ? next : null;
};

const normalizeEffect = (value: unknown) => {
  const effect = cleanString(value).toUpperCase();
  return effect === 'DENY' ? 'DENY' : 'ALLOW';
};

const normalizeConditions = (value: unknown) => {
  if (value && typeof value === 'object') return value;
  return null;
};

const normalizePriority = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(0, Math.min(1000, Math.round(parsed)));
};

const mapNamespace = (namespace: any) => ({
  id: namespace.id,
  key: namespace.key,
  label: namespace.label,
  description: namespace.description || '',
  isSystemNamespace: Boolean(namespace.isSystemNamespace),
  isActive: Boolean(namespace.isActive),
  resources: Array.isArray(namespace.resources)
    ? namespace.resources.map((resource: any) => ({
        id: resource.id,
        key: resource.key,
        label: resource.label,
        description: resource.description || '',
        isActive: Boolean(resource.isActive)
      }))
    : []
});

const mapRule = (rule: any) => ({
  id: rule.id,
  key: rule.key,
  label: rule.label,
  description: rule.description || '',
  permissionKey: rule.permissionKey,
  effect: rule.effect,
  priority: Number(rule.priority || 0),
  isSystemRule: Boolean(rule.isSystemRule),
  isActive: Boolean(rule.isActive),
  conditions: rule.conditions || null,
  createdByStaffId: rule.createdByStaffId || null,
  updatedByStaffId: rule.updatedByStaffId || null,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt,
  namespaceId: rule.namespaceId,
  namespaceKey: rule.namespace?.key || '',
  namespaceLabel: rule.namespace?.label || '',
  resourceId: rule.resourceId || null,
  resourceKey: rule.resource?.key || null,
  resourceLabel: rule.resource?.label || null
});

const mapOverride = (override: any, user?: any) => ({
  id: override.id,
  userId: override.userId,
  permissionKey: override.permissionKey,
  resourceType: override.resourceType || null,
  resourceId: override.resourceId || null,
  effect: override.effect,
  reason: override.reason || '',
  expiresAt: override.expiresAt,
  isActive: Boolean(override.isActive),
  createdByStaffId: override.createdByStaffId || null,
  updatedByStaffId: override.updatedByStaffId || null,
  createdAt: override.createdAt,
  updatedAt: override.updatedAt,
  user: user
    ? {
        id: user.id,
        email: user.email,
        username: user.username || '',
        name: user.name || '',
        role: user.role,
        isActive: Boolean(user.isActive)
      }
    : null
});

const createPolicyAuditLog = async (input: {
  permissionKey: string;
  decision: string;
  staffUserId?: string | null;
  subjectUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  source?: string | null;
  context?: unknown;
}) => {
  await prisma.permissionDecisionLog.create({
    data: {
      permissionKey: input.permissionKey,
      decision: input.decision,
      staffUserId: input.staffUserId || null,
      subjectUserId: input.subjectUserId || null,
      resourceType: input.resourceType || null,
      resourceId: input.resourceId || null,
      source: input.source || 'policy_center',
      context: (input.context as any) || null
    }
  });
};

const resolveUserByIdentifier = async (identifier: string) => {
  const cleaned = cleanString(identifier);
  if (!cleaned) return null;

  return prisma.user.findFirst({
    where: {
      OR: [
        { id: cleaned },
        { email: { equals: cleaned, mode: 'insensitive' } },
        { username: { equals: cleaned, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      isActive: true
    }
  });
};

export const ensurePolicyCatalogSeeded = async () => {
  if (policySeeded) return;

  for (const namespaceSeed of DEFAULT_POLICY_NAMESPACES) {
    const namespace = await prisma.policyNamespace.upsert({
      where: { key: namespaceSeed.key },
      create: {
        key: namespaceSeed.key,
        label: namespaceSeed.label,
        description: namespaceSeed.description || null,
        isSystemNamespace: true,
        isActive: true
      },
      update: {
        label: namespaceSeed.label,
        description: namespaceSeed.description || null,
        isSystemNamespace: true,
        isActive: true
      }
    });

    for (const resourceSeed of namespaceSeed.resources) {
      await prisma.policyResource.upsert({
        where: {
          namespaceId_key: {
            namespaceId: namespace.id,
            key: resourceSeed.key
          }
        },
        create: {
          namespaceId: namespace.id,
          key: resourceSeed.key,
          label: resourceSeed.label,
          description: resourceSeed.description || null,
          isActive: true
        },
        update: {
          label: resourceSeed.label,
          description: resourceSeed.description || null,
          isActive: true
        }
      });
    }
  }

  policySeeded = true;
};

export const getPolicyCatalog = async () => {
  await ensurePolicyCatalogSeeded();
  const namespaces = await prisma.policyNamespace.findMany({
    include: {
      resources: {
        where: { isActive: true },
        orderBy: { label: 'asc' }
      }
    },
    where: { isActive: true },
    orderBy: { label: 'asc' }
  });

  return {
    namespaces: namespaces.map(mapNamespace),
    permissionSuggestions: DEFAULT_PERMISSION_SUGGESTIONS
  };
};

export const getPolicySummary = async () => {
  await ensurePolicyCatalogSeeded();
  const [namespaceCount, resourceCount, ruleCount, activeRuleCount, overrideCount, activeOverrideCount] =
    await prisma.$transaction([
      prisma.policyNamespace.count(),
      prisma.policyResource.count(),
      prisma.policyRule.count(),
      prisma.policyRule.count({ where: { isActive: true } }),
      prisma.userPermissionOverride.count(),
      prisma.userPermissionOverride.count({ where: { isActive: true } })
    ]);

  return {
    namespaces: namespaceCount,
    resources: resourceCount,
    rules: ruleCount,
    activeRules: activeRuleCount,
    overrides: overrideCount,
    activeOverrides: activeOverrideCount,
    permissionSuggestions: DEFAULT_PERMISSION_SUGGESTIONS.length
  };
};

export const listPolicyRules = async (filters: PolicyRuleFilters = {}) => {
  await ensurePolicyCatalogSeeded();

  let namespaceId: string | undefined;
  if (cleanString(filters.namespaceKey)) {
    const namespace = await prisma.policyNamespace.findUnique({
      where: { key: cleanString(filters.namespaceKey) },
      select: { id: true }
    });
    if (!namespace?.id) return [];
    namespaceId = namespace.id;
  }

  let resourceId: string | undefined;
  if (cleanString(filters.resourceKey)) {
    const resource = await prisma.policyResource.findFirst({
      where: {
        key: cleanString(filters.resourceKey),
        ...(namespaceId ? { namespaceId } : {})
      },
      select: { id: true }
    });
    if (!resource?.id) return [];
    resourceId = resource.id;
  }

  const query = cleanString(filters.query);
  const permissionKey = cleanString(filters.permissionKey);
  const rules = await prisma.policyRule.findMany({
    where: {
      ...(namespaceId ? { namespaceId } : {}),
      ...(resourceId ? { resourceId } : {}),
      ...(filters.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : {}),
      ...(permissionKey ? { permissionKey: { contains: permissionKey, mode: 'insensitive' } } : {}),
      ...(query
        ? {
            OR: [
              { key: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { permissionKey: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    include: {
      namespace: {
        select: { key: true, label: true }
      },
      resource: {
        select: { key: true, label: true }
      }
    },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
  });

  return rules.map(mapRule);
};

export const savePolicyRule = async (input: SavePolicyRuleInput, staffUserId?: string | null) => {
  await ensurePolicyCatalogSeeded();

  const namespaceKey = cleanString(input.namespaceKey);
  const key = cleanString(input.key);
  const label = cleanString(input.label);
  const permissionKey = cleanString(input.permissionKey);

  if (!namespaceKey) throw new Error('Namespace is required');
  if (!key) throw new Error('Rule key is required');
  if (!label) throw new Error('Rule label is required');
  if (!permissionKey) throw new Error('Permission key is required');

  const namespace = await prisma.policyNamespace.findUnique({
    where: { key: namespaceKey },
    select: { id: true, key: true, label: true }
  });
  if (!namespace?.id) throw new Error('Policy namespace not found');

  const resourceKey = cleanString(input.resourceKey);
  let resource: { id: string; key: string; label: string } | null = null;
  if (resourceKey) {
    resource = await prisma.policyResource.findFirst({
      where: {
        namespaceId: namespace.id,
        key: resourceKey
      },
      select: { id: true, key: true, label: true }
    });
    if (!resource?.id) throw new Error('Policy resource not found for namespace');
  }

  const payload = {
    namespaceId: namespace.id,
    resourceId: resource?.id || null,
    key,
    label,
    description: normalizeOptionalString(input.description),
    permissionKey,
    effect: normalizeEffect(input.effect),
    conditions: normalizeConditions(input.conditions) as any,
    priority: normalizePriority(input.priority),
    isSystemRule: Boolean(input.isSystemRule),
    isActive: input.isActive !== false,
    updatedByStaffId: staffUserId || null
  };

  const stored = input.id
    ? await prisma.policyRule.update({
        where: { id: input.id },
        data: payload,
        include: {
          namespace: { select: { key: true, label: true } },
          resource: { select: { key: true, label: true } }
        }
      })
    : await prisma.policyRule.create({
        data: {
          ...payload,
          createdByStaffId: staffUserId || null
        },
        include: {
          namespace: { select: { key: true, label: true } },
          resource: { select: { key: true, label: true } }
        }
      });

  await createPolicyAuditLog({
    permissionKey,
    decision: input.id ? 'RULE_UPDATED' : 'RULE_CREATED',
    staffUserId,
    resourceType: resource?.key || null,
    resourceId: resource?.id || null,
    context: {
      ruleId: stored.id,
      namespaceKey,
      resourceKey: resource?.key || null,
      effect: stored.effect,
      isActive: stored.isActive
    }
  });

  return mapRule(stored);
};

export const deactivatePolicyRule = async (id: string, staffUserId?: string | null) => {
  const rule = await prisma.policyRule.update({
    where: { id },
    data: {
      isActive: false,
      updatedByStaffId: staffUserId || null
    },
    include: {
      namespace: { select: { key: true, label: true } },
      resource: { select: { key: true, label: true } }
    }
  });

  await createPolicyAuditLog({
    permissionKey: rule.permissionKey,
    decision: 'RULE_DEACTIVATED',
    staffUserId,
    resourceType: rule.resource?.key || null,
    resourceId: rule.resourceId || null,
    context: {
      ruleId: rule.id,
      namespaceKey: rule.namespace?.key || null
    }
  });

  return mapRule(rule);
};

export const getUserPermissionOverrides = async (identifier: string) => {
  const user = await resolveUserByIdentifier(identifier);
  if (!user?.id) {
    return {
      user: null,
      overrides: []
    };
  }

  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }]
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username || '',
      name: user.name || '',
      role: user.role,
      isActive: Boolean(user.isActive)
    },
    overrides: overrides.map((override) => mapOverride(override, user))
  };
};

export const createUserPermissionOverride = async (
  input: SaveUserPermissionOverrideInput,
  staffUserId?: string | null
) => {
  const identifier = cleanString(input.identifier);
  if (!identifier) throw new Error('User email or ID is required');

  const permissionKey = cleanString(input.permissionKey);
  if (!permissionKey) throw new Error('Permission key is required');

  const user = await resolveUserByIdentifier(identifier);
  if (!user?.id) throw new Error('User not found');

  const override = await prisma.userPermissionOverride.create({
    data: {
      userId: user.id,
      permissionKey,
      resourceType: normalizeOptionalString(input.resourceType),
      resourceId: normalizeOptionalString(input.resourceId),
      effect: normalizeEffect(input.effect),
      reason: normalizeOptionalString(input.reason),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      isActive: input.isActive !== false,
      createdByStaffId: staffUserId || null,
      updatedByStaffId: staffUserId || null
    }
  });

  await createPolicyAuditLog({
    permissionKey,
    decision: 'OVERRIDE_CREATED',
    staffUserId,
    subjectUserId: user.id,
    resourceType: override.resourceType,
    resourceId: override.resourceId,
    context: {
      overrideId: override.id,
      effect: override.effect,
      reason: override.reason
    }
  });

  return mapOverride(override, user);
};

export const updateUserPermissionOverride = async (
  id: string,
  input: SaveUserPermissionOverrideInput,
  staffUserId?: string | null
) => {
  const existing = await prisma.userPermissionOverride.findUnique({ where: { id } });
  if (!existing?.id) throw new Error('User permission override not found');

  const user = input.identifier ? await resolveUserByIdentifier(input.identifier) : await prisma.user.findUnique({
    where: { id: existing.userId },
    select: { id: true, email: true, username: true, name: true, role: true, isActive: true }
  });
  if (!user?.id) throw new Error('User not found');

  const permissionKey = cleanString(input.permissionKey) || existing.permissionKey;
  const updated = await prisma.userPermissionOverride.update({
    where: { id },
    data: {
      userId: user.id,
      permissionKey,
      resourceType: input.resourceType !== undefined ? normalizeOptionalString(input.resourceType) : existing.resourceType,
      resourceId: input.resourceId !== undefined ? normalizeOptionalString(input.resourceId) : existing.resourceId,
      effect: input.effect !== undefined ? normalizeEffect(input.effect) : existing.effect,
      reason: input.reason !== undefined ? normalizeOptionalString(input.reason) : existing.reason,
      expiresAt: input.expiresAt !== undefined ? (input.expiresAt ? new Date(input.expiresAt) : null) : existing.expiresAt,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
      updatedByStaffId: staffUserId || null
    }
  });

  await createPolicyAuditLog({
    permissionKey: updated.permissionKey,
    decision: 'OVERRIDE_UPDATED',
    staffUserId,
    subjectUserId: updated.userId,
    resourceType: updated.resourceType,
    resourceId: updated.resourceId,
    context: {
      overrideId: updated.id,
      effect: updated.effect,
      isActive: updated.isActive
    }
  });

  return mapOverride(updated, user);
};

export const deactivateUserPermissionOverride = async (id: string, staffUserId?: string | null) => {
  const updated = await prisma.userPermissionOverride.update({
    where: { id },
    data: {
      isActive: false,
      updatedByStaffId: staffUserId || null
    }
  });

  const user = await prisma.user.findUnique({
    where: { id: updated.userId },
    select: { id: true, email: true, username: true, name: true, role: true, isActive: true }
  });

  await createPolicyAuditLog({
    permissionKey: updated.permissionKey,
    decision: 'OVERRIDE_DEACTIVATED',
    staffUserId,
    subjectUserId: updated.userId,
    resourceType: updated.resourceType,
    resourceId: updated.resourceId,
    context: {
      overrideId: updated.id
    }
  });

  return mapOverride(updated, user);
};
