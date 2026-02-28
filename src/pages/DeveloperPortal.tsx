import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import { DeveloperPlatformService } from '../services/developerPlatform';

type LinkMethod = 'SCROLITH_LOGIN_CONFIRM' | 'EMAIL_OTP';
type LookupType = 'EMAIL' | 'USERNAME';

const sectionItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'connect', label: 'Connect Scrolith Account' },
  { id: 'apps', label: 'My Apps' },
  { id: 'logs', label: 'Logs & Analytics' },
  { id: 'docs', label: 'Docs' },
  { id: 'settings', label: 'Settings' }
];

const statusBadgeClass = (status: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'LINKED' || normalized === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'PENDING_VERIFICATION' || normalized === 'PENDING_REVIEW') return 'bg-amber-100 text-amber-700';
  if (normalized === 'SUSPENDED' || normalized === 'DISABLED') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const DeveloperPortal: React.FC = () => {
  const { showNotification } = useNotification();
  const [activeSection, setActiveSection] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
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
  const [newAppScopes, setNewAppScopes] = useState('profile:read email:read');
  const [newAppRedirectUris, setNewAppRedirectUris] = useState('https://example.com/oauth/callback');

  const isLinked = String(me?.linkStatus || '').toUpperCase() === 'LINKED';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [meData, appData] = await Promise.all([DeveloperPlatformService.getMe(), DeveloperPlatformService.getApps()]);
      setMe(meData || null);
      setApps(Array.isArray(appData) ? appData : []);
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
    setCreatingApp(true);
    try {
      const data = await DeveloperPlatformService.createApp({
        name: newAppName.trim(),
        tagline: newAppTagline.trim(),
        requestedScopes,
        redirectUris
      });
      setLastClientSecret(String(data?.clientSecret || ''));
      setNewAppName('');
      setNewAppTagline('');
      showNotification('success', 'App created', 'App client credentials generated successfully.');
      await loadDashboard();
    } catch (error: any) {
      showNotification('error', 'Create app failed', error?.message || 'Unable to create app.');
    } finally {
      setCreatingApp(false);
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

    const events = ['dev:link_status_updated', 'dev:app_updated', 'dev:log_created'];
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

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-72 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
        <h1 className="text-base font-semibold text-slate-900">Developer Platform</h1>
        <p className="mt-1 text-xs text-slate-500">developer.scrolith.com</p>
        <nav className="mt-4 space-y-1">
          {sectionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
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

        <div className="grid gap-6 xl:grid-cols-2">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Create developer app</h3>
            <p className="mt-1 text-sm text-slate-600">Apps are automatically routed through approval policy configured by admin.</p>
            <div className="mt-4 space-y-3">
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
                <span className="text-slate-600">Requested scopes (space/comma separated)</span>
                <input
                  value={newAppScopes}
                  onChange={(event) => setNewAppScopes(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
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
                disabled={creatingApp || !isLinked}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingApp ? 'Creating...' : isLinked ? 'Create App' : 'Link account first'}
              </button>
            </div>
          </div>
        </div>

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
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{app.name}</p>
                      <p className="text-xs text-slate-500">Client ID: {app.clientId}</p>
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

        {activeSection === 'logs' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">App logs {selectedAppId ? `(${selectedAppId})` : ''}</h3>
            {selectedAppLogs.length === 0 ? (
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
        ) : null}
      </section>
    </div>
  );
};

export default DeveloperPortal;
