import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PlatformSettings } from '../types';
import { CMSService } from '../services/cms';
import { AdminService } from '../services/admin';
import { AuthService } from '../services/authService';
import { SocketContext } from './SocketContext';

interface ContentContextType {
  settings: PlatformSettings | null;
  loading: boolean;
  updateSettings?: (settings: PlatformSettings) => Promise<void>;
  mergeHeaderConfig?: (header?: any) => Promise<void>;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const socketContext = useContext(SocketContext);
  const socket = socketContext?.socket ?? null;

  const fetchSettings = useCallback(async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      // Load platform (site) settings and system settings, then merge so
      // components (like SystemSettings) always see both.
      const hasToken = Boolean(await AuthService.getToken());
      const storedUser = AuthService.getStoredUser();
      const role = String(storedUser?.role || '').toLowerCase();
      const isAdmin = role.includes('admin');
      const [platformData, systemData] = hasToken
        ? isAdmin
          ? await Promise.all([
              AdminService.getPlatformSettings(),
              AdminService.getSystemSettings().catch(() => null)
            ])
          : [await CMSService.getSettings(), null]
        : [await CMSService.getSettings(), null];

      let merged: any = platformData || {};

      // Attach system under `system` key if available
      if (systemData) {
        merged = { ...merged, system: systemData };
      }

      // If assets missing, try header config as fallback
      const faviconValue = merged?.favicon_url || merged?.faviconUrl;
      const logoValue = merged?.logo_url || merged?.logoUrl;
      if (!faviconValue || !logoValue) {
        try {
          const header = await CMSService.getHeaderConfig();
          if (header) {
            const headerFavicon = (header as any)?.favicon_url || (header as any)?.faviconUrl;
            const headerLogo = (header as any)?.logo_url || (header as any)?.logoUrl;
            merged = {
              ...merged,
              ...(headerFavicon ? { favicon_url: headerFavicon, faviconUrl: headerFavicon } : {}),
              ...(headerLogo ? { logo_url: headerLogo, logoUrl: headerLogo } : {})
            };
          }
        } catch (e) {
          console.warn('Failed to load header config for assets', e);
        }
      }

      // If tagline is missing from platform payload, try CMSService.getSettings()
      // which normalizes sources (settings, header, hero, etc.) and provides a
      // consolidated `tagline` value used by the UI. This ensures updates made
      // in header/hero sources still surface when the platform write path only
      // persisted one of the sources.
      if (!merged?.tagline) {
        try {
          const cmsSettings = await CMSService.getSettings();
          if (cmsSettings && cmsSettings.tagline) {
            merged = { ...merged, tagline: cmsSettings.tagline };
          }
        } catch (e) {
          // Non-fatal
        }
      }

      setSettings(merged as PlatformSettings);
    } catch (error) {
      console.error('Failed to load settings, using defaults', error);
      const defaultSettings: any = {
        siteName: 'Scrolith',
        tagline: 'AI-Powered Social Freelance Marketplace with Secure Escrow & Monetization',
        logoUrl: 'https://ui-avatars.com/api/?name=Scrolith&background=0D8ABC&color=fff&size=128&bold=true',
        faviconUrl: 'https://ui-avatars.com/api/?name=G&background=0D8ABC&color=fff&size=64&bold=true',
        favicon_url: 'https://ui-avatars.com/api/?name=G&background=0D8ABC&color=fff&size=64&bold=true',
        adminEmail: 'admin@Scrolith.com',
        supportEmail: 'support@Scrolith.com',
        footerAboutTitle: 'About Scrolith',
        footerAboutText: 'Connecting talent with opportunity.',
        footerCopyright: 'Ac 2024 Scrolith Inc.',
        footerLinks: [],
        socialLinks: [],
        system: {
          maintenanceMode: false,
          registrationsEnabled: true,
          kycEnforced: false,
          admin2FA: false
        }
      };
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: PlatformSettings) => {
    try {
      // If system settings provided, save via admin system endpoint
      let savedSystem: any = null;
      if ((newSettings as any).system) {
        try {
          savedSystem = await AdminService.saveSystemSettings((newSettings as any).system);
        } catch (e) {
          console.error('Failed to save system settings via AdminService', e);
          throw e;
        }
      }

      // Save platform-level settings if present (siteName, tagline, logo, etc.)
      const platformPayload: Partial<PlatformSettings> = { ...newSettings };
      // remove system before sending to platform endpoint
      delete (platformPayload as any).system;
      try {
        await AdminService.savePlatformSettings(platformPayload as PlatformSettings);
      } catch (e) {
        console.error('Failed to save platform settings via AdminService', e);
        // not fatal for system save; rethrow if nothing was saved
        if (!((newSettings as any).system)) throw e;
      }

      // Optimistically update local settings so UI reflects changes immediately.
      // If backend returned a merged system payload, prefer it to keep local state in sync.
      setSettings(prev => ({ ...(prev as any), ...(newSettings as any), ...(savedSystem ? { system: savedSystem } : {}) }));

      // Ensure canonical server state is applied client-side even if socket events are missed
      // (sometimes dev proxies or auth can prevent a live socket reconnection). Fetch
      // the latest settings from the server to guarantee everything (platform + system)
      // is in sync with the backend.
      try {
        await fetchSettings();
      } catch (e) {
        // Non-fatal: keep optimistic state if re-fetch fails
        console.warn('Re-fetch after save failed', e);
      }
    } catch (error) {
      console.error('updateSettings failed', error);
      throw error;
    }
  }, []);

  const mergeHeaderConfig = useCallback(async (header?: any) => {
    try {
      let headerConfig = header;
      if (!headerConfig) {
        headerConfig = await CMSService.getHeaderConfig();
      }
      if (!headerConfig) return;

      const headerFavicon = (headerConfig as any)?.favicon_url || (headerConfig as any)?.faviconUrl;
      const headerLogo = (headerConfig as any)?.logo_url || (headerConfig as any)?.logoUrl;
      const headerTagline = (headerConfig as any)?.tagline || (headerConfig as any)?.siteTagline || (headerConfig as any)?.taglineText;

      setSettings(prev => {
        const merged: any = { ...(prev as any) } || {};
        if (headerFavicon) {
          merged.favicon_url = headerFavicon;
          merged.faviconUrl = headerFavicon;
        }
        if (headerLogo) {
          merged.logo_url = headerLogo;
          merged.logoUrl = headerLogo;
        }
        if (headerTagline && !merged.tagline) merged.tagline = headerTagline;
        return merged as PlatformSettings;
      });
    } catch (e) {
      console.warn('Failed to merge header config into settings', e);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!socket) return;

    const handleSettingsUpdated = () => {
      fetchSettings();
    };

    socket.on('settings:updated', handleSettingsUpdated);
    socket.on('cms:header_updated', handleSettingsUpdated);
    return () => {
      socket.off('settings:updated', handleSettingsUpdated);
      socket.off('cms:header_updated', handleSettingsUpdated);
    };
  }, [socket, fetchSettings]);

  return (
    <ContentContext.Provider value={{ settings, loading, updateSettings, mergeHeaderConfig }}>
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = (): ContentContextType => {
  const context = useContext(ContentContext);
  if (context === undefined) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

