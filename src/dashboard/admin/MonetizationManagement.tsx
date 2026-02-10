import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Search, ShieldAlert, XCircle } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type MonetizationSettings = {
  enabled: boolean;
  requirements: {
    minPosts: number;
    minFollowers: number;
    minAge: number;
    violationFreeDays: number;
    requireKycApproved: boolean;
  };
  review: {
    defaultReapplyCooldownDays: number;
    autoEnableOnApprove: boolean;
  };
};

const defaultSettings: MonetizationSettings = {
  enabled: true,
  requirements: {
    minPosts: 30,
    minFollowers: 2000,
    minAge: 18,
    violationFreeDays: 30,
    requireKycApproved: true
  },
  review: {
    defaultReapplyCooldownDays: 30,
    autoEnableOnApprove: true
  }
};

const statusClass = (status?: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'REJECTED') return 'bg-rose-100 text-rose-700';
  if (normalized === 'SUSPENDED') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const MonetizationManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const [settings, setSettings] = useState<MonetizationSettings>(defaultSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [reapplyAfterDays, setReapplyAfterDays] = useState(30);
  const [reapplyAt, setReapplyAt] = useState('');
  const [disableUntil, setDisableUntil] = useState('');
  const [enableMonetization, setEnableMonetization] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(false);

  const totalPages = useMemo(() => {
    if (!limit) return 1;
    return Math.max(1, Math.ceil(total / limit));
  }, [limit, total]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await AdminService.getMonetizationSettings();
      setSettings({
        enabled: data?.enabled !== false,
        requirements: {
          minPosts: Number(data?.requirements?.minPosts ?? defaultSettings.requirements.minPosts),
          minFollowers: Number(data?.requirements?.minFollowers ?? defaultSettings.requirements.minFollowers),
          minAge: Number(data?.requirements?.minAge ?? defaultSettings.requirements.minAge),
          violationFreeDays: Number(
            data?.requirements?.violationFreeDays ?? defaultSettings.requirements.violationFreeDays
          ),
          requireKycApproved: data?.requirements?.requireKycApproved !== false
        },
        review: {
          defaultReapplyCooldownDays: Number(
            data?.review?.defaultReapplyCooldownDays ?? defaultSettings.review.defaultReapplyCooldownDays
          ),
          autoEnableOnApprove: data?.review?.autoEnableOnApprove !== false
        }
      });
      setEnableMonetization(data?.review?.autoEnableOnApprove !== false);
      setReapplyAfterDays(
        Number(data?.review?.defaultReapplyCooldownDays ?? defaultSettings.review.defaultReapplyCooldownDays)
      );
    } catch (error) {
      console.error('Failed to load monetization settings', error);
      showNotification('error', 'Monetization', 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  }, [showNotification]);

  const loadApplications = useCallback(async () => {
    setLoadingRows(true);
    try {
      const response = await AdminService.getMonetizationApplications({
        status: statusFilter,
        search: search.trim() || undefined,
        page,
        limit
      });
      setRows(Array.isArray(response?.items) ? response.items : []);
      setTotal(Number(response?.total ?? 0));
    } catch (error) {
      console.error('Failed to load monetization applications', error);
      showNotification('error', 'Monetization', 'Failed to load applications');
    } finally {
      setLoadingRows(false);
    }
  }, [limit, page, search, showNotification, statusFilter]);

  const loadApplicationDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetailLoading(true);
      try {
        const data = await AdminService.getMonetizationApplication(id);
        setSelected(data || null);
        setDecisionNote(String(data?.adminNote || ''));
        setReapplyAt(data?.reapplyAllowedAt ? String(data.reapplyAllowedAt).slice(0, 16) : '');
        setDisableUntil('');
      } catch (error) {
        console.error('Failed to load monetization application detail', error);
        showNotification('error', 'Monetization', 'Failed to load application detail');
      } finally {
        setDetailLoading(false);
      }
    },
    [showNotification]
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const payload = {
        enabled: settings.enabled,
        requirements: settings.requirements,
        review: settings.review
      };
      const next = await AdminService.saveMonetizationSettings(payload);
      setSettings({
        enabled: next?.enabled !== false,
        requirements: {
          minPosts: Number(next?.requirements?.minPosts ?? settings.requirements.minPosts),
          minFollowers: Number(next?.requirements?.minFollowers ?? settings.requirements.minFollowers),
          minAge: Number(next?.requirements?.minAge ?? settings.requirements.minAge),
          violationFreeDays: Number(next?.requirements?.violationFreeDays ?? settings.requirements.violationFreeDays),
          requireKycApproved: next?.requirements?.requireKycApproved !== false
        },
        review: {
          defaultReapplyCooldownDays: Number(
            next?.review?.defaultReapplyCooldownDays ?? settings.review.defaultReapplyCooldownDays
          ),
          autoEnableOnApprove: next?.review?.autoEnableOnApprove !== false
        }
      });
      showNotification('success', 'Monetization', 'Settings saved');
    } catch (error) {
      console.error('Failed to save monetization settings', error);
      showNotification('error', 'Monetization', 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    setDecisionLoading(true);
    try {
      await AdminService.approveMonetizationApplication(selectedId, {
        note: decisionNote.trim() || undefined,
        enableMonetization
      });
      showNotification('success', 'Monetization', 'Application approved');
      await Promise.all([loadApplications(), loadApplicationDetail(selectedId)]);
    } catch (error: any) {
      console.error('Approve monetization application failed', error);
      showNotification('error', 'Monetization', error?.response?.data?.error || 'Failed to approve application');
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    if (!decisionNote.trim()) {
      showNotification('warning', 'Monetization', 'Rejection note is required');
      return;
    }
    setDecisionLoading(true);
    try {
      await AdminService.rejectMonetizationApplication(selectedId, {
        note: decisionNote.trim(),
        reapplyAfterDays,
        ...(reapplyAt ? { reapplyAllowedAt: new Date(reapplyAt).toISOString() } : {})
      });
      showNotification('success', 'Monetization', 'Application rejected');
      await Promise.all([loadApplications(), loadApplicationDetail(selectedId)]);
    } catch (error: any) {
      console.error('Reject monetization application failed', error);
      showNotification('error', 'Monetization', error?.response?.data?.error || 'Failed to reject application');
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleDisableUser = async () => {
    const userId = String(selected?.userId || selected?.user?.id || '').trim();
    if (!userId) return;
    setDecisionLoading(true);
    try {
      await AdminService.disableUserMonetization(userId, {
        reason: decisionNote.trim() || 'Disabled by admin',
        ...(disableUntil ? { disableUntil: new Date(disableUntil).toISOString() } : {})
      });
      showNotification('success', 'Monetization', 'User monetization disabled');
      await Promise.all([loadApplications(), loadApplicationDetail(selectedId as string)]);
    } catch (error: any) {
      console.error('Disable monetization failed', error);
      showNotification('error', 'Monetization', error?.response?.data?.error || 'Failed to disable monetization');
    } finally {
      setDecisionLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Monetization Settings</h2>
            <p className="text-sm text-gray-500">Control eligibility requirements and review defaults.</p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={settingsSaving || settingsLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {settingsSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
        {settingsLoading ? (
          <p className="text-sm text-gray-500">Loading monetization settings...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Monetization enabled
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={settings.requirements.requireKycApproved}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    requirements: { ...prev.requirements, requireKycApproved: e.target.checked }
                  }))
                }
              />
              Require KYC approved
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={settings.review.autoEnableOnApprove}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    review: { ...prev.review, autoEnableOnApprove: e.target.checked }
                  }))
                }
              />
              Auto-enable on approval
            </label>
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Min posts</label>
              <input
                type="number"
                min={0}
                value={settings.requirements.minPosts}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    requirements: { ...prev.requirements, minPosts: toNumber(e.target.value, prev.requirements.minPosts) }
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Min followers</label>
              <input
                type="number"
                min={0}
                value={settings.requirements.minFollowers}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    requirements: {
                      ...prev.requirements,
                      minFollowers: toNumber(e.target.value, prev.requirements.minFollowers)
                    }
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Minimum age</label>
              <input
                type="number"
                min={13}
                value={settings.requirements.minAge}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    requirements: { ...prev.requirements, minAge: toNumber(e.target.value, prev.requirements.minAge) }
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Violation-free days
              </label>
              <input
                type="number"
                min={0}
                value={settings.requirements.violationFreeDays}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    requirements: {
                      ...prev.requirements,
                      violationFreeDays: toNumber(e.target.value, prev.requirements.violationFreeDays)
                    }
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Default cooldown days</label>
              <input
                type="number"
                min={0}
                value={settings.review.defaultReapplyCooldownDays}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    review: {
                      ...prev.review,
                      defaultReapplyCooldownDays: toNumber(
                        e.target.value,
                        prev.review.defaultReapplyCooldownDays
                      )
                    }
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Monetization Applications</h3>
            <p className="text-sm text-gray-500">Review and decide monetization requests.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
              <option value="all">All</option>
            </select>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white px-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search applicant"
                className="w-52 border-0 bg-transparent px-2 py-2 text-sm focus:outline-none"
              />
            </div>
            <button
              onClick={() => loadApplications()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Applicant</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Posts</th>
                <th className="px-3 py-2">Followers</th>
                <th className="px-3 py-2">KYC</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                    Loading applications...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                    No applications found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const snapshot = row?.eligibilitySnapshot || {};
                  const postsSnapshot = snapshot?.posts || {};
                  const followersSnapshot = snapshot?.followers || {};
                  const kycSnapshot = snapshot?.kyc || {};
                  return (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900">{row?.fullName || row?.user?.name || 'Applicant'}</div>
                        <div className="text-xs text-gray-500">{row?.email || row?.user?.email || '-'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row?.status)}`}>
                          {String(row?.status || 'PENDING')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {postsSnapshot.current ?? '-'} / {postsSnapshot.required ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {followersSnapshot.current ?? '-'} / {followersSnapshot.required ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{kycSnapshot.status ?? row?.user?.kycStatus ?? '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{formatDate(row?.submittedAt || row?.createdAt)}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => loadApplicationDetail(row.id)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded border border-gray-200 px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Application Review</h3>
                <p className="text-sm text-gray-500">Review eligibility snapshot and apply a decision.</p>
              </div>
              <button
                onClick={() => {
                  setSelectedId(null);
                  setSelected(null);
                  setDecisionNote('');
                  setReapplyAt('');
                  setDisableUntil('');
                }}
                className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-600"
              >
                Close
              </button>
            </div>

            {detailLoading ? (
              <p className="text-sm text-gray-500">Loading application...</p>
            ) : !selected ? (
              <p className="text-sm text-gray-500">Application not found.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Applicant</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {selected?.fullName || selected?.user?.name || '-'}
                    </p>
                    <p className="text-xs text-gray-500">{selected?.email || selected?.user?.email || '-'}</p>
                    <p className="text-xs text-gray-500">Country: {selected?.country || '-'}</p>
                    <p className="text-xs text-gray-500">Age: {selected?.age || '-'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                    <div className="mt-1">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(selected?.status)}`}>
                        {String(selected?.status || 'PENDING')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Submitted: {formatDate(selected?.submittedAt)}</p>
                    <p className="text-xs text-gray-500">Reviewed: {formatDate(selected?.reviewedAt)}</p>
                    <p className="text-xs text-gray-500">Reapply: {formatDate(selected?.reapplyAllowedAt)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Eligibility Snapshot</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span>Posts</span>
                      <span className="font-semibold">
                        {selected?.eligibilitySnapshot?.posts?.current ?? '-'} /{' '}
                        {selected?.eligibilitySnapshot?.posts?.required ?? '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span>Followers</span>
                      <span className="font-semibold">
                        {selected?.eligibilitySnapshot?.followers?.current ?? '-'} /{' '}
                        {selected?.eligibilitySnapshot?.followers?.required ?? '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span>KYC</span>
                      <span className="font-semibold">
                        {selected?.eligibilitySnapshot?.kyc?.status ?? selected?.user?.kycStatus ?? '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span>Last violation</span>
                      <span className="font-semibold">
                        {formatDate(selected?.eligibilitySnapshot?.violations?.lastViolationAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-3">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Admin note</label>
                  <textarea
                    rows={3}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Enter approval/rejection note..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="rounded-lg border border-gray-200 p-2 text-sm">
                      <span className="block text-xs uppercase tracking-wide text-gray-500">Reapply cooldown days</span>
                      <input
                        type="number"
                        min={0}
                        value={reapplyAfterDays}
                        onChange={(e) => setReapplyAfterDays(toNumber(e.target.value, 30))}
                        className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <label className="rounded-lg border border-gray-200 p-2 text-sm">
                      <span className="block text-xs uppercase tracking-wide text-gray-500">Override reapply at</span>
                      <input
                        type="datetime-local"
                        value={reapplyAt}
                        onChange={(e) => setReapplyAt(e.target.value)}
                        className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={enableMonetization}
                        onChange={(e) => setEnableMonetization(e.target.checked)}
                      />
                      Enable access on approve
                    </label>
                  </div>
                  <div className="mt-3 rounded-lg border border-gray-200 p-2 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-gray-500">Disable until (optional)</span>
                    <input
                      type="datetime-local"
                      value={disableUntil}
                      onChange={(e) => setDisableUntil(e.target.value)}
                      className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={decisionLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={decisionLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={handleDisableUser}
                    disabled={decisionLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-60"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Disable User Monetization
                  </button>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    Live decisions update user status in realtime.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default MonetizationManagement;
