import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const DEFAULT_SYSTEM = {
  currency: { baseCurrency: 'USD' },
  currencies: [] as Array<{ code: string; name?: string; symbol?: string; rate?: number; isActive?: boolean }>
};

const normalizeCurrency = (entry: any, baseCode?: string) => {
  const code = (entry?.code || '').toString().toUpperCase();
  const parsedRate = Number(entry?.rate);
  const rate = Number.isFinite(parsedRate) ? parsedRate : 1;
  const isDefault = baseCode ? code === baseCode : Boolean(entry?.isDefault ?? entry?.is_default);
  return {
    code,
    name: entry?.name || code,
    symbol: entry?.symbol || '',
    rate,
    isActive: entry?.isActive !== false,
    isDefault
  };
};

export const getActiveCurrencies = async (_req: Request, res: Response) => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data = (record?.data as any) || DEFAULT_SYSTEM;
    const list = Array.isArray(data?.currencies) ? data.currencies : [];
    const base = data?.currency?.baseCurrency ? String(data.currency.baseCurrency).toUpperCase() : 'USD';
    let active = list
      .filter((c: any) => c && c.isActive !== false)
      .map((entry: any) => normalizeCurrency(entry, base));

    if (!active.some((c: any) => c.code === base)) {
      active = [normalizeCurrency({ code: base, isActive: true, rate: 1 }, base), ...active];
    } else {
      active = active.map((c: any) => ({ ...c, isDefault: c.code === base }));
    }

    return res.json({ success: true, data: active });
  } catch (error: any) {
    console.error('Get active currencies error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load currencies' });
  }
};
