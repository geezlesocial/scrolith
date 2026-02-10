import prisma from './prismaClient';

export type GcoinSettingsSnapshot = {
  conversionRate: number;
  minWithdrawal: number;
  conversionEnabled: boolean;
  autoApproveConversions: boolean;
  userTransfersEnabled: boolean;
  transferFeeType: 'percentage' | 'flat';
  transferFeeValue: number;
  viewsUnit: number;
  likesUnit: number;
  repostsUnit: number;
  sharesUnit: number;
  coinPerViewsUnit: number;
  coinPerLikesUnit: number;
  coinPerRepostsUnit: number;
  coinPerSharesUnit: number;
  adminFeePercent: number;
};

const DEFAULT_GCOIN_SETTINGS: GcoinSettingsSnapshot = {
  conversionRate: 0,
  minWithdrawal: 0,
  conversionEnabled: false,
  autoApproveConversions: false,
  userTransfersEnabled: false,
  transferFeeType: 'percentage',
  transferFeeValue: 0,
  viewsUnit: 200,
  likesUnit: 30,
  repostsUnit: 40,
  sharesUnit: 50,
  coinPerViewsUnit: 1,
  coinPerLikesUnit: 1,
  coinPerRepostsUnit: 1,
  coinPerSharesUnit: 1,
  adminFeePercent: 0.1
};

const normalizeNumber = (value: any, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeSettings = (raw: any): GcoinSettingsSnapshot => ({
  conversionRate: normalizeNumber(raw?.conversionRate ?? raw?.conversion_rate, DEFAULT_GCOIN_SETTINGS.conversionRate),
  minWithdrawal: normalizeNumber(raw?.minWithdrawal ?? raw?.min_withdrawal, DEFAULT_GCOIN_SETTINGS.minWithdrawal),
  conversionEnabled: Boolean(raw?.conversionEnabled ?? raw?.conversion_enabled ?? DEFAULT_GCOIN_SETTINGS.conversionEnabled),
  autoApproveConversions: Boolean(raw?.autoApproveConversions ?? raw?.auto_approve_conversions ?? DEFAULT_GCOIN_SETTINGS.autoApproveConversions),
  userTransfersEnabled: Boolean(raw?.userTransfersEnabled ?? raw?.user_transfers_enabled ?? DEFAULT_GCOIN_SETTINGS.userTransfersEnabled),
  transferFeeType: (raw?.transferFeeType ?? raw?.transfer_fee_type ?? DEFAULT_GCOIN_SETTINGS.transferFeeType) as 'percentage' | 'flat',
  transferFeeValue: normalizeNumber(raw?.transferFeeValue ?? raw?.transfer_fee_value, DEFAULT_GCOIN_SETTINGS.transferFeeValue),
  viewsUnit: normalizeNumber(raw?.viewsUnit ?? raw?.views_unit, DEFAULT_GCOIN_SETTINGS.viewsUnit),
  likesUnit: normalizeNumber(raw?.likesUnit ?? raw?.likes_unit, DEFAULT_GCOIN_SETTINGS.likesUnit),
  repostsUnit: normalizeNumber(raw?.repostsUnit ?? raw?.reposts_unit, DEFAULT_GCOIN_SETTINGS.repostsUnit),
  sharesUnit: normalizeNumber(raw?.sharesUnit ?? raw?.shares_unit, DEFAULT_GCOIN_SETTINGS.sharesUnit),
  coinPerViewsUnit: normalizeNumber(raw?.coinPerViewsUnit ?? raw?.coin_per_views_unit, DEFAULT_GCOIN_SETTINGS.coinPerViewsUnit),
  coinPerLikesUnit: normalizeNumber(raw?.coinPerLikesUnit ?? raw?.coin_per_likes_unit, DEFAULT_GCOIN_SETTINGS.coinPerLikesUnit),
  coinPerRepostsUnit: normalizeNumber(raw?.coinPerRepostsUnit ?? raw?.coin_per_reposts_unit, DEFAULT_GCOIN_SETTINGS.coinPerRepostsUnit),
  coinPerSharesUnit: normalizeNumber(raw?.coinPerSharesUnit ?? raw?.coin_per_shares_unit, DEFAULT_GCOIN_SETTINGS.coinPerSharesUnit),
  adminFeePercent: normalizeNumber(raw?.adminFeePercent ?? raw?.admin_fee_percent, DEFAULT_GCOIN_SETTINGS.adminFeePercent)
});

const GCOIN_SETTINGS_SCOPE = 'gcoin_settings';

const getAppSetting = async (): Promise<any> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: GCOIN_SETTINGS_SCOPE } });
    if (record?.data) return record.data;
  } catch (e) {
    console.warn('[gcoinSettings] AppSetting read failed', e);
  }
  return null;
};

const saveAppSetting = async (data: any) => {
  try {
    await prisma.appSetting.upsert({
      where: { scope: GCOIN_SETTINGS_SCOPE },
      create: { scope: GCOIN_SETTINGS_SCOPE, data },
      update: { data }
    });
  } catch (e) {
    console.warn('[gcoinSettings] AppSetting save failed', e);
  }
};

export const getGcoinSettingsSafe = async (): Promise<GcoinSettingsSnapshot> => {
  try {
    const record = await prisma.gcoinSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (record) return normalizeSettings(record);
  } catch (e) {
    console.warn('[gcoinSettings] Prisma read failed, falling back to AppSetting', e);
  }

  const fallback = await getAppSetting();
  if (fallback) return normalizeSettings(fallback);
  return { ...DEFAULT_GCOIN_SETTINGS };
};

export const saveGcoinSettingsSafe = async (payload: any): Promise<GcoinSettingsSnapshot> => {
  const existing = await getGcoinSettingsSafe();
  const merged = normalizeSettings({ ...existing, ...payload });

  let saved = false;
  try {
    const existingRow = await prisma.gcoinSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!existingRow) {
      await prisma.gcoinSettings.create({ data: merged as any });
    } else {
      await prisma.gcoinSettings.update({ where: { id: existingRow.id }, data: merged as any });
      await prisma.gcoinSettings.updateMany({
        where: { id: { not: existingRow.id } },
        data: merged as any
      });
    }
    saved = true;
  } catch (e) {
    console.warn('[gcoinSettings] Prisma save failed, using AppSetting only', e);
  }

  // Always write to AppSetting so reads are stable even if Prisma fails.
  await saveAppSetting(merged);

  if (!saved) {
    // If Prisma failed, we still return the merged snapshot.
    return merged;
  }

  return merged;
};
