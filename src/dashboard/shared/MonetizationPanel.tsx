import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { UserService } from '../../services/user';

type MonetizationViewState = {
  settings?: {
    enabled?: boolean;
    requirements?: {
      minPosts?: number;
      minFollowers?: number;
      minAge?: number;
      violationFreeDays?: number;
      requireKycApproved?: boolean;
    };
  };
  eligibility?: {
    isEligible?: boolean;
    requirements?: {
      posts?: { current?: number; required?: number; met?: boolean };
      followers?: { current?: number; required?: number; met?: boolean };
      kyc?: { status?: string; required?: string; met?: boolean };
      violations?: {
        lastViolationAt?: string | null;
        daysRequired?: number;
        daysSinceViolation?: number | null;
        met?: boolean;
        nextEligibleAt?: string | null;
      };
    };
  };
  application?: {
    id?: string;
    status?: string;
    adminNote?: string | null;
    reapplyAllowedAt?: string | null;
    submittedAt?: string | null;
    reviewedAt?: string | null;
  } | null;
  monetization?: {
    isEnabled?: boolean;
    enabledAt?: string | null;
    disabledAt?: string | null;
    disabledReason?: string | null;
    updatedAt?: string | null;
  } | null;
};

type FormState = {
  fullName: string;
  tinNumber: string;
  country: string;
  age: string;
  email: string;
  phone: string;
};

const statusBadgeClass = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'REJECTED') return 'bg-rose-100 text-rose-700';
  if (normalized === 'SUSPENDED') return 'bg-amber-100 text-amber-700';
  if (normalized === 'PENDING' || normalized === 'SUBMITTED') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const toPositiveInt = (value: string, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const MonetizationPanel: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { socket, isConnected } = useSocket();

  const [state, setState] = useState<MonetizationViewState | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [form, setForm] = useState<FormState>({
    fullName: '',
    tinNumber: '',
    country: '',
    age: '',
    email: '',
    phone: ''
  });

  const applyPrefill = useCallback((latest?: any) => {
    setForm((prev) => ({
      fullName: prev.fullName || String(latest?.fullName || user?.name || ''),
      tinNumber: prev.tinNumber || String(latest?.tinNumber || ''),
      country: prev.country || String(latest?.country || user?.country || ''),
      age: prev.age || String(latest?.age || ''),
      email: prev.email || String(latest?.email || user?.email || ''),
      phone: prev.phone || String(latest?.phone || '')
    }));
  }, [user?.country, user?.email, user?.name]);

  const loadMonetization = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const [statusData, applications] = await Promise.all([
          UserService.getMonetizationStatus(),
          UserService.getMonetizationApplications(8).catch(() => [])
        ]);
        const rows = Array.isArray(applications) ? applications : [];
        setState(statusData || null);
        setHistory(rows);
        applyPrefill(rows[0]);
        setErrorMessage('');
      } catch (error: any) {
        console.error('Failed to load monetization status', error);
        const message = String(error?.response?.data?.error || error?.message || 'Failed to load monetization status');
        setErrorMessage(message);
        if (!silent) showNotification('error', 'Monetization', message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyPrefill, showNotification]
  );

  useEffect(() => {
    loadMonetization();
  }, [loadMonetization]);

  useEffect(() => {
    if (!socket) return;
    const handleRealtime = () => {
      void loadMonetization(true);
    };
    socket.on('monetization:application_updated', handleRealtime);
    socket.on('monetization:status_updated', handleRealtime);
    return () => {
      socket.off('monetization:application_updated', handleRealtime);
      socket.off('monetization:status_updated', handleRealtime);
    };
  }, [socket, loadMonetization]);

  useEffect(() => {
    if (isConnected) return;
    const timer = window.setInterval(() => {
      void loadMonetization(true);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [isConnected, loadMonetization]);

  const settingsEnabled = state?.settings?.enabled !== false;
  const eligibility = state?.eligibility;
  const requirements = eligibility?.requirements || {};
  const application = state?.application || null;
  const monetization = state?.monetization || null;
  const status = String(application?.status || (monetization?.isEnabled ? 'APPROVED' : 'NOT_APPLIED')).toUpperCase();
  const reapplyAllowedAt = application?.reapplyAllowedAt ? new Date(application.reapplyAllowedAt) : null;
  const cooldownActive = Boolean(
    status === 'REJECTED' && reapplyAllowedAt && reapplyAllowedAt.getTime() > Date.now()
  );
  const pending = status === 'PENDING' || status === 'SUBMITTED';
  const approved = status === 'APPROVED' && Boolean(monetization?.isEnabled);
  const suspended = status === 'SUSPENDED' || (!monetization?.isEnabled && Boolean(monetization?.disabledAt));
  const canApply =
    settingsEnabled &&
    Boolean(eligibility?.isEligible) &&
    !pending &&
    !approved &&
    !cooldownActive &&
    !suspended;

  const statusLabel = useMemo(() => {
    if (!settingsEnabled) return 'Disabled by admin';
    if (approved) return 'Approved';
    if (pending) return 'Pending Review';
    if (cooldownActive) return 'Reapply cooldown';
    if (suspended) return 'Suspended';
    if (eligibility?.isEligible) return 'Eligible';
    return 'Not eligible';
  }, [settingsEnabled, approved, pending, cooldownActive, suspended, eligibility?.isEligible]);

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      fullName: form.fullName.trim(),
      tinNumber: form.tinNumber.trim(),
      country: form.country.trim(),
      age: toPositiveInt(form.age, 0),
      email: form.email.trim(),
      phone: form.phone.trim()
    };

    if (!payload.fullName || !payload.tinNumber || !payload.country || !payload.age || !payload.email || !payload.phone) {
      showNotification('warning', 'Monetization', 'All application fields are required.');
      return;
    }

    setSubmitting(true);
    try {
      await UserService.applyMonetization(payload);
      showNotification('success', 'Monetization', 'Application submitted. It is now pending admin review.');
      setShowForm(false);
      await loadMonetization(true);
    } catch (error: any) {
      const message = String(error?.response?.data?.error || error?.message || 'Failed to submit application');
      showNotification('error', 'Monetization', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Loading monetization status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Monetization</p>
            <h3 className="text-xl font-semibold text-slate-900">Earnings Activation</h3>
            <p className="mt-1 text-sm text-slate-500">
              Apply once all requirements are met. Admin decisions sync in real time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
              {statusLabel}
            </span>
            <button
              onClick={() => loadMonetization(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Requirement checklist</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Posts</span>
                <span className={requirements?.posts?.met ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                  {requirements?.posts?.current ?? 0} / {requirements?.posts?.required ?? 0}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Followers</span>
                <span className={requirements?.followers?.met ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                  {requirements?.followers?.current ?? 0} / {requirements?.followers?.required ?? 0}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>KYC</span>
                <span className={requirements?.kyc?.met ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                  {requirements?.kyc?.status || 'PENDING'}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Violation window</span>
                <span className={requirements?.violations?.met ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                  {requirements?.violations?.met
                    ? `Clear (${requirements?.violations?.daysRequired ?? 0}d)`
                    : requirements?.violations?.nextEligibleAt
                      ? `Eligible ${formatDateTime(requirements?.violations?.nextEligibleAt)}`
                      : 'Not met'}
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Application state</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Submitted</span>
                <span>{formatDateTime(application?.submittedAt)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Reviewed</span>
                <span>{formatDateTime(application?.reviewedAt)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Reapply</span>
                <span>{formatDateTime(application?.reapplyAllowedAt)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>Monetization</span>
                <span className={monetization?.isEnabled ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                  {monetization?.isEnabled ? 'Enabled' : 'Not active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {application?.adminNote && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <p className="font-semibold">Admin note</p>
            <p className="mt-1 whitespace-pre-wrap">{application.adminNote}</p>
          </div>
        )}

        {monetization?.isEnabled && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            <span>Monetization is active since {formatDateTime(monetization.enabledAt)}</span>
          </div>
        )}

        {!settingsEnabled && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Clock3 className="h-4 w-4" />
            <span>Monetization applications are currently disabled by admin settings.</span>
          </div>
        )}

        {cooldownActive && reapplyAllowedAt && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Clock3 className="h-4 w-4" />
            <span>Reapply is available on {formatDateTime(reapplyAllowedAt.toISOString())}.</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              disabled={!canApply || submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Apply for Monetization
            </button>
          )}
          {showForm && (
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={submitApplication} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-lg font-semibold text-slate-900">Monetization application</h4>
          <p className="mt-1 text-sm text-slate-500">Provide legal and contact details exactly as requested.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder="Full name"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={form.tinNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, tinNumber: e.target.value }))}
              placeholder="TIN number"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={form.country}
              onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              placeholder="Country"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={form.age}
              onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
              type="number"
              min={1}
              placeholder="Age"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              type="email"
              placeholder="Email address"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Phone number"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="mt-4 flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Submitting...' : 'Submit application'}
            </button>
          </div>
        </form>
      )}

      {history.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Application history</h4>
          <div className="mt-3 space-y-2">
            {history.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(String(item.status || 'PENDING'))}`}>
                  {String(item.status || 'PENDING')}
                </span>
                <span className="text-slate-500">{formatDateTime(item.createdAt || item.submittedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonetizationPanel;
