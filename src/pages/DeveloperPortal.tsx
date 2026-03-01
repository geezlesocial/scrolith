import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { DeveloperPlatformService } from '../services/developerPlatform';
import { CommunityService } from '../services/community';
import { FileService } from '../services/files';
import { resolveAssetUrl } from '../utils/assetUrl';

type LinkMethod = 'SCROLITH_LOGIN_CONFIRM' | 'EMAIL_OTP';
type LookupType = 'EMAIL' | 'USERNAME';

const sectionItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'connect', label: 'Connect Scrolith Account' },
  { id: 'apps', label: 'My Apps' },
  { id: 'logs', label: 'Logs & Analytics' },
  { id: 'products', label: 'Products' },
  { id: 'docs', label: 'Docs' },
  { id: 'settings', label: 'Settings' }
];

const productScopeCatalog = [
  {
    scope: 'openid',
    product: 'Identity',
    description: 'OpenID authentication handshake for login and identity tokens.',
    requiresApproval: false
  },
  {
    scope: 'username',
    product: 'Identity',
    description: 'Read the connected user username.',
    requiresApproval: false
  },
  {
    scope: 'avatar',
    product: 'Identity',
    description: 'Read the connected user avatar.',
    requiresApproval: false
  },
  {
    scope: 'followers.read',
    product: 'Community',
    description: 'Read follower graphs and follower analytics.',
    requiresApproval: true
  },
  {
    scope: 'posts.read',
    product: 'Community',
    description: 'Read posts and post engagement analytics.',
    requiresApproval: true
  },
  {
    scope: 'jobs.read',
    product: 'Jobs',
    description: 'Read job listing data and status.',
    requiresApproval: true
  },
  {
    scope: 'gigs.read',
    product: 'Gigs',
    description: 'Read gig catalog data and performance.',
    requiresApproval: true
  },
  {
    scope: 'notifications.read',
    product: 'Notifications',
    description: 'Read user notification events.',
    requiresApproval: true
  }
];

const validSectionIds = new Set(sectionItems.map((item) => item.id));

const statusBadgeClass = (status: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'LINKED' || normalized === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'PENDING_VERIFICATION' || normalized === 'PENDING_REVIEW') return 'bg-amber-100 text-amber-700';
  if (normalized === 'SUSPENDED' || normalized === 'DISABLED') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const normalizePlatformUrl = (value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}`;
  } catch {
    return null;
  }
};

const normalizeHttpUrl = (value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const getSectionFromRoute = (pathname: string, search: string) => {
  const path = String(pathname || '').toLowerCase();
  if (path.endsWith('/developer/apps')) return 'apps';
  if (path.endsWith('/developer/products')) return 'products';

  const section = String(new URLSearchParams(search).get('section') || '').trim().toLowerCase();
  if (section && validSectionIds.has(section)) return section;
  return 'overview';
};

const DeveloperPortal: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [activeSection, setActiveSection] = useState(() => getSectionFromRoute(location.pathname, location.search));
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [myBusinessPages, setMyBusinessPages] = useState<any[]>([]);
  const [selectedAppLogs, setSelectedAppLogs] = useState<any[]>([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [requestingLink, setRequestingLink] = useState(false);
  const [creatingApp, setCreatingApp] = useState(false);
  const [lastClientSecret, setLastClientSecret] = useState('');

  const [lookupType, setLookupType] = useState<LookupType>('EMAIL');
  const [lookupValue, setLookupValue] = useState('');
  const [linkMethod, setLinkMethod] = useState<LinkMethod>('SCROLITH_LOGIN_CONFIRM');
  const [linkRequestId, setLinkRequestId] = useState('');
  const [linkOtp, setLinkOtp] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');

  const [newAppName, setNewAppName] = useState('');
  const [newAppTagline, setNewAppTagline] = useState('');
  const [newAppTermsUrl, setNewAppTermsUrl] = useState('');
  const [newAppPrivacyUrl, setNewAppPrivacyUrl] = useState('');
  const [newAppPlatformUrls, setNewAppPlatformUrls] = useState('https://example.com');
  const [newAppScopes, setNewAppScopes] = useState('openid username avatar');
  const [newAppRedirectUris, setNewAppRedirectUris] = useState('https://example.com/oauth/callback');
  const [newAppConnectedPageId, setNewAppConnectedPageId] = useState('');
  const [newAppLogoFileId, setNewAppLogoFileId] = useState('');
  const [newAppLogoUrl, setNewAppLogoUrl] = useState('');
  const [newAppLogoName, setNewAppLogoName] = useState('');
  const [docsConfig, setDocsConfig] = useState<any>(null);
  const [uploadingAppLogo, setUploadingAppLogo] = useState(false);
  const appLogoInputRef = useRef<HTMLInputElement | null>(null);

  const isLinked = String(me?.linkStatus || '').toUpperCase() === 'LINKED';

  useEffect(() => {
    setActiveSection(getSectionFromRoute(location.pathname, location.search));
  }, [location.pathname, location.search]);

  const openSection = useCallback(
    (sectionId: string) => {
      const normalized = String(sectionId || '').trim().toLowerCase();
      if (!validSectionIds.has(normalized)) return;
      if (normalized === 'products') {
        navigate('/developer/products');
        return;
      }
      if (normalized === 'apps' && String(location.pathname || '').toLowerCase().endsWith('/developer/apps')) {
        setActiveSection('apps');
        return;
      }

      const params = new URLSearchParams(location.search);
      if (normalized === 'overview') params.delete('section');
      else params.set('section', normalized);
      navigate({
        pathname: normalized === 'apps' ? '/developer/apps' : '/developer',
        search: params.toString() ? `?${params.toString()}` : ''
      });
    },
    [location.pathname, location.search, navigate]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [meData, appData, docsData, pagesData] = await Promise.all([
        DeveloperPlatformService.getMe(),
        DeveloperPlatformService.getApps(),
        DeveloperPlatformService.getDocs().catch(() => null),
        CommunityService.getMyBusinessPages().catch(() => [])
      ]);
      setMe(meData || null);
      setApps(Array.isArray(appData) ? appData : []);
      setDocsConfig(docsData || null);
      setMyBusinessPages(Array.isArray(pagesData) ? pagesData : []);
    } catch (error: any) {
      showNotification('error', 'Developer Portal', error?.message || 'Failed to load developer dashboard.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const requestedScopes = useMemo(
    () =>
      Array.from(
        new Set(
          String(newAppScopes || '')
            .split(/[\s,]+/g)
            .map((scope) => scope.trim())
            .filter(Boolean)
        )
      ),
    [newAppScopes]
  );

  const connectedPage = useMemo(() => {
    if (!newAppConnectedPageId) return null;
    return myBusinessPages.find((page) => String(page?.id || '') === String(newAppConnectedPageId || '')) || null;
  }, [myBusinessPages, newAppConnectedPageId]);

  const connectedPageSlug = useMemo(
    () => String(connectedPage?.slug || connectedPage?.handle || connectedPage?.id || '').trim(),
    [connectedPage]
  );

  const connectedPageUrl = useMemo(
    () => (connectedPageSlug ? `https://scrolith.com/company/${encodeURIComponent(connectedPageSlug)}` : ''),
    [connectedPageSlug]
  );

  const requestedScopeSet = useMemo(() => new Set(requestedScopes), [requestedScopes]);

  const platformUrls = useMemo(
    () =>
      Array.from(
        new Set(
          String(newAppPlatformUrls || '')
            .split(/\r?\n|,/g)
            .map((entry) => normalizePlatformUrl(entry))
            .filter(Boolean) as string[]
        )
      ),
    [newAppPlatformUrls]
  );

  const redirectUris = useMemo(
    () =>
      Array.from(
        new Set(
          String(newAppRedirectUris || '')
            .split(/\r?\n|,/g)
            .map((uri) => uri.trim())
            .filter(Boolean)
        )
      ),
    [newAppRedirectUris]
  );

  const docsPages = useMemo(
    () => (Array.isArray(docsConfig?.pages) ? docsConfig.pages.filter((page: any) => page?.isPublished !== false) : []),
    [docsConfig?.pages]
  );

  const setScopeState = useCallback((scope: string, enabled: boolean) => {
    const targetScope = String(scope || '').trim();
    if (!targetScope) return;
    setNewAppScopes((prev) => {
      const set = new Set(
        String(prev || '')
          .split(/[\s,]+/g)
          .map((entry) => entry.trim())
          .filter(Boolean)
      );
      if (enabled) set.add(targetScope);
      else set.delete(targetScope);
      return Array.from(set).join(' ');
    });
  }, []);

  const handleLinkRequest = async () => {
    if (!lookupValue.trim()) {
      showNotification('error', 'Link account', 'Provide a Scrolith email or username.');
      return;
    }
    setRequestingLink(true);
    try {
      const data = await DeveloperPlatformService.requestLink({
        lookupType,
        lookupValue: lookupValue.trim(),
        verificationMethod: linkMethod
      });
      setLinkRequestId(String(data?.linkRequestId || ''));
      setDevOtpHint(String(data?._devOnlyOtp || ''));
      showNotification('success', 'Link request created', 'Verification is now required before API access.');
      await loadDashboard();
    } catch (error: any) {
      showNotification('error', 'Link request failed', error?.message || 'Unable to create link request.');
    } finally {
      setRequestingLink(false);
    }
  };

  const handleConfirmLink = async () => {
    if (!linkRequestId.trim()) {
      showNotification('error', 'Confirm link', 'No pending link request id found.');
      return;
    }
    setRequestingLink(true);
    try {
      if (linkMethod === 'EMAIL_OTP') {
        if (!linkOtp.trim()) {
          showNotification('error', 'Verify OTP', 'Enter the OTP code.');
          return;
        }
        await DeveloperPlatformService.verifyOtp({
          linkRequestId: linkRequestId.trim(),
          otp: linkOtp.trim()
        });
      } else {
        await DeveloperPlatformService.confirmScrolithLogin({
          linkRequestId: linkRequestId.trim()
        });
      }
      showNotification('success', 'Scrolith account linked', 'Developer capabilities are now enabled.');
      setLinkOtp('');
      await loadDashboard();
    } catch (error: any) {
      showNotification('error', 'Link verification failed', error?.message || 'Unable to verify link.');
    } finally {
      setRequestingLink(false);
    }
  };

  const handleCreateApp = async () => {
    if (!isLinked) {
      showNotification('error', 'Developer app', 'Connect your Scrolith account before creating apps.');
      return;
    }
    if (!newAppName.trim()) {
      showNotification('error', 'Developer app', 'App name is required.');
      return;
    }
    if (String(newAppPlatformUrls || '').trim() && platformUrls.length === 0) {
      showNotification(
        'error',
        'Developer app',
        'Provide a valid app/platform URL (example: https://example.com or example.com).'
      );
      return;
    }

    const termsUrl = normalizeHttpUrl(newAppTermsUrl);
    if (String(newAppTermsUrl || '').trim() && !termsUrl) {
      showNotification('error', 'Developer app', 'Provide a valid App/platform Terms URL.');
      return;
    }

    const privacyUrl = normalizeHttpUrl(newAppPrivacyUrl);
    if (String(newAppPrivacyUrl || '').trim() && !privacyUrl) {
      showNotification('error', 'Developer app', 'Provide a valid App/platform Privacy URL.');
      return;
    }

    const pagePlatformOrigin = connectedPageUrl ? normalizePlatformUrl(connectedPageUrl) : null;
    const effectivePlatformUrls = Array.from(
      new Set([...(platformUrls || []), ...(pagePlatformOrigin ? [pagePlatformOrigin] : [])].filter(Boolean))
    );

    setCreatingApp(true);
    try {
      const data = await DeveloperPlatformService.createApp({
        name: newAppName.trim(),
        tagline: newAppTagline.trim(),
        platformUrls: effectivePlatformUrls,
        appUrl: connectedPageUrl || undefined,
        connectedPageId: connectedPage ? connectedPage.id : undefined,
        connectedPageSlug: connectedPageSlug || undefined,
        termsUrl: termsUrl || undefined,
        privacyUrl: privacyUrl || undefined,
        logoFileId: newAppLogoFileId || undefined,
        requestedScopes,
        redirectUris
      });
      setLastClientSecret(String(data?.clientSecret || ''));
      setNewAppName('');
      setNewAppTagline('');
      setNewAppTermsUrl('');
      setNewAppPrivacyUrl('');
      setNewAppPlatformUrls('https://example.com');
      setNewAppScopes('openid username avatar');
      setNewAppConnectedPageId('');
      setNewAppLogoFileId('');
      setNewAppLogoUrl('');
      setNewAppLogoName('');
      showNotification('success', 'App created', 'App client credentials generated successfully.');
      await loadDashboard();
    } catch (error: any) {
      showNotification('error', 'Create app failed', error?.message || 'Unable to create app.');
    } finally {
      setCreatingApp(false);
    }
  };

  const handleChooseAppLogo = () => {
    appLogoInputRef.current?.click();
  };

  const handleUploadAppLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      showNotification('error', 'App logo', 'Only image files are supported.');
      return;
    }

    setUploadingAppLogo(true);
    try {
      const uploaded = await FileService.uploadFile(file, 'portfolio', { visibility: 'public' });
      setNewAppLogoFileId(String(uploaded.id || uploaded.fileId || '').trim());
      setNewAppLogoUrl(String(uploaded.url || '').trim());
      setNewAppLogoName(String(uploaded.name || file.name || 'App logo').trim());
      showNotification('success', 'App logo uploaded', 'Logo is attached to this app draft.');
    } catch (error: any) {
      showNotification('error', 'Upload failed', error?.message || 'Unable to upload app logo.');
    } finally {
      setUploadingAppLogo(false);
    }
  };

  const loadLogs = useCallback(async (appId: string) => {
    setSelectedAppId(appId);
    try {
      const logs = await DeveloperPlatformService.getAppLogs(appId);
      setSelectedAppLogs(Array.isArray(logs) ? logs : []);
      setActiveSection('logs');
    } catch (error: any) {
      showNotification('error', 'App logs', error?.message || 'Unable to load app logs.');
    }
  }, [showNotification]);

  useEffect(() => {
    const refresh = () => {
      void loadDashboard();
      if (selectedAppId) {
        void loadLogs(selectedAppId);
      }
    };

    const events = ['dev:link_status_updated', 'dev:app_updated', 'dev:log_created', 'dev:docs_updated'];
    events.forEach((eventName) => window.addEventListener(eventName, refresh as EventListener));
    const intervalId = window.setInterval(refresh, 45_000);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, refresh as EventListener));
      window.clearInterval(intervalId);
    };
  }, [loadDashboard, loadLogs, selectedAppId]);

  const handleRotateSecret = async (appId: string) => {
    try {
      const data = await DeveloperPlatformService.rotateSecret(appId);
      setLastClientSecret(String(data?.clientSecret || ''));
      showNotification('success', 'Client secret rotated', 'Old client secret was invalidated.');
      await loadDashboard();
    } catch (error: any) {
      showNotification('error', 'Rotate secret failed', error?.message || 'Unable to rotate app secret.');
    }
  };

  const handleAppToggle = async (app: any) => {
    try {
      const status = String(app?.status || '').toUpperCase();
      if (status === 'DISABLED') await DeveloperPlatformService.enableApp(app.id);
      else await DeveloperPlatformService.disableApp(app.id);
      showNotification('success', 'App updated', `App ${status === 'DISABLED' ? 'enabled' : 'disabled'} successfully.`);
      await loadDashboard();
    } catch (error: any) {
      showNotification('error', 'App update failed', error?.message || 'Unable to update app status.');
    }
  };

  const connectPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Connect your Scrolith account</h3>
      <p className="mt-1 text-sm text-slate-600">
        Link is mandatory before creating apps, rotating secrets, or accessing logs.
      </p>
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Lookup type</span>
            <select
              value={lookupType}
              onChange={(event) => setLookupType(event.target.value as LookupType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="EMAIL">Email</option>
              <option value="USERNAME">Username</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">Verification method</span>
            <select
              value={linkMethod}
              onChange={(event) => setLinkMethod(event.target.value as LinkMethod)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="SCROLITH_LOGIN_CONFIRM">Confirm by Scrolith login</option>
              <option value="EMAIL_OTP">Email OTP (fallback)</option>
            </select>
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">{lookupType === 'EMAIL' ? 'Scrolith email' : 'Scrolith username'}</span>
          <input
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={lookupType === 'EMAIL' ? 'name@example.com' : 'username'}
          />
        </label>
        <button
          type="button"
          disabled={requestingLink}
          onClick={handleLinkRequest}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {requestingLink ? 'Requesting...' : 'Request Link'}
        </button>
        {linkRequestId ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">Pending link request</p>
            <p className="mt-1 break-all text-xs text-slate-600">{linkRequestId}</p>
            {linkMethod === 'EMAIL_OTP' ? (
              <div className="mt-3 space-y-2">
                <input
                  value={linkOtp}
                  onChange={(event) => setLinkOtp(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Enter OTP"
                />
                {devOtpHint ? <p className="text-xs text-amber-700">Dev OTP: {devOtpHint}</p> : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleConfirmLink}
              disabled={requestingLink}
              className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {requestingLink ? 'Verifying...' : 'Finalize Link'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  const createAppPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Create developer app</h3>
      <p className="mt-1 text-sm text-slate-600">Apps are automatically routed through approval policy configured by admin.</p>
      <div className="mt-4 space-y-3">
        <label className="space-y-2 text-sm">
          <span className="text-slate-600">App logo</span>
          <div className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              {newAppLogoUrl ? (
                <img src={newAppLogoUrl} alt="App logo preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-slate-400">No logo</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                ref={appLogoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadAppLogo}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleChooseAppLogo}
                  disabled={uploadingAppLogo}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  {uploadingAppLogo ? 'Uploading...' : newAppLogoFileId ? 'Change Logo' : 'Upload Logo'}
                </button>
                {newAppLogoFileId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNewAppLogoFileId('');
                      setNewAppLogoUrl('');
                      setNewAppLogoName('');
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="truncate text-xs text-slate-500">{newAppLogoName || 'PNG/JPG/WebP recommended'}</p>
            </div>
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">App name</span>
          <input
            value={newAppName}
            onChange={(event) => setNewAppName(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Scrolith Productivity App"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Tagline</span>
          <input
            value={newAppTagline}
            onChange={(event) => setNewAppTagline(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Automate creator workflows"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">App/platform Terms URL</span>
          <input
            value={newAppTermsUrl}
            onChange={(event) => setNewAppTermsUrl(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="https://example.com/terms"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">App/platform Privacy URL</span>
          <input
            value={newAppPrivacyUrl}
            onChange={(event) => setNewAppPrivacyUrl(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="https://example.com/privacy"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">App/platform URLs (comma or newline separated)</span>
          <textarea
            value={newAppPlatformUrls}
            onChange={(event) => setNewAppPlatformUrls(event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={'https://example.com\nhttps://www.example.com\nexample.com'}
          />
          <p className="text-xs text-slate-500">
            Add trusted platform origins. Subdomains are supported and normalized automatically.
          </p>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Connect Scrolith Page (optional)</span>
          <select
            value={newAppConnectedPageId}
            onChange={(event) => setNewAppConnectedPageId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">No connected page</option>
            {myBusinessPages.map((page: any) => (
              <option key={String(page?.id || '')} value={String(page?.id || '')}>
                {String(page?.name || 'Untitled Page')} ({String(page?.slug || page?.handle || page?.id || '').trim()})
              </option>
            ))}
          </select>
          {connectedPageUrl ? (
            <p className="text-xs text-slate-500">
              Connected page URL: <span className="font-medium text-slate-700">{connectedPageUrl}</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">Connect one of your existing Scrolith pages to scope this app to your page brand.</p>
          )}
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Developer Products & Scopes</p>
            <button
              type="button"
              onClick={() => openSection('products')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              View Products
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {productScopeCatalog.map((entry) => {
              const enabled = requestedScopeSet.has(entry.scope);
              return (
                <label key={entry.scope} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setScopeState(entry.scope, event.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800">{entry.scope}</span>{' '}
                    <span className="text-slate-500">({entry.product})</span>
                    <span className="mt-0.5 block text-slate-500">{entry.description}</span>
                    {entry.requiresApproval ? (
                      <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Admin approval required
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Requested scopes (space/comma separated)</span>
          <input
            value={newAppScopes}
            onChange={(event) => setNewAppScopes(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            Advanced scopes are routed through admin approval policy before activation.
          </p>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Redirect URIs (comma or newline separated)</span>
          <textarea
            value={newAppRedirectUris}
            onChange={(event) => setNewAppRedirectUris(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleCreateApp}
          disabled={creatingApp || uploadingAppLogo || !isLinked}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creatingApp ? 'Creating...' : isLinked ? 'Create App' : 'Link account first'}
        </button>
      </div>
    </div>
  );

  const myAppsPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">My apps</h3>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>
      {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : null}
      {!loading && apps.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No apps yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {apps.map((app) => (
            <div key={app.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      {app?.logoFileId ? (
                        <img
                          src={resolveAssetUrl(`/api/files/content/${encodeURIComponent(String(app.logoFileId))}`)}
                          alt={`${String(app?.name || 'App')} logo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-500">
                          {String(app?.name || 'A').trim().slice(0, 1).toUpperCase() || 'A'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{app.name}</p>
                      <p className="truncate text-xs text-slate-500">Client ID: {app.clientId}</p>
                    </div>
                  </div>
                  {app?.appUrl ? (
                    <p className="mt-1 truncate text-xs text-slate-500">Connected URL: {String(app.appUrl)}</p>
                  ) : null}
                  {app?.termsUrl ? <p className="mt-1 truncate text-xs text-slate-500">Terms: {String(app.termsUrl)}</p> : null}
                  {app?.privacyUrl ? <p className="mt-1 truncate text-xs text-slate-500">Privacy: {String(app.privacyUrl)}</p> : null}
                  {Array.isArray(app.platformUrls) && app.platformUrls.length ? (
                    <p className="mt-1 truncate text-xs text-slate-500">Platform URLs: {app.platformUrls.join(', ')}</p>
                  ) : null}
                  {Array.isArray(app.requestedScopes) && app.requestedScopes.length ? (
                    <p className="mt-1 truncate text-xs text-slate-500">Scopes: {app.requestedScopes.join(', ')}</p>
                  ) : null}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(String(app.status || ''))}`}>
                  {app.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleRotateSecret(app.id)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Rotate Secret
                </button>
                <button
                  type="button"
                  onClick={() => void handleAppToggle(app)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {String(app.status || '').toUpperCase() === 'DISABLED' ? 'Enable' : 'Disable'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadLogs(app.id)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  View Logs
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const logsPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Logs & Analytics</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          App:
          <select
            value={selectedAppId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedAppId(nextId);
              if (nextId) void loadLogs(nextId);
              else setSelectedAppLogs([]);
            }}
            className="rounded-lg border border-slate-300 px-2 py-1"
          >
            <option value="">Select app</option>
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!selectedAppId ? (
        <p className="mt-3 text-sm text-slate-500">Select an app to view audit logs.</p>
      ) : selectedAppLogs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No logs found for this app.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {selectedAppLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              <p className="font-semibold text-slate-800">{log.action}</p>
              <p className="text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
              {log.status ? <p className="text-slate-600">Status: {log.status}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-72 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
        <h1 className="text-base font-semibold text-slate-900">Developer Platform</h1>
        <p className="mt-1 text-xs text-slate-500">scrolith.com/developer</p>
        <nav className="mt-4 space-y-1">
          {sectionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openSection(item.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                activeSection === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 flex-1 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Scrolith Developer Dashboard</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(String(me?.linkStatus || 'UNLINKED'))}`}>
              {String(me?.linkStatus || 'UNLINKED')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Developer APIs and app management are blocked until your Scrolith account is linked and verified.
          </p>
          {lastClientSecret ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">Copy this client secret now. It is shown only once.</p>
              <code className="mt-2 block overflow-x-auto rounded bg-white px-2 py-1 text-xs text-slate-700">{lastClientSecret}</code>
            </div>
          ) : null}
        </div>
        {activeSection === 'overview' ? (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              {connectPanel}
              {createAppPanel}
            </div>
            {myAppsPanel}
          </>
        ) : null}

        {activeSection === 'connect' ? connectPanel : null}

        {activeSection === 'apps' ? (
          <>
            {createAppPanel}
            {myAppsPanel}
          </>
        ) : null}

        {activeSection === 'logs' ? logsPanel : null}

        {activeSection === 'products' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Developer Products</h3>
            <p className="mt-1 text-sm text-slate-600">
              Select product scopes for your app. Advanced scopes are routed through admin approval policy before activation.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {productScopeCatalog.map((entry) => {
                const enabled = requestedScopeSet.has(entry.scope);
                return (
                  <div key={entry.scope} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.scope}</p>
                        <p className="text-xs text-slate-500">{entry.product}</p>
                      </div>
                      {entry.requiresApproval ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Approval
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Standard
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{entry.description}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-xs font-medium ${enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {enabled ? 'Added to request' : 'Not requested'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setScopeState(entry.scope, !enabled)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {enabled ? 'Remove' : 'Request Scope'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openSection('apps')}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Continue to Create App
              </button>
              <a
                href="/developer/docs?page=products"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Read Products Docs
              </a>
            </div>
          </div>
        ) : null}

        {activeSection === 'docs' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">{String(docsConfig?.landingTitle || 'Developer Docs')}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {String(docsConfig?.landingSubtitle || 'Reference documentation, OAuth flows, and API usage guides.')}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a
                href={String(docsConfig?.portalHomeUrl || '/developer')}
                className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <p className="font-semibold text-slate-900">Developer Portal Home</p>
                <p className="mt-1 text-xs text-slate-500">Open the primary developer dashboard.</p>
              </a>
              <a
                href={String(docsConfig?.docsHomeUrl || '/developer/docs')}
                className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <p className="font-semibold text-slate-900">Embedded Docs</p>
                <p className="mt-1 text-xs text-slate-500">Read docs directly inside Scrolith.</p>
              </a>
              <a
                href="/developer/products"
                className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <p className="font-semibold text-slate-900">Products & Scopes</p>
                <p className="mt-1 text-xs text-slate-500">Browse scope products and approval requirements.</p>
              </a>
            </div>
            {docsPages.length ? (
              <div className="mt-4 space-y-2">
                {docsPages.slice(0, 6).map((page: any) => (
                  <a
                    key={String(page.id)}
                    href={`/developer/docs?page=${encodeURIComponent(String(page.slug || page.id || ''))}`}
                    className="block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <p className="font-medium text-slate-900">{String(page.title || 'Untitled')}</p>
                    {page.summary ? <p className="mt-0.5 text-xs text-slate-500">{String(page.summary)}</p> : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeSection === 'settings' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Developer Settings</h3>
            <p className="mt-1 text-sm text-slate-600">Identity and connection status snapshot for your developer profile.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Link status</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">{String(me?.linkStatus || 'UNLINKED')}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Linked user id</dt>
                <dd className="mt-1 break-all text-sm text-slate-700">{String(me?.userId || 'Not linked')}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Developer email</dt>
                <dd className="mt-1 break-all text-sm text-slate-700">{String(me?.developerEmail || 'Unavailable')}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Last synced</dt>
                <dd className="mt-1 text-sm text-slate-700">
                  {me?.lastSyncedAt ? new Date(me.lastSyncedAt).toLocaleString() : 'Not synced yet'}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default DeveloperPortal;
