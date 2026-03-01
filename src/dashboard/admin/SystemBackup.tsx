import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';

type BackupMode = 'full' | 'partial';
type RestoreMode = 'replace' | 'append';

type BackupRecord = {
  id: string;
  fileName: string;
  mode: BackupMode;
  sections: string[];
  tables: string[];
  includeFiles: boolean;
  fileCount: number;
  sizeBytes: number;
  createdAt: string;
  createdByAdminEmail: string | null;
  importedAt: string | null;
  lastRestoredAt: string | null;
  restoreCount: number;
  licenseHint: string;
  notes: string | null;
  fileMissing?: boolean;
};

type RestoreState = {
  backupId: string;
  scrolithLicense: string;
  adminEmail: string;
  adminPassword: string;
  mode: RestoreMode;
  includeFiles: boolean;
  usePartialScope: boolean;
  sections: string[];
  customTablesText: string;
};

const parseLines = (value: string) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[\n,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );

const getApiErrorMessage = (error: any, fallback: string) => {
  const payload = error?.response?.data || {};
  const candidates = [
    payload?.error,
    payload?.message,
    payload?.data?.error,
    payload?.data?.message,
    error?.message
  ];
  const message = candidates.find((entry) => typeof entry === 'string' && entry.trim());
  return String(message || fallback || 'Request failed');
};

const formatBytes = (bytes: number) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const createInitialRestoreState = (adminEmail: string): RestoreState => ({
  backupId: '',
  scrolithLicense: '',
  adminEmail,
  adminPassword: '',
  mode: 'replace',
  includeFiles: true,
  usePartialScope: false,
  sections: [],
  customTablesText: ''
});

const SystemBackup: React.FC = () => {
  const { showNotification } = useNotification();
  const { user } = useUser();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedBackupIds, setSelectedBackupIds] = useState<Set<string>>(new Set());
  const [latestLicense, setLatestLicense] = useState<{ backupId: string; license: string } | null>(null);

  const [createMode, setCreateMode] = useState<BackupMode>('full');
  const [createSections, setCreateSections] = useState<string[]>([]);
  const [createCustomTablesText, setCreateCustomTablesText] = useState('');
  const [createIncludeFiles, setCreateIncludeFiles] = useState(true);
  const [createNotes, setCreateNotes] = useState('');

  const [importNotes, setImportNotes] = useState('');
  const [restoreState, setRestoreState] = useState<RestoreState>(() =>
    createInitialRestoreState(String(user?.email || ''))
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      if (silent) setRefreshing(true);
      try {
        const [meta, backupRows] = await Promise.all([
          AdminService.getSystemBackupMeta().catch(() => ({ sections: [] })),
          AdminService.getSystemBackups()
        ]);
        const resolvedSections = Array.isArray(meta?.sections) ? meta.sections : [];
        setSections(resolvedSections);
        setBackups(Array.isArray(backupRows) ? backupRows : []);
      } catch (error: any) {
        showNotification('error', 'System Backup', getApiErrorMessage(error, 'Failed to load backups.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showNotification]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const refresh = () => {
      void loadData(true);
    };
    window.addEventListener('admin:system_backup_updated', refresh as EventListener);
    const pollId = window.setInterval(refresh, 45_000);
    return () => {
      window.removeEventListener('admin:system_backup_updated', refresh as EventListener);
      window.clearInterval(pollId);
    };
  }, [loadData]);

  useEffect(() => {
    setRestoreState((prev) => ({
      ...prev,
      adminEmail: String(user?.email || prev.adminEmail || '')
    }));
  }, [user?.email]);

  const totalSize = useMemo(
    () => backups.reduce((sum, backup) => sum + Number(backup?.sizeBytes || 0), 0),
    [backups]
  );

  const selectedBackups = useMemo(
    () => backups.filter((backup) => selectedBackupIds.has(backup.id)),
    [backups, selectedBackupIds]
  );

  const resetRestoreState = useCallback(() => {
    setRestoreState(createInitialRestoreState(String(user?.email || '')));
  }, [user?.email]);

  const toggleSelectedBackup = (backupId: string) => {
    setSelectedBackupIds((prev) => {
      const next = new Set(prev);
      if (next.has(backupId)) {
        next.delete(backupId);
      } else {
        next.add(backupId);
      }
      return next;
    });
  };

  const toggleCreateSection = (section: string) => {
    setCreateSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return Array.from(next);
    });
  };

  const toggleRestoreSection = (section: string) => {
    setRestoreState((prev) => {
      const next = new Set(prev.sections);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return { ...prev, sections: Array.from(next) };
    });
  };

  const copyLatestLicense = async () => {
    if (!latestLicense?.license) return;
    try {
      await navigator.clipboard.writeText(latestLicense.license);
      showNotification('success', 'License copied', 'Scrolith backup license copied to clipboard.');
    } catch {
      showNotification('info', 'Copy failed', 'Please copy the license manually and store it securely.');
    }
  };

  const handleCreateBackup = async () => {
    if (createMode === 'partial' && !createSections.length && !parseLines(createCustomTablesText).length) {
      showNotification(
        'error',
        'System Backup',
        'Select at least one section or custom table for partial backup.'
      );
      return;
    }
    setCreating(true);
    try {
      const result = await AdminService.createSystemBackup({
        mode: createMode,
        sections: createMode === 'partial' ? createSections : [],
        customTables: createMode === 'partial' ? parseLines(createCustomTablesText) : [],
        includeFiles: createIncludeFiles,
        notes: createNotes.trim()
      });
      const backupId = String(result?.backup?.id || '');
      const license = String(result?.scrolithLicense || '');
      if (backupId && license) {
        setLatestLicense({ backupId, license });
      }
      showNotification('success', 'System Backup', 'Backup created successfully.');
      setCreateNotes('');
      await loadData(true);
    } catch (error: any) {
      showNotification('error', 'System Backup', getApiErrorMessage(error, 'Failed to create backup.'));
    } finally {
      setCreating(false);
    }
  };

  const handleImportBackup = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await AdminService.importSystemBackup(file, importNotes.trim() || undefined);
      const backupId = String(result?.backup?.id || '');
      const license = String(result?.scrolithLicense || '');
      if (backupId && license) {
        setLatestLicense({ backupId, license });
      }
      setImportNotes('');
      if (importInputRef.current) importInputRef.current.value = '';
      showNotification('success', 'System Backup', 'Backup file imported successfully.');
      await loadData(true);
    } catch (error: any) {
      showNotification('error', 'System Backup', getApiErrorMessage(error, 'Failed to import backup.'));
    } finally {
      setImporting(false);
    }
  };

  const downloadBackup = async (backup: BackupRecord) => {
    try {
      const blob = await AdminService.downloadSystemBackup(backup.id);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = backup.fileName || `${backup.id}.scrolith-backup.json.gz`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      showNotification('success', 'Backup Download', 'Backup file download started.');
    } catch (error: any) {
      showNotification('error', 'Backup Download', getApiErrorMessage(error, 'Failed to download backup.'));
    }
  };

  const deleteBackups = async (backupIds: string[]) => {
    if (!backupIds.length) return;
    const confirmed = window.confirm(
      backupIds.length === 1
        ? 'Delete this backup file? This cannot be undone.'
        : `Delete ${backupIds.length} selected backup files? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingIds(new Set(backupIds));
    try {
      if (backupIds.length === 1) {
        await AdminService.deleteSystemBackup(backupIds[0]);
      } else {
        await AdminService.deleteSystemBackups(backupIds);
      }
      setSelectedBackupIds((prev) => {
        const next = new Set(prev);
        backupIds.forEach((id) => next.delete(id));
        return next;
      });
      showNotification('success', 'System Backup', 'Backup file(s) deleted.');
      await loadData(true);
    } catch (error: any) {
      showNotification('error', 'System Backup', getApiErrorMessage(error, 'Failed to delete backup file(s).'));
    } finally {
      setDeletingIds(new Set());
    }
  };

  const openRestore = (backupId: string) => {
    setRestoreState((prev) => ({
      ...createInitialRestoreState(String(user?.email || prev.adminEmail || '')),
      backupId
    }));
  };

  const submitRestore = async () => {
    if (!restoreState.backupId) {
      showNotification('error', 'Restore Backup', 'Select a backup to restore.');
      return;
    }
    if (!restoreState.scrolithLicense.trim()) {
      showNotification('error', 'Restore Backup', 'Scrolith license is required.');
      return;
    }
    if (!restoreState.adminEmail.trim() || !restoreState.adminPassword) {
      showNotification('error', 'Restore Backup', 'Admin email and password are required.');
      return;
    }
    if (
      restoreState.usePartialScope &&
      !restoreState.sections.length &&
      !parseLines(restoreState.customTablesText).length
    ) {
      showNotification('error', 'Restore Backup', 'Select sections or custom tables for partial restore scope.');
      return;
    }

    setRestoring(true);
    try {
      const payload = {
        scrolithLicense: restoreState.scrolithLicense.trim(),
        adminEmail: restoreState.adminEmail.trim(),
        adminPassword: restoreState.adminPassword,
        mode: restoreState.mode,
        includeFiles: restoreState.includeFiles,
        sections: restoreState.usePartialScope ? restoreState.sections : [],
        customTables: restoreState.usePartialScope ? parseLines(restoreState.customTablesText) : []
      };
      await AdminService.restoreSystemBackup(restoreState.backupId, payload);
      showNotification(
        'success',
        'Restore Completed',
        'Backup restore completed. Verify runtime health and clear application cache if needed.'
      );
      resetRestoreState();
      await loadData(true);
    } catch (error: any) {
      showNotification('error', 'Restore Failed', getApiErrorMessage(error, 'Failed to restore backup.'));
    } finally {
      setRestoring(false);
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
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">System Backup Module</h2>
            <p className="text-sm text-gray-600">
              Full and partial backup, migration export/import, license-verified restore, and backup catalog management.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Backup Files</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{backups.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Storage</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatBytes(totalSize)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Selected For Delete</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{selectedBackupIds.size}</p>
          </div>
        </div>
      </section>

      {latestLicense ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <ShieldCheck className="h-4 w-4" />
                Scrolith Restore License Generated
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Store this license securely. It is required together with admin credentials for restore.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyLatestLicense()}
              className="inline-flex items-center rounded-lg border border-amber-400 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy License
            </button>
          </div>
          <p className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-xs text-gray-900">
            {latestLicense.license}
          </p>
          <p className="mt-2 text-xs text-amber-700">Backup ID: {latestLicense.backupId}</p>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">Create Backup</h3>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Backup Mode</span>
              <select
                value={createMode}
                onChange={(event) => setCreateMode(event.target.value === 'partial' ? 'partial' : 'full')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="full">Full backup (entire platform)</option>
                <option value="partial">Partial backup (selected sections)</option>
              </select>
            </label>

            {createMode === 'partial' ? (
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Partial Sections</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  {sections.map((section) => (
                    <label key={section} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={createSections.includes(section)}
                        onChange={() => toggleCreateSection(section)}
                      />
                      <span className="capitalize">{section.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-gray-600">Custom Tables (comma/new line)</span>
                  <textarea
                    rows={3}
                    value={createCustomTablesText}
                    onChange={(event) => setCreateCustomTablesText(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="Example: User, AppSetting, BlogPost"
                  />
                </label>
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={createIncludeFiles}
                onChange={(event) => setCreateIncludeFiles(event.target.checked)}
              />
              Include file snapshots (`data` / `uploads`)
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Backup Notes</span>
              <textarea
                rows={2}
                value={createNotes}
                onChange={(event) => setCreateNotes(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Optional notes for this backup."
              />
            </label>

            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={creating}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Generate Backup
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-emerald-600" />
            <h3 className="text-base font-semibold text-gray-900">Import Backup File</h3>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Backup File (.scrolith-backup.json.gz)</span>
              <input
                ref={importInputRef}
                type="file"
                accept=".gz,.json,.scrolith-backup"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (!file) return;
                  void handleImportBackup(file);
                }}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Import Notes</span>
              <textarea
                rows={3}
                value={importNotes}
                onChange={(event) => setImportNotes(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Optional notes for imported backup."
              />
            </label>

            <p className="text-xs text-gray-500">
              Imported backups receive a newly generated Scrolith restore license for this server environment.
            </p>

            {importing ? (
              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing backup file...
              </div>
            ) : (
              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <FileUp className="mr-2 h-4 w-4" />
                Choose file to import
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">Backup Catalog</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void deleteBackups(selectedBackups.map((entry) => entry.id))}
              disabled={!selectedBackups.length || deletingIds.size > 0}
              className="inline-flex items-center rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={backups.length > 0 && selectedBackupIds.size === backups.length}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedBackupIds(new Set(backups.map((entry) => entry.id)));
                      } else {
                        setSelectedBackupIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2">Scope</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">License Hint</th>
                <th className="px-2 py-2">Restore</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => {
                const deleting = deletingIds.has(backup.id);
                const selected = selectedBackupIds.has(backup.id);
                return (
                  <tr key={backup.id} className="border-b border-gray-100 align-top">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelectedBackup(backup.id)}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-medium text-gray-900">{formatDateTime(backup.createdAt)}</p>
                      <p className="text-xs text-gray-500">{backup.createdByAdminEmail || '-'}</p>
                      {backup.fileMissing ? (
                        <p className="mt-1 text-xs font-medium text-red-600">File missing on server</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-medium capitalize text-gray-900">{backup.mode}</p>
                      <p className="text-xs text-gray-600">
                        Sections: {Array.isArray(backup.sections) && backup.sections.length ? backup.sections.join(', ') : '-'}
                      </p>
                      <p className="text-xs text-gray-600">Tables: {Array.isArray(backup.tables) ? backup.tables.length : 0}</p>
                      <p className="text-xs text-gray-600">Files: {backup.includeFiles ? backup.fileCount : 0}</p>
                    </td>
                    <td className="px-2 py-3 text-gray-700">{formatBytes(backup.sizeBytes)}</td>
                    <td className="px-2 py-3 font-mono text-xs text-gray-700">...{backup.licenseHint || '------'}</td>
                    <td className="px-2 py-3 text-xs text-gray-600">
                      <p>Last: {formatDateTime(backup.lastRestoredAt)}</p>
                      <p>Count: {Number(backup.restoreCount || 0)}</p>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void downloadBackup(backup)}
                          disabled={Boolean(backup.fileMissing)}
                          className="inline-flex items-center rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-60"
                        >
                          <Download className="mr-1 h-3 w-3" />
                          Export
                        </button>
                        <button
                          type="button"
                          onClick={() => openRestore(backup.id)}
                          className="inline-flex items-center rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                        >
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteBackups([backup.id])}
                          disabled={deleting}
                          className="inline-flex items-center rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {deleting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!backups.length ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-sm text-gray-500">
                    No backup files generated yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {restoreState.backupId ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-blue-900">
              <ShieldCheck className="h-4 w-4" />
              Restore Backup
            </h3>
            <button
              type="button"
              onClick={() => resetRestoreState()}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Close
            </button>
          </div>

          <p className="mt-2 text-xs text-blue-800">
            Backup ID: <span className="font-mono">{restoreState.backupId}</span>. Provide matching license and admin credentials.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-blue-900">Scrolith license</span>
              <input
                type="text"
                value={restoreState.scrolithLicense}
                onChange={(event) => setRestoreState((prev) => ({ ...prev, scrolithLicense: event.target.value }))}
                className="w-full rounded-lg border border-blue-300 px-3 py-2"
                placeholder="SCROLITH-..."
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-blue-900">Admin email</span>
              <input
                type="email"
                value={restoreState.adminEmail}
                onChange={(event) => setRestoreState((prev) => ({ ...prev, adminEmail: event.target.value }))}
                className="w-full rounded-lg border border-blue-300 px-3 py-2"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-blue-900">Admin password</span>
              <input
                type="password"
                value={restoreState.adminPassword}
                onChange={(event) => setRestoreState((prev) => ({ ...prev, adminPassword: event.target.value }))}
                className="w-full rounded-lg border border-blue-300 px-3 py-2"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-blue-900">Restore mode</span>
              <select
                value={restoreState.mode}
                onChange={(event) =>
                  setRestoreState((prev) => ({
                    ...prev,
                    mode: event.target.value === 'append' ? 'append' : 'replace'
                  }))
                }
                className="w-full rounded-lg border border-blue-300 px-3 py-2"
              >
                <option value="replace">Replace (truncate & restore)</option>
                <option value="append">Append (insert where possible)</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-blue-900">
              <input
                type="checkbox"
                checked={restoreState.includeFiles}
                onChange={(event) => setRestoreState((prev) => ({ ...prev, includeFiles: event.target.checked }))}
              />
              Restore file snapshots
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-blue-900">
              <input
                type="checkbox"
                checked={restoreState.usePartialScope}
                onChange={(event) =>
                  setRestoreState((prev) => ({
                    ...prev,
                    usePartialScope: event.target.checked
                  }))
                }
              />
              Use partial restore scope
            </label>

            {restoreState.usePartialScope ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  {sections.map((section) => (
                    <label key={section} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={restoreState.sections.includes(section)}
                        onChange={() => toggleRestoreSection(section)}
                      />
                      <span className="capitalize">{section.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">Custom tables (comma/new line)</span>
                  <textarea
                    rows={2}
                    value={restoreState.customTablesText}
                    onChange={(event) =>
                      setRestoreState((prev) => ({ ...prev, customTablesText: event.target.value }))
                    }
                    className="w-full rounded-lg border border-blue-300 px-3 py-2"
                    placeholder="Example: User, AppSetting"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submitRestore()}
              disabled={restoring}
              className="inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Restore Backup
            </button>
            <p className="self-center text-xs text-blue-900">
              Only admin users with valid credentials and matching Scrolith license can restore this backup.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default SystemBackup;
