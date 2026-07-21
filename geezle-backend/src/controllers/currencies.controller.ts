import { Request, Response } from 'express';
import { resolveEffectiveCurrencies } from '../services/fx.service';
import { ensurePlatformCurrencyCatalog } from '../services/ensurePlatformCurrencyCatalog.service';
import { FRANKFURTER_UNSUPPORTED_CODES, PLATFORM_BASE_CURRENCY } from '../services/platformCurrencyCatalog';
import { getMinorUnits } from '../services/money.service';

export const getActiveCurrencies = async (_req: Request, res: Response) => {
  try {
    // Phase 28D — ensure USD base + full platform catalog (idempotent)
    await ensurePlatformCurrencyCatalog();
    const resolved = await resolveEffectiveCurrencies();
    const currencies = resolved.currencies
      .filter((c) => c.isActive !== false)
      .map((c) => ({
        ...c,
        minorUnit: getMinorUnits(c.code),
        frankfurterSupported: !FRANKFURTER_UNSUPPORTED_CODES.includes(c.code),
        rateUnavailable: c.code !== resolved.baseCurrency && !(Number(c.rate) > 0)
      }));
    return res.json({
      success: true,
      data: currencies,
      meta: {
        baseCurrency: resolved.baseCurrency || PLATFORM_BASE_CURRENCY,
        catalogCount: currencies.length,
        snapshot: resolved.snapshot,
        frankfurterUnsupported: FRANKFURTER_UNSUPPORTED_CODES,
        fx: {
          enabled: resolved.fxConfig.enabled,
          providerCode: resolved.fxConfig.providerCode
        }
      }
    });
  } catch (error: any) {
    console.error('Get active currencies error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load currencies' });
  }
};
