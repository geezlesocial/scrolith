/**
 * Phase 28D — idempotent ensure of USD base + 23-currency catalog in AppSetting system.
 * Does not overwrite admin-set rates when present and positive.
 * Does not disable currencies the admin already configured beyond the catalog (merges in).
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

export const ensurePlatformCurrencyCatalog = async (): Promise<{
  baseCurrency: string;
  catalogCount: number;
  merged: number;
  created: boolean;
}> => {
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
    // Fill missing metadata; preserve admin rate if positive and not a false 1:1 placeholder
    // Phase 28E: non-base rate===1 is treated as unset (symbol-only trap) → use seed catalog rate
    const rateNum = Number(prev.rate);
    const hasRealRate = Number.isFinite(rateNum) && rateNum > 0 && !(rateNum === 1 && catalog.code !== baseCurrency);
    const next = {
      ...prev,
      code: catalog.code,
      name: prev.name || catalog.name,
      symbol: prev.symbol || catalog.symbol,
      rate: catalog.code === baseCurrency ? 1 : hasRealRate ? rateNum : catalog.seedRateVsUsd,
      isActive: prev.isActive !== false,
      isDefault: catalog.code === baseCurrency ? true : Boolean(prev.isDefault) && catalog.code === baseCurrency,
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

  // Force single base
  for (const [code, entry] of byCode.entries()) {
    if (code === baseCurrency) {
      byCode.set(code, { ...entry, isDefault: true, isActive: true, rate: 1 });
    } else if (entry.isDefault) {
      byCode.set(code, { ...entry, isDefault: false });
    }
  }

  // Order: catalog order first, then any extras
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

  return {
    baseCurrency,
    catalogCount: PLATFORM_CURRENCY_CATALOG.length,
    merged,
    created: !record
  };
};

export const getPlatformCatalogSnapshot = () => ({
  baseCurrency: PLATFORM_BASE_CURRENCY,
  currencies: buildCatalogCurrencyRecords(),
  frankfurterUnsupported: PLATFORM_CURRENCY_CATALOG.filter((c) => !c.frankfurterSupported).map((c) => c.code)
});
