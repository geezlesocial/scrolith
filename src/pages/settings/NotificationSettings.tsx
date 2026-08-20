/**
 * Phase 32.2 — User notification preferences, quiet hours, focus mode, digests.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Clock,
  Focus,
  Loader2,
  Mail,
  Moon,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  Volume2
} from 'lucide-react';
import { NotificationService } from '../../services/notifications';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import CallRingtoneSettingsPanel from '../../components/settings/CallRingtoneSettingsPanel';

const CATEGORIES = [
  { id: 'personal', label: 'Personal', hint: 'Likes, comments, follows, mentions' },
  { id: 'messaging', label: 'Messaging', hint: 'Direct messages' },
  { id: 'messaging_groups', label: 'Messaging groups', hint: 'Group chats and mentions' },
  { id: 'jobs', label: 'Jobs', hint: 'Applications and job updates' },
  { id: 'marketplace', label: 'Marketplace', hint: 'Orders and listings' },
  { id: 'communities', label: 'Communities', hint: 'Community activity' },
  { id: 'business', label: 'Business', hint: 'Company and page updates' },
  { id: 'wallet', label: 'Wallet', hint: 'Payments and transfers' },
  { id: 'security', label: 'Security', hint: 'Logins and account security (mandatory alerts always deliver)', mandatory: true },
  { id: 'support', label: 'Support', hint: 'Ticket replies' },
  { id: 'system', label: 'System', hint: 'Product and platform updates' },
  { id: 'admin', label: 'Admin', hint: 'Admin notices when applicable' }
] as const;

const DELIVERY_MODES = [
  { value: 'immediate', label: 'Notify me immediately' },
  { value: 'digest', label: 'Include in my digest' },
  { value: 'priority_only', label: 'Only when important' },
  { value: 'muted', label: 'Mute this category' }
] as const;

const MIN_PRIORITIES = [
  { value: 'critical', label: 'Critical only' },
  { value: 'high', label: 'High and above' },
  { value: 'normal', label: 'Normal and above' },
  { value: 'low', label: 'All priorities' }
] as const;

const FOCUS_PRESETS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' }
] as const;

const DIGEST_MODES = [
  { value: 'off', label: 'Off' },
  { value: 'morning', label: 'Morning (08:00 local)' },
  { value: 'evening', label: 'Evening (19:00 local)' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' }
] as const;

const EVENT_OVERRIDE_EXAMPLES = [
  'messaging.direct_message',
  'messaging.group_mention',
  'jobs.application_status',
  'marketplace.order_update',
  'wallet.payment_received',
  'security.new_login',
  'support.ticket_reply'
];

type TabId = 'overview' | 'channels' | 'categories' | 'events' | 'quiet' | 'focus' | 'digests' | 'devices' | 'privacy';

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id: string;
}> = ({ checked, onChange, label, description, disabled, id }) => (
  <div className="flex items-start justify-between gap-4 py-3">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900">
        {label}
      </label>
      {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'left-5' : 'left-0.5'
        }`}
        aria-hidden
      />
    </button>
  </div>
);

const SectionCard: React.FC<{ title: string; children: React.ReactNode; icon?: React.ReactNode }> = ({
  title,
  children,
  icon
}) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby={`sec-${title}`}>
    <h2 id={`sec-${title}`} className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
      {icon}
      {title}
    </h2>
    {children}
  </section>
);

const NotificationSettings: React.FC = () => {
  const { isAuthenticated } = useUser();
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundle, setBundle] = useState<any>(null);
  const [digests, setDigests] = useState<any[]>([]);
  const [eventType, setEventType] = useState(EVENT_OVERRIDE_EXAMPLES[0]);
  const [eventMuted, setEventMuted] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [qhForm, setQhForm] = useState({
    startTime: '22:00',
    endTime: '07:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    label: 'Quiet hours'
  });

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [prefs, digestList, deviceList] = await Promise.all([
        NotificationService.getPreferences(),
        NotificationService.listDigests(10).catch(() => []),
        NotificationService.listDevices().catch(() => [])
      ]);
      setBundle(prefs);
      setDigests(digestList || []);
      setDevices(Array.isArray(deviceList) ? deviceList : []);
      if (prefs?.global?.timezone) {
        setQhForm((f) => ({ ...f, timezone: prefs.global.timezone }));
      }
    } catch (e: any) {
      showNotification('error', 'Notifications', e?.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const global = bundle?.global || {};
  const categories: any[] = useMemo(() => bundle?.categories || [], [bundle]);
  const digest = bundle?.digest || {};
  const focus = bundle?.focus;
  const quietHours: any[] = bundle?.quietHours || [];

  const saveGlobal = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await NotificationService.patchPreferences({ ...patch, version: global.version });
      showNotification('success', 'Notifications', 'Preferences saved.');
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Save failed';
      showNotification('error', 'Notifications', msg);
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (category: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await NotificationService.patchCategoryPreference(category, patch);
      showNotification('success', 'Notifications', `${category} updated.`);
      await load();
    } catch (e: any) {
      showNotification('error', 'Notifications', e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'channels', label: 'Channels' },
    { id: 'categories', label: 'Categories' },
    { id: 'events', label: 'Advanced' },
    { id: 'quiet', label: 'Quiet hours' },
    { id: 'focus', label: 'Focus mode' },
    { id: 'digests', label: 'Digests' },
    { id: 'devices', label: 'Devices' },
    { id: 'privacy', label: 'Privacy' }
  ];

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Bell className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Notification settings</h1>
        <p className="mt-2 text-slate-600">Sign in to manage notification preferences.</p>
        <Link to="/auth/login" className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
              <Link to="/settings" className="hover:underline">
                Settings
              </Link>
              {' / '}
              Notifications
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Bell className="h-7 w-7 text-blue-600" aria-hidden />
              Notification settings
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Control delivery channels, quiet hours, focus mode, and digests. Mandatory security alerts always deliver.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/notifications"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open inbox
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Reload preferences"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </button>
          </div>
        </header>

        <div
          className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1"
          role="tablist"
          aria-label="Notification settings sections"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-20 text-slate-500" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading preferences…
          </div>
        ) : (
          <div className="space-y-4" role="tabpanel">
            {tab === 'overview' && (
              <>
                <CallRingtoneSettingsPanel />
                <SectionCard title="Global controls" icon={<Shield className="h-4 w-4 text-blue-600" />}>
                  <div className="divide-y divide-slate-100">
                    <Toggle
                      id="pause-optional"
                      checked={Boolean(global.pauseOptional)}
                      onChange={(v) => void saveGlobal({ pauseOptional: v })}
                      label="Pause all optional notifications"
                      description="Mandatory security and emergency alerts still deliver."
                    />
                    <Toggle
                      id="allow-security"
                      checked={global.allowMandatorySecurity !== false}
                      onChange={(v) => void saveGlobal({ allowMandatorySecurity: v })}
                      label="Allow mandatory security notifications"
                      description="New logins, password changes, and device alerts."
                      disabled
                    />
                    <Toggle
                      id="allow-emergency"
                      checked={global.allowEmergencySystem !== false}
                      onChange={(v) => void saveGlobal({ allowEmergencySystem: v })}
                      label="Allow emergency system alerts"
                      description="Critical platform safety broadcasts."
                      disabled
                    />
                    <Toggle
                      id="marketing"
                      checked={Boolean(global.marketingEnabled)}
                      onChange={(v) => void saveGlobal({ marketingEnabled: v })}
                      label="Marketing notifications"
                    />
                    <Toggle
                      id="product-updates"
                      checked={global.productUpdatesEnabled !== false}
                      onChange={(v) => void saveGlobal({ productUpdatesEnabled: v })}
                      label="Product update notifications"
                    />
                  </div>
                </SectionCard>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
                  <strong>Mandatory vs optional:</strong> Security and emergency alerts cannot be fully muted by user
                  preferences. Quiet hours and focus mode still allow critical/security exceptions by default.
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    if (!window.confirm('Reset all notification preferences to defaults?')) return;
                    setSaving(true);
                    try {
                      await NotificationService.resetPreferences();
                      showNotification('success', 'Notifications', 'Preferences reset.');
                      await load();
                    } catch (e: any) {
                      showNotification('error', 'Notifications', e?.message || 'Reset failed');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Reset to defaults
                </button>
              </>
            )}

            {tab === 'channels' && (
              <SectionCard title="Channel defaults" icon={<Smartphone className="h-4 w-4 text-blue-600" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Active channels: In-app, Push, Email. SMS, Desktop, and Webhook are reserved for a future phase.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: <Bell className="h-5 w-5" />, label: 'In-app', status: 'Available' },
                    { icon: <Smartphone className="h-5 w-5" />, label: 'Push', status: 'Available' },
                    { icon: <Mail className="h-5 w-5" />, label: 'Email', status: 'Available' }
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="text-blue-600">{c.icon}</div>
                      <div className="mt-2 font-medium text-slate-900">{c.label}</div>
                      <div className="text-xs text-emerald-600">{c.status}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  <Toggle
                    id="play-sounds"
                    checked={global.playSounds !== false}
                    onChange={(v) => void saveGlobal({ playSounds: v })}
                    label="Play sounds"
                  />
                  <Toggle
                    id="vibration"
                    checked={global.enableVibration !== false}
                    onChange={(v) => void saveGlobal({ enableVibration: v })}
                    label="Enable vibration"
                  />
                  <Toggle
                    id="badge"
                    checked={global.badgeEnabled !== false}
                    onChange={(v) => void saveGlobal({ badgeEnabled: v })}
                    label="Badge count"
                  />
                </div>
              </SectionCard>
            )}

            {tab === 'categories' && (
              <div className="space-y-3">
                {CATEGORIES.map((cat) => {
                  const row = categories.find((c) => c.category === cat.id) || {};
                  return (
                    <SectionCard key={cat.id} title={cat.label}>
                      <p className="mb-2 text-xs text-slate-500">{cat.hint}</p>
                      {'mandatory' in cat && cat.mandatory ? (
                        <p className="mb-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                          Mandatory security policy applies
                        </p>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Toggle
                          id={`${cat.id}-inapp`}
                          checked={row.inAppEnabled !== false}
                          disabled={cat.id === 'security'}
                          onChange={(v) => void saveCategory(cat.id, { inAppEnabled: v })}
                          label="In-app"
                        />
                        <Toggle
                          id={`${cat.id}-push`}
                          checked={row.pushEnabled !== false}
                          onChange={(v) => void saveCategory(cat.id, { pushEnabled: v })}
                          label="Push"
                        />
                        <Toggle
                          id={`${cat.id}-email`}
                          checked={Boolean(row.emailEnabled)}
                          onChange={(v) => void saveCategory(cat.id, { emailEnabled: v })}
                          label="Email"
                        />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="font-medium text-slate-700">Delivery mode</span>
                          <select
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={row.deliveryMode || 'immediate'}
                            disabled={cat.id === 'security'}
                            onChange={(e) => void saveCategory(cat.id, { deliveryMode: e.target.value })}
                            aria-label={`${cat.label} delivery mode`}
                          >
                            {DELIVERY_MODES.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="font-medium text-slate-700">Minimum priority</span>
                          <select
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            value={row.minPriority || 'normal'}
                            onChange={(e) => void saveCategory(cat.id, { minPriority: e.target.value })}
                            aria-label={`${cat.label} minimum priority`}
                          >
                            {MIN_PRIORITIES.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </SectionCard>
                  );
                })}
              </div>
            )}

            {tab === 'events' && (
              <SectionCard title="Event-type overrides" icon={<Volume2 className="h-4 w-4 text-blue-600" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Advanced: override a specific event type. Overrides inherit from the category unless changed.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block min-w-[220px] flex-1 text-sm">
                    <span className="font-medium text-slate-700">Event type</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                    >
                      {EVENT_OVERRIDE_EXAMPLES.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Toggle
                    id="event-muted"
                    checked={eventMuted}
                    onChange={setEventMuted}
                    label="Mute this event"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await NotificationService.patchEventPreference(eventType, { muted: eventMuted });
                        showNotification('success', 'Notifications', 'Event override saved.');
                        await load();
                      } catch (e: any) {
                        showNotification('error', 'Notifications', e?.message || 'Failed');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4" />
                    Save override
                  </button>
                </div>
                {(bundle?.eventOverrides || []).length > 0 ? (
                  <ul className="mt-4 divide-y divide-slate-100 text-sm">
                    {(bundle.eventOverrides as any[]).map((ev) => (
                      <li key={ev.id || ev.eventType} className="flex justify-between py-2">
                        <span className="font-mono text-xs text-slate-800">{ev.eventType}</span>
                        <span className="text-slate-500">{ev.muted ? 'Muted' : 'Custom'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No event overrides yet.</p>
                )}
              </SectionCard>
            )}

            {tab === 'quiet' && (
              <SectionCard title="Quiet hours" icon={<Moon className="h-4 w-4 text-blue-600" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Suppress optional push/email during your schedule. Windows may cross midnight (e.g. 22:00 → 07:00).
                  App-level quiet hours do not replace device Do Not Disturb.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="font-medium">Start</span>
                    <input
                      type="time"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={qhForm.startTime}
                      onChange={(e) => setQhForm((f) => ({ ...f, startTime: e.target.value }))}
                      aria-label="Quiet hours start time"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium">End</span>
                    <input
                      type="time"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={qhForm.endTime}
                      onChange={(e) => setQhForm((f) => ({ ...f, endTime: e.target.value }))}
                      aria-label="Quiet hours end time"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="font-medium">Timezone</span>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={qhForm.timezone}
                      onChange={(e) => setQhForm((f) => ({ ...f, timezone: e.target.value }))}
                      aria-label="Quiet hours timezone"
                      placeholder="Asia/Manila"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await NotificationService.putQuietHours({
                        label: qhForm.label,
                        channel: 'ALL',
                        timezone: qhForm.timezone,
                        daysOfWeek: qhForm.daysOfWeek,
                        startTime: qhForm.startTime,
                        endTime: qhForm.endTime
                      });
                      if (qhForm.timezone) {
                        await NotificationService.patchPreferences({ timezone: qhForm.timezone, version: global.version });
                      }
                      showNotification('success', 'Notifications', 'Quiet hours saved.');
                      await load();
                    } catch (e: any) {
                      showNotification('error', 'Notifications', e?.message || 'Failed');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                >
                  <Clock className="h-4 w-4" />
                  Save quiet hours
                </button>
                {quietHours.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm">
                    {quietHours.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                        <span>
                          {r.startTime || r.start_time} – {r.endTime || r.end_time} ({r.timezone || 'UTC'})
                        </span>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={async () => {
                            await NotificationService.deleteQuietHour(r.id);
                            await load();
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No quiet hour rules active.</p>
                )}
              </SectionCard>
            )}

            {tab === 'focus' && (
              <SectionCard title="Focus mode" icon={<Focus className="h-4 w-4 text-blue-600" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Temporarily silence optional push (and optionally email). Critical and security notifications remain
                  allowed by default. Syncs across devices.
                </p>
                {focus ? (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                    <p className="font-semibold">Focus mode is active</p>
                    <p className="mt-1">
                      {focus.indefinite
                        ? 'Until you disable it'
                        : focus.endsAt
                          ? `Until ${new Date(focus.endsAt).toLocaleString()}`
                          : 'Active'}
                    </p>
                    <button
                      type="button"
                      className="mt-3 rounded-lg bg-violet-700 px-3 py-1.5 text-white"
                      onClick={async () => {
                        await NotificationService.stopFocusMode();
                        showNotification('success', 'Focus mode', 'Disabled.');
                        await load();
                      }}
                    >
                      Turn off Focus Mode
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_PRESETS.map((p) => (
                      <button
                        key={p.minutes}
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                        onClick={async () => {
                          await NotificationService.startFocusMode({
                            durationMinutes: p.minutes,
                            silencePush: true,
                            allowCritical: true,
                            allowSecurity: true
                          });
                          showNotification('success', 'Focus mode', `On for ${p.label}.`);
                          await load();
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      onClick={async () => {
                        await NotificationService.startFocusMode({
                          untilTomorrowMorning: true,
                          timezone: global.timezone || qhForm.timezone
                        });
                        showNotification('success', 'Focus mode', 'Until tomorrow morning.');
                        await load();
                      }}
                    >
                      Until tomorrow morning
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      onClick={async () => {
                        await NotificationService.startFocusMode({ indefinite: true });
                        showNotification('success', 'Focus mode', 'Indefinite until disabled.');
                        await load();
                      }}
                    >
                      Indefinite
                    </button>
                  </div>
                )}
              </SectionCard>
            )}

            {tab === 'digests' && (
              <>
                <SectionCard title="Digest schedule" icon={<Mail className="h-4 w-4 text-blue-600" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="font-medium">Mode</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                        value={digest.mode || 'off'}
                        onChange={async (e) => {
                          const mode = e.target.value;
                          await NotificationService.putDigestSettings({
                            mode,
                            enabled: mode !== 'off',
                            timezone: global.timezone || qhForm.timezone || 'UTC'
                          });
                          await load();
                        }}
                        aria-label="Digest mode"
                      >
                        {DIGEST_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="font-medium">Timezone</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                        value={digest.timezone || 'UTC'}
                        onChange={async (e) => {
                          await NotificationService.putDigestSettings({ timezone: e.target.value });
                          await load();
                        }}
                        aria-label="Digest timezone"
                      />
                    </label>
                  </div>
                  <div className="mt-3 divide-y divide-slate-100">
                    <Toggle
                      id="digest-email"
                      checked={digest.emailEnabled !== false}
                      onChange={async (v) => {
                        await NotificationService.putDigestSettings({ emailEnabled: v });
                        await load();
                      }}
                      label="Email digests"
                    />
                    <Toggle
                      id="digest-inapp"
                      checked={digest.inAppEnabled !== false}
                      onChange={async (v) => {
                        await NotificationService.putDigestSettings({ inAppEnabled: v });
                        await load();
                      }}
                      label="In-app digest summary"
                    />
                    <Toggle
                      id="digest-push"
                      checked={Boolean(digest.pushReadyAlert)}
                      onChange={async (v) => {
                        await NotificationService.putDigestSettings({ pushReadyAlert: v });
                        await load();
                      }}
                      label="Push when digest is ready"
                    />
                  </div>
                </SectionCard>
                <SectionCard title="Recent digests">
                  {digests.length === 0 ? (
                    <p className="text-sm text-slate-500">No digests yet. Digests appear after a scheduled run.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {digests.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                          <div>
                            <div className="font-medium text-slate-900">
                              {d.mode} · {d.itemCount} items
                            </div>
                            <div className="text-xs text-slate-500">
                              {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''} · {d.status}
                            </div>
                          </div>
                          <Link
                            to={`/notifications?digest=${d.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </>
            )}

            {tab === 'devices' && (
              <SectionCard title="Registered devices" icon={<Smartphone className="h-4 w-4 text-blue-600" />}>
                <p className="mb-3 text-sm text-slate-600">
                  Push tokens registered for your account. Removing a device stops push delivery to that installation.
                  Preferences, Focus Mode, and read state still sync over the web session.
                </p>
                {devices.length === 0 ? (
                  <p className="text-sm text-slate-500">No devices registered yet. Open the Android app while signed in to register push.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {devices.map((d) => (
                      <li key={d.id || d.deviceId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <div className="font-medium text-slate-900">
                            {d.deviceName || d.platform || 'Device'} · {d.platform}
                          </div>
                          <div className="text-xs text-slate-500">
                            Status: {d.pushStatus || 'active'}
                            {d.appVersion ? ` · app ${d.appVersion}` : ''}
                            {d.lastSeenAt ? ` · last seen ${new Date(d.lastSeenAt).toLocaleString()}` : ''}
                            {d.lastSyncAt ? ` · synced ${new Date(d.lastSyncAt).toLocaleString()}` : ''}
                          </div>
                          {d.tokenPrefix ? (
                            <div className="font-mono text-[11px] text-slate-400">token {d.tokenPrefix}…</div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          onClick={async () => {
                            const key = d.deviceId || d.id;
                            if (!key) return;
                            if (!window.confirm('Remove this device’s push registration?')) return;
                            try {
                              await NotificationService.removeDevice(String(key));
                              showNotification('success', 'Devices', 'Device removed.');
                              await load();
                            } catch (e: any) {
                              showNotification('error', 'Devices', e?.message || 'Failed to remove device');
                            }
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            )}

            {tab === 'privacy' && (
              <SectionCard title="Preview and privacy" icon={<Shield className="h-4 w-4 text-blue-600" />}>
                <div className="divide-y divide-slate-100">
                  <Toggle
                    id="show-previews"
                    checked={global.showPreviews !== false}
                    onChange={(v) => void saveGlobal({ showPreviews: v })}
                    label="Show notification previews"
                    description="When off, email digests avoid highly sensitive message bodies."
                  />
                  <Toggle
                    id="sync-read"
                    checked={global.syncReadState !== false}
                    onChange={(v) => void saveGlobal({ syncReadState: v })}
                    label="Sync read state across devices"
                  />
                  <Toggle
                    id="group-similar"
                    checked={global.groupSimilar !== false}
                    onChange={(v) => void saveGlobal({ groupSimilar: v })}
                    label="Group similar notifications"
                  />
                </div>
              </SectionCard>
            )}

            {saving ? (
              <p className="text-center text-xs text-slate-500" role="status" aria-live="polite">
                Saving…
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationSettings;
