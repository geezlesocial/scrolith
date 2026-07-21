/**
 * Phase 28D/E — idempotent ensure of USD base + 23-currency catalog in AppSetting system.
 * Writes only when catalog is incomplete or base/rate metadata needs correction.
 * Safe to call from public catalog endpoints (no write storm when already healthy).
 */

import prisma from '../utils/prismaClient';
import {
  PLATFORM_BASE_CURRENCY,
  PLATFORM_CURRENCY_CATALOG,
  buildCatalogCurrencyRecords
} from './platformCurrencyCatalog';

const normalizeCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase();

let lastEnsureAt = 0;
const ENSURE_COOLDOWN_MS = 60_000;

export const ensurePlatformCurrencyCatalog = async (): Promise<{
  baseCurrency: string;
  catalogCount: number;
  merged: number;
  created: boolean;
  wrote: boolean;
  skipped: boolean;
}> => {
  // Cooldown: avoid concurrent public GETs all writing system settings
  if (Date.now() - lastEnsureAt < ENSURE_COOLDOWN_MS) {
    return {
      baseCurrency: PLATFORM_BASE_CURRENCY,
      catalogCount: PLATFORM_CURRENCY_CATALOG.length,
      merged: 0,
      created: false,
      wrote: false,
      skipped: true
    };
  }

  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  const existing = ((record?.data as Record<string, any>) || {}) as Record<string, any>;
  const baseCurrency = PLATFORM_BASE_CURRENCY;
  const currentList = Array.isArray(existing.currencies) ? existing.currencies : [];
  const byCode = new Map<string, any>();
  currentList.forEach((entry: any) => {
    const code = normalizeCode(entry?.code);
    if (code) byCode.set(code, entry);
  });

  let merged = 0;
  let needsWrite = false;

  // Missing catalog codes
  for (const catalog of PLATFORM_CURRENCY_CATALOG) {
    if (!byCode.has(catalog.code)) {
      needsWrite = true;
      break;
    }
  }
  // Base must be USD
  if (normalizeCode(existing?.currency?.baseCurrency) !== baseCurrency) needsWrite = true;
  const usd = byCode.get(baseCurrency);
  if (!usd || Number(usd.rate) !== 1 || usd.isActive === false || !usd.isDefault) needsWrite = true;
  // False 1:1 rates on non-base catalog currencies
  for (const catalog of PLATFORM_CURRENCY_CATALOG) {
    if (catalog.code === baseCurrency) continue;
    const prev = byCode.get(catalog.code);
    if (!prev) continue;
    const rateNum = Number(prev.rate);
    if (rateNum === 1) {
      needsWrite = true;
      break;
    }
  }

  if (!needsWrite && record) {
    lastEnsureAt = Date.now();
    return {
      baseCurrency,
      catalogCount: PLATFORM_CURRENCY_CATALOG.length,
      merged: 0,
      created: false,
      wrote: false,
      skipped: true
    };
  }

  for (const catalog of PLATFORM_CURRENCY_CATALOG) {
    const prev = byCode.get(catalog.code);
    if (!prev) {
      byCode.set(catalog.code, {
        code: catalog.code,
        name: catalog.name,
        symbol: catalog.symbol,
        rate: catalog.seedRateVsUsd,
        isActive: true,
        isDefault: catalog.code === baseCurrency,
        minorUnit: catalog.minorUnit,
        frankfurterSupported: catalog.frankfurterSupported
      });
      merged += 1;
      continue;
    }
    const rateNum = Number(prev.rate);
    const hasRealRate =
      Number.isFinite(rateNum) && rateNum > 0 && !(rateNum === 1 && catalog.code !== baseCurrency);
    const next = {
      ...prev,
      code: catalog.code,
      name: prev.name || catalog.name,
      symbol: prev.symbol || catalog.symbol,
      rate: catalog.code === baseCurrency ? 1 : hasRealRate ? rateNum : catalog.seedRateVsUsd,
      isActive: prev.isActive !== false,
      isDefault: catalog.code === baseCurrency,
      minorUnit: prev.minorUnit ?? catalog.minorUnit,
      frankfurterSupported: catalog.frankfurterSupported
    };
    if (catalog.code === baseCurrency) {
      next.isDefault = true;
      next.isActive = true;
      next.rate = 1;
    }
    byCode.set(catalog.code, next);
  }

  for (const [code, entry] of byCode.entries()) {
    if (code === baseCurrency) {
      byCode.set(code, { ...entry, isDefault: true, isActive: true, rate: 1 });
    } else if (entry.isDefault) {
      byCode.set(code, { ...entry, isDefault: false });
    }
  }

  const ordered: any[] = [];
  for (const c of PLATFORM_CURRENCY_CATALOG) {
    const e = byCode.get(c.code);
    if (e) ordered.push(e);
  }
  for (const [code, e] of byCode.entries()) {
    if (!PLATFORM_CURRENCY_CATALOG.some((c) => c.code === code)) ordered.push(e);
  }

  const nextData = {
    ...existing,
    currency: {
      ...(existing.currency || {}),
      baseCurrency
    },
    currencies: ordered
  };

  await prisma.appSetting.upsert({
    where: { scope: 'system' },
    create: { scope: 'system', data: nextData },
    update: { data: nextData }
  });

  lastEnsureAt = Date.now();
  return {
    baseCurrency,
    catalogCount: PLATFORM_CURRENCY_CATALOG.length,
    merged,
    created: !record,
    wrote: true,
    skipped: false
  };
};

export const getPlatformCatalogSnapshot = () => ({
  baseCurrency: PLATFORM_BASE_CURRENCY,
  currencies: buildCatalogCurrencyRecords(),
  frankfurterUnsupported: PLATFORM_CURRENCY_CATALOG.filter((c) => !c.frankfurterSupported).map((c) => c.code)
});
