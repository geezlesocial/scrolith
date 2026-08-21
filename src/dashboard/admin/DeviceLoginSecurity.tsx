import React from 'react';
import { CheckCircle2, Clock3, Loader2, MonitorSmartphone, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { DeviceSecurityService } from '../../services/deviceSecurity';

type PendingLoginApproval = {
  id: string;
  status?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  platform?: string | null;
  deviceType?: string | null;
  browserName?: string | null;
  deviceModel?: string | null;
  appVersion?: string | null;
};

const REQUEST_EVENTS = ['security.login_approval.requested', 'security:login_approval_required'];
const RESOLUTION_EVENTS = ['security.login_approval.updated', 'security.login_approval.resolved', 'security:login_approval_updated'];

const formatDate = (value?: string | null) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const describeDevice = (approval: PendingLoginApproval) => {
  const parts = [approval.browserName, approval.platform, approval.deviceModel, approval.deviceType]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' - ') || 'New Scrolith device';
};

const DeviceLoginSecurity: React.FC = () => {
  const { showNotification } = useNotification();
  const [approvals, setApprovals] = React.useState<PendingLoginApproval[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const load = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const rows = await DeviceSecurityService.listPendingApprovals();
      setApprovals(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      if (manual) showNotification('alert', 'Unable to load approvals', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, [showNotification]);

  React.useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    const refreshFromEvent = () => void load();
    const eventNames = [...REQUEST_EVENTS, ...RESOLUTION_EVENTS];
    eventNames.forEach((eventName) => window.addEventListener(eventName, refreshFromEvent));
    return () => {
      window.clearInterval(interval);
      eventNames.forEach((eventName) => window.removeEventListener(eventName, refreshFromEvent));
    };
  }, [load]);

  const decide = async (approval: PendingLoginApproval, decision: 'approve' | 'reject') => {
    if (savingId) return;
    setSavingId(approval.id);
    try {
      if (decision === 'approve') await DeviceSecurityService.approveLogin(approval.id);
      else await DeviceSecurityService.rejectLogin(approval.id);
      setApprovals((current) => current.filter((item) => item.id !== approval.id));
      showNotification('success', decision === 'approve' ? 'Login approved' : 'Login rejected', 'The requesting device has been updated.');
    } catch (error: any) {
      showNotification('alert', 'Approval update failed', error?.response?.data?.error || error?.message || 'Please try again.');
      await load(true);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Device Login Security</h2>
              <p className="mt-1 text-sm text-slate-600">Review sign-in requests from devices that are not yet trusted.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh login approvals"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading login requests...</div>
        ) : approvals.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            No pending device login requests.
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <article key={approval.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200">
                      <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{describeDevice(approval)}</h3>
                      <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                        <span>Requested: {formatDate(approval.createdAt)}</span>
                        <span>Expires: {formatDate(approval.expiresAt)}</span>
                        {approval.appVersion ? <span>Version: {approval.appVersion}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void decide(approval, 'reject')}
                      disabled={savingId === approval.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingId === approval.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide(approval, 'approve')}
                      disabled={savingId === approval.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingId === approval.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-800"><Clock3 className="h-4 w-4" aria-hidden="true" /> Approval expires automatically if no decision is made.</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default DeviceLoginSecurity;
