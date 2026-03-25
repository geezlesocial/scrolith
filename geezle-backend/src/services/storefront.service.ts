import prisma from '../utils/prismaClient';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  isStorefrontRoleEnabled,
  normalizeStorefrontSettings,
  StorefrontSettingsNormalized
} from '../utils/storefrontSettings';

export const getStorefrontSettings = async (): Promise<StorefrontSettingsNormalized> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    return normalizeStorefrontSettings(
      (record?.data as any)?.storefront ?? (record?.data as any)?.storefront_settings
    );
  } catch {
    return DEFAULT_STOREFRONT_SETTINGS;
  }
};

export const isUserStorefrontEnabled = (
  settings: StorefrontSettingsNormalized,
  role?: string | null
) =>
  Boolean(
    settings.enabled &&
      settings.userProfilesEnabled &&
      settings.modules.userGigs &&
      isStorefrontRoleEnabled(settings, role)
  );

export const isBusinessPageStorefrontEnabled = (settings: StorefrontSettingsNormalized) =>
  Boolean(settings.enabled && settings.businessPagesEnabled && settings.modules.businessPackages);
