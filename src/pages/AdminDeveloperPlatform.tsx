import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import { DeveloperPlatformService } from '../services/developerPlatform';

const statusBadgeClass = (status: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'LINKED') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'PENDING_REVIEW' || normalized === 'PENDING_VERIFICATION') return 'bg-amber-100 text-amber-700';
  if (normalized === 'SUSPENDED' || normalized === 'DISABLED' || normalized === 'REJECTED') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const AdminDeveloperPlatform: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [docsSaving, setDocsSaving] = useState(false);
  const [pageSavingId, setPageSavingId] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [docsConfig, setDocsConfig] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [developers, setDevelopers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  const sensitiveScopesText = useMemo(
    () => (Array.isArray(config?.sensitiveScopes) ? config.sensitiveScopes.join(', ') : ''),
    [config?.sensitiveScopes]
  );

  const docsPages = useMemo(
    () => (Array.isArray(docsConfig?.pages) ? docsConfig.pages : []),
    [docsConfig?.pages]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, appRows, devRows] = await Promise.all([
        DeveloperPlatformService.getAdminConfig(),
        DeveloperPlatformService.getAdminApps(statusFilter || undefined),
        DeveloperPlatformService.getAdminDevelopers()
      ]);
      const docs = await DeveloperPlatformService.getAdminDocs().catch(() => null);
      setConfig(cfg || null);
      setApps(Array.isArray(appRows) ? appRows : []);
      setDevelopers(Array.isArray(devRows) ? devRows : []);
      setDocsConfig(docs || null);
    } catch (error: any) {
      showNotification('error', 'Developer Platform', error?.message || 'Failed to load admin developer platform.');
    } finally {
      setLoading(false);
    }
  }, [showNotification, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const refresh = () => {
      void loadData();
    };

    const events = ['dev:config_updated', 'dev:app_updated', 'dev:link_status_updated', 'dev:log_created', 'dev:docs_updated'];
    events.forEach((eventName) => window.addEventListener(eventName, refresh as EventListener));
    const intervalId = window.setInterval(refresh, 45_000);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, refresh as EventListener));
      window.clearInterval(intervalId);
    };
  }, [loadData]);

  const saveConfig = async () => {
    if (!config) return;
    setConfigSaving(true);
    try {
      await DeveloperPlatformService.updateAdminConfig({
        developerBaseUrl: String(config.developerBaseUrl || '').trim(),
        autoApproveEnabled: Boolean(config.autoApproveEnabled),
        authorizationCodeTtlSeconds: Number(config.authorizationCodeTtlSeconds || 300),
        accessTokenTtlSeconds: Number(config.accessTokenTtlSeconds || 3600),
        refreshTokenTtlSeconds: Number(config.refreshTokenTtlSeconds || 2592000),
        rateLimitPerMinute: Number(config.rateLimitPerMinute || 120),
        requireManualApprovalForSensitiveScope: Boolean(config.requireManualApprovalForSensitiveScope),
        sensitiveScopes: String(sensitiveScopesText || '')
          .split(/[,\n]/g)
          .map((scope) => scope.trim())
          .filter(Boolean)
      });
      showNotification('success', 'Developer Platform', 'Developer platform configuration updated.');
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Developer Platform', error?.message || 'Failed to update developer configuration.');
    } finally {
      setConfigSaving(false);
    }
  };

  const updateAppStatus = async (appId: string, action: 'approve' | 'reject' | 'disable') => {
    try {
      if (action === 'approve') await DeveloperPlatformService.approveAdminApp(appId);
      if (action === 'reject') await DeveloperPlatformService.rejectAdminApp(appId);
      if (action === 'disable') await DeveloperPlatformService.disableAdminApp(appId);
      showNotification('success', 'App moderation', `App ${action} action completed.`);
      await loadData();
    } catch (error: any) {
      showNotification('error', 'App moderation', error?.message || 'Failed to update app status.');
    }
  };

  const updateDeveloperStatus = async (developerId: string, action: 'suspend' | 'unsuspend') => {
    try {
      if (action === 'suspend') await DeveloperPlatformService.suspendDeveloper(developerId);
      if (action === 'unsuspend') await DeveloperPlatformService.unsuspendDeveloper(developerId);
      showNotification('success', 'Developer moderation', `Developer ${action} action completed.`);
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Developer moderation', error?.message || 'Failed to update developer status.');
    }
  };

  const updateLocalDocPage = (pageId: string, field: string, value: any) => {
    setDocsConfig((prev: any) => {
      const pages = Array.isArray(prev?.pages) ? prev.pages : [];
      return {
        ...(prev || {}),
        pages: pages.map((page: any) => (String(page?.id) === pageId ? { ...page, [field]: value } : page))
      };
    });
  };

  const saveDocsConfig = async () => {
    if (!docsConfig) return;
    setDocsSaving(true);
    try {
      const payload = {
        portalHomeUrl: String(docsConfig?.portalHomeUrl || '/developer'),
        docsHomeUrl: String(docsConfig?.docsHomeUrl || '/developer/docs'),
        landingTitle: String(docsConfig?.landingTitle || '').trim(),
        landingSubtitle: String(docsConfig?.landingSubtitle || '').trim(),
        pages: docsPages
      };
      const saved = await DeveloperPlatformService.updateAdminDocs(payload);
      setDocsConfig(saved || payload);
      showNotification('success', 'Developer Docs', 'Developer docs configuration updated.');
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Developer Docs', error?.message || 'Failed to update developer docs.');
    } finally {
      setDocsSaving(false);
    }
  };

  const addDocsPage = async () => {
    setDocsSaving(true);
    try {
      await DeveloperPlatformService.createAdminDocPage({
        title: 'New Page',
        summary: 'Add a short summary.',
        content: 'Write your documentation content here.',
        isPublished: true
      });
      showNotification('success', 'Developer Docs', 'Documentation page created.');
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Developer Docs', error?.message || 'Failed to create docs page.');
    } finally {
      setDocsSaving(false);
    }
  };

  const saveDocPage = async (pageId: string) => {
    const page = docsPages.find((entry: any) => String(entry?.id) === pageId);
    if (!page) return;
    setPageSavingId(pageId);
    try {
      await DeveloperPlatformService.updateAdminDocPage(pageId, {
        title: page.title,
        slug: page.slug,
        summary: page.summary,
        content: page.content,
        order: Number(page.order || 0),
        isPublished: Boolean(page.isPublished)
      });
      showNotification('success', 'Developer Docs', 'Documentation page updated.');
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Developer Docs', error?.message || 'Failed to update docs page.');
    } finally {
      setPageSavingId('');
    }
  };

  const deleteDocPage = async (pageId: string) => {
    setPageSavingId(pageId);
    try {
      await DeveloperPlatformService.deleteAdminDocPage(pageId);
      showNotification('success', 'Developer Docs', 'Documentation page deleted.');
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Developer Docs', error?.message || 'Failed to delete docs page.');
    } finally {
      setPageSavingId('');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Admin Developer Platform</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enterprise controls for developer base URL, auto-approval policy, app moderation, and developer link status.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Platform Config</h2>
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={configSaving || !config}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {configSaving ? 'Saving...' : 'Save Config'}
          </button>
        </div>
        {loading || !config ? (
          <p className="mt-3 text-sm text-slate-500">Loading configuration...</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Developer Base URL</span>
              <input
                value={config.developerBaseUrl || ''}
                onChange={(event) => setConfig((prev: any) => ({ ...prev, developerBaseUrl: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Rate limit (per minute)</span>
              <input
                type="number"
                value={Number(config.rateLimitPerMinute || 120)}
                onChange={(event) => setConfig((prev: any) => ({ ...prev, rateLimitPerMinute: Number(event.target.value || 120) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Access token TTL (seconds)</span>
              <input
                type="number"
                value={Number(config.accessTokenTtlSeconds || 3600)}
                onChange={(event) => setConfig((prev: any) => ({ ...prev, accessTokenTtlSeconds: Number(event.target.value || 3600) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Refresh token TTL (seconds)</span>
              <input
                type="number"
                value={Number(config.refreshTokenTtlSeconds || 2592000)}
                onChange={(event) => setConfig((prev: any) => ({ ...prev, refreshTokenTtlSeconds: Number(event.target.value || 2592000) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600">Sensitive scopes (comma separated)</span>
              <input
                value={sensitiveScopesText}
                onChange={(event) =>
                  setConfig((prev: any) => ({
                    ...prev,
                    sensitiveScopes: event.target.value
                      .split(/[,\n]/g)
                      .map((scope) => scope.trim())
                      .filter(Boolean)
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(config.autoApproveEnabled)}
                onChange={(event) => setConfig((prev: any) => ({ ...prev, autoApproveEnabled: event.target.checked }))}
              />
              Auto-approve eligible apps
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(config.requireManualApprovalForSensitiveScope)}
                onChange={(event) =>
                  setConfig((prev: any) => ({ ...prev, requireManualApprovalForSensitiveScope: event.target.checked }))
                }
              />
              Sensitive scopes require manual approval
            </label>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Developer Apps</h2>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PENDING_REVIEW">Pending review</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">App</th>
                <th className="px-2 py-2">Owner</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <p className="font-medium text-slate-900">{app.name}</p>
                    <p className="text-xs text-slate-500">{app.clientId}</p>
                    {Array.isArray(app.platformUrls) && app.platformUrls.length ? (
                      <p className="mt-1 text-xs text-slate-500">Platform URLs: {app.platformUrls.join(', ')}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {app.ownerUser?.name || app.ownerUser?.username || app.ownerUser?.email || '-'}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(app.status)}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void updateAppStatus(app.id, 'approve')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateAppStatus(app.id, 'reject')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateAppStatus(app.id, 'disable')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Disable
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!apps.length ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-sm text-slate-500">
                    No developer apps found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Developers</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Developer</th>
                <th className="px-2 py-2">Scrolith User</th>
                <th className="px-2 py-2">Link Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {developers.map((developer) => (
                <tr key={developer.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <p className="font-medium text-slate-900">{developer.developerEmail}</p>
                    <p className="text-xs text-slate-500">{developer.developerUsername || '-'}</p>
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {developer.user?.name || developer.user?.username || developer.user?.email || 'Not linked'}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(developer.linkStatus)}`}>
                      {developer.linkStatus}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void updateDeveloperStatus(developer.id, 'suspend')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Suspend
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateDeveloperStatus(developer.id, 'unsuspend')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Unsuspend
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!developers.length ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-sm text-slate-500">
                    No developer profiles found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Developer Pages & Docs CMS</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void addDocsPage()}
              disabled={docsSaving}
              className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              Add Page
            </button>
            <button
              type="button"
              onClick={() => void saveDocsConfig()}
              disabled={docsSaving || !docsConfig}
              className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {docsSaving ? 'Saving...' : 'Save Docs Config'}
            </button>
          </div>
        </div>

        {loading && !docsConfig ? (
          <p className="mt-4 text-sm text-slate-500">Loading docs configuration...</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Developer portal URL path</span>
                <input
                  value={String(docsConfig?.portalHomeUrl || '/developer')}
                  onChange={(event) =>
                    setDocsConfig((prev: any) => ({ ...(prev || {}), portalHomeUrl: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Docs URL path</span>
                <input
                  value={String(docsConfig?.docsHomeUrl || '/developer/docs')}
                  onChange={(event) =>
                    setDocsConfig((prev: any) => ({ ...(prev || {}), docsHomeUrl: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Landing title</span>
                <input
                  value={String(docsConfig?.landingTitle || '')}
                  onChange={(event) =>
                    setDocsConfig((prev: any) => ({ ...(prev || {}), landingTitle: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-600">Landing subtitle</span>
                <input
                  value={String(docsConfig?.landingSubtitle || '')}
                  onChange={(event) =>
                    setDocsConfig((prev: any) => ({ ...(prev || {}), landingSubtitle: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-5 space-y-4">
              {docsPages.map((page: any) => (
                <div key={String(page.id)} className="rounded-xl border border-slate-200 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-600">Page title</span>
                      <input
                        value={String(page.title || '')}
                        onChange={(event) => updateLocalDocPage(String(page.id), 'title', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-600">Slug</span>
                      <input
                        value={String(page.slug || '')}
                        onChange={(event) => updateLocalDocPage(String(page.id), 'slug', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-600">Summary</span>
                      <input
                        value={String(page.summary || '')}
                        onChange={(event) => updateLocalDocPage(String(page.id), 'summary', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-600">Order</span>
                      <input
                        type="number"
                        value={Number(page.order || 0)}
                        onChange={(event) => updateLocalDocPage(String(page.id), 'order', Number(event.target.value || 0))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </div>

                  <label className="mt-3 block space-y-1 text-sm">
                    <span className="text-slate-600">Content</span>
                    <textarea
                      rows={8}
                      value={String(page.content || '')}
                      onChange={(event) => updateLocalDocPage(String(page.id), 'content', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(page.isPublished)}
                        onChange={(event) => updateLocalDocPage(String(page.id), 'isPublished', event.target.checked)}
                      />
                      Published
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveDocPage(String(page.id))}
                        disabled={pageSavingId === String(page.id)}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        {pageSavingId === String(page.id) ? 'Saving...' : 'Save Page'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteDocPage(String(page.id))}
                        disabled={pageSavingId === String(page.id)}
                        className="rounded border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!docsPages.length ? <p className="text-sm text-slate-500">No documentation pages yet.</p> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default AdminDeveloperPlatform;
