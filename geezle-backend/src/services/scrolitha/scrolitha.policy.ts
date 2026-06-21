import prisma from '../../utils/prismaClient';
import { incrementMinuteCounter, scrolithaCache } from './scrolitha.cache';
import { getScrolithaKnowledgeBundle } from './scrolitha.knowledge';
import type { ScrolithaActor, ScrolithaScope, ScrolithaToolDefinition } from './scrolitha.types';

const CONFIG_CACHE_PREFIX = 'scrolitha:config:';
const CONFIG_CACHE_TTL_MS = 45_000;

const DEFAULT_PROMPT_BLOCKLIST = [
  'ignore previous instructions',
  'ignore all previous',
  'reveal your system prompt',
  'show hidden prompt',
  'api key',
  'private key',
  'secret token',
  'dump env',
  'environment variable'
];

const buildDefaultMetadata = (scope: ScrolithaScope) => {
  const knowledge = getScrolithaKnowledgeBundle();
  const llm = {
    enabled: true,
    provider: 'core',
    host: '',
    coreEndpoint: '',
    ollamaHost: '',
    model: scope === 'admin' ? 'scrolitha-admin-core' : 'scrolitha-core',
    coreModel: 'llama3.2:3b',
    ollamaModel: 'llama3.2:3b',
    sidecarMode: false,
    maxTokens: scope === 'admin' ? 1536 : 1024,
    temperature: 0.35,
    topP: 0.9,
    timeoutMs: 45000,
    enableStreaming: false,
    allowGeminiFallback: false
  };

  const learning = { enabled: true };

  const postAi = {
    assistantEnabled: true,
    insightEnabled: true,
    randomPercentage: 15,
    manualOnly: false,
    maxInsightLength: 220,
    insightSafeMode: false,
    insightTone: 'professional',
    rankingBoostEnabled: false,
    regenerateBatchLimit: 40
  };

  if (scope === 'admin') {
    return {
      llm,
      learning,
      knowledge,
      postAi
    };
  }

  return {
    llm,
    learning
  };
};

const DEFAULT_CONFIG = {
  user: {
    scope: 'user',
    enabled: true,
    safeMode: false,
    requireConfirmationByDefault: true,
    lowRiskAutoExecute: false,
    denyListedTools: [],
    promptBlocklist: DEFAULT_PROMPT_BLOCKLIST,
    userRateLimitPerMinute: 30,
    adminActionCapPerMinute: 10,
    metadata: buildDefaultMetadata('user')
  },
  admin: {
    scope: 'admin',
    enabled: true,
    safeMode: false,
    requireConfirmationByDefault: true,
    lowRiskAutoExecute: false,
    denyListedTools: [],
    promptBlocklist: DEFAULT_PROMPT_BLOCKLIST,
    userRateLimitPerMinute: 30,
    adminActionCapPerMinute: 10,
    metadata: buildDefaultMetadata('admin')
  }
} as const;

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mergeMetadataObjects = (
  base: Record<string, any>,
  patch: Record<string, any>
): Record<string, any> => {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = mergeMetadataObjects(current, value);
      continue;
    }
    out[key] = value;
  }
  return out;
};

export const normalizeRole = (role: unknown) => String(role || '').trim().toLowerCase();

export const resolveScrolithaScope = (role: unknown): ScrolithaScope => {
  const normalized = normalizeRole(role);
  if (normalized.includes('admin')) return 'admin';
  return 'user';
};

const normalizeConfigRecord = (record: any, scope: ScrolithaScope) => {
  const fallback = DEFAULT_CONFIG[scope];
  return {
    id: record?.id,
    scope,
    enabled: typeof record?.enabled === 'boolean' ? record.enabled : fallback.enabled,
    safeMode: typeof record?.safeMode === 'boolean' ? record.safeMode : fallback.safeMode,
    requireConfirmationByDefault:
      typeof record?.requireConfirmationByDefault === 'boolean'
        ? record.requireConfirmationByDefault
        : fallback.requireConfirmationByDefault,
    lowRiskAutoExecute:
      typeof record?.lowRiskAutoExecute === 'boolean'
        ? record.lowRiskAutoExecute
        : fallback.lowRiskAutoExecute,
    denyListedTools: Array.isArray(record?.denyListedTools)
      ? record.denyListedTools.map((entry: unknown) => String(entry || '').trim().toUpperCase()).filter(Boolean)
      : fallback.denyListedTools,
    promptBlocklist: Array.isArray(record?.promptBlocklist)
      ? record.promptBlocklist.map((entry: unknown) => String(entry || '').trim().toLowerCase()).filter(Boolean)
      : fallback.promptBlocklist,
    userRateLimitPerMinute: Number.isFinite(Number(record?.userRateLimitPerMinute))
      ? Math.max(5, Math.min(200, Math.floor(Number(record.userRateLimitPerMinute))))
      : fallback.userRateLimitPerMinute,
    adminActionCapPerMinute: Number.isFinite(Number(record?.adminActionCapPerMinute))
      ? Math.max(1, Math.min(100, Math.floor(Number(record.adminActionCapPerMinute))))
      : fallback.adminActionCapPerMinute,
    metadata: (() => {
      const defaults = isPlainObject(fallback.metadata) ? (fallback.metadata as Record<string, any>) : {};
      const source =
        record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, any>)
          : {};
      return mergeMetadataObjects(defaults, source);
    })(),
    createdAt: record?.createdAt,
    updatedAt: record?.updatedAt
  };
};

export const ensureScrolithaConfig = async (scope: ScrolithaScope) => {
  const key = `${CONFIG_CACHE_PREFIX}${scope}`;
  const cached = scrolithaCache.get<any>(key);
  if (cached) return cached;

  const defaults = DEFAULT_CONFIG[scope];
  const row = await prisma.scrolithaConfig.upsert({
    where: { scope },
    create: {
      scope,
      enabled: defaults.enabled,
      safeMode: defaults.safeMode,
      requireConfirmationByDefault: defaults.requireConfirmationByDefault,
      lowRiskAutoExecute: defaults.lowRiskAutoExecute,
      denyListedTools: [...defaults.denyListedTools],
      promptBlocklist: [...defaults.promptBlocklist],
      userRateLimitPerMinute: defaults.userRateLimitPerMinute,
      adminActionCapPerMinute: defaults.adminActionCapPerMinute,
      metadata: defaults.metadata
    },
    update: {}
  });

  const normalized = normalizeConfigRecord(row, scope);
  scrolithaCache.set(key, normalized, CONFIG_CACHE_TTL_MS);
  return normalized;
};

export const updateScrolithaConfig = async (input: {
  scope: unknown;
  enabled?: unknown;
  safeMode?: unknown;
  requireConfirmationByDefault?: unknown;
  lowRiskAutoExecute?: unknown;
  denyListedTools?: unknown;
  promptBlocklist?: unknown;
  userRateLimitPerMinute?: unknown;
  adminActionCapPerMinute?: unknown;
  metadata?: unknown;
  updatedBy?: string;
}) => {
  const scope = resolveScrolithaScope(input.scope);
  const existing = await ensureScrolithaConfig(scope);

  const denyListedTools = Array.isArray(input.denyListedTools)
    ? input.denyListedTools.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
    : existing.denyListedTools;

  const promptBlocklist = Array.isArray(input.promptBlocklist)
    ? input.promptBlocklist.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
    : existing.promptBlocklist;

  const payload = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled,
    safeMode: typeof input.safeMode === 'boolean' ? input.safeMode : existing.safeMode,
    requireConfirmationByDefault:
      typeof input.requireConfirmationByDefault === 'boolean'
        ? input.requireConfirmationByDefault
        : existing.requireConfirmationByDefault,
    lowRiskAutoExecute:
      typeof input.lowRiskAutoExecute === 'boolean'
        ? input.lowRiskAutoExecute
        : existing.lowRiskAutoExecute,
    denyListedTools,
    promptBlocklist,
    userRateLimitPerMinute: Number.isFinite(Number(input.userRateLimitPerMinute))
      ? Math.max(5, Math.min(200, Math.floor(Number(input.userRateLimitPerMinute))))
      : existing.userRateLimitPerMinute,
    adminActionCapPerMinute: Number.isFinite(Number(input.adminActionCapPerMinute))
      ? Math.max(1, Math.min(100, Math.floor(Number(input.adminActionCapPerMinute))))
      : existing.adminActionCapPerMinute,
    metadata: (() => {
      if (!isPlainObject(input.metadata)) return existing.metadata;
      const base = isPlainObject(existing.metadata) ? (existing.metadata as Record<string, any>) : {};
      return mergeMetadataObjects(base, input.metadata);
    })(),
    updatedBy: input.updatedBy || null
  };

  const updated = await prisma.scrolithaConfig.upsert({
    where: { scope },
    create: { scope, ...payload },
    update: payload
  });

  const normalized = normalizeConfigRecord(updated, scope);
  scrolithaCache.set(`${CONFIG_CACHE_PREFIX}${scope}`, normalized, CONFIG_CACHE_TTL_MS);
  return normalized;
};

export const invalidateScrolithaConfigCache = (scope?: ScrolithaScope) => {
  if (scope) {
    scrolithaCache.delete(`${CONFIG_CACHE_PREFIX}${scope}`);
    return;
  }
  scrolithaCache.invalidateByPrefix(CONFIG_CACHE_PREFIX);
};

export const detectPromptInjectionAttempt = (
  message: string,
  promptBlocklist: string[]
): { blocked: boolean; pattern?: string } => {
  const source = String(message || '').toLowerCase();
  const patterns = Array.from(new Set([...(promptBlocklist || []), ...DEFAULT_PROMPT_BLOCKLIST]));
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (source.includes(pattern)) {
      return { blocked: true, pattern };
    }
  }
  return { blocked: false };
};

export const canUseTool = (
  actor: ScrolithaActor,
  tool: ScrolithaToolDefinition,
  config: Awaited<ReturnType<typeof ensureScrolithaConfig>>
): { allowed: boolean; reason?: string } => {
  if (!config.enabled) return { allowed: false, reason: 'Scrolitha is disabled by policy.' };
  if (tool.scope !== actor.scope) return { allowed: false, reason: 'Tool scope mismatch.' };
  if (config.denyListedTools.includes(tool.key.toUpperCase())) {
    return { allowed: false, reason: 'Tool is denied by policy.' };
  }

  if (config.safeMode) {
    const isReadOnly = tool.method === 'GET' || tool.key.startsWith('GET_') || tool.key.startsWith('SEARCH_');
    if (!isReadOnly) {
      return { allowed: false, reason: 'Safe mode blocks non-read actions.' };
    }
  }

  if (Array.isArray(tool.roleScope) && tool.roleScope.length) {
    const normalizedRole = normalizeRole(actor.role);
    const allowed = tool.roleScope.some((entry) => normalizedRole === normalizeRole(entry));
    if (!allowed) return { allowed: false, reason: 'Role is not allowed for this tool.' };
  }

  return { allowed: true };
};

export const shouldRequireConfirmation = (
  tool: ScrolithaToolDefinition,
  config: Awaited<ReturnType<typeof ensureScrolithaConfig>>
) => {
  if (tool.requiresConfirmation) return true;
  if (tool.method === 'GET') return false;
  if (config.lowRiskAutoExecute && !tool.destructive) return false;
  return Boolean(config.requireConfirmationByDefault);
};

export const enforceActionRateLimits = (input: {
  actor: ScrolithaActor;
  config: Awaited<ReturnType<typeof ensureScrolithaConfig>>;
  channel: 'chat' | 'execute';
  destructive?: boolean;
}) => {
  const normalizedRole = normalizeRole(input.actor.role);
  const key = `scrolitha:rate:${input.channel}:${input.actor.id}:${normalizedRole}`;
  const count = incrementMinuteCounter(key);
  if (count > input.config.userRateLimitPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded (${input.config.userRateLimitPerMinute}/min).`
    };
  }

  if (input.actor.isAdmin && input.destructive) {
    const destructiveKey = `scrolitha:admin-destructive:${input.actor.id}`;
    const destructiveCount = incrementMinuteCounter(destructiveKey);
    if (destructiveCount > input.config.adminActionCapPerMinute) {
      return {
        allowed: false,
        reason: `Admin destructive cap exceeded (${input.config.adminActionCapPerMinute}/min).`
      };
    }
  }

  return { allowed: true };
};

export const redactPayload = (payload: any, sensitiveFields?: string[]) => {
  if (!payload || typeof payload !== 'object') return payload;
  const fields = new Set(
    (sensitiveFields || []).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
  );
  if (!fields.size) return payload;

  const walk = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => walk(entry));
    const next: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (fields.has(key.toLowerCase())) {
        next[key] = '[REDACTED]';
      } else {
        next[key] = walk(entry);
      }
    }
    return next;
  };

  return walk(payload);
};
