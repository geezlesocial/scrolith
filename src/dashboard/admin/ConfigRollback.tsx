import React, { useEffect, useMemo, useState } from 'react';
import { Database, GitBranch, History, RefreshCw, RotateCcw } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type ConfigSummary = {
  scopes: number;
  snapshots: number;
  changes: number;
  rollbacks: number;
  releases: number;
};

type ConfigScopeRow = {
  scope: string;
  key: string;
  label: string;
  description: string;
  category: string;
  snapshotCount: number;
  latestSnapshotVersion: number;
  latestSnapshotAt?: string | null;
};

type ConfigSnapshotRow = {
  id: string;
  scope: string;
  key: string;
  label: string;
  version: number;
  source: string;
  reason?: string;
  createdAt: string;
};

type ConfigChangeRow = {
  id: string;
  scope: string;
  key: string;
  action: string;
  reason?: string;
  createdAt: string;
  beforeVersion?: number | null;
  afterVersion?: number | null;
};

type RollbackRunRow = {
  id: string;
  scope: string;
  key: string;
  targetVersion: number;
  status: string;
  notes?: string;
  createdAt: string;
  completedAt?: string | null;
  beforeVersion?: number | null;
  afterVersion?: number | null;
};

type ReleaseRow = {
  id: string;
  scope: string;
  key?: string | null;
  releaseKey: string;
  label: string;
  notes?: string;
  createdAt: string;
};

const emptySummary: ConfigSummary = {
  scopes: 0,
  snapshots: 0,
  changes: 0,
  rollbacks: 0,
  releases: 0
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const ConfigRollback: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [runningRollback, setRunningRollback] = useState(false);
  const [savingRelease, setSavingRelease] = useState(false);

  const [summary, setSummary] = useState<ConfigSummary>(emptySummary);
  const [scopes, setScopes] = useState<ConfigScopeRow[]>([]);
  const [selectedScope, setSelectedScope] = useState('');
  const [currentPayload, setCurrentPayload] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<ConfigSnapshotRow[]>([]);
  const [changes, setChanges] = useState<ConfigChangeRow[]>([]);
  const [rollbacks, setRollbacks] = useState<RollbackRunRow[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);

  const [snapshotReason, setSnapshotReason] = useState('');
  const [targetRollbackVersion, setTargetRollbackVersion] = useState('');
  const [rollbackNotes, setRollbackNotes] = useState('');
  const [releaseForm, setReleaseForm] = useState({
    releaseKey: '',
    label: '',
    notes: ''
  });

  const selectedScopeRow = useMemo(
    () => scopes.find((entry) => entry.scope === selectedScope) || null,
    [scopes, selectedScope]
  );

  const payloadPreview = useMemo(() => {
    try {
      return JSON.stringify(currentPayload?.payload ?? currentPayload ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }, [currentPayload]);

  const loadSummary = async () => {
    const data = await AdminService.getConfigRollbackSummary();
    setSummary(data || emptySummary);
  };

  const loadScopes = async () => {
    const rows = await AdminService.getConfigScopes();
    setScopes(Array.isArray(rows) ? rows : []);
    setSelectedScope((current) => {
      if (current && rows.some((entry: ConfigScopeRow) => entry.scope === current)) return current;
      return rows[0]?.scope || '';
    });
  };

  const loadScopeData = async (scope: string) => {
    if (!scope) {
      setCurrentPayload(null);
      setSnapshots([]);
      setChanges([]);
      setRollbacks([]);
      return;
    }

    const [current, snapshotRows, changeRows, rollbackRows] = await Promise.all([
      AdminService.getCurrentConfigPayload(scope),
      AdminService.getConfigSnapshots({ scope, limit: 20 }),
      AdminService.getConfigChanges({ scope, limit: 20 }),
      AdminService.getConfigRollbacks({ scope, limit: 20 })
    ]);

    setCurrentPayload(current || null);
    setSnapshots(Array.isArray(snapshotRows) ? snapshotRows : []);
    setChanges(Array.isArray(changeRows) ? changeRows : []);
    setRollbacks(Array.isArray(rollbackRows) ? rollbackRows : []);
  };

  const loadReleases = async () => {
    const rows = await AdminService.getConfigReleaseRollouts({ limit: 20 });
    setReleases(Array.isArray(rows) ? rows : []);
  };

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadSummary(), loadScopes(), loadReleases()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await Promise.all([loadSummary(), loadScopes(), loadReleases()]);
      } catch (error: any) {
        showNotification('alert', 'Config Center Error', error?.message || 'Failed to load Config and Rollback foundations.');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (loading || !selectedScope) return;
    loadScopeData(selectedScope).catch((error: any) => {
      showNotification('alert', 'Config Scope Error', error?.message || 'Failed to load config scope data.');
    });
  }, [selectedScope, loading]);

  useEffect(() => {
    if (!targetRollbackVersion && snapshots.length > 0) {
      setTargetRollbackVersion(String(snapshots[0].version));
    }
  }, [snapshots, targetRollbackVersion]);

  useEffect(() => {
    const refresh = () => {
      refreshAll()
        .then(() => (selectedScope ? loadScopeData(selectedScope) : Promise.resolve()))
        .catch(() => null);
    };

    window.addEventListener('config:snapshot_created', refresh as EventListener);
    window.addEventListener('config:rollback_completed', refresh as EventListener);
    window.addEventListener('config:release_logged', refresh as EventListener);
    return () => {
      window.removeEventListener('config:snapshot_created', refresh as EventListener);
      window.removeEventListener('config:rollback_completed', refresh as EventListener);
      window.removeEventListener('config:release_logged', refresh as EventListener);
    };
  }, [selectedScope]);

  const handleCreateSnapshot = async () => {
    if (!selectedScope) {
      showNotification('info', 'Select Scope', 'Choose a config scope before creating a snapshot.');
      return;
    }

    try {
      setCreatingSnapshot(true);
      await AdminService.createConfigSnapshot({
        scope: selectedScope,
        reason: snapshotReason || null
      });
      showNotification('success', 'Snapshot Created', 'A new config snapshot was created successfully.');
      setSnapshotReason('');
      await Promise.all([loadSummary(), loadScopes(), loadScopeData(selectedScope)]);
    } catch (error: any) {
      showNotification('alert', 'Snapshot Failed', error?.message || 'Failed to create config snapshot.');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedScope) {
      showNotification('info', 'Select Scope', 'Choose a config scope before running rollback.');
      return;
    }

    const targetVersion = Number(targetRollbackVersion);
    if (!Number.isFinite(targetVersion) || targetVersion <= 0) {
      showNotification('info', 'Select Version', 'Choose a valid snapshot version to rollback.');
      return;
    }

    if (!window.confirm(`Rollback ${selectedScopeRow?.label || selectedScope} to version ${targetVersion}?`)) {
      return;
    }

    try {
      setRunningRollback(true);
      await AdminService.rollbackConfigScope({
        scope: selectedScope,
        targetVersion,
        notes: rollbackNotes || null
      });
      showNotification('success', 'Rollback Completed', `Config scope restored to snapshot version ${targetVersion}.`);
      setRollbackNotes('');
      await Promise.all([loadSummary(), loadScopes(), loadScopeData(selectedScope), loadReleases()]);
    } catch (error: any) {
      showNotification('alert', 'Rollback Failed', error?.message || 'Failed to rollback selected config scope.');
    } finally {
      setRunningRollback(false);
    }
  };

  const handleLogRelease = async () => {
    if (!selectedScope) {
      showNotification('info', 'Select Scope', 'Choose a config scope before logging a release.');
      return;
    }

    if (!releaseForm.releaseKey.trim() || !releaseForm.label.trim()) {
      showNotification('info', 'Release Details Required', 'Enter both a release key and label.');
      return;
    }

    try {
      setSavingRelease(true);
      await AdminService.createConfigReleaseRollout({
        scope: selectedScope,
        releaseKey: releaseForm.releaseKey.trim(),
        label: releaseForm.label.trim(),
        notes: releaseForm.notes.trim() || null
      });
      showNotification('success', 'Release Logged', 'Release rollout note saved successfully.');
      setReleaseForm({ releaseKey: '', label: '', notes: '' });
      await Promise.all([loadSummary(), loadReleases(), loadScopeData(selectedScope)]);
    } catch (error: any) {
      showNotification('alert', 'Release Log Failed', error?.message || 'Failed to log release rollout.');
    } finally {
      setSavingRelease(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading Config and Rollback foundations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Config and Rollback Foundations</h2>
          <p className="text-sm text-gray-500">
            Native snapshots, rollback runs, and release logging for live Scrolith configuration scopes.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              await refreshAll();
              if (selectedScope) await loadScopeData(selectedScope);
              showNotification('success', 'Config Center Refreshed', 'Latest config data loaded.');
            } catch (error: any) {
              showNotification('alert', 'Refresh Failed', error?.message || 'Failed to refresh config data.');
            }
          }}
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Scopes', value: summary.scopes },
          { label: 'Snapshots', value: summary.snapshots },
          { label: 'Changes', value: summary.changes },
          { label: 'Rollbacks', value: summary.rollbacks },
          { label: 'Releases', value: summary.releases }
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Scope Control</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">Config Scope</span>
                <select
                  value={selectedScope}
                  onChange={(event) => {
                    setSelectedScope(event.target.value);
                    setTargetRollbackVersion('');
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  {scopes.map((scope) => (
                    <option key={scope.scope} value={scope.scope}>
                      {scope.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm text-gray-700">
                <div className="font-semibold text-slate-900">{selectedScopeRow?.label || 'No scope selected'}</div>
                <div className="mt-1 text-xs text-gray-500">{selectedScopeRow?.description || 'Select a scope.'}</div>
                <div className="mt-2 text-xs text-gray-500">
                  Snapshots: {selectedScopeRow?.snapshotCount || 0} · Latest version: {selectedScopeRow?.latestSnapshotVersion || 0}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-semibold text-gray-900">Create Snapshot</div>
                <textarea
                  value={snapshotReason}
                  onChange={(event) => setSnapshotReason(event.target.value)}
                  rows={3}
                  placeholder="Reason for this snapshot"
                  className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  onClick={handleCreateSnapshot}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {creatingSnapshot ? 'Creating...' : 'Create Snapshot'}
                </button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <RotateCcw className="h-4 w-4" />
                  Rollback Scope
                </div>
                <select
                  value={targetRollbackVersion}
                  onChange={(event) => setTargetRollbackVersion(event.target.value)}
                  className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select snapshot version</option>
                  {snapshots.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.version}>
                      Version {snapshot.version} · {snapshot.source}
                    </option>
                  ))}
                </select>
                <textarea
                  value={rollbackNotes}
                  onChange={(event) => setRollbackNotes(event.target.value)}
                  rows={3}
                  placeholder="Rollback note"
                  className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  onClick={handleRollback}
                  className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  {runningRollback ? 'Rolling Back...' : 'Run Rollback'}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold text-gray-900">Current Payload Preview</div>
              <textarea
                value={payloadPreview}
                readOnly
                rows={14}
                className="w-full rounded-lg border border-gray-200 bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-200"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Snapshots</h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                        No snapshots recorded for this scope.
                      </td>
                    </tr>
                  ) : (
                    snapshots.map((snapshot) => (
                      <tr key={snapshot.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">v{snapshot.version}</td>
                        <td className="px-4 py-3 text-gray-700">{snapshot.source}</td>
                        <td className="px-4 py-3 text-gray-500">{snapshot.reason || '-'}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDateTime(snapshot.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Release Rollout Notes</h3>
            </div>

            <div className="space-y-3">
              <input
                value={releaseForm.releaseKey}
                onChange={(event) => setReleaseForm((current) => ({ ...current, releaseKey: event.target.value }))}
                placeholder="release-20260326-config"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={releaseForm.label}
                onChange={(event) => setReleaseForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Config foundations rollout"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <textarea
                value={releaseForm.notes}
                onChange={(event) => setReleaseForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                placeholder="Release note or operator context"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <button
                onClick={handleLogRelease}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {savingRelease ? 'Saving...' : 'Log Release'}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-bold text-gray-900">Rollback History</h3>
            </div>
            <div className="space-y-3 p-4">
              {rollbacks.length === 0 ? (
                <div className="text-sm text-gray-400">No rollback runs recorded for this scope.</div>
              ) : (
                rollbacks.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900">Version {entry.targetVersion}</div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {entry.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Before v{entry.beforeVersion ?? '-'} · After v{entry.afterVersion ?? '-'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{entry.notes || 'No notes provided.'}</div>
                    <div className="mt-2 text-xs text-gray-400">{formatDateTime(entry.completedAt || entry.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-bold text-gray-900">Release Log</h3>
            </div>
            <div className="space-y-3 p-4">
              {releases.length === 0 ? (
                <div className="text-sm text-gray-400">No release notes logged yet.</div>
              ) : (
                releases.map((release) => (
                  <div key={release.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="font-semibold text-slate-900">{release.label}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {release.releaseKey} · {release.scope}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{release.notes || 'No notes provided.'}</div>
                    <div className="mt-2 text-xs text-gray-400">{formatDateTime(release.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Change Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Versions</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {changes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                      No config change log entries yet.
                    </td>
                  </tr>
                ) : (
                  changes.map((entry) => (
                    <tr key={entry.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{entry.action}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {entry.beforeVersion ? `v${entry.beforeVersion}` : '-'} → {entry.afterVersion ? `v${entry.afterVersion}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{entry.reason || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDateTime(entry.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Supported Scopes</h3>
          </div>
          <div className="space-y-3 p-4">
            {scopes.map((scope) => (
              <button
                key={scope.scope}
                onClick={() => setSelectedScope(scope.scope)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedScope === scope.scope
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-slate-900">{scope.label}</div>
                <div className="mt-1 text-xs text-gray-500">{scope.description}</div>
                <div className="mt-2 text-xs text-gray-400">
                  Category: {scope.category} · Snapshots: {scope.snapshotCount} · Latest version: {scope.latestSnapshotVersion || 0}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigRollback;
