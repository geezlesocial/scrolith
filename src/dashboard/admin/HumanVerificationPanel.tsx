import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldOff
} from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import HumanVerificationService from '../../services/humanVerification';

const CHALLENGE_TYPES = [
  'arithmetic',
  'sequence',
  'shape_count',
  'icon_count',
  'largest_number',
  'smallest_number',
  'odd_even',
  'color',
  'emoji',
  'pattern',
  'logic',
  'time',
  'object',
  'word',
  'letter',
  'common_sense'
] as const;

const ENDPOINTS = [
  ['login', 'Login'],
  ['signup', 'Signup'],
  ['forgot_password', 'Forgot Password'],
  ['password_reset', 'Password Reset'],
  ['support', 'Support'],
  ['contact', 'Contact'],
  ['report', 'Report Abuse'],
  ['feedback', 'Feedback'],
  ['api', 'Public API'],
  ['marketplace', 'Marketplace'],
  ['jobs', 'Jobs'],
  ['generic', 'Generic']
] as const;

const Toggle = ({
  enabled,
  onChange,
  label
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
      enabled ? 'bg-green-600' : 'bg-gray-200'
    }`}
    aria-pressed={enabled}
    aria-label={label || 'Toggle'}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
        enabled ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

const HumanVerificationPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [settings, setSettings] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        HumanVerificationService.getAdminSettings(),
        HumanVerificationService.getAdminAnalytics(days)
      ]);
      setSettings(s);
      setAnalytics(a);
    } catch (err: any) {
      showNotification(
        'alert',
        'Human Verification',
        err?.response?.data?.error || err?.message || 'Failed to load settings'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const patch = (path: string, value: unknown) => {
    setSettings((prev: any) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let cur: any = next;
      for (let i = 0; i < parts.length - 1; i += 1) {
        cur[parts[i]] = cur[parts[i]] ?? {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await HumanVerificationService.updateAdminSettings(settings);
      setSettings(updated);
      showNotification('success', 'Saved', 'Scrolith Human Verification settings updated.');
    } catch (err: any) {
      showNotification(
        'alert',
        'Save failed',
        err?.response?.data?.error || err?.message || 'Unable to save'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading Scrolith Human Verification…
      </div>
    );
  }

  if (!settings) return null;

  const totals = analytics?.totals || {};

  return (
    <div className="space-y-6" data-testid="human-verification-admin">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            Scrolith Human Verification
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Built-in privacy-friendly CAPTCHA alternative. No Google reCAPTCHA required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-gray-900">Master Enable</h4>
              <p className="text-xs text-gray-500">When off, all endpoints skip verification.</p>
            </div>
            <Toggle
              enabled={Boolean(settings.masterEnabled)}
              onChange={(v) => patch('masterEnabled', v)}
              label="Master enable"
            />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-amber-900">
              <ShieldOff className="h-4 w-4" />
              Emergency disable
            </div>
            <Toggle
              enabled={Boolean(settings.emergencyDisabled)}
              onChange={(v) => patch('emergencyDisabled', v)}
              label="Emergency disable"
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="font-semibold text-gray-900">Difficulty</h4>
          <select
            className="mt-2 w-full rounded-lg border border-gray-300 p-2.5"
            value={settings.difficulty || 'automatic'}
            onChange={(e) => patch('difficulty', e.target.value)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="extreme">Extreme</option>
            <option value="automatic">Automatic</option>
          </select>
          <p className="mt-2 text-xs text-gray-500">
            Automatic escalates difficulty after failed attempts when progressive mode is on.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h4 className="mb-3 font-semibold text-gray-900">Protected endpoints</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENDPOINTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm text-gray-800">{label}</span>
              <Toggle
                enabled={Boolean(settings.endpoints?.[key])}
                onChange={(v) =>
                  setSettings((prev: any) => ({
                    ...prev,
                    endpoints: { ...prev.endpoints, [key]: v }
                  }))
                }
                label={label}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h4 className="mb-3 font-semibold text-gray-900">Challenge types</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CHALLENGE_TYPES.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={Boolean(settings.challengeTypes?.[t])}
                onChange={(e) =>
                  setSettings((prev: any) => ({
                    ...prev,
                    challengeTypes: { ...prev.challengeTypes, [t]: e.target.checked }
                  }))
                }
              />
              <span className="capitalize text-gray-700">{t.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="font-semibold text-gray-900">Timing & limits</h4>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(
              [
                ['timing.expirationSeconds', 'Expiration (sec)', settings.timing?.expirationSeconds],
                [
                  'timing.verificationTtlSeconds',
                  'Token TTL (sec)',
                  settings.timing?.verificationTtlSeconds
                ],
                ['timing.maxAttempts', 'Max attempts', settings.timing?.maxAttempts],
                ['timing.cooldownSeconds', 'Cooldown (sec)', settings.timing?.cooldownSeconds],
                [
                  'timing.lockDurationSeconds',
                  'Lock duration (sec)',
                  settings.timing?.lockDurationSeconds
                ]
              ] as const
            ).map(([path, label, value]) => (
              <label key={path} className="text-xs font-medium text-gray-600">
                {label}
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  value={value ?? 0}
                  onChange={(e) => patch(path, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="font-semibold text-gray-900">Behavior</h4>
          <div className="mt-3 space-y-3">
            {(
              [
                ['alwaysVerify', 'Always verify'],
                ['riskBased', 'Risk-based'],
                ['rememberDevice', 'Remember device'],
                ['skipLoggedInUsers', 'Skip logged-in users'],
                ['skipVerifiedSession', 'Skip verified session'],
                ['progressiveDifficulty', 'Progressive difficulty']
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{label}</span>
                <Toggle
                  enabled={Boolean(settings.behavior?.[key])}
                  onChange={(v) => patch(`behavior.${key}`, v)}
                  label={label}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="font-semibold text-gray-900">Branding</h4>
          <div className="mt-3 space-y-3">
            {(
              [
                ['title', 'Title'],
                ['instructions', 'Instructions'],
                ['successMessage', 'Success message'],
                ['failureMessage', 'Failure message']
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs font-medium text-gray-600">
                {label}
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                  value={settings.branding?.[key] || ''}
                  onChange={(e) => patch(`branding.${key}`, e.target.value)}
                />
              </label>
            ))}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Show logo</span>
              <Toggle
                enabled={Boolean(settings.branding?.showLogo)}
                onChange={(v) => patch('branding.showLogo', v)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="font-semibold text-gray-900">Theme</h4>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-600">
              Mode
              <select
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                value={settings.theme?.mode || 'system'}
                onChange={(e) => patch('theme.mode', e.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">
              Shape
              <select
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                value={settings.theme?.shape || 'rounded'}
                onChange={(e) => patch('theme.shape', e.target.value)}
              >
                <option value="rounded">Rounded</option>
                <option value="square">Square</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">
              Accent color
              <input
                type="color"
                className="mt-1 h-10 w-full rounded-lg border p-1"
                value={settings.theme?.accentColor || '#2563eb'}
                onChange={(e) => patch('theme.accentColor', e.target.value)}
              />
            </label>
            <div className="flex items-end justify-between pb-1">
              <span className="text-sm text-gray-700">Animation</span>
              <Toggle
                enabled={Boolean(settings.theme?.animation)}
                onChange={(v) => patch('theme.animation', v)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-semibold text-gray-900">
            <BarChart3 className="h-5 w-5 text-blue-600" /> Analytics
          </h4>
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Generated', totals.generated],
            ['Solved', totals.solved],
            ['Failed', totals.failed],
            ['Expired', totals.expired],
            ['Success %', totals.successRate],
            ['Failure %', totals.failureRate],
            ['Avg solve ms', totals.averageSolveTimeMs],
            ['Blocked', totals.blocked]
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{value ?? 0}</div>
            </div>
          ))}
        </div>
        {analytics?.note && (
          <p className="mt-3 text-xs text-amber-700">{analytics.note}</p>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {(
            [
              ['Top endpoints', analytics?.topEndpoints],
              ['Top browsers', analytics?.topBrowsers],
              ['Top IPs', analytics?.topIps],
              ['Top countries', analytics?.topCountries]
            ] as const
          ).map(([title, rows]) => (
            <div key={title}>
              <h5 className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-800">
                <Activity className="h-4 w-4" /> {title}
              </h5>
              <ul className="space-y-1 text-sm text-gray-600">
                {(rows || []).slice(0, 5).map((r: any) => (
                  <li key={r.name} className="flex justify-between border-b border-gray-100 py-1">
                    <span className="truncate pr-2">{r.name}</span>
                    <span className="font-medium">{r.count}</span>
                  </li>
                ))}
                {!(rows || []).length && <li className="text-gray-400">No data yet</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HumanVerificationPanel;
