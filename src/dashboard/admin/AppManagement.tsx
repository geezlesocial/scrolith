import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Download,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Monitor,
  Trash2,
  X
} from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const defaultConfig = {
  enabled: true,
  autoHideSeconds: 8,
  maxShowsPerDay: 2,
  cooldownHours: 2,
  branding: {
    title: 'Install Scrolith App',
    subtitle: 'Get a faster app experience built for your device.',
    logoUrl: 'https://scrolith.com/icon-192.png',
    iconUrl: 'https://scrolith.com/icon-192.png'
  },
  android: {
    enabled: true,
    title: 'Try the Scrolith Android App',
    message: 'Download the latest APK test build before Google Play release.',
    ctaLabel: 'Download APK',
    secondaryCtaLabel: 'I Installed',
    downloadUrl: '',
    version: 'beta',
    iconUrl: 'https://scrolith.com/icon-192.png'
  },
  desktop: {
    enabled: true,
    title: 'Get the Scrolith Desktop App',
    message: 'Install the desktop build with your latest logo/icon branding.',
    ctaLabel: 'Download Desktop App',
    secondaryCtaLabel: 'I Installed',
    downloadUrl:
      'https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe',
    version: 'beta',
    iconUrl: 'https://scrolith.com/icon-192.png'
  }
};

const getValueByPath = (obj: Record<string, any>, path: string) => {
  return path.split('.').reduce((acc: any, key) => (acc ? acc[key] : undefined), obj);
};

const setValueByPath = (obj: Record<string, any>, path: string, value: any) => {
  const keys = path.split('.');
  const out: Record<string, any> = { ...obj };
  let cursor: Record<string, any> = out;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    cursor[key] = { ...(cursor[key] || {}) };
    cursor = cursor[key];
  });
  return out;
};

const initialCampaignForm = {
  name: '',
  title: '',
  body: '',
  mediaType: 'none',
  mediaUrl: '',
  actionUrl: '',
  targetPlatform: 'all',
  targetRole: 'all',
  deliveryInApp: true,
  deliveryPush: true
};

const AppManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [rangeDays, setRangeDays] = useState(7);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  const [config, setConfig] = useState<any>(defaultConfig);
  const [analytics, setAnalytics] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignForm, setCampaignForm] = useState(initialCampaignForm);

  const loadDashboard = useCallback(async () => {
    try {
      const [loadedConfig, loadedAnalytics, loadedEvents, loadedCampaigns] =
        await Promise.all([
          AdminService.getAppDistributionConfig(),
          AdminService.getAppDistributionAnalytics({ rangeDays }),
          AdminService.getAppDistributionEvents({ limit: 150 }),
          AdminService.getAppCampaigns()
        ]);
      setConfig(loadedConfig || defaultConfig);
      setAnalytics(loadedAnalytics || null);
      setEvents(Array.isArray(loadedEvents) ? loadedEvents : []);
      setCampaigns(Array.isArray(loadedCampaigns) ? loadedCampaigns : []);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load App Management data';
      showNotification('error', 'Load Failed', message);
    } finally {
      setLoading(false);
    }
  }, [rangeDays, showNotification]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => {
      void loadDashboard();
    };
    const eventsToWatch = [
      'apps:event_tracked',
      'apps:metrics_updated',
      'apps:campaign_sent',
      'apps:campaign_updated',
      'apps:campaign_deleted',
      'apps:config_updated'
    ];
    eventsToWatch.forEach((eventName) => {
      window.addEventListener(eventName, refresh as EventListener);
    });
    return () => {
      eventsToWatch.forEach((eventName) => {
        window.removeEventListener(eventName, refresh as EventListener);
      });
    };
  }, [loadDashboard]);

  const summary = useMemo(() => {
    return analytics?.summary || {
      promptShown: 0,
      downloads: 0,
      installs: 0,
      conversionRate: 0,
      activePushUsers: 0,
      totalDeviceTokens: 0
    };
  }, [analytics]);

  const pushRuntime = useMemo(() => {
    return (
      analytics?.pushRuntime || {
        enabled: false,
        credentialSource: null,
        projectId: '',
        error: 'Push diagnostics unavailable'
      }
    );
  }, [analytics]);

  const recentPushRegistrationErrors = useMemo(() => {
    const eventEntry = Array.isArray(analytics?.byEvent)
      ? analytics.byEvent.find((item: any) => item?.event === 'push_registration_error')
      : null;
    return Number(eventEntry?.count || 0);
  }, [analytics]);

  const focusedCampaignId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('campaignId') || '';
  }, []);

  const resetCampaignForm = useCallback(() => {
    setCampaignForm(initialCampaignForm);
    setEditingCampaignId(null);
  }, []);

  const editCampaign = useCallback((campaign: any) => {
    if (!campaign?.id) return;
    setEditingCampaignId(String(campaign.id));
    setCampaignForm({
      name: String(campaign.name || ''),
      title: String(campaign.title || ''),
      body: String(campaign.body || ''),
      mediaType:
        campaign.mediaType === 'image' || campaign.mediaType === 'video' ? campaign.mediaType : 'none',
      mediaUrl: String(campaign.mediaUrl || ''),
      actionUrl: String(campaign.actionUrl || ''),
      targetPlatform:
        campaign.targetPlatform === 'android' || campaign.targetPlatform === 'desktop'
          ? campaign.targetPlatform
          : 'all',
      targetRole:
        campaign.targetRole === 'freelancer' ||
        campaign.targetRole === 'employer' ||
        campaign.targetRole === 'admin'
          ? campaign.targetRole
          : 'all',
      deliveryInApp: campaign.deliveryInApp !== false,
      deliveryPush: campaign.deliveryPush !== false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleConfigChange = (path: string, value: any) => {
    setConfig((prev: any) => setValueByPath(prev, path, value));
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const saved = await AdminService.saveAppDistributionConfig(config);
      setConfig(saved || config);
      showNotification('success', 'Saved', 'App distribution settings saved.');
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to save settings';
      showNotification('error', 'Save Failed', message);
    } finally {
      setSavingConfig(false);
    }
  };

  const sendCampaign = async () => {
    if (!campaignForm.title.trim() || !campaignForm.body.trim()) {
      showNotification('error', 'Missing fields', 'Campaign title and body are required.');
      return;
    }
    setSendingCampaign(true);
    try {
      const result = await AdminService.sendAppCampaign({
        ...campaignForm,
        name: campaignForm.name || campaignForm.title
      });
      const recipients = Number(result?.recipients || 0);
      const inApp = Number(result?.notificationsCreated || 0);
      const pushSent = Number(result?.pushSent || 0);
      const pushEligibleUsers = Number(result?.pushEligibleUsers || 0);
      const pushSkippedUsers = Number(result?.pushSkippedUsers || 0);
      const pushEnabled = result?.pushEnabled !== false;

      showNotification(
        'success',
        'Campaign Sent',
        [
          `Recipients: ${recipients}`,
          campaignForm.deliveryInApp ? `In-app: ${inApp}` : null,
          campaignForm.deliveryPush ? `Push sent: ${pushSent}` : null
        ]
          .filter(Boolean)
          .join(' • ')
      );
      if (campaignForm.deliveryPush && !pushEnabled) {
        showNotification(
          'alert',
          'Push Delivery Disabled',
          'FCM credentials are not configured on the backend. Configure Firebase service-account credentials to enable push campaigns.'
        );
      } else if (campaignForm.deliveryPush && pushEligibleUsers === 0) {
        showNotification(
          'info',
          'No Push-Eligible Devices',
          'No active device tokens matched this audience/platform. In-app delivery may still succeed.'
        );
      } else if (campaignForm.deliveryPush && pushSkippedUsers > 0) {
        showNotification(
          'info',
          'Partial Push Audience',
          `${pushSkippedUsers} recipient(s) had no matching active device token for the selected platform.`
        );
      }
      resetCampaignForm();
      await loadDashboard();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to send campaign';
      showNotification('error', 'Send Failed', message);
    } finally {
      setSendingCampaign(false);
    }
  };

  const saveCampaignChanges = async () => {
    if (!editingCampaignId) return;
    if (!campaignForm.title.trim() || !campaignForm.body.trim()) {
      showNotification('error', 'Missing fields', 'Campaign title and body are required.');
      return;
    }
    setSendingCampaign(true);
    try {
      await AdminService.updateAppCampaign(editingCampaignId, {
        ...campaignForm,
        name: campaignForm.name || campaignForm.title
      });
      showNotification('success', 'Campaign Updated', 'Campaign details saved.');
      resetCampaignForm();
      await loadDashboard();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update campaign';
      showNotification('error', 'Update Failed', message);
    } finally {
      setSendingCampaign(false);
    }
  };

  const resendCampaign = async (campaignId: string) => {
    if (!campaignId) return;
    setSendingCampaign(true);
    try {
      const result = await AdminService.resendAppCampaign(campaignId);
      showNotification(
        'success',
        'Campaign Resent',
        `Recipients: ${Number(result?.recipients || 0)} • Push sent: ${Number(result?.pushSent || 0)}`
      );
      await loadDashboard();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to resend campaign';
      showNotification('error', 'Resend Failed', message);
    } finally {
      setSendingCampaign(false);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!campaignId) return;
    const confirmed = window.confirm('Delete this campaign? This cannot be undone.');
    if (!confirmed) return;
    setSendingCampaign(true);
    try {
      await AdminService.deleteAppCampaign(campaignId);
      if (editingCampaignId === campaignId) {
        resetCampaignForm();
      }
      showNotification('success', 'Campaign Deleted', 'Campaign removed from history.');
      await loadDashboard();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to delete campaign';
      showNotification('error', 'Delete Failed', message);
    } finally {
      setSendingCampaign(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-gray-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Prompt Shown</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{summary.promptShown || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Downloads</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{summary.downloads || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Installs</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{summary.installs || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Install Conversion</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{summary.conversionRate || 0}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">App Distribution Settings</h2>
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingConfig ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-sm font-medium text-gray-700">Prompt Enabled</span>
              <input
                type="checkbox"
                checked={Boolean(config.enabled)}
                onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              />
            </label>
            <label className="rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-600">Auto Hide (seconds)</span>
              <input
                type="number"
                min={3}
                max={30}
                value={Number(config.autoHideSeconds || 8)}
                onChange={(e) => handleConfigChange('autoHideSeconds', Number(e.target.value || 8))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-600">Max Alerts Per Day</span>
              <input
                type="number"
                min={1}
                max={6}
                value={Number(config.maxShowsPerDay || 2)}
                onChange={(e) => handleConfigChange('maxShowsPerDay', Number(e.target.value || 2))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-600">Cooldown (hours)</span>
              <input
                type="number"
                min={1}
                max={12}
                value={Number(config.cooldownHours || 2)}
                onChange={(e) => handleConfigChange('cooldownHours', Number(e.target.value || 2))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="rounded-lg border border-gray-200 px-3 py-2 md:col-span-2">
              <span className="text-sm text-gray-600">Brand Logo URL</span>
              <input
                type="text"
                value={getValueByPath(config, 'branding.logoUrl') || ''}
                onChange={(e) => handleConfigChange('branding.logoUrl', e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Smartphone className="h-4 w-4" /> Android App
              </div>
              <label className="mb-2 block text-xs text-gray-500">APK Download URL</label>
              <input
                type="text"
                value={getValueByPath(config, 'android.downloadUrl') || ''}
                onChange={(e) => handleConfigChange('android.downloadUrl', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
              <label className="mt-2 block text-xs text-gray-500">Icon URL</label>
              <input
                type="text"
                value={getValueByPath(config, 'android.iconUrl') || ''}
                onChange={(e) => handleConfigChange('android.iconUrl', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Monitor className="h-4 w-4" /> Desktop App
              </div>
              <label className="mb-2 block text-xs text-gray-500">Desktop Download URL</label>
              <input
                type="text"
                value={getValueByPath(config, 'desktop.downloadUrl') || ''}
                onChange={(e) => handleConfigChange('desktop.downloadUrl', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
              <p className="mt-2 text-[11px] text-gray-500">
                Current live origin:
                <span className="ml-1 font-medium text-gray-700">
                  storage.googleapis.com/downloads.scrolith.com/desktop/win
                </span>
              </p>
              <label className="mt-2 block text-xs text-gray-500">Icon URL</label>
              <input
                type="text"
                value={getValueByPath(config, 'desktop.iconUrl') || ''}
                onChange={(e) => handleConfigChange('desktop.iconUrl', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Realtime Metrics</h2>
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value={1}>Today</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          <div className="space-y-3">
            <div
              className={[
                'rounded-lg border p-3',
                pushRuntime?.enabled
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-rose-200 bg-rose-50/60'
              ].join(' ')}
            >
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Bell className="h-4 w-4" /> Push Delivery Health
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-semibold text-gray-900">Backend:</span>{' '}
                  {pushRuntime?.enabled ? 'Configured' : 'Unavailable'}
                </div>
                <div>
                  <span className="font-semibold text-gray-900">Source:</span>{' '}
                  {pushRuntime?.credentialSource || 'missing'}
                </div>
                <div>
                  <span className="font-semibold text-gray-900">Project:</span>{' '}
                  {pushRuntime?.projectId || 'unknown'}
                </div>
                <div>
                  <span className="font-semibold text-gray-900">Active users:</span>{' '}
                  {summary.activePushUsers || 0}
                </div>
                <div>
                  <span className="font-semibold text-gray-900">Device tokens:</span>{' '}
                  {summary.totalDeviceTokens || 0}
                </div>
                <div>
                  <span className="font-semibold text-gray-900">Reg errors:</span>{' '}
                  {recentPushRegistrationErrors}
                </div>
              </div>
              {pushRuntime?.error ? (
                <div className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs text-rose-700">
                  {pushRuntime.error}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <BarChart3 className="h-4 w-4" /> Activity by Event
              </p>
              <div className="space-y-1 text-sm text-gray-600">
                {(analytics?.byEvent || []).slice(0, 6).map((item: any) => (
                  <div key={item.event} className="flex justify-between">
                    <span>{item.event}</span>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <MapPin className="h-4 w-4" /> Top Locations
              </p>
              <div className="space-y-1 text-sm text-gray-600">
                {(analytics?.byCountry || []).slice(0, 6).map((item: any) => (
                  <div key={item.country} className="flex justify-between">
                    <span>{item.country}</span>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingCampaignId ? 'Edit App Campaign' : 'Send App Campaign'}
          </h2>
          {editingCampaignId ? (
            <button
              onClick={resetCampaignForm}
              disabled={sendingCampaign}
              className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            placeholder="Campaign name"
            value={campaignForm.name}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Title"
            value={campaignForm.title}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, title: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Message body"
            value={campaignForm.body}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, body: e.target.value }))}
            className="md:col-span-2 min-h-[88px] rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={campaignForm.mediaType}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, mediaType: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="none">Text only</option>
            <option value="image">Text + image</option>
            <option value="video">Text + video</option>
          </select>
          <input
            placeholder="Media URL (image/video)"
            value={campaignForm.mediaUrl}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, mediaUrl: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Action URL (optional)"
            value={campaignForm.actionUrl}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, actionUrl: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={campaignForm.targetPlatform}
            onChange={(e) =>
              setCampaignForm((prev) => ({ ...prev, targetPlatform: e.target.value }))
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All platforms</option>
            <option value="android">Android only</option>
            <option value="desktop">Desktop only</option>
          </select>
          <select
            value={campaignForm.targetRole}
            onChange={(e) => setCampaignForm((prev) => ({ ...prev, targetRole: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All roles</option>
            <option value="freelancer">Freelancers</option>
            <option value="employer">Employers</option>
            <option value="admin">Admin/Staff</option>
          </select>
          <label className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={campaignForm.deliveryInApp}
              onChange={(e) =>
                setCampaignForm((prev) => ({ ...prev, deliveryInApp: e.target.checked }))
              }
            />
            In-app notification
          </label>
          <label className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={campaignForm.deliveryPush}
              onChange={(e) =>
                setCampaignForm((prev) => ({ ...prev, deliveryPush: e.target.checked }))
              }
            />
            Push notification
          </label>
        </div>

        <button
          onClick={editingCampaignId ? saveCampaignChanges : sendCampaign}
          disabled={sendingCampaign}
          className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sendingCampaign ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {editingCampaignId ? 'Save Campaign' : 'Send Campaign'}
        </button>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Activity className="h-5 w-5" /> Recent App Events
          </h2>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2">Event</th>
                  <th className="pb-2">Platform</th>
                  <th className="pb-2">Location</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 120).map((event) => (
                  <tr key={event.id} className="border-t border-gray-100 text-gray-700">
                    <td className="py-2">{event.event}</td>
                    <td className="py-2">{event.platform || event.deviceCategory}</td>
                    <td className="py-2">{event.country || 'unknown'}</td>
                    <td className="py-2">{new Date(event.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-400">
                      No app events yet
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Bell className="h-5 w-5" /> Campaign Activity
          </h2>
          <div className="space-y-3">
            {campaigns.slice(0, 12).map((campaign) => (
              <div
                key={campaign.id}
                className={[
                  'rounded-lg border p-3',
                  focusedCampaignId && focusedCampaignId === String(campaign.id)
                    ? 'border-indigo-400 ring-1 ring-indigo-300'
                    : 'border-gray-200'
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{campaign.name || campaign.title}</p>
                    <p className="text-xs text-gray-500">
                      {campaign.targetPlatform} / {campaign.targetRole}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {campaign.lastSentAt
                      ? new Date(campaign.lastSentAt).toLocaleString()
                      : 'Not sent'}
                  </span>
                </div>
                {campaign.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{campaign.body}</p>
                ) : null}
                {campaign.actionUrl ? (
                  <p className="mt-1 truncate text-xs text-indigo-700">Action: {campaign.actionUrl}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => editCampaign(campaign)}
                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => resendCampaign(String(campaign.id))}
                    disabled={sendingCampaign}
                    className="inline-flex items-center rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Resend
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCampaign(String(campaign.id))}
                    disabled={sendingCampaign}
                    className="inline-flex items-center rounded-md border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-600">
                  <div className="rounded bg-gray-50 p-2">
                    <p className="font-semibold text-gray-900">{campaign.totalRecipients || 0}</p>
                    <p>Recipients</p>
                  </div>
                  <div className="rounded bg-gray-50 p-2">
                    <p className="font-semibold text-gray-900">{campaign.totalPushSent || 0}</p>
                    <p>Push sent</p>
                  </div>
                  <div className="rounded bg-gray-50 p-2">
                    <p className="font-semibold text-gray-900">{campaign.totalPushFailed || 0}</p>
                    <p>Push failed</p>
                  </div>
                  <div className="rounded bg-gray-50 p-2">
                    <p className="font-semibold text-gray-900">
                      {campaign.totalNotificationsCreated || 0}
                    </p>
                    <p>In-app</p>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Push eligible: {campaign.lastPushEligibleUsers || 0} | Skipped (no token):{' '}
                  {campaign.lastPushSkippedUsers || 0}
                  {campaign.lastPushDisabled ? ' | Push disabled on backend' : ''}
                </div>
                {campaign.lastPushErrorSummary ? (
                  <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Push errors: {campaign.lastPushErrorSummary}
                  </div>
                ) : null}
              </div>
            ))}
            {campaigns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
                No campaigns yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p className="flex items-center gap-2 font-semibold text-gray-800">
          <Download className="h-4 w-4" />
          Enterprise App Delivery Notes
        </p>
        <p className="mt-2">
          This module tracks guest prompt exposure, download/install intent, location signals,
          and campaign delivery outcomes in realtime. Campaigns support text, image, and video metadata
          and can deliver both in-app notifications and push notifications.
        </p>
      </section>
    </div>
  );
};

export default AppManagement;
