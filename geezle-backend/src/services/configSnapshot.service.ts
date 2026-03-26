import fs from 'fs';
import path from 'path';
import prisma from '../utils/prismaClient';
import {
  DEFAULT_SYSTEM,
  hydrateSystemSettings,
  validateSystem
} from '../controllers/admin.systemSettings.controller';
import {
  readAppDistributionConfig,
  saveAppDistributionConfig
} from '../controllers/apps.controller';

type ConfigScopeKey =
  | 'system.settings'
  | 'platform.settings'
  | 'homepage.guest'
  | 'apps.distribution';

type ConfigScopeDescriptor = {
  scope: ConfigScopeKey;
  key: string;
  label: string;
  description: string;
  category: string;
};

type SnapshotFilters = {
  scope?: string;
  limit?: number;
};

type ChangeFilters = {
  scope?: string;
  limit?: number;
};

type RollbackFilters = {
  scope?: string;
  limit?: number;
};

type CreateSnapshotInput = {
  scope?: string;
  reason?: string | null;
  label?: string | null;
  source?: string | null;
  metadata?: unknown;
};

type RollbackInput = {
  scope?: string;
  targetVersion?: number;
  notes?: string | null;
  metadata?: unknown;
};

type CreateReleaseRolloutInput = {
  scope?: string;
  releaseKey?: string;
  label?: string;
  notes?: string | null;
  metadata?: unknown;
};

const SETTINGS_DIR = path.resolve(__dirname, '../../data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');

const CONFIG_SCOPE_DESCRIPTORS: ConfigScopeDescriptor[] = [
  {
    scope: 'system.settings',
    key: 'default',
    label: 'System Settings',
    description: 'Core platform system settings persisted in AppSetting(scope=system).',
    category: 'system'
  },
  {
    scope: 'platform.settings',
    key: 'default',
    label: 'Platform Settings',
    description: 'Platform-wide branding, reactions, homepage, and messaging controls.',
    category: 'system'
  },
  {
    scope: 'homepage.guest',
    key: 'guest',
    label: 'Guest Homepage',
    description: 'Guest homepage draft and published state stored in CMSConfig(HOMEPAGE).',
    category: 'content'
  },
  {
    scope: 'apps.distribution',
    key: 'default',
    label: 'App Distribution',
    description: 'Web and mobile app distribution prompts and download configuration.',
    category: 'apps'
  }
];

const isObjectLike = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const cleanString = (value: unknown) => String(value || '').trim();

const normalizeLimit = (value: unknown, fallback = 25) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.round(parsed)));
};

const ensureSettingsDir = () => {
  try {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  } catch {
    // ignore filesystem issues until write is attempted
  }
};

const readPersistedSettings = () => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return null;
  }
};

const writePersistedSettings = (payload: Record<string, any>) => {
  ensureSettingsDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
};

const resolveScopeDescriptor = (scopeInput?: string | null) => {
  const scope = cleanString(scopeInput) as ConfigScopeKey;
  const descriptor = CONFIG_SCOPE_DESCRIPTORS.find((entry) => entry.scope === scope);
  if (!descriptor) {
    throw new Error('Supported config scope is required');
  }
  return descriptor;
};

const getLatestSnapshot = async (scope: string, key: string) =>
  prisma.configSnapshot.findFirst({
    where: { scope, key },
    orderBy: { version: 'desc' }
  });

const getNextSnapshotVersion = async (scope: string, key: string) => {
  const latest = await getLatestSnapshot(scope, key);
  return Number(latest?.version || 0) + 1;
};

const mapSnapshot = (snapshot: any) => ({
  id: snapshot.id,
  scope: snapshot.scope,
  key: snapshot.key,
  label: snapshot.label || '',
  version: Number(snapshot.version || 0),
  source: snapshot.source,
  reason: snapshot.reason || '',
  metadata: snapshot.metadata || null,
  createdByStaffId: snapshot.createdByStaffId || null,
  createdAt: snapshot.createdAt,
  payload: snapshot.payload
});

const mapChange = (entry: any) => ({
  id: entry.id,
  scope: entry.scope,
  key: entry.key,
  action: entry.action,
  reason: entry.reason || '',
  metadata: entry.metadata || null,
  createdByStaffId: entry.createdByStaffId || null,
  createdAt: entry.createdAt,
  beforeSnapshotId: entry.beforeSnapshotId || null,
  beforeVersion: entry.beforeSnapshot?.version ?? null,
  afterSnapshotId: entry.afterSnapshotId || null,
  afterVersion: entry.afterSnapshot?.version ?? null
});

const mapRollbackRun = (entry: any) => ({
  id: entry.id,
  scope: entry.scope,
  key: entry.key,
  targetVersion: Number(entry.targetVersion || 0),
  status: entry.status,
  notes: entry.notes || '',
  metadata: entry.metadata || null,
  createdByStaffId: entry.createdByStaffId || null,
  createdAt: entry.createdAt,
  completedAt: entry.completedAt || null,
  beforeSnapshotId: entry.beforeSnapshotId || null,
  beforeVersion: entry.beforeSnapshot?.version ?? null,
  afterSnapshotId: entry.afterSnapshotId || null,
  afterVersion: entry.afterSnapshot?.version ?? null
});

const mapReleaseRollout = (entry: any) => ({
  id: entry.id,
  scope: entry.scope,
  key: entry.key || null,
  releaseKey: entry.releaseKey,
  label: entry.label,
  notes: entry.notes || '',
  metadata: entry.metadata || null,
  createdByStaffId: entry.createdByStaffId || null,
  createdAt: entry.createdAt
});

const readSystemSettingsPayload = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    return cloneJson(hydrateSystemSettings(record?.data ?? DEFAULT_SYSTEM));
  } catch {
    const persisted = readPersistedSettings();
    if (isObjectLike(persisted?.system)) {
      return cloneJson(hydrateSystemSettings(persisted.system));
    }
    return cloneJson(hydrateSystemSettings(DEFAULT_SYSTEM));
  }
};

const writeSystemSettingsPayload = async (payload: unknown) => {
  const normalized = hydrateSystemSettings(payload ?? DEFAULT_SYSTEM);
  const errors = validateSystem(normalized);
  if (errors.length) {
    throw new Error(errors.join('; '));
  }

  try {
    await prisma.appSetting.upsert({
      where: { scope: 'system' },
      create: { scope: 'system', data: normalized as any },
      update: { data: normalized as any }
    });
  } catch {
    // fall through to file persistence so rollback still has a durable path
  }

  const persisted = readPersistedSettings() || {};
  persisted.system = normalized;
  writePersistedSettings(persisted);
  return cloneJson(normalized);
};

const readPlatformSettingsPayload = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
    if (isObjectLike(record?.data)) {
      return cloneJson(record.data);
    }
  } catch {
    // fall back to file
  }

  const persisted = readPersistedSettings();
  if (isObjectLike(persisted?.platform)) {
    return cloneJson(persisted.platform);
  }
  return {};
};

const writePlatformSettingsPayload = async (payload: unknown) => {
  const nextPayload = isObjectLike(payload) ? payload : {};
  await prisma.appSetting.upsert({
    where: { scope: 'platform' },
    create: { scope: 'platform', data: nextPayload as any },
    update: { data: nextPayload as any }
  });
  const persisted = readPersistedSettings() || {};
  persisted.platform = nextPayload;
  writePersistedSettings(persisted);
  return cloneJson(nextPayload);
};

const getHomepageConfigRecord = async () =>
  prisma.cMSConfig.findFirst({
    where: { target: 'HOMEPAGE' as any },
    orderBy: { version: 'desc' }
  });

const readGuestHomepagePayload = async () => {
  const record = await getHomepageConfigRecord();
  const data = isObjectLike(record?.data) ? (record?.data as Record<string, any>) : {};
  return cloneJson(data.guestHomepage || data.guest_homepage || {});
};

const writeGuestHomepagePayload = async (payload: unknown, actorUserId?: string | null) => {
  const record = await getHomepageConfigRecord();
  const existingData = isObjectLike(record?.data) ? (record?.data as Record<string, any>) : {};
  const nextPayload = isObjectLike(payload) ? payload : {};
  const nextData = {
    ...existingData,
    guestHomepage: nextPayload
  };

  await prisma.cMSConfig.create({
    data: {
      target: 'HOMEPAGE' as any,
      version: Number(record?.version || 0) + 1,
      data: nextData as any,
      updatedById: actorUserId || null
    }
  });

  return cloneJson(nextPayload);
};

const readConfigPayload = async (scope: ConfigScopeKey) => {
  switch (scope) {
    case 'system.settings':
      return readSystemSettingsPayload();
    case 'platform.settings':
      return readPlatformSettingsPayload();
    case 'homepage.guest':
      return readGuestHomepagePayload();
    case 'apps.distribution':
      return cloneJson(await readAppDistributionConfig());
    default:
      throw new Error('Unsupported config scope');
  }
};

const writeConfigPayload = async (
  scope: ConfigScopeKey,
  payload: unknown,
  actorUserId?: string | null
) => {
  switch (scope) {
    case 'system.settings':
      return writeSystemSettingsPayload(payload);
    case 'platform.settings':
      return writePlatformSettingsPayload(payload);
    case 'homepage.guest':
      return writeGuestHomepagePayload(payload, actorUserId);
    case 'apps.distribution':
      return cloneJson(await saveAppDistributionConfig(payload));
    default:
      throw new Error('Unsupported config scope');
  }
};

const createSnapshotRecord = async (input: {
  scope: string;
  key: string;
  label?: string | null;
  payload: unknown;
  source?: string | null;
  reason?: string | null;
  metadata?: unknown;
  createdByStaffId?: string | null;
}) => {
  const version = await getNextSnapshotVersion(input.scope, input.key);
  const snapshot = await prisma.configSnapshot.create({
    data: {
      scope: input.scope,
      key: input.key,
      label: cleanString(input.label) || null,
      payload: cloneJson(input.payload) as any,
      version,
      source: cleanString(input.source) || 'admin',
      reason: cleanString(input.reason) || null,
      metadata: (input.metadata as any) || null,
      createdByStaffId: input.createdByStaffId || null
    }
  });
  return snapshot;
};

export const getConfigRollbackSummary = async () => {
  const [snapshots, changes, rollbacks, releases] = await prisma.$transaction([
    prisma.configSnapshot.count(),
    prisma.configChange.count(),
    prisma.rollbackRun.count(),
    prisma.releaseRollout.count()
  ]);

  return {
    scopes: CONFIG_SCOPE_DESCRIPTORS.length,
    snapshots,
    changes,
    rollbacks,
    releases
  };
};

export const getConfigScopes = async () => {
  const rows = await Promise.all(
    CONFIG_SCOPE_DESCRIPTORS.map(async (descriptor) => {
      const [snapshotCount, latestSnapshot] = await Promise.all([
        prisma.configSnapshot.count({
          where: {
            scope: descriptor.scope,
            key: descriptor.key
          }
        }),
        prisma.configSnapshot.findFirst({
          where: {
            scope: descriptor.scope,
            key: descriptor.key
          },
          orderBy: { version: 'desc' }
        })
      ]);

      return {
        ...descriptor,
        snapshotCount,
        latestSnapshotVersion: latestSnapshot?.version || 0,
        latestSnapshotAt: latestSnapshot?.createdAt || null
      };
    })
  );

  return rows;
};

export const listConfigSnapshots = async (filters: SnapshotFilters = {}) => {
  const scope = cleanString(filters.scope);
  const rows = await prisma.configSnapshot.findMany({
    where: scope ? { scope } : undefined,
    orderBy: [{ createdAt: 'desc' }, { version: 'desc' }],
    take: normalizeLimit(filters.limit, 25)
  });
  return rows.map(mapSnapshot);
};

export const listConfigChanges = async (filters: ChangeFilters = {}) => {
  const scope = cleanString(filters.scope);
  const rows = await prisma.configChange.findMany({
    where: scope ? { scope } : undefined,
    include: {
      beforeSnapshot: {
        select: { id: true, version: true }
      },
      afterSnapshot: {
        select: { id: true, version: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(filters.limit, 25)
  });
  return rows.map(mapChange);
};

export const listRollbackRuns = async (filters: RollbackFilters = {}) => {
  const scope = cleanString(filters.scope);
  const rows = await prisma.rollbackRun.findMany({
    where: scope ? { scope } : undefined,
    include: {
      beforeSnapshot: {
        select: { id: true, version: true }
      },
      afterSnapshot: {
        select: { id: true, version: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(filters.limit, 25)
  });
  return rows.map(mapRollbackRun);
};

export const listReleaseRollouts = async (limit = 25) => {
  const rows = await prisma.releaseRollout.findMany({
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(limit, 25)
  });
  return rows.map(mapReleaseRollout);
};

export const createConfigSnapshot = async (
  input: CreateSnapshotInput,
  staffUserId?: string | null
) => {
  const descriptor = resolveScopeDescriptor(input.scope);
  const payload = await readConfigPayload(descriptor.scope);
  const snapshot = await createSnapshotRecord({
    scope: descriptor.scope,
    key: descriptor.key,
    label: input.label || descriptor.label,
    payload,
    source: input.source || 'manual_snapshot',
    reason: input.reason || null,
    metadata: input.metadata,
    createdByStaffId: staffUserId || null
  });

  await prisma.configChange.create({
    data: {
      scope: descriptor.scope,
      key: descriptor.key,
      action: 'SNAPSHOT_CREATED',
      afterSnapshotId: snapshot.id,
      reason: cleanString(input.reason) || null,
      metadata: {
        label: snapshot.label,
        version: snapshot.version,
        source: snapshot.source
      } as any,
      createdByStaffId: staffUserId || null
    }
  });

  return mapSnapshot(snapshot);
};

export const rollbackConfigScope = async (
  input: RollbackInput,
  staffUserId?: string | null,
  actorUserId?: string | null
) => {
  const descriptor = resolveScopeDescriptor(input.scope);
  const targetVersion = Number(input.targetVersion);
  if (!Number.isFinite(targetVersion) || targetVersion <= 0) {
    throw new Error('Valid targetVersion is required');
  }

  const targetSnapshot = await prisma.configSnapshot.findFirst({
    where: {
      scope: descriptor.scope,
      key: descriptor.key,
      version: targetVersion
    }
  });
  if (!targetSnapshot?.id) {
    throw new Error('Config snapshot version not found');
  }

  const currentPayload = await readConfigPayload(descriptor.scope);
  const beforeSnapshot = await createSnapshotRecord({
    scope: descriptor.scope,
    key: descriptor.key,
    label: descriptor.label,
    payload: currentPayload,
    source: 'rollback_before',
    reason: `Automatic pre-rollback snapshot before applying version ${targetVersion}`,
    metadata: {
      targetVersion
    },
    createdByStaffId: staffUserId || null
  });

  const appliedPayload = await writeConfigPayload(descriptor.scope, targetSnapshot.payload, actorUserId || null);
  const afterSnapshot = await createSnapshotRecord({
    scope: descriptor.scope,
    key: descriptor.key,
    label: descriptor.label,
    payload: appliedPayload,
    source: 'rollback_after',
    reason: cleanString(input.notes) || `Rollback applied from snapshot version ${targetVersion}`,
    metadata: {
      targetVersion,
      restoredFromSnapshotId: targetSnapshot.id
    },
    createdByStaffId: staffUserId || null
  });

  const rollbackRun = await prisma.rollbackRun.create({
    data: {
      scope: descriptor.scope,
      key: descriptor.key,
      targetVersion,
      status: 'COMPLETED',
      beforeSnapshotId: beforeSnapshot.id,
      afterSnapshotId: afterSnapshot.id,
      notes: cleanString(input.notes) || null,
      metadata: (input.metadata as any) || null,
      createdByStaffId: staffUserId || null,
      completedAt: new Date()
    }
  });

  await prisma.configChange.create({
    data: {
      scope: descriptor.scope,
      key: descriptor.key,
      action: 'ROLLBACK_COMPLETED',
      beforeSnapshotId: beforeSnapshot.id,
      afterSnapshotId: afterSnapshot.id,
      reason: cleanString(input.notes) || `Rollback applied from snapshot version ${targetVersion}`,
      metadata: {
        targetVersion,
        rollbackRunId: rollbackRun.id,
        restoredFromSnapshotId: targetSnapshot.id
      } as any,
      createdByStaffId: staffUserId || null
    }
  });

  return {
    rollbackRun: mapRollbackRun({
      ...rollbackRun,
      beforeSnapshot,
      afterSnapshot
    }),
    targetSnapshot: mapSnapshot(targetSnapshot),
    beforeSnapshot: mapSnapshot(beforeSnapshot),
    afterSnapshot: mapSnapshot(afterSnapshot),
    appliedPayload
  };
};

export const createReleaseRollout = async (
  input: CreateReleaseRolloutInput,
  staffUserId?: string | null
) => {
  const descriptor = resolveScopeDescriptor(input.scope);
  const releaseKey = cleanString(input.releaseKey);
  const label = cleanString(input.label);

  if (!releaseKey) {
    throw new Error('releaseKey is required');
  }
  if (!label) {
    throw new Error('label is required');
  }

  const release = await prisma.releaseRollout.create({
    data: {
      scope: descriptor.scope,
      key: descriptor.key,
      releaseKey,
      label,
      notes: cleanString(input.notes) || null,
      metadata: (input.metadata as any) || null,
      createdByStaffId: staffUserId || null
    }
  });

  await prisma.configChange.create({
    data: {
      scope: descriptor.scope,
      key: descriptor.key,
      action: 'RELEASE_LOGGED',
      reason: cleanString(input.notes) || null,
      metadata: {
        releaseKey,
        label
      } as any,
      createdByStaffId: staffUserId || null
    }
  });

  return mapReleaseRollout(release);
};

export const getConfigPayloadForScope = async (scope: string) => {
  const descriptor = resolveScopeDescriptor(scope);
  const payload = await readConfigPayload(descriptor.scope);
  return {
    descriptor,
    payload
  };
};
