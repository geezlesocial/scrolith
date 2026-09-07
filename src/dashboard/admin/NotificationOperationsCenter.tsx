/**
 * Phase 32.4 — Enterprise Notification Operations Dashboard
 * Admin → Notifications → Operations
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Flag,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Smartphone,
  FileText
} from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type Section =
  | 'overview'
  | 'live'
  | 'delivery'
  | 'campaigns'
  | 'templates'
  | 'retries'
  | 'failures'
  | 'queue'
  | 'devices'
  | 'analytics'
  | 'engagement'
  | 'flags'
  | 'audit'
  | 'settings';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity className="h-4 w-4" /> },
  { id: 'live', label: 'Live Activity', icon: <Bell className="h-4 w-4" /> },
  { id: 'delivery', label: 'Delivery', icon: <Send className="h-4 w-4" /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Megaphone className="h-4 w-4" /> },
  { id: 'templates', label: 'Templates', icon: <FileText className="h-4 w-4" /> },
  { id: 'retries', label: 'Retry Queue', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'failures', label: 'Failures', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'queue', label: 'Queue Health', icon: <Activity className="h-4 w-4" /> },
  { id: 'devices', label: 'Device Health', icon: <Smartphone className="h-4 w-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <Activity className="h-4 w-4" /> },
  { id: 'engagement', label: 'Engagement Automations', icon: <Bell className="h-4 w-4" /> },
  { id: 'flags', label: 'Feature Flags', icon: <Flag className="h-4 w-4" /> },
  { id: 'audit', label: 'Audit Logs', icon: <Shield className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> }
];

const MetricCard: React.FC<{ label: string; value: string | number; hint?: string; tone?: 'default' | 'warn' | 'good' }> = ({
  label,
  value,
  hint,
  tone = 'default'
}) => (
  <div
    className={`rounded-xl border p-4 shadow-sm ${
      tone === 'warn'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'good'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-white'
    }`}
  >
    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
  </div>
);

const NotificationOperationsCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [section, setSection] = useState<Section>('overview');
  const [range, setRange] = useState('today');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [live, setLive] = useState<any[]>([]);
  const [delivery, setDelivery] = useState<any>(null);
  const [retries, setRetries] = useState<any[]>([]);
  const [failures, setFailures] = useState<any[]>([]);
  const [queue, setQueue] = useState<any>(null);
  const [devices, setDevices] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [flags, setFlags] = useState<any>(null);
  const [retention, setRetention] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [engagementRules, setEngagementRules] = useState<any[]>([]);
  const [engagementState, setEngagementState] = useState<any>(null);
  const [engagementStats, setEngagementStats] = useState<any>(null);
  const [engagementForm, setEngagementForm] = useState({
    eventType: 'engagement.post.impression',
    name: 'Post impression milestones',
    thresholds: '50,100,250,500,1000',
    rolloutPercentage: 0,
    maxNotificationsPerWindow: 1,
    frequencyWindowSeconds: 86400,
    cooldownSeconds: 0,
    inAppEnabled: true,
    pushEnabled: true,
    aiAssistanceEnabled: false,
    titleTemplate: '',
    bodyTemplate: ''
  });
  const [busy, setBusy] = useState(false);

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    type: 'platform_announcement',
    title: '',
    body: '',
    deepLink: '/notifications',
    reason: ''
  });

  // Template form
  const [templateForm, setTemplateForm] = useState({
    key: '',
    name: '',
    channel: 'in_app',
    title: '',
    body: '',
    subject: ''
  });

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await AdminService.getNotificationOpsOverview({ range });
      setOverview(ov);
    } catch (e: any) {
      showNotification('error', 'Notification Ops', e?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [range, showNotification]);

  const loadSection = useCallback(async () => {
    try {
      if (section === 'live') {
        setLive((await AdminService.getNotificationOpsLive(40)) || []);
      } else if (section === 'delivery' || section === 'analytics') {
        setDelivery(await AdminService.getNotificationOpsDelivery({ range: range === 'today' ? '7d' : range }));
      } else if (section === 'retries') {
        const rows = await AdminService.getNotificationOpsRetries({ limit: 50 });
        setRetries(Array.isArray(rows) ? rows : []);
      } else if (section === 'failures') {
        const rows = await AdminService.getNotificationOpsFailures(50);
        setFailures(Array.isArray(rows) ? rows : []);
      } else if (section === 'queue') {
        setQueue(await AdminService.getNotificationOpsQueue());
      } else if (section === 'devices') {
        setDevices(await AdminService.getNotificationOpsDevices());
      } else if (section === 'templates') {
        const rows = await AdminService.getNotificationOpsTemplates();
        setTemplates(Array.isArray(rows) ? rows : []);
      } else if (section === 'campaigns') {
        const rows = await AdminService.getNotificationOpsCampaigns();
        setCampaigns(Array.isArray(rows) ? rows : []);
      } else if (section === 'audit') {
        const rows = await AdminService.getNotificationOpsAudit({ limit: 50 });
        setAudit(Array.isArray(rows) ? rows : []);
      } else if (section === 'flags') {
        setFlags(await AdminService.getNotificationOpsFeatureFlags());
      } else if (section === 'settings') {
        setRetention(await AdminService.getNotificationOpsRetention());
        setSettings(await AdminService.getNotificationOpsSettings());
      } else if (section === 'engagement') {
        const [rules, state, stats] = await Promise.all([
          AdminService.getEngagementAutomationRules(),
          AdminService.getEngagementAutomationState(),
          AdminService.getEngagementAutomationStats()
        ]);
        setEngagementRules(Array.isArray(rules) ? rules : []);
        setEngagementState(state);
        setEngagementStats(stats);
      }
    } catch (e: any) {
      // Soft — section may 503 pre-migration
      console.warn('[notification-ops]', section, e?.message);
    }
  }, [section, range]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  const m = overview?.metrics || {};

  const flagEntries = useMemo(() => {
    const v = flags?.value || flags || {};
    return Object.entries(v) as [string, boolean][];
  }, [flags]);

  return (
    <div className="space-y-4" aria-label="Notification operations dashboard">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bell className="h-6 w-6 text-blue-600" aria-hidden />
            Notification Operations
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Enterprise delivery monitoring, campaigns, templates, retries, and health — Phase 32.4.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">
            Range{' '}
            <select
              className="ml-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Analytics range"
            >
              <option value="today">Today</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              void loadCore();
              void loadSection();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1"
        role="tablist"
        aria-label="Operations sections"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
              section === s.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>

      {loading && !overview ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-slate-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading operations…
        </div>
      ) : null}

      {section === 'overview' && overview ? (
        <div className="space-y-4" role="tabpanel">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Emitted" value={m.emitted ?? 0} />
            <MetricCard label="Delivered" value={m.delivered ?? 0} tone="good" />
            <MetricCard label="Failed" value={m.failed ?? 0} tone={m.failed ? 'warn' : 'default'} />
            <MetricCard label="Suppressed / deferred" value={m.suppressed ?? 0} />
            <MetricCard label="Push" value={m.pushDeliveries ?? 0} />
            <MetricCard label="Email" value={m.emailDeliveries ?? 0} />
            <MetricCard label="In-app" value={m.inAppDeliveries ?? 0} />
            <MetricCard label="Digests" value={m.digestsSent ?? 0} />
            <MetricCard
              label="Failure rate"
              value={`${((m.failureRate || 0) * 100).toFixed(1)}%`}
              tone={m.failureRate > 0.05 ? 'warn' : 'good'}
            />
            <MetricCard label="Read rate" value={`${((m.readRate || 0) * 100).toFixed(1)}%`} />
            <MetricCard label="Latency (avg ms)" value={m.deliveryLatencyMs ?? '—'} />
            <MetricCard label="Retry backlog" value={m.retryBacklog ?? 0} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">Top categories</h3>
              <ul className="mt-3 space-y-1 text-sm">
                {(overview.topCategories || []).length ? (
                  overview.topCategories.map((c: any) => (
                    <li key={c.category} className="flex justify-between border-b border-slate-50 py-1">
                      <span>{c.category}</span>
                      <span className="tabular-nums text-slate-600">{c.count}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-500">No data in range</li>
                )}
              </ul>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">Top event types</h3>
              <ul className="mt-3 space-y-1 text-sm">
                {(overview.topEventTypes || []).length ? (
                  overview.topEventTypes.map((t: any) => (
                    <li key={t.type} className="flex justify-between border-b border-slate-50 py-1">
                      <span className="truncate font-mono text-xs">{t.type}</span>
                      <span className="tabular-nums text-slate-600">{t.count}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-500">No data in range</li>
                )}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {section === 'live' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" role="tabpanel">
          <h3 className="font-semibold">Live activity</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2">Read</th>
                </tr>
              </thead>
              <tbody>
                {live.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-500">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.type}</td>
                    <td className="py-2 pr-3">{row.category || '—'}</td>
                    <td className="py-2 pr-3">{row.title}</td>
                    <td className="py-2">{row.isRead ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!live.length ? <p className="mt-4 text-sm text-slate-500">No recent notifications.</p> : null}
          </div>
        </section>
      ) : null}

      {(section === 'delivery' || section === 'analytics') && delivery ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" role="tabpanel">
          <h3 className="font-semibold">Channel delivery breakdown</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(delivery.channels || {}).map(([ch, stats]: [string, any]) => (
              <div key={ch} className="rounded-lg border border-slate-100 p-3">
                <div className="font-medium capitalize text-slate-900">{ch.replace('_', '-')}</div>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Delivered</dt>
                    <dd className="tabular-nums">{stats.delivered}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Failed</dt>
                    <dd className="tabular-nums text-red-600">{stats.failed}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Pending</dt>
                    <dd className="tabular-nums">{stats.pending}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Suppressed</dt>
                    <dd className="tabular-nums">{stats.suppressed}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          {section === 'analytics' && overview ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Devices registered" value={m.devicesRegistered ?? 0} />
              <MetricCard label="Invalid tokens" value={m.invalidTokens ?? 0} tone={m.invalidTokens ? 'warn' : 'default'} />
            </div>
          ) : null}
        </section>
      ) : null}

      {section === 'campaigns' ? (
        <div className="grid gap-4 lg:grid-cols-2" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Create campaign</h3>
            <div className="mt-3 space-y-2 text-sm">
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Name"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))}
                aria-label="Campaign name"
              />
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={campaignForm.type}
                onChange={(e) => setCampaignForm((f) => ({ ...f, type: e.target.value }))}
                aria-label="Campaign type"
              >
                <option value="platform_announcement">Platform announcement</option>
                <option value="maintenance">Maintenance</option>
                <option value="security_notice">Security notice</option>
                <option value="feature_release">Feature release</option>
                <option value="emergency">Emergency</option>
              </select>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Title"
                value={campaignForm.title}
                onChange={(e) => setCampaignForm((f) => ({ ...f, title: e.target.value }))}
                aria-label="Campaign title"
              />
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                rows={3}
                placeholder="Body"
                value={campaignForm.body}
                onChange={(e) => setCampaignForm((f) => ({ ...f, body: e.target.value }))}
                aria-label="Campaign body"
              />
              {campaignForm.type === 'emergency' ? (
                <textarea
                  className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                  rows={2}
                  placeholder="Emergency reason (required)"
                  value={campaignForm.reason}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, reason: e.target.value }))}
                  aria-label="Emergency reason"
                />
              ) : null}
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const created = await AdminService.createNotificationOpsCampaign({
                      ...campaignForm,
                      channels: ['IN_APP', 'PUSH'],
                      targeting: { all: true }
                    });
                    if (campaignForm.type === 'emergency') {
                      await AdminService.confirmNotificationEmergency(created.id, campaignForm.reason || 'Ops emergency');
                      await AdminService.sendNotificationOpsCampaign(created.id, {
                        confirm: true,
                        reason: campaignForm.reason
                      });
                    } else {
                      await AdminService.sendNotificationOpsCampaign(created.id);
                    }
                    showNotification('success', 'Campaigns', 'Campaign sent (bounded batch).');
                    setCampaignForm({ name: '', type: 'platform_announcement', title: '', body: '', deepLink: '/notifications', reason: '' });
                    await loadSection();
                  } catch (e: any) {
                    showNotification('error', 'Campaigns', e?.response?.data?.error || e?.message || 'Failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {campaignForm.type === 'emergency' ? 'Confirm & send emergency' : 'Create & send'}
              </button>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Recent campaigns</h3>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {campaigns.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.type} · {c.status}
                      {c.stats?.sent != null ? ` · sent ${c.stats.sent}` : ''}
                    </div>
                  </div>
                  {c.status !== 'cancelled' && c.status !== 'sent' ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={async () => {
                        await AdminService.cancelNotificationOpsCampaign(c.id);
                        await loadSection();
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </li>
              ))}
              {!campaigns.length ? <li className="text-slate-500">No campaigns yet.</li> : null}
            </ul>
          </section>
        </div>
      ) : null}

      {section === 'templates' ? (
        <div className="grid gap-4 lg:grid-cols-2" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Create template</h3>
            <div className="mt-3 space-y-2 text-sm">
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="key (e.g. welcome)"
                value={templateForm.key}
                onChange={(e) => setTemplateForm((f) => ({ ...f, key: e.target.value }))}
              />
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
              />
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={templateForm.channel}
                onChange={(e) => setTemplateForm((f) => ({ ...f, channel: e.target.value }))}
              >
                <option value="in_app">In-app</option>
                <option value="push">Push</option>
                <option value="email">Email</option>
              </select>
              <input
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Title (supports {{name}})"
                value={templateForm.title}
                onChange={(e) => setTemplateForm((f) => ({ ...f, title: e.target.value }))}
              />
              <textarea
                className="w-full rounded-lg border px-3 py-2"
                rows={3}
                placeholder="Body"
                value={templateForm.body}
                onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
              />
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-2 text-white"
                onClick={async () => {
                  try {
                    const t = await AdminService.createNotificationOpsTemplate(templateForm);
                    await AdminService.publishNotificationOpsTemplate(t.id);
                    showNotification('success', 'Templates', 'Template created and published.');
                    setTemplateForm({ key: '', name: '', channel: 'in_app', title: '', body: '', subject: '' });
                    await loadSection();
                  } catch (e: any) {
                    showNotification('error', 'Templates', e?.message || 'Failed');
                  }
                }}
              >
                Create & publish
              </button>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Templates</h3>
            <ul className="mt-3 divide-y text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">
                      {t.name} <span className="text-xs text-slate-400">v{t.version}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.key} · {t.channel} · {t.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={async () => {
                      try {
                        const p = await AdminService.previewNotificationOpsTemplate(t.id, { name: 'Alex' });
                        showNotification('info', 'Preview', `${p.title || ''} — ${p.body || ''}`.slice(0, 120));
                      } catch (e: any) {
                        showNotification('error', 'Preview', e?.message || 'Failed');
                      }
                    }}
                  >
                    Preview
                  </button>
                </li>
              ))}
              {!templates.length ? <li className="text-slate-500">No templates yet.</li> : null}
            </ul>
          </section>
        </div>
      ) : null}

      {section === 'retries' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" role="tabpanel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Retry queue</h3>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={async () => {
                try {
                  const r = await AdminService.enqueueNotificationRetries(50);
                  showNotification('success', 'Retries', `Enqueued ${r?.created ?? 0} jobs from failures.`);
                  await loadSection();
                } catch (e: any) {
                  showNotification('error', 'Retries', e?.message || 'Failed');
                }
              }}
            >
              Enqueue from failures
            </button>
          </div>
          <ul className="mt-3 divide-y text-sm">
            {retries.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-mono text-xs">{j.id.slice(0, 12)}…</div>
                  <div className="text-xs text-slate-500">
                    {j.channel} · {j.status} · attempts {j.attemptCount}/{j.maxAttempts}
                    {j.lastError ? ` · ${j.lastError}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={async () => {
                      await AdminService.retryNotificationJob(j.id);
                      await loadSection();
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={async () => {
                      await AdminService.cancelNotificationRetry(j.id);
                      await loadSection();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
            {!retries.length ? <li className="text-slate-500">Queue empty.</li> : null}
          </ul>
        </section>
      ) : null}

      {section === 'failures' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" role="tabpanel">
          <h3 className="font-semibold">Delivery failures</h3>
          <ul className="mt-3 divide-y text-sm">
            {failures.map((f) => (
              <li key={f.id} className="py-2">
                <div className="font-medium">
                  {f.channel} · {f.errorCode || 'error'}
                </div>
                <div className="text-xs text-slate-500">
                  {f.errorMessage || '—'} · {f.createdAt ? new Date(f.createdAt).toLocaleString() : ''}
                </div>
              </li>
            ))}
            {!failures.length ? <li className="text-slate-500">No recent failures.</li> : null}
          </ul>
        </section>
      ) : null}

      {section === 'queue' && queue ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="tabpanel">
          <MetricCard label="Worker status" value={queue.workerStatus || 'unknown'} />
          <MetricCard label="Queue depth" value={queue.queueDepth ?? 0} />
          <MetricCard label="Retry backlog" value={queue.retryBacklog ?? 0} />
          <MetricCard label="Dead letter" value={queue.deadLetterCount ?? 0} tone={queue.deadLetterCount ? 'warn' : 'default'} />
          <MetricCard label="Processing" value={queue.processing ?? 0} />
          <MetricCard label="Digest cron" value={queue.digestCronEnabled ? 'on' : 'off'} />
        </section>
      ) : null}

      {section === 'devices' && devices ? (
        <section className="space-y-4" role="tabpanel">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Registered devices" value={devices.total ?? 0} />
            <MetricCard label="Invalid tokens" value={devices.invalidTokens ?? 0} tone={devices.invalidTokens ? 'warn' : 'default'} />
            <MetricCard label="With last sync" value={devices.withLastSync ?? 0} />
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">By platform</h3>
            <ul className="mt-2 text-sm">
              {(devices.byPlatform || []).map((p: any) => (
                <li key={p.platform} className="flex justify-between py-1">
                  <span>{p.platform}</span>
                  <span className="tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">By app version</h3>
            <ul className="mt-2 text-sm">
              {(devices.byAppVersion || []).map((p: any) => (
                <li key={p.appVersion} className="flex justify-between py-1">
                  <span className="font-mono text-xs">{p.appVersion}</span>
                  <span className="tabular-nums">{p.count}</span>
                </li>
              ))}
              {!(devices.byAppVersion || []).length ? <li className="text-slate-500">No version metadata yet.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      {section === 'flags' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" role="tabpanel">
          <h3 className="font-semibold">Feature flags</h3>
          <p className="mt-1 text-xs text-slate-500">Configurable without deployment. Changes are audited.</p>
          <div className="mt-4 divide-y">
            {flagEntries.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-800">{key}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(value)}
                  aria-label={`Toggle ${key}`}
                  className={`h-7 w-12 rounded-full ${value ? 'bg-blue-600' : 'bg-slate-300'}`}
                  onClick={async () => {
                    try {
                      const next = await AdminService.putNotificationOpsFeatureFlags({ [key]: !value });
                      setFlags(next);
                      showNotification('success', 'Flags', `${key} updated.`);
                    } catch (e: any) {
                      showNotification('error', 'Flags', e?.message || 'Failed');
                    }
                  }}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </button>
              </div>
            ))}
            {!flagEntries.length ? <p className="text-sm text-slate-500">Unable to load flags.</p> : null}
          </div>
        </section>
      ) : null}

      {section === 'engagement' ? (
        <div className="space-y-4" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Engagement Automations</h3>
                <p className="mt-1 text-xs text-slate-500">Durable milestone rules. New rules start disabled and at 0% rollout.</p>
              </div>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${engagementState?.paused ? 'bg-emerald-600' : 'bg-amber-600'}`}
                onClick={async () => {
                  const next = await AdminService.putEngagementAutomationState({ paused: !engagementState?.paused });
                  setEngagementState((s: any) => ({ ...s, ...next }));
                  showNotification('success', 'Engagement Automations', next.paused ? 'Automation paused.' : 'Automation activated.');
                }}
              >
                {engagementState?.paused ? 'Activate automation' : 'Pause automation'}
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Signals" value={engagementStats?.signals ?? 0} />
              <MetricCard label="Milestone states" value={(engagementStats?.states || []).reduce((sum: number, row: any) => sum + Number(row._count?._all || 0), 0)} />
              <MetricCard label="Status" value={engagementState?.paused ? 'Paused' : 'Active'} tone={engagementState?.paused ? 'warn' : 'good'} />
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Delivery (last 30 days): {(engagementStats?.delivery || []).map((row: any) => `${row.channel}/${row.status}: ${row._count?._all || 0}`).join(' · ') || 'No delivery attempts'}
            </div>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold">Create milestone rule</h3>
              <div className="mt-3 space-y-2 text-sm">
                <select className="w-full rounded-lg border px-3 py-2" value={engagementForm.eventType} onChange={(e) => setEngagementForm((f) => ({ ...f, eventType: e.target.value }))}>
                  {['post.impression','profile.search_appearance','marketplace.listing.impression','scroll.impression','profile.direct_view','content.reach','marketplace.listing.save','marketplace.listing.inquiry','opportunity.qualified'].map((suffix) => (
                    <option key={suffix} value={`engagement.${suffix}`}>{suffix}</option>
                  ))}
                </select>
                <input className="w-full rounded-lg border px-3 py-2" placeholder="Rule name" value={engagementForm.name} onChange={(e) => setEngagementForm((f) => ({ ...f, name: e.target.value }))} />
                <input className="w-full rounded-lg border px-3 py-2" placeholder="Thresholds: 50,100,250" value={engagementForm.thresholds} onChange={(e) => setEngagementForm((f) => ({ ...f, thresholds: e.target.value }))} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <input type="number" min={0} max={100} className="rounded-lg border px-3 py-2" aria-label="Rollout percentage" value={engagementForm.rolloutPercentage} onChange={(e) => setEngagementForm((f) => ({ ...f, rolloutPercentage: Number(e.target.value) }))} />
                  <input type="number" min={1} className="rounded-lg border px-3 py-2" aria-label="Max notifications per window" value={engagementForm.maxNotificationsPerWindow} onChange={(e) => setEngagementForm((f) => ({ ...f, maxNotificationsPerWindow: Number(e.target.value) }))} />
                  <input type="number" min={60} className="rounded-lg border px-3 py-2" aria-label="Frequency window seconds" value={engagementForm.frequencyWindowSeconds} onChange={(e) => setEngagementForm((f) => ({ ...f, frequencyWindowSeconds: Number(e.target.value) }))} />
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label><input type="checkbox" checked={engagementForm.inAppEnabled} onChange={(e) => setEngagementForm((f) => ({ ...f, inAppEnabled: e.target.checked }))} /> In-app</label>
                  <label><input type="checkbox" checked={engagementForm.pushEnabled} onChange={(e) => setEngagementForm((f) => ({ ...f, pushEnabled: e.target.checked }))} /> Push</label>
                  <label><input type="checkbox" checked={engagementForm.aiAssistanceEnabled} onChange={(e) => setEngagementForm((f) => ({ ...f, aiAssistanceEnabled: e.target.checked }))} /> AI assistance</label>
                </div>
                <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white" onClick={async () => {
                  try {
                    await AdminService.createEngagementAutomationRule({ ...engagementForm, thresholds: engagementForm.thresholds.split(',').map((v) => Number(v.trim())) });
                    showNotification('success', 'Engagement Automations', 'Rule created.');
                    await loadSection();
                  } catch (e: any) { showNotification('error', 'Engagement Automations', e?.response?.data?.error || e?.message || 'Failed'); }
                }}>Create disabled rule</button>
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold">Configured rules</h3>
              <ul className="mt-3 divide-y text-sm">
                {engagementRules.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div><div className="font-medium">{rule.name}</div><div className="text-xs text-slate-500">{rule.eventType} · {rule.thresholds?.join(', ')} · rollout {rule.rolloutPercentage}%</div></div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium" onClick={async () => { await AdminService.testEngagementAutomationRule({ ruleId: rule.id }); showNotification('success', 'Engagement Automations', 'Test notification sent to your admin account.'); }}>Test to me</button>
                      <button type="button" className={`rounded px-2 py-1 text-xs font-medium text-white ${rule.isEnabled ? 'bg-emerald-600' : 'bg-slate-500'}`} onClick={async () => { const next = await AdminService.updateEngagementAutomationRule(rule.id, { isEnabled: !rule.isEnabled }); setEngagementRules((rows) => rows.map((row) => row.id === rule.id ? next : row)); }}> {rule.isEnabled ? 'Disable' : 'Enable'} </button>
                    </div>
                  </li>
                ))}
                {!engagementRules.length ? <li className="text-slate-500">No rules configured.</li> : null}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {section === 'audit' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" role="tabpanel">
          <h3 className="font-semibold">Operational audit logs</h3>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto text-sm">
            {audit.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="font-medium">{a.action}</div>
                <div className="text-xs text-slate-500">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''} · actor {a.actorId || a.userId || '—'}
                </div>
              </li>
            ))}
            {!audit.length ? <li className="text-slate-500">No audit entries.</li> : null}
          </ul>
        </section>
      ) : null}

      {section === 'settings' ? (
        <div className="grid gap-4 lg:grid-cols-2" role="tabpanel">
          <section className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Retention (days)</h3>
            {retention?.value ? (
              <div className="mt-3 space-y-2 text-sm">
                {Object.entries(retention.value).map(([k, v]) => (
                  <label key={k} className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">{k}</span>
                    <input
                      type="number"
                      min={7}
                      max={3650}
                      className="w-24 rounded border px-2 py-1"
                      value={Number(v)}
                      onChange={(e) =>
                        setRetention((r: any) => ({
                          ...r,
                          value: { ...r.value, [k]: Number(e.target.value) }
                        }))
                      }
                      aria-label={k}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-white"
                  onClick={async () => {
                    try {
                      const next = await AdminService.putNotificationOpsRetention(retention.value);
                      setRetention(next);
                      showNotification('success', 'Retention', 'Saved.');
                    } catch (e: any) {
                      showNotification('error', 'Retention', e?.message || 'Failed');
                    }
                  }}
                >
                  Save retention
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Loading…</p>
            )}
          </section>
          <section className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Ops settings</h3>
            {settings?.value ? (
              <div className="mt-3 space-y-2 text-sm">
                {Object.entries(settings.value).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-mono text-xs">{String(v)}</span>
                  </div>
                ))}
                <p className="text-xs text-slate-500">
                  Use Feature Flags and Retention for primary controls. Full defaults also available via Phase 32.2 admin
                  defaults API.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Loading…</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationOperationsCenter;
