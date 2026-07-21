import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Snowflake
} from 'lucide-react';
import type {
  Currency,
  FxHealth,
  FxLockRecord,
  FxManualOverrideRecord,
  FxProviderRecord,
  FxSnapshotRecord,
  FxSystemConfig
} from '../../../types';

type FxControlPlanePanelProps = {
  currencies: Currency[];
  fxConfig: FxSystemConfig;
  onFxConfigChange: (
    updater: FxSystemConfig | ((current: FxSystemConfig) => FxSystemConfig)
  ) => void;
  providers: FxProviderRecord[];
  health: FxHealth | null;
  snapshots: FxSnapshotRecord[];
  overrides: FxManualOverrideRecord[];
  locks: FxLockRecord[];
  busyAction?: string | null;
  onRefresh: () => Promise<void> | void;
  onRunSync: () => Promise<void> | void;
  onUpdateProvider: (
    code: string,
    payload: Partial<Pick<FxProviderRecord, 'enabled' | 'priority' | 'baseUrl' | 'settingsJson'>>
  ) => Promise<void> | void;
  onApproveSnapshot: (id: string, freeze?: boolean) => Promise<void> | void;
  onSetSnapshotFrozen: (id: string, frozen: boolean) => Promise<void> | void;
  onCreateOverride: (payload: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    reason: string;
  }) => Promise<void> | void;
  onApproveOverride: (id: string) => Promise<void> | void;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const statusBadgeClass = (status?: string | null) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'APPROVED' || normalized === 'SUCCESS') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (normalized === 'PENDING' || normalized === 'RUNNING' || normalized === 'INITIATED') {
    return 'bg-amber-100 text-amber-700';
  }
  if (normalized === 'FAILED' || normalized === 'ERROR' || normalized === 'REJECTED') {
    return 'bg-rose-100 text-rose-700';
  }
  return 'bg-slate-100 text-slate-700';
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

const FxControlPlanePanel: React.FC<FxControlPlanePanelProps> = ({
  currencies,
  fxConfig,
  onFxConfigChange,
  providers,
  health,
  snapshots,
  overrides,
  locks,
  busyAction,
  onRefresh,
  onRunSync,
  onUpdateProvider,
  onApproveSnapshot,
  onSetSnapshotFrozen,
  onCreateOverride,
  onApproveOverride
}) => {
  const [overrideDraft, setOverrideDraft] = useState({
    fromCurrency: fxConfig.syncBaseCurrency || 'USD',
    toCurrency: '',
    rate: '',
    effectiveFrom: '',
    effectiveTo: '',
    reason: ''
  });
  const [providerDrafts, setProviderDrafts] = useState<
    Record<string, { enabled: boolean; priority: number; baseUrl: string }>
  >({});

  useEffect(() => {
    setOverrideDraft((prev) => ({
      ...prev,
      fromCurrency: prev.fromCurrency || fxConfig.syncBaseCurrency || 'USD'
    }));
  }, [fxConfig.syncBaseCurrency]);

  useEffect(() => {
    const nextDrafts: Record<string, { enabled: boolean; priority: number; baseUrl: string }> = {};
    providers.forEach((provider) => {
      nextDrafts[provider.code] = {
        enabled: Boolean(provider.enabled),
        priority: Number(provider.priority || 0),
        baseUrl: String(provider.baseUrl || '')
      };
    });
    setProviderDrafts(nextDrafts);
  }, [providers]);

  const activeCurrencyCodes = useMemo(
    () => currencies.filter((entry) => entry.isActive !== false).map((entry) => entry.code),
    [currencies]
  );

  const currentSnapshot = health?.snapshot || null;
  const latestSyncStatus = String((health?.latestSync as any)?.status || '').trim().toUpperCase();

  const submitOverride = async () => {
    const payload = {
      fromCurrency: String(overrideDraft.fromCurrency || '').trim().toUpperCase(),
      toCurrency: String(overrideDraft.toCurrency || '').trim().toUpperCase(),
      rate: Number(overrideDraft.rate),
      effectiveFrom: overrideDraft.effectiveFrom || undefined,
      effectiveTo: overrideDraft.effectiveTo || null,
      reason: String(overrideDraft.reason || '').trim()
    };
    if (!payload.fromCurrency || !payload.toCurrency || !Number.isFinite(payload.rate) || payload.rate <= 0 || !payload.reason) {
      return;
    }
    await onCreateOverride(payload);
    setOverrideDraft((prev) => ({
      ...prev,
      toCurrency: '',
      rate: '',
      effectiveFrom: '',
      effectiveTo: '',
      reason: ''
    }));
  };

  return (
    <div className="space-y-6 min-w-0 w-full max-w-full">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 min-w-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FX Engine</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{fxConfig.enabled ? 'Enabled' : 'Disabled'}</p>
            </div>
            <ShieldCheck className={`h-5 w-5 ${fxConfig.enabled ? 'text-emerald-500' : 'text-slate-300'}`} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Configuration changes here are persisted when you click Save Settings.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Snapshot</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{currentSnapshot?.id || 'No approved snapshot'}</p>
            </div>
            <Database className="h-5 w-5 text-blue-500" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Provider: {currentSnapshot?.providerCode || fxConfig.providerCode}</p>
          <p className="mt-1 text-xs text-slate-500">
            Updated: {formatDateTime(currentSnapshot?.approvedAt || currentSnapshot?.fetchedAt)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sync Status</p>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(latestSyncStatus || 'idle')}`}>
                {latestSyncStatus || 'IDLE'}
              </span>
            </div>
            <RefreshCw className={`h-5 w-5 ${busyAction === 'sync' ? 'animate-spin text-blue-500' : 'text-slate-400'}`} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Last sync: {formatDateTime((health?.latestSync as any)?.finishedAt || (health?.latestSync as any)?.startedAt)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Locks Created</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{Number(health?.lockCount || 0)}</p>
            </div>
            <Lock className="h-5 w-5 text-violet-500" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Active currencies: {Number(health?.currencyCount || activeCurrencyCodes.length)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-slate-900">FX Runtime Policy</h4>
            <p className="text-sm text-slate-500">This governs approved-snapshot resolution, fallback behavior, and background sync cadence.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {busyAction === 'refresh' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void onRunSync()}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {busyAction === 'sync' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Run Sync
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Engine Enabled</span>
            <select
              className={inputClass}
              value={fxConfig.enabled ? 'true' : 'false'}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  enabled: event.target.value === 'true'
                }))
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Provider Code</span>
            <select
              className={inputClass}
              value={fxConfig.providerCode}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  providerCode: event.target.value
                }))
              }
            >
              {providers.map((provider) => (
                <option key={provider.code} value={provider.code}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Sync Base Currency</span>
            <input className={inputClass} value={fxConfig.syncBaseCurrency} disabled />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Refresh Enabled</span>
            <select
              className={inputClass}
              value={fxConfig.refreshEnabled ? 'true' : 'false'}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  refreshEnabled: event.target.value === 'true'
                }))
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Auto-Approve Snapshots</span>
            <select
              className={inputClass}
              value={fxConfig.autoApproveSnapshots ? 'true' : 'false'}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  autoApproveSnapshots: event.target.value === 'true'
                }))
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Fallback To Stored Rates</span>
            <select
              className={inputClass}
              value={fxConfig.fallbackToStoredRates ? 'true' : 'false'}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  fallbackToStoredRates: event.target.value === 'true'
                }))
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Refresh Cron</span>
            <input
              className={inputClass}
              value={fxConfig.refreshCron}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  refreshCron: event.target.value
                }))
              }
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Stale Threshold (seconds)</span>
            <input
              type="number"
              min="60"
              className={inputClass}
              value={fxConfig.staleAfterSeconds}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  staleAfterSeconds: Math.max(60, Number(event.target.value || current.staleAfterSeconds))
                }))
              }
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Source Base URL</span>
            <input
              className={inputClass}
              value={fxConfig.sourceBaseUrl}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  sourceBaseUrl: event.target.value
                }))
              }
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Source Provider</span>
            <input
              className={inputClass}
              value={fxConfig.sourceProvider}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  sourceProvider: event.target.value.toUpperCase()
                }))
              }
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Timezone</span>
            <input
              className={inputClass}
              value={fxConfig.timezone}
              onChange={(event) =>
                onFxConfigChange((current) => ({
                  ...current,
                  timezone: event.target.value
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-bold text-slate-900">Providers</h4>
              <p className="text-sm text-slate-500">Enable, prioritize, and pin the source endpoints Scrolith is allowed to use.</p>
            </div>
            <Database className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 space-y-3">
            {providers.map((provider) => {
              const draft = providerDrafts[provider.code] || {
                enabled: provider.enabled,
                priority: provider.priority,
                baseUrl: String(provider.baseUrl || '')
              };
              const providerBusy = busyAction === `provider:${provider.code}`;
              return (
                <div key={provider.code} className="rounded-xl border border-slate-200 p-4">
                  <div className="grid gap-3 md:grid-cols-[1.3fr_0.8fr_1fr_auto] md:items-end">
                    <div>
                      <p className="font-semibold text-slate-900">{provider.name}</p>
                      <p className="text-xs text-slate-500">{provider.code} · {provider.kind}</p>
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Enabled</span>
                      <select
                        className={inputClass}
                        value={draft.enabled ? 'true' : 'false'}
                        onChange={(event) =>
                          setProviderDrafts((current) => ({
                            ...current,
                            [provider.code]: {
                              ...draft,
                              enabled: event.target.value === 'true'
                            }
                          }))
                        }
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Priority</span>
                      <input
                        type="number"
                        className={inputClass}
                        value={draft.priority}
                        onChange={(event) =>
                          setProviderDrafts((current) => ({
                            ...current,
                            [provider.code]: {
                              ...draft,
                              priority: Number(event.target.value || 0)
                            }
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void onUpdateProvider(provider.code, draft)}
                      className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      {providerBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </button>
                  </div>

                  <label className="mt-3 block space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Base URL</span>
                    <input
                      className={inputClass}
                      value={draft.baseUrl}
                      onChange={(event) =>
                        setProviderDrafts((current) => ({
                          ...current,
                          [provider.code]: {
                            ...draft,
                            baseUrl: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-bold text-slate-900">Overrides</h4>
              <p className="text-sm text-slate-500">Create pair-specific overrides without mutating the underlying approved snapshot history.</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">From</span>
              <select
                className={inputClass}
                value={overrideDraft.fromCurrency}
                onChange={(event) => setOverrideDraft((prev) => ({ ...prev, fromCurrency: event.target.value }))}
              >
                {activeCurrencyCodes.map((code) => (
                  <option key={`from-${code}`} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">To</span>
              <select
                className={inputClass}
                value={overrideDraft.toCurrency}
                onChange={(event) => setOverrideDraft((prev) => ({ ...prev, toCurrency: event.target.value }))}
              >
                <option value="">Select currency</option>
                {activeCurrencyCodes
                  .filter((code) => code !== overrideDraft.fromCurrency)
                  .map((code) => (
                    <option key={`to-${code}`} value={code}>
                      {code}
                    </option>
                  ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Override Rate</span>
              <input
                type="number"
                step="0.00000001"
                min="0.00000001"
                className={inputClass}
                value={overrideDraft.rate}
                onChange={(event) => setOverrideDraft((prev) => ({ ...prev, rate: event.target.value }))}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Effective From</span>
              <input
                type="datetime-local"
                className={inputClass}
                value={overrideDraft.effectiveFrom}
                onChange={(event) => setOverrideDraft((prev) => ({ ...prev, effectiveFrom: event.target.value }))}
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Effective To</span>
              <input
                type="datetime-local"
                className={inputClass}
                value={overrideDraft.effectiveTo}
                onChange={(event) => setOverrideDraft((prev) => ({ ...prev, effectiveTo: event.target.value }))}
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Reason</span>
              <textarea
                className={`${inputClass} min-h-[96px]`}
                value={overrideDraft.reason}
                onChange={(event) => setOverrideDraft((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Explain why this pair needs an override."
              />
            </label>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => void submitOverride()}
                className="inline-flex items-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                {busyAction === 'override:create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                Create Override
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {overrides.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No overrides created yet.</p>
            ) : (
              overrides.map((override) => (
                <div key={override.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {override.fromCurrency}/{override.toCurrency} · {Number(override.rate).toFixed(8)}
                      </p>
                      <p className="text-xs text-slate-500">{override.reason}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(override.status)}`}>
                      {override.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>From: {formatDateTime(override.effectiveFrom)}</span>
                    <span>To: {formatDateTime(override.effectiveTo)}</span>
                  </div>
                  {String(override.status || '').toUpperCase() !== 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => void onApproveOverride(override.id)}
                      className="mt-3 inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      {busyAction === `override:approve:${override.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Approve Override
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-slate-900">Snapshots</h4>
            <p className="text-sm text-slate-500">Approve or freeze reference snapshots before they become the platform authority.</p>
          </div>
          <Snowflake className="h-5 w-5 text-sky-500" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Snapshot</th>
                <th className="px-3 py-3">Provider</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Source Time</th>
                <th className="px-3 py-3">Frozen</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshots.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    No snapshots recorded yet.
                  </td>
                </tr>
              ) : (
                snapshots.map((snapshot) => {
                  const status = String(snapshot.status || '').toUpperCase();
                  return (
                    <tr key={snapshot.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">{snapshot.id}</td>
                      <td className="px-3 py-3 text-slate-600">{snapshot.providerCode}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(snapshot.sourceTimestamp)}</td>
                      <td className="px-3 py-3 text-slate-600">{snapshot.isFrozen ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {status !== 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => void onApproveSnapshot(snapshot.id, false)}
                              className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              {busyAction === `snapshot:approve:${snapshot.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Approve'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              status === 'APPROVED'
                                ? void onSetSnapshotFrozen(snapshot.id, !snapshot.isFrozen)
                                : void onApproveSnapshot(snapshot.id, true)
                            }
                            className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            {busyAction === `snapshot:freeze:${snapshot.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : snapshot.isFrozen ? 'Unfreeze' : 'Freeze'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-slate-900">Recent Locks</h4>
            <p className="text-sm text-slate-500">Immutable locks are what financial flows should use for wallet, order, and withdrawal settlement.</p>
          </div>
          <Lock className="h-5 w-5 text-violet-500" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Entity</th>
                <th className="px-3 py-3">Pair</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Rate</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locks.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    No FX locks created yet.
                  </td>
                </tr>
              ) : (
                locks.map((lock) => (
                  <tr key={lock.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{lock.entityType}</div>
                      <div className="text-xs text-slate-500">{lock.entityId}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {lock.fromCurrency}/{lock.toCurrency}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {Number(lock.sourceAmount).toFixed(2)} → {Number(lock.convertedAmount).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{Number(lock.rate).toFixed(8)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(lock.rateSource)}`}>
                          {lock.rateSource}
                        </span>
                        {lock.stale && <span className="text-xs font-semibold text-amber-600">STALE</span>}
                        {lock.isFrozenSnapshot && <span className="text-xs font-semibold text-sky-600">FROZEN</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDateTime(lock.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FxControlPlanePanel;
