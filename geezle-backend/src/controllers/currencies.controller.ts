import { Request, Response } from 'express';
import { resolveEffectiveCurrencies } from '../services/fx.service';

export const getActiveCurrencies = async (_req: Request, res: Response) => {
  try {
    const resolved = await resolveEffectiveCurrencies();
    return res.json({
      success: true,
      data: resolved.currencies,
      meta: {
        baseCurrency: resolved.baseCurrency,
        snapshot: resolved.snapshot,
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
