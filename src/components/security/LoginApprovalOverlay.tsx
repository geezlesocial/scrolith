import React from 'react';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { authenticateBiometrics, checkBiometrics, getBiometricPreference, isNativePlatform } from '../../mobile/biometrics';
import { DeviceSecurityService, traceDeviceSecurity } from '../../services/deviceSecurity';

type PendingApproval = {
  id: string;
  status?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  platform?: string | null;
  deviceModel?: string | null;
  browserName?: string | null;
  deviceType?: string | null;
};

const REQUEST_EVENTS = ['security.login_approval.requested', 'security:login_approval_required'];
const RESOLUTION_EVENTS = ['security.login_approval.updated', 'security.login_approval.resolved', 'security:login_approval_updated'];

const normalizeStatus = (value: unknown) => String(value || 'PENDING').trim().toUpperCase();

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Soon';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Soon' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const describeDevice = (approval: PendingApproval) => {
  const parts = [approval.browserName, approval.platform, approval.deviceModel, approval.deviceType]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' - ') || 'New Scrolith device';
};

const getAttemptId = (payload: any) => String(payload?.attemptId || payload?.attempt_id || payload?.id || payload?.data?.attemptId || payload?.data?.id || '').trim();

export const LoginApprovalOverlay: React.FC = () => {
  const { isAuthenticated, user } = useUser();
  const [approval, setApproval] = React.useState<PendingApproval | null>(null);
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const isMountedRef = React.useRef(true);

  const refreshPending = React.useCallback(async (attemptId?: string) => {
    try {
      const rows = await DeviceSecurityService.listPendingApprovals();
      const pending = attemptId
        ? rows.find((row: PendingApproval) => String(row?.id) === attemptId)
        : rows[0];
      if (!isMountedRef.current) return;
      if (pending && normalizeStatus(pending.status) === 'PENDING') setApproval(pending as PendingApproval);
    } catch {
      // The realtime signal is advisory. An unavailable refresh must not affect the signed-in session.
    }
  }, []);

  React.useEffect(() => {
    isMountedRef.current = true;
    setApproval(null);
    if (!isAuthenticated) {
      return () => { isMountedRef.current = false; };
    }

    traceDeviceSecurity('approval_realtime_listener_started', { realtimeListenerStarted: true });
    void refreshPending();
    const listeners = REQUEST_EVENTS.map((eventName) => {
      const handler = (event: Event) => void refreshPending(getAttemptId((event as CustomEvent).detail) || undefined);
      window.addEventListener(eventName, handler as EventListener);
      return () => window.removeEventListener(eventName, handler as EventListener);
    });
    const resolutions = RESOLUTION_EVENTS.map((eventName) => {
      const handler = (event: Event) => {
        const payload = (event as CustomEvent).detail;
        const attemptId = getAttemptId(payload);
        const status = normalizeStatus(payload?.status || payload?.data?.status);
        setApproval((current) => current?.id === attemptId && status !== 'PENDING' ? null : current);
      };
      window.addEventListener(eventName, handler as EventListener);
      return () => window.removeEventListener(eventName, handler as EventListener);
    });
    return () => {
      isMountedRef.current = false;
      listeners.forEach((cleanup) => cleanup());
      resolutions.forEach((cleanup) => cleanup());
    };
  }, [isAuthenticated, user?.id, refreshPending]);

  const submit = async (action: 'approve' | 'reject') => {
    if (!approval || busy) return;
    setBusy(action);
    setError(null);
    try {
      if (action === 'approve' && isNativePlatform() && getBiometricPreference()) {
        const availability = await checkBiometrics();
        if (availability.available) {
          const result = await authenticateBiometrics('Approve this Scrolith sign-in request');
          if (!result.ok) throw new Error(result.error || 'Biometric verification is required before approving this login.');
        }
      }
      if (action === 'approve') await DeviceSecurityService.approveLogin(approval.id);
      else await DeviceSecurityService.rejectLogin(approval.id);
      traceDeviceSecurity('approval_resolution_submitted', { approvalActionSubmitted: true });
      if (isMountedRef.current) setApproval(null);
    } catch (submissionError: any) {
      if (isMountedRef.current) setError(submissionError?.response?.data?.error || submissionError?.message || 'Unable to update this login request.');
    } finally {
      if (isMountedRef.current) setBusy(null);
    }
  };

  if (!isAuthenticated || !approval) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="login-approval-title">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="bg-slate-950 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200"><ShieldCheck className="h-6 w-6" /></span>
              <div>
                <p id="login-approval-title" className="text-base font-bold">New sign-in request</p>
                <p className="text-xs text-slate-300">Only approve a device you recognize.</p>
              </div>
            </div>
            <button type="button" onClick={() => setApproval(null)} className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10">Later</button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Awaiting your decision</div>
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Device</p><p className="mt-1 font-semibold text-slate-900">{describeDevice(approval)}</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Requested</p><p className="mt-1 font-semibold text-slate-900">{formatDateTime(approval.createdAt)}</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Expires</p><p className="mt-1 font-semibold text-slate-900">{formatDateTime(approval.expiresAt)}</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Protection</p><p className="mt-1 font-semibold text-slate-900">{isNativePlatform() && getBiometricPreference() ? 'Biometric confirmation' : 'Authenticated session'}</p></div>
          </div>
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => submit('reject')} disabled={Boolean(busy)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'reject' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <><XCircle className="mr-2 inline h-4 w-4" />Reject</>}</button>
            <button type="button" onClick={() => submit('approve')} disabled={Boolean(busy)} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'approve' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 inline h-4 w-4" />Approve</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
