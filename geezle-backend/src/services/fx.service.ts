import type { Application } from 'express';
import cron from 'node-cron';
import prisma from '../utils/prismaClient';
import { listFxLocks } from './fxLock.service';

type SystemCurrencyEntry = {
  code?: string;
  name?: string;
  symbol?: string;
  rate?: number;
  isActive?: boolean;
  isDefault?: boolean;
};

type SystemSettingsShape = {
  currency?: {
    baseCurrency?: string;
  };
  currencies?: SystemCurrencyEntry[];
  fx?: Partial<FxSystemConfig>;
};

export type FxSystemConfig = {
  enabled: boolean;
  providerCode: string;
  syncBaseCurrency: string;
  autoApproveSnapshots: boolean;
  refreshEnabled: boolean;
  refreshCron: string;
  staleAfterSeconds: number;
  fallbackToStoredRates: boolean;
  sourceBaseUrl: string;
  sourceProvider: string;
  timezone: string;
};

export type EffectiveCurrencyEntry = {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  isActive: boolean;
  isDefault: boolean;
  rateSource: 'base' | 'snapshot' | 'override' | 'manual';
  snapshotId?: string | null;
  rateUpdatedAt?: string | null;
  stale?: boolean;
};

type ResolvedCurrencySet = {
  baseCurrency: string;
  currencies: EffectiveCurrencyEntry[];
  rates: Map<string, number>;
  fxConfig: FxSystemConfig;
  snapshot: {
    id: string;
    providerCode: string;
    fetchedAt: string;
    approvedAt: string | null;
    stale: boolean;
    isFrozen: boolean;
  } | null;
};

type SyncTrigger = 'manual' | 'scheduled' | 'startup';

type SyncInput = {
  providerCode?: string;
  baseCurrency?: string;
  requestedById?: string | null;
  triggerType?: SyncTrigger;
};

type FrankfurterResponse = {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number | string>;
};

const DEFAULT_SYSTEM_SETTINGS: SystemSettingsShape = {
  currency: { baseCurrency: 'USD' },
  currencies: [],
  fx: {}
};

export const DEFAULT_FX_SYSTEM_CONFIG: FxSystemConfig = {
  enabled: true,
  providerCode: 'frankfurter_ecb',
  syncBaseCurrency: 'USD',
  autoApproveSnapshots: true,
  refreshEnabled: true,
  refreshCron: '17 0 * * 1-5',
  staleAfterSeconds: 172800,
  fallbackToStoredRates: true,
  sourceBaseUrl: process.env.FX_SOURCE_BASE_URL || 'https://api.frankfurter.app',
  sourceProvider: 'ECB',
  timezone: process.env.SCHEDULE_TIMEZONE || 'UTC'
};

const DEFAULT_FX_PROVIDERS = [
  {
    code: 'frankfurter_ecb',
    name: 'Frankfurter (ECB)',
    kind: 'frankfurter',
    baseUrl: process.env.FX_SOURCE_BASE_URL || 'https://api.frankfurter.app',
    enabled: true,
    priority: 10,
    settingsJson: { provider: 'ECB' }
  },
  {
    code: 'frankfurter_blended',
    name: 'Frankfurter (Blended)',
    kind: 'frankfurter',
    baseUrl: process.env.FX_SOURCE_BASE_URL || 'https://api.frankfurter.app',
    enabled: false,
    priority: 20,
    settingsJson: {}
  }
];

let fxCronTask: any = null;
let fxCronExpression = '';

const isObjectLike = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeCurrencyCode = (value: any, fallback = '') =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const normalizeBoolean = (value: any, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeNumber = (value: any, fallback: number, min?: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (Number.isFinite(min) && parsed < Number(min)) return Number(min);
  return parsed;
};

const normalizeRate = (value: any, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const toIso = (value?: Date | string | null) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
};

const normalizeSystemCurrency = (entry: any, baseCurrency: string): EffectiveCurrencyEntry | null => {
  const code = normalizeCurrencyCode(entry?.code);
  if (!code) return null;
  return {
    code,
    name: String(entry?.name || code),
    symbol: String(entry?.symbol || ''),
    rate: normalizeRate(entry?.rate, code === baseCurrency ? 1 : 1),
    isActive: entry?.isActive !== false,
    isDefault: code === baseCurrency || Boolean(entry?.isDefault ?? entry?.is_default),
    rateSource: code === baseCurrency ? 'base' : 'manual',
    snapshotId: null,
    rateUpdatedAt: null,
    stale: false
  };
};

const normalizeCurrencyList = (entries: any[], baseCurrency: string): EffectiveCurrencyEntry[] => {
  const safeBase = normalizeCurrencyCode(baseCurrency, 'USD');
  const seen = new Set<string>();
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeSystemCurrency(entry, safeBase))
    .filter((entry): entry is EffectiveCurrencyEntry => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry.code)) return false;
      seen.add(entry.code);
      return true;
    })
    .filter((entry) => entry.isActive !== false);

  if (!normalized.some((entry) => entry.code === safeBase)) {
    normalized.unshift({
      code: safeBase,
      name: safeBase,
      symbol: '',
      rate: 1,
      isActive: true,
      isDefault: true,
      rateSource: 'base',
      snapshotId: null,
      rateUpdatedAt: null,
      stale: false
    });
  }

  return normalized.map((entry) => ({
    ...entry,
    isDefault: entry.code === safeBase
  }));
};

const normalizeBaseUrl = (value: any, fallback: string) => {
  const raw = String(value || fallback || '').slice(0, 2048).trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, '');
};

export const normalizeFxSystemConfig = (raw: any, fallbackBaseCurrency = 'USD'): FxSystemConfig => {
  const source = isObjectLike(raw) ? raw : {};
  const baseCurrency = normalizeCurrencyCode(
    source.syncBaseCurrency ?? source.baseCurrency,
    fallbackBaseCurrency || DEFAULT_FX_SYSTEM_CONFIG.syncBaseCurrency
  );

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_FX_SYSTEM_CONFIG.enabled),
    providerCode: String(source.providerCode || DEFAULT_FX_SYSTEM_CONFIG.providerCode).trim() || DEFAULT_FX_SYSTEM_CONFIG.providerCode,
    syncBaseCurrency: baseCurrency || DEFAULT_FX_SYSTEM_CONFIG.syncBaseCurrency,
    autoApproveSnapshots: normalizeBoolean(
      source.autoApproveSnapshots,
      DEFAULT_FX_SYSTEM_CONFIG.autoApproveSnapshots
    ),
    refreshEnabled: normalizeBoolean(source.refreshEnabled, DEFAULT_FX_SYSTEM_CONFIG.refreshEnabled),
    refreshCron: String(source.refreshCron || DEFAULT_FX_SYSTEM_CONFIG.refreshCron).trim() || DEFAULT_FX_SYSTEM_CONFIG.refreshCron,
    staleAfterSeconds: normalizeNumber(
      source.staleAfterSeconds,
      DEFAULT_FX_SYSTEM_CONFIG.staleAfterSeconds,
      60
    ),
    fallbackToStoredRates: normalizeBoolean(
      source.fallbackToStoredRates,
      DEFAULT_FX_SYSTEM_CONFIG.fallbackToStoredRates
    ),
    sourceBaseUrl: normalizeBaseUrl(
      source.sourceBaseUrl,
      DEFAULT_FX_SYSTEM_CONFIG.sourceBaseUrl
    ),
    sourceProvider: String(source.sourceProvider || DEFAULT_FX_SYSTEM_CONFIG.sourceProvider)
      .trim()
      .toUpperCase(),
    timezone: String(source.timezone || DEFAULT_FX_SYSTEM_CONFIG.timezone).trim() || DEFAULT_FX_SYSTEM_CONFIG.timezone
  };
};

const loadSystemSettings = async (): Promise<SystemSettingsShape> => {
  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  return (record?.data as SystemSettingsShape) || DEFAULT_SYSTEM_SETTINGS;
};

const persistSystemFxConfig = async (fxConfig: FxSystemConfig) => {
  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  const existing = ((record?.data as Record<string, any>) || {}) as Record<string, any>;
  const next = {
    ...existing,
    fx: fxConfig
  };
  await prisma.appSetting.upsert({
    where: { scope: 'system' },
    create: { scope: 'system', data: next },
    update: { data: next }
  });
  return next;
};

const extractSystemCurrencyState = (settings: SystemSettingsShape) => {
  const baseCurrency = normalizeCurrencyCode(settings?.currency?.baseCurrency, 'USD');
  const currencies = normalizeCurrencyList(settings?.currencies || [], baseCurrency);
  return { baseCurrency, currencies };
};

const getCurrentFxConfig = async () => {
  const settings = await loadSystemSettings();
  const { baseCurrency, currencies } = extractSystemCurrencyState(settings);
  const fxConfig = normalizeFxSystemConfig(settings?.fx, baseCurrency);
  return { settings, baseCurrency, currencies, fxConfig };
};

export const ensureFxProvidersSeeded = async () => {
  await Promise.all(
    DEFAULT_FX_PROVIDERS.map((provider) =>
      prisma.fxProvider.upsert({
        where: { code: provider.code },
        create: provider,
        update: {
          name: provider.name,
          kind: provider.kind,
          baseUrl: provider.baseUrl,
          priority: provider.priority,
          settingsJson: provider.settingsJson
        }
      })
    )
  );
};

const buildSnapshotInclude = {
  provider: true,
  rates: {
    orderBy: { quoteCurrency: 'asc' as const }
  }
};

const findPreferredSnapshot = async (baseCurrency: string, providerCode?: string | null) => {
  const providerFilter = providerCode ? { providerCode } : {};
  const frozen = await prisma.fxSnapshot.findFirst({
    where: {
      baseCurrency,
      status: 'APPROVED',
      isFrozen: true,
      ...providerFilter
    },
    orderBy: [{ approvedAt: 'desc' }, { fetchedAt: 'desc' }],
    include: buildSnapshotInclude
  });
  if (frozen) return frozen;

  return prisma.fxSnapshot.findFirst({
    where: {
      baseCurrency,
      status: 'APPROVED',
      ...providerFilter
    },
    orderBy: [{ approvedAt: 'desc' }, { fetchedAt: 'desc' }],
    include: buildSnapshotInclude
  });
};

const loadActiveOverrides = async (fromCurrency: string, toCurrencies: string[]) => {
  const now = new Date();
  const rows = await prisma.fxManualOverride.findMany({
    where: {
      fromCurrency,
      toCurrency: { in: toCurrencies },
      status: 'APPROVED',
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
    },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }]
  });

  const byPair = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const key = `${row.fromCurrency}:${row.toCurrency}`;
    if (!byPair.has(key)) byPair.set(key, row);
  });
  return byPair;
};

const snapshotIsStale = (snapshot: { sourceTimestamp: Date | string }, config: FxSystemConfig) => {
  const sourceTime = new Date(snapshot.sourceTimestamp);
  const ageSeconds = Math.max(0, (Date.now() - sourceTime.getTime()) / 1000);
  return ageSeconds > Math.max(60, config.staleAfterSeconds);
};

export const resolveEffectiveCurrencies = async (): Promise<ResolvedCurrencySet> => {
  const { baseCurrency, currencies, fxConfig } = await getCurrentFxConfig();
  const currencyCodes = currencies.map((entry) => entry.code);
  const overrides = fxConfig.enabled
    ? await loadActiveOverrides(baseCurrency, currencyCodes.filter((code) => code !== baseCurrency))
    : new Map<string, any>();
  const snapshot = fxConfig.enabled
    ? await findPreferredSnapshot(baseCurrency, fxConfig.providerCode || null)
    : null;

  const snapshotRates = new Map<string, number>();
  if (snapshot?.rates?.length) {
    snapshot.rates.forEach((row) => {
      snapshotRates.set(row.quoteCurrency, Number(row.effectiveRate ?? row.rate));
    });
  }

  const stale = snapshot ? snapshotIsStale(snapshot, fxConfig) : true;

  const effectiveCurrencies = currencies.map((entry) => {
    if (entry.code === baseCurrency) {
      return {
        ...entry,
        rate: 1,
        rateSource: 'base' as const,
        snapshotId: snapshot?.id || null,
        rateUpdatedAt: snapshot ? toIso(snapshot.approvedAt || snapshot.fetchedAt) : null,
        stale
      };
    }

    const override = overrides.get(`${baseCurrency}:${entry.code}`);
    const snapshotRate = snapshotRates.get(entry.code);
    if (override) {
      return {
        ...entry,
        rate: Number(override.rate),
        rateSource: 'override' as const,
        snapshotId: snapshot?.id || null,
        rateUpdatedAt: toIso(override.updatedAt),
        stale
      };
    }

    if (Number.isFinite(snapshotRate) && snapshotRate && snapshotRate > 0) {
      return {
        ...entry,
        rate: Number(snapshotRate),
        rateSource: 'snapshot' as const,
        snapshotId: snapshot?.id || null,
        rateUpdatedAt: snapshot ? toIso(snapshot.approvedAt || snapshot.fetchedAt) : null,
        stale
      };
    }

    return {
      ...entry,
      rate: normalizeRate(entry.rate, 1),
      rateSource: 'manual' as const,
      snapshotId: null,
      rateUpdatedAt: null,
      stale: false
    };
  });

  const rates = new Map<string, number>();
  effectiveCurrencies.forEach((entry) => {
    rates.set(entry.code, normalizeRate(entry.rate, entry.code === baseCurrency ? 1 : 1));
  });

  return {
    baseCurrency,
    currencies: effectiveCurrencies,
    rates,
    fxConfig,
    snapshot: snapshot
      ? {
          id: snapshot.id,
          providerCode: snapshot.providerCode,
          fetchedAt: snapshot.fetchedAt.toISOString(),
          approvedAt: toIso(snapshot.approvedAt),
          stale,
          isFrozen: snapshot.isFrozen
        }
      : null
  };
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const fetchFn = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('Global fetch is not available in this runtime');
  }

  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response?.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`FX provider request failed (${response?.status || 'ERR'}): ${text || 'unknown error'}`);
  }

  return response.json() as Promise<T>;
};

const fetchFrankfurterRates = async (
  provider: { code: string; baseUrl: string | null; settingsJson: any },
  baseCurrency: string,
  config: FxSystemConfig
) => {
  const baseUrl = normalizeBaseUrl(
    provider.baseUrl || provider.settingsJson?.baseUrl,
    config.sourceBaseUrl
  );
  const providerCode = String(provider.settingsJson?.provider || config.sourceProvider || '').trim().toUpperCase();
  const endpoint = new URL(`${baseUrl}/latest`);
  endpoint.searchParams.set('from', baseCurrency);
  if (providerCode) endpoint.searchParams.set('provider', providerCode);

  const payload = await fetchJson<FrankfurterResponse>(endpoint.toString());
  const responseBase = normalizeCurrencyCode(payload?.base, baseCurrency);
  const rawRates = isObjectLike(payload?.rates) ? payload.rates : {};
  const rates = Object.entries(rawRates).reduce<Record<string, number>>((acc, [quoteCurrency, rate]) => {
    const code = normalizeCurrencyCode(quoteCurrency);
    const numeric = normalizeRate(rate, 0);
    if (code && numeric > 0) {
      acc[code] = numeric;
    }
    return acc;
  }, {});

  return {
    baseCurrency: responseBase,
    sourceTimestamp: payload?.date ? new Date(`${payload.date}T00:00:00.000Z`) : new Date(),
    rates,
    sourceMeta: {
      endpoint: endpoint.toString(),
      provider: providerCode || null,
      date: payload?.date || null
    }
  };
};

const fetchProviderSnapshot = async (
  provider: { code: string; kind: string; baseUrl: string | null; settingsJson: any },
  baseCurrency: string,
  config: FxSystemConfig
) => {
  const kind = String(provider.kind || '').trim().toLowerCase();
  if (kind === 'frankfurter') {
    return fetchFrankfurterRates(provider, baseCurrency, config);
  }
  throw new Error(`FX provider kind is not supported yet: ${provider.kind}`);
};

export const runFxSync = async (input: SyncInput = {}) => {
  await ensureFxProvidersSeeded();
  const { baseCurrency: systemBaseCurrency, fxConfig } = await getCurrentFxConfig();
  const providerCode = String(input.providerCode || fxConfig.providerCode || DEFAULT_FX_SYSTEM_CONFIG.providerCode).trim();
  const baseCurrency = normalizeCurrencyCode(systemBaseCurrency || fxConfig.syncBaseCurrency || input.baseCurrency || 'USD');
  const provider = await prisma.fxProvider.findUnique({ where: { code: providerCode } });

  if (!provider) {
    throw new Error(`FX provider not found: ${providerCode}`);
  }
  if (!provider.enabled) {
    throw new Error(`FX provider is disabled: ${providerCode}`);
  }

  const syncJob = await prisma.fxSyncJob.create({
    data: {
      providerCode,
      baseCurrency,
      requestedById: input.requestedById || null,
      triggerType: input.triggerType || 'manual',
      status: 'RUNNING'
    }
  });

  try {
    const fetched = await fetchProviderSnapshot(provider, baseCurrency, fxConfig);
    const records = Object.entries(fetched.rates)
      .map(([quoteCurrency, rate]) => ({
        quoteCurrency: normalizeCurrencyCode(quoteCurrency),
        rate: normalizeRate(rate, 0)
      }))
      .filter((entry) => entry.quoteCurrency && entry.quoteCurrency !== fetched.baseCurrency && entry.rate > 0);

    if (!records.length) {
      throw new Error('FX provider returned no usable rates');
    }

    const now = new Date();
    const snapshot = await prisma.$transaction(async (tx) => {
      const created = await tx.fxSnapshot.create({
        data: {
          providerCode,
          baseCurrency: fetched.baseCurrency,
          status: fxConfig.autoApproveSnapshots ? 'APPROVED' : 'PENDING',
          sourceTimestamp: fetched.sourceTimestamp,
          approvedAt: fxConfig.autoApproveSnapshots ? now : null,
          approvedById: fxConfig.autoApproveSnapshots ? input.requestedById || 'system' : null,
          sourceMeta: fetched.sourceMeta
        }
      });

      await tx.fxRate.createMany({
        data: records.map((entry) => ({
          snapshotId: created.id,
          quoteCurrency: entry.quoteCurrency,
          rate: entry.rate,
          effectiveRate: entry.rate
        }))
      });

      return created;
    });

    const completed = await prisma.fxSyncJob.update({
      where: { id: syncJob.id },
      data: {
        snapshotId: snapshot.id,
        status: 'COMPLETED',
        finishedAt: new Date(),
        recordsInserted: records.length,
        meta: fetched.sourceMeta
      }
    });

    return {
      job: completed,
      snapshot,
      provider,
      autoApproved: fxConfig.autoApproveSnapshots
    };
  } catch (error: any) {
    const failed = await prisma.fxSyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        error: error?.message || 'FX sync failed'
      }
    });
    return Promise.reject(Object.assign(new Error(failed.error || 'FX sync failed'), { job: failed }));
  }
};

export const listFxProviders = async () => {
  await ensureFxProvidersSeeded();
  return prisma.fxProvider.findMany({
    orderBy: [{ priority: 'asc' }, { code: 'asc' }]
  });
};

export const updateFxProvider = async (code: string, payload: Record<string, any>) => {
  const providerCode = String(code || '').trim();
  if (!providerCode) throw new Error('Provider code is required');
  const existing = await prisma.fxProvider.findUnique({ where: { code: providerCode } });
  if (!existing) throw new Error('FX provider not found');

  return prisma.fxProvider.update({
    where: { code: providerCode },
    data: {
      name: payload.name !== undefined ? String(payload.name || existing.name).trim() || existing.name : undefined,
      baseUrl:
        payload.baseUrl !== undefined
          ? normalizeBaseUrl(payload.baseUrl, existing.baseUrl || DEFAULT_FX_SYSTEM_CONFIG.sourceBaseUrl)
          : undefined,
      enabled: payload.enabled !== undefined ? normalizeBoolean(payload.enabled, existing.enabled) : undefined,
      priority: payload.priority !== undefined ? normalizeNumber(payload.priority, existing.priority, 0) : undefined,
      settingsJson:
        payload.settingsJson !== undefined && isObjectLike(payload.settingsJson)
          ? payload.settingsJson
          : payload.sourceProvider !== undefined
            ? {
                ...(isObjectLike(existing.settingsJson) ? existing.settingsJson : {}),
                provider: String(payload.sourceProvider || '').trim().toUpperCase()
              }
            : undefined
    }
  });
};

export const getFxConfig = async () => {
  const { fxConfig } = await getCurrentFxConfig();
  return fxConfig;
};

export const updateFxConfig = async (payload: Record<string, any>) => {
  const { baseCurrency, fxConfig } = await getCurrentFxConfig();
  const merged = normalizeFxSystemConfig({ ...fxConfig, ...(isObjectLike(payload) ? payload : {}) }, baseCurrency);
  merged.syncBaseCurrency = baseCurrency;
  await persistSystemFxConfig(merged);
  return merged;
};

export const listFxSnapshots = async (options: { limit?: number; providerCode?: string; baseCurrency?: string } = {}) => {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  return prisma.fxSnapshot.findMany({
    where: {
      ...(options.providerCode ? { providerCode: String(options.providerCode).trim() } : {}),
      ...(options.baseCurrency ? { baseCurrency: normalizeCurrencyCode(options.baseCurrency) } : {})
    },
    orderBy: [{ fetchedAt: 'desc' }],
    take: limit,
    include: {
      provider: true,
      _count: {
        select: { rates: true, syncJobs: true }
      }
    }
  });
};

export const approveFxSnapshot = async (snapshotId: string, actorId?: string | null, freeze = false) => {
  const id = String(snapshotId || '').trim();
  if (!id) throw new Error('Snapshot id is required');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.fxSnapshot.findUnique({ where: { id } });
    if (!existing) throw new Error('FX snapshot not found');

    if (freeze) {
      await tx.fxSnapshot.updateMany({
        where: {
          baseCurrency: existing.baseCurrency,
          isFrozen: true
        },
        data: { isFrozen: false }
      });
    }

    return tx.fxSnapshot.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: actorId || null,
        isFrozen: freeze ? true : existing.isFrozen
      },
      include: { provider: true }
    });
  });
};

export const setFxSnapshotFrozen = async (snapshotId: string, frozen: boolean, actorId?: string | null) => {
  const id = String(snapshotId || '').trim();
  if (!id) throw new Error('Snapshot id is required');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.fxSnapshot.findUnique({ where: { id } });
    if (!existing) throw new Error('FX snapshot not found');

    if (frozen) {
      await tx.fxSnapshot.updateMany({
        where: {
          baseCurrency: existing.baseCurrency,
          isFrozen: true
        },
        data: { isFrozen: false }
      });
    }

    return tx.fxSnapshot.update({
      where: { id },
      data: {
        isFrozen: frozen,
        approvedById: frozen ? actorId || existing.approvedById : existing.approvedById
      },
      include: { provider: true }
    });
  });
};

export const listFxOverrides = async (options: { limit?: number; status?: string } = {}) => {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  return prisma.fxManualOverride.findMany({
    where: {
      ...(options.status ? { status: String(options.status).trim().toUpperCase() } : {})
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit
  });
};

export const createFxOverride = async (payload: Record<string, any>, actorId?: string | null) => {
  const fromCurrency = normalizeCurrencyCode(payload.fromCurrency);
  const toCurrency = normalizeCurrencyCode(payload.toCurrency);
  const rate = normalizeRate(payload.rate, 0);
  const reason = String(payload.reason || '').trim();
  const effectiveFrom = payload.effectiveFrom ? new Date(payload.effectiveFrom) : new Date();
  const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : null;
  const approveNow = normalizeBoolean(payload.approveNow, false);

  if (!fromCurrency || !toCurrency) throw new Error('fromCurrency and toCurrency are required');
  if (fromCurrency === toCurrency) throw new Error('Override pair must use different currencies');
  if (!rate || rate <= 0) throw new Error('rate must be greater than zero');
  if (!reason) throw new Error('reason is required');
  if (Number.isNaN(effectiveFrom.getTime())) throw new Error('effectiveFrom is invalid');
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) throw new Error('effectiveTo is invalid');

  return prisma.fxManualOverride.create({
    data: {
      fromCurrency,
      toCurrency,
      rate,
      reason,
      effectiveFrom,
      effectiveTo,
      status: approveNow ? 'APPROVED' : 'PENDING',
      createdById: actorId || null,
      approvedById: approveNow ? actorId || null : null
    }
  });
};

export const approveFxOverride = async (overrideId: string, actorId?: string | null) => {
  const id = String(overrideId || '').trim();
  if (!id) throw new Error('Override id is required');

  return prisma.fxManualOverride.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: actorId || null
    }
  });
};

export const getFxHealth = async () => {
  const [providers, latestSync, resolved, recentLocks, lockCount] = await Promise.all([
    listFxProviders(),
    prisma.fxSyncJob.findFirst({
      orderBy: [{ startedAt: 'desc' }],
      include: { provider: true, snapshot: true }
    }),
    resolveEffectiveCurrencies(),
    listFxLocks({ limit: 10 }),
    prisma.fxLock.count()
  ]);

  return {
    config: resolved.fxConfig,
    snapshot: resolved.snapshot,
    latestSync,
    providers,
    currencyCount: resolved.currencies.length,
    recentLocks,
    lockCount
  };
};

const emitFxRuntimeUpdate = (app: Application, payload: Record<string, any>) => {
  const io = app.get('io');
  const communityIo = app.get('communityIo');
  io?.emit?.('settings:updated', { scope: 'system', reason: 'fx_updated', ...payload });
  communityIo?.emit?.('settings:updated', { scope: 'system', reason: 'fx_updated', ...payload });
};

export const notifyFxRuntimeUpdate = async (app: Application, payload: Record<string, any> = {}) => {
  const settings = await loadSystemSettings();
  app.set('runtime:systemSettings', settings);
  app.set('runtime:systemSettingsVersion', Date.now());
  emitFxRuntimeUpdate(app, payload);
};

export const registerFxJobs = async (app: Application) => {
  await ensureFxProvidersSeeded();
  const { fxConfig } = await getCurrentFxConfig();

  if (fxCronTask) {
    fxCronTask.stop();
    fxCronTask = null;
    fxCronExpression = '';
  }

  if (!fxConfig.enabled || !fxConfig.refreshEnabled) {
    return;
  }

  const expression = cron.validate(fxConfig.refreshCron)
    ? fxConfig.refreshCron
    : DEFAULT_FX_SYSTEM_CONFIG.refreshCron;

  fxCronTask = cron.schedule(
    expression,
    async () => {
      try {
        const result = await runFxSync({ triggerType: 'scheduled' });
        if (result.autoApproved) {
          await notifyFxRuntimeUpdate(app, {
            fx: {
              providerCode: result.provider.code,
              snapshotId: result.snapshot.id,
              source: 'scheduled_sync'
            }
          });
        }
      } catch (error) {
        console.error('[fx] scheduled sync failed:', error);
      }
    },
    {
      scheduled: true,
      timezone: fxConfig.timezone || DEFAULT_FX_SYSTEM_CONFIG.timezone
    }
  );

  fxCronTask.start();
  fxCronExpression = expression;
};

export const getRegisteredFxCronExpression = () => fxCronExpression || null;
