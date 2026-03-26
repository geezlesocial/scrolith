import prisma from '../utils/prismaClient';

type FeatureFlagSeed = {
  key: string;
  label: string;
  description?: string;
  category?: string;
};

type FeatureFlagFilters = {
  query?: string;
  category?: string;
  activeOnly?: boolean;
  killSwitch?: boolean;
};

type SaveFeatureFlagInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  category?: string | null;
  defaultValue?: boolean;
  isActive?: boolean;
};

type SaveFeatureAudienceInput = {
  id?: string;
  key?: string;
  label?: string;
  roleScope?: string[] | string;
  countryScope?: string[] | string;
  platformScope?: string[] | string;
  appVersions?: string[] | string;
  metadata?: unknown;
  isActive?: boolean;
};

type SaveFeatureRuleInput = {
  id?: string;
  audienceId?: string | null;
  rolloutPercent?: number;
  value?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  priority?: number;
  isActive?: boolean;
  conditions?: unknown;
};

type ResolveFeatureFlagContextInput = {
  key?: string;
  userId?: string | null;
  sessionKey?: string | null;
  role?: string | null;
  country?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  metadata?: unknown;
};

const DEFAULT_FEATURE_FLAGS: FeatureFlagSeed[] = [
  {
    key: 'control_plane_enabled',
    label: 'Control Plane',
    description: 'Master switch for the native Scrolith control plane.',
    category: 'control_plane'
  },
  {
    key: 'policy_center_enabled',
    label: 'Policy Center',
    description: 'Enable Policy Center admin surfaces and evaluations.',
    category: 'staff_control'
  },
  {
    key: 'user_permission_overrides_enabled',
    label: 'User Permission Overrides',
    description: 'Allow per-user permission override behavior.',
    category: 'staff_control'
  },
  {
    key: 'feature_control_center_enabled',
    label: 'Feature Control Center',
    description: 'Enable the native Scrolith feature rollout console.',
    category: 'control_plane'
  },
  {
    key: 'kill_switches_enabled',
    label: 'Kill Switches',
    description: 'Allow emergency global disable actions for flagged features.',
    category: 'control_plane'
  },
  {
    key: 'trust_center_enabled',
    label: 'Trust Center',
    description: 'Enable trust scoring, moderation controls, and safety operations.',
    category: 'trust_safety'
  },
  {
    key: 'appeals_enabled',
    label: 'Appeals',
    description: 'Enable moderation appeals and reviews.',
    category: 'trust_safety'
  },
  {
    key: 'config_rollback_enabled',
    label: 'Config Rollback',
    description: 'Enable config snapshots and safe rollback actions.',
    category: 'control_plane'
  }
];

let featureFlagsSeeded = false;

const cleanString = (value: unknown) => String(value || '').trim();

const normalizeOptionalString = (value: unknown) => {
  const cleaned = cleanString(value);
  return cleaned.length ? cleaned : null;
};

const normalizeStringArray = (value: unknown) => {
  const rawValues = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(
    new Set(
      rawValues
        .map((entry) => cleanString(entry).toLowerCase())
        .filter((entry) => entry.length > 0)
    )
  );
};

const normalizeInt = (value: unknown, fallback: number, min = 0, max = 1000) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const normalizeBool = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeJson = (value: unknown) => {
  if (value && typeof value === 'object') return value;
  return null;
};

const normalizeDate = (value: unknown) => {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const stableBucket = (input: string) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 1000003;
  }
  return Math.abs(hash % 100);
};

const mapFlag = (flag: any) => ({
  id: flag.id,
  key: flag.key,
  label: flag.label,
  description: flag.description || '',
  category: flag.category,
  defaultValue: Boolean(flag.defaultValue),
  isActive: Boolean(flag.isActive),
  killSwitch: Boolean(flag.killSwitch),
  createdByStaffId: flag.createdByStaffId || null,
  createdAt: flag.createdAt,
  updatedAt: flag.updatedAt,
  audiencesCount: Number(flag?._count?.audiences || 0),
  rulesCount: Number(flag?._count?.rules || 0),
  exposuresCount: Number(flag?._count?.exposures || 0)
});

const mapAudience = (audience: any) => ({
  id: audience.id,
  flagId: audience.flagId,
  key: audience.key,
  label: audience.label,
  roleScope: Array.isArray(audience.roleScope) ? audience.roleScope : [],
  countryScope: Array.isArray(audience.countryScope) ? audience.countryScope : [],
  platformScope: Array.isArray(audience.platformScope) ? audience.platformScope : [],
  appVersions: Array.isArray(audience.appVersions) ? audience.appVersions : [],
  metadata: audience.metadata || null,
  isActive: Boolean(audience.isActive),
  createdAt: audience.createdAt,
  updatedAt: audience.updatedAt,
  rulesCount: Number(audience?._count?.rules || 0)
});

const mapRule = (rule: any) => ({
  id: rule.id,
  flagId: rule.flagId,
  audienceId: rule.audienceId || null,
  audienceKey: rule.audience?.key || null,
  audienceLabel: rule.audience?.label || null,
  rolloutPercent: Number(rule.rolloutPercent || 0),
  value: Boolean(rule.value),
  startAt: rule.startAt,
  endAt: rule.endAt,
  priority: Number(rule.priority || 0),
  isActive: Boolean(rule.isActive),
  conditions: rule.conditions || null,
  createdByStaffId: rule.createdByStaffId || null,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt
});

const mapAuditLog = (entry: any) => ({
  id: entry.id,
  flagId: entry.flagId,
  staffId: entry.staffId || null,
  action: entry.action,
  beforeState: entry.beforeState || null,
  afterState: entry.afterState || null,
  createdAt: entry.createdAt
});

const mapExposure = (entry: any) => ({
  id: entry.id,
  flagId: entry.flagId,
  userId: entry.userId || null,
  sessionKey: entry.sessionKey || null,
  variant: entry.variant || null,
  value: Boolean(entry.value),
  context: entry.context || null,
  exposedAt: entry.exposedAt
});

const createFeatureAuditLog = async (input: {
  flagId: string;
  action: string;
  staffId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}) => {
  await prisma.featureFlagAuditLog.create({
    data: {
      flagId: input.flagId,
      staffId: input.staffId || null,
      action: input.action,
      beforeState: (input.beforeState as any) || null,
      afterState: (input.afterState as any) || null
    }
  });
};

const mapFlagForAudit = (flag: any) => ({
  id: flag.id,
  key: flag.key,
  label: flag.label,
  category: flag.category,
  defaultValue: Boolean(flag.defaultValue),
  isActive: Boolean(flag.isActive),
  killSwitch: Boolean(flag.killSwitch)
});

export const ensureFeatureFlagsSeeded = async () => {
  if (featureFlagsSeeded) return;

  for (const flag of DEFAULT_FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: {
        key: flag.key,
        label: flag.label,
        description: flag.description || null,
        category: flag.category || 'platform',
        defaultValue: false,
        isActive: true,
        killSwitch: false
      },
      update: {
        label: flag.label,
        description: flag.description || null,
        category: flag.category || 'platform',
        isActive: true
      }
    });
  }

  featureFlagsSeeded = true;
};

export const getFeatureControlSummary = async () => {
  await ensureFeatureFlagsSeeded();
  const [flags, activeFlags, killSwitches, audiences, rules, activeRules, exposures, auditLogs] =
    await prisma.$transaction([
      prisma.featureFlag.count(),
      prisma.featureFlag.count({ where: { isActive: true } }),
      prisma.featureFlag.count({ where: { killSwitch: true } }),
      prisma.featureAudience.count(),
      prisma.featureRule.count(),
      prisma.featureRule.count({ where: { isActive: true } }),
      prisma.featureExposure.count(),
      prisma.featureFlagAuditLog.count()
    ]);

  return {
    flags,
    activeFlags,
    killSwitches,
    audiences,
    rules,
    activeRules,
    exposures,
    auditLogs
  };
};

export const listFeatureFlags = async (filters: FeatureFlagFilters = {}) => {
  await ensureFeatureFlagsSeeded();
  const query = cleanString(filters.query);
  const category = cleanString(filters.category);

  const flags = await prisma.featureFlag.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(filters.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : {}),
      ...(filters.killSwitch !== undefined ? { killSwitch: Boolean(filters.killSwitch) } : {}),
      ...(query
        ? {
            OR: [
              { key: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    include: {
      _count: {
        select: {
          audiences: true,
          rules: true,
          exposures: true
        }
      }
    },
    orderBy: [{ category: 'asc' }, { key: 'asc' }]
  });

  return flags.map(mapFlag);
};

export const saveFeatureFlag = async (input: SaveFeatureFlagInput, staffId?: string | null) => {
  await ensureFeatureFlagsSeeded();

  const key = cleanString(input.key);
  const label = cleanString(input.label);
  const category = cleanString(input.category) || 'platform';
  if (!key) throw new Error('Feature flag key is required');
  if (!label) throw new Error('Feature flag label is required');

  const existing = input.id
    ? await prisma.featureFlag.findUnique({ where: { id: input.id } })
    : await prisma.featureFlag.findUnique({ where: { key } });

  const stored = input.id
    ? await prisma.featureFlag.update({
        where: { id: input.id },
        data: {
          key,
          label,
          description: normalizeOptionalString(input.description),
          category,
          defaultValue: normalizeBool(input.defaultValue, false),
          isActive: input.isActive !== false
        },
        include: {
          _count: {
            select: { audiences: true, rules: true, exposures: true }
          }
        }
      })
    : await prisma.featureFlag.create({
        data: {
          key,
          label,
          description: normalizeOptionalString(input.description),
          category,
          defaultValue: normalizeBool(input.defaultValue, false),
          isActive: input.isActive !== false,
          killSwitch: false,
          createdByStaffId: staffId || null
        },
        include: {
          _count: {
            select: { audiences: true, rules: true, exposures: true }
          }
        }
      });

  await createFeatureAuditLog({
    flagId: stored.id,
    action: input.id ? 'FLAG_UPDATED' : 'FLAG_CREATED',
    staffId,
    beforeState: existing ? mapFlagForAudit(existing) : null,
    afterState: mapFlagForAudit(stored)
  });

  return mapFlag(stored);
};

export const toggleFeatureKillSwitch = async (
  id: string,
  enabled: boolean,
  staffId?: string | null
) => {
  const existing = await prisma.featureFlag.findUnique({ where: { id } });
  if (!existing?.id) throw new Error('Feature flag not found');

  const stored = await prisma.featureFlag.update({
    where: { id },
    data: { killSwitch: enabled },
    include: {
      _count: {
        select: { audiences: true, rules: true, exposures: true }
      }
    }
  });

  await createFeatureAuditLog({
    flagId: stored.id,
    action: enabled ? 'KILL_SWITCH_ENABLED' : 'KILL_SWITCH_DISABLED',
    staffId,
    beforeState: mapFlagForAudit(existing),
    afterState: mapFlagForAudit(stored)
  });

  return mapFlag(stored);
};

export const listFeatureAudiences = async (flagId: string) => {
  const audiences = await prisma.featureAudience.findMany({
    where: { flagId },
    include: {
      _count: {
        select: { rules: true }
      }
    },
    orderBy: [{ isActive: 'desc' }, { key: 'asc' }]
  });
  return audiences.map(mapAudience);
};

export const saveFeatureAudience = async (
  flagId: string,
  input: SaveFeatureAudienceInput,
  staffId?: string | null
) => {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag?.id) throw new Error('Feature flag not found');

  const key = cleanString(input.key);
  const label = cleanString(input.label);
  if (!key) throw new Error('Audience key is required');
  if (!label) throw new Error('Audience label is required');

  const existing = input.id ? await prisma.featureAudience.findUnique({ where: { id: input.id } }) : null;
  const stored = input.id
    ? await prisma.featureAudience.update({
        where: { id: input.id },
        data: {
          key,
          label,
          roleScope: normalizeStringArray(input.roleScope),
          countryScope: normalizeStringArray(input.countryScope),
          platformScope: normalizeStringArray(input.platformScope),
          appVersions: normalizeStringArray(input.appVersions),
          metadata: normalizeJson(input.metadata) as any,
          isActive: input.isActive !== false
        },
        include: {
          _count: {
            select: { rules: true }
          }
        }
      })
    : await prisma.featureAudience.create({
        data: {
          flagId,
          key,
          label,
          roleScope: normalizeStringArray(input.roleScope),
          countryScope: normalizeStringArray(input.countryScope),
          platformScope: normalizeStringArray(input.platformScope),
          appVersions: normalizeStringArray(input.appVersions),
          metadata: normalizeJson(input.metadata) as any,
          isActive: input.isActive !== false
        },
        include: {
          _count: {
            select: { rules: true }
          }
        }
      });

  await createFeatureAuditLog({
    flagId,
    action: input.id ? 'AUDIENCE_UPDATED' : 'AUDIENCE_CREATED',
    staffId,
    beforeState: existing || null,
    afterState: stored
  });

  return mapAudience(stored);
};

export const listFeatureRules = async (flagId: string) => {
  const rules = await prisma.featureRule.findMany({
    where: { flagId },
    include: {
      audience: {
        select: {
          id: true,
          key: true,
          label: true
        }
      }
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
  });
  return rules.map(mapRule);
};

export const saveFeatureRule = async (
  flagId: string,
  input: SaveFeatureRuleInput,
  staffId?: string | null
) => {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag?.id) throw new Error('Feature flag not found');

  const audienceId = normalizeOptionalString(input.audienceId);
  if (audienceId) {
    const audience = await prisma.featureAudience.findFirst({
      where: { id: audienceId, flagId },
      select: { id: true }
    });
    if (!audience?.id) throw new Error('Feature audience not found for flag');
  }

  const existing = input.id ? await prisma.featureRule.findUnique({ where: { id: input.id } }) : null;
  const stored = input.id
    ? await prisma.featureRule.update({
        where: { id: input.id },
        data: {
          audienceId,
          rolloutPercent: normalizeInt(input.rolloutPercent, 0, 0, 100),
          value: normalizeBool(input.value, false),
          startAt: normalizeDate(input.startAt),
          endAt: normalizeDate(input.endAt),
          priority: normalizeInt(input.priority, 100, 0, 1000),
          isActive: input.isActive !== false,
          conditions: normalizeJson(input.conditions) as any
        },
        include: {
          audience: {
            select: { id: true, key: true, label: true }
          }
        }
      })
    : await prisma.featureRule.create({
        data: {
          flagId,
          audienceId,
          rolloutPercent: normalizeInt(input.rolloutPercent, 0, 0, 100),
          value: normalizeBool(input.value, false),
          startAt: normalizeDate(input.startAt),
          endAt: normalizeDate(input.endAt),
          priority: normalizeInt(input.priority, 100, 0, 1000),
          isActive: input.isActive !== false,
          conditions: normalizeJson(input.conditions) as any,
          createdByStaffId: staffId || null
        },
        include: {
          audience: {
            select: { id: true, key: true, label: true }
          }
        }
      });

  await createFeatureAuditLog({
    flagId,
    action: input.id ? 'RULE_UPDATED' : 'RULE_CREATED',
    staffId,
    beforeState: existing || null,
    afterState: stored
  });

  return mapRule(stored);
};

export const deactivateFeatureRule = async (id: string, staffId?: string | null) => {
  const existing = await prisma.featureRule.findUnique({ where: { id } });
  if (!existing?.id) throw new Error('Feature rule not found');

  const stored = await prisma.featureRule.update({
    where: { id },
    data: { isActive: false },
    include: {
      audience: {
        select: { id: true, key: true, label: true }
      }
    }
  });

  await createFeatureAuditLog({
    flagId: stored.flagId,
    action: 'RULE_DEACTIVATED',
    staffId,
    beforeState: existing,
    afterState: stored
  });

  return mapRule(stored);
};

export const listFeatureFlagAudit = async (input?: { flagId?: string; limit?: number }) => {
  const limit = normalizeInt(input?.limit, 25, 1, 100);
  const rows = await prisma.featureFlagAuditLog.findMany({
    where: input?.flagId ? { flagId: input.flagId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  return rows.map(mapAuditLog);
};

export const listFeatureExposures = async (input?: {
  flagId?: string;
  userId?: string;
  sessionKey?: string;
  limit?: number;
}) => {
  const limit = normalizeInt(input?.limit, 25, 1, 100);
  const rows = await prisma.featureExposure.findMany({
    where: {
      ...(input?.flagId ? { flagId: input.flagId } : {}),
      ...(input?.userId ? { userId: input.userId } : {}),
      ...(input?.sessionKey ? { sessionKey: input.sessionKey } : {})
    },
    orderBy: { exposedAt: 'desc' },
    take: limit
  });
  return rows.map(mapExposure);
};

const audienceMatches = (audience: any, context: ResolveFeatureFlagContextInput) => {
  if (!audience?.isActive) return false;

  const matchesScope = (scope: string[], value: string | null | undefined) => {
    if (!Array.isArray(scope) || scope.length === 0) return true;
    const normalizedValue = cleanString(value).toLowerCase();
    if (!normalizedValue) return false;
    return scope.includes(normalizedValue);
  };

  return (
    matchesScope(audience.roleScope || [], context.role) &&
    matchesScope(audience.countryScope || [], context.country) &&
    matchesScope(audience.platformScope || [], context.platform) &&
    matchesScope(audience.appVersions || [], context.appVersion)
  );
};

const ruleIsActiveForNow = (rule: any) => {
  if (!rule?.isActive) return false;
  const now = Date.now();
  if (rule.startAt && new Date(rule.startAt).getTime() > now) return false;
  if (rule.endAt && new Date(rule.endAt).getTime() < now) return false;
  return true;
};

export const resolveFeatureFlagContext = async (input: ResolveFeatureFlagContextInput) => {
  await ensureFeatureFlagsSeeded();
  const key = cleanString(input.key);
  if (!key) throw new Error('Feature flag key is required');

  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    include: {
      rules: {
        where: { isActive: true },
        include: {
          audience: true
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });
  if (!flag?.id) throw new Error('Feature flag not found');

  let resolvedValue = Boolean(flag.defaultValue);
  let variant = 'default';

  if (!flag.isActive) {
    resolvedValue = false;
    variant = 'inactive';
  } else if (flag.killSwitch) {
    resolvedValue = false;
    variant = 'kill_switch';
  } else {
    for (const rule of flag.rules) {
      if (!ruleIsActiveForNow(rule)) continue;
      if (rule.audience && !audienceMatches(rule.audience, input)) continue;

      const rolloutPercent = normalizeInt(rule.rolloutPercent, 0, 0, 100);
      if (rolloutPercent > 0 && rolloutPercent < 100) {
        const stableKey = `${flag.key}:${input.userId || input.sessionKey || 'guest'}`;
        if (stableBucket(stableKey) >= rolloutPercent) continue;
      } else if (rolloutPercent <= 0) {
        continue;
      }

      resolvedValue = Boolean(rule.value);
      variant = rule.id;
      break;
    }
  }

  const exposure = await prisma.featureExposure.create({
    data: {
      flagId: flag.id,
      userId: normalizeOptionalString(input.userId),
      sessionKey: normalizeOptionalString(input.sessionKey),
      variant,
      value: resolvedValue,
      context: {
        role: normalizeOptionalString(input.role),
        country: normalizeOptionalString(input.country),
        platform: normalizeOptionalString(input.platform),
        appVersion: normalizeOptionalString(input.appVersion),
        metadata: normalizeJson(input.metadata)
      } as any
    }
  });

  return {
    flag: mapFlag(flag),
    value: resolvedValue,
    variant,
    exposure: mapExposure(exposure)
  };
};
