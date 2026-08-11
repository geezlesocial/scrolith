import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { DeviceSecurityService } from '../../services/deviceSecurity';
import { authenticateBiometrics, checkBiometrics, getBiometricPreference, isNativePlatform } from '../../mobile/biometrics';
import {
  getLoginApprovalAttemptId,
  isLoginApprovalNotification,
  LOGIN_APPROVAL_OPEN_EVENT
} from '../../utils/notificationRouting';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED';

type LoginApprovalRequest = {
  attemptId: string;
  status: ApprovalStatus;
  expiresAt?: string | Date | null;
  createdAt?: string | Date | null;
  platform?: string | null;
  deviceModel?: string | null;
  browserName?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  deviceType?: string | null;
  eventId?: string | null;
};

const REQUEST_EVENTS = [
  'security.login_approval.requested',
  'security:login_approval_required',
  'mobile:push-notification-received',
  LOGIN_APPROVAL_OPEN_EVENT
];

const RESOLUTION_EVENTS = [
  'security.login_approval.updated',
  'security.login_approval.resolved',
  'security:login_approval_updated'
];

const normalizeStatus = (value: unknown): ApprovalStatus => {
  const status = String(value || 'PENDING').trim().toUpperCase();
  if (status === 'APPROVED' || status === 'REJECTED' || status === 'EXPIRED' || status === 'CONSUMED') return status;
  return 'PENDING';
};

const normalizeAttempt = (raw: any): LoginApprovalRequest | null => {
  const source = raw?.data && typeof raw.data === 'object' ? { ...raw.data, ...raw } : raw;
  const attemptId = String(getLoginApprovalAttemptId(source) || source?.id || '').trim();
  if (!attemptId) return null;
  const type = String(source?.type || source?.notificationType || source?.category || '').toLowerCase();
  if (type && !type.includes('login_approval') && !type.includes('security')) return null;
  return {
    attemptId,
    status: normalizeStatus(source?.status),
    expiresAt: source?.expiresAt || source?.expires_at || null,
    createdAt: source?.createdAt || source?.created_at || null,
    platform: source?.platform || null,
    deviceModel: source?.deviceModel || source?.device_model || null,
    browserName: source?.browserName || source?.browser_name || null,
    osVersion: source?.osVersion || source?.os_version || null,
    appVersion: source?.appVersion || source?.app_version || null,
    deviceType: source?.deviceType || source?.device_type || null,
    eventId: source?.eventId || source?.event_id || `login-approval:${attemptId}`
  };
};

const fromPendingRow = (row: any): LoginApprovalRequest | null =>
  normalizeAttempt({
    attemptId: row?.id,
    status: row?.status || 'PENDING',
    expiresAt: row?.expiresAt,
    createdAt: row?.createdAt,
    platform: row?.platform,
    deviceModel: row?.deviceModel,
    appVersion: row?.appVersion
  });

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const hasExpired = (request: LoginApprovalRequest | null) => {
  if (!request?.expiresAt) return false;
  const expiresAt = new Date(request.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
};

const describeDevice = (request: LoginApprovalRequest) => {
  const parts = [request.browserName, request.platform, request.deviceModel, request.deviceType]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' - ') || 'New Scrolith device';
};

export const LoginApprovalOverlay: React.FC = () => {
  const { isAuthenticated } = useUser();
  const { showNotification, refreshNotifications } = useNotification();
  const location = useLocation();
  const [active, setActive] = useState<LoginApprovalRequest | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenRef = useRef<Map<string, number>>(new Map());
  const browserNotificationRef = useRef<Notification | null>(null);

  const activeExpired = hasExpired(active);
  const canAct = Boolean(active && active.status === 'PENDING' && !activeExpired && !busy);

  const remember = useCallback((request: LoginApprovalRequest) => {
    const key = request.eventId || `login-approval:${request.attemptId}`;
    const now = Date.now();
    const recent = seenRef.current.get(key);
    seenRef.current.set(key, now);
    for (const [entry, ts] of seenRef.current.entries()) {
      if (now - ts > 10 * 60_000) seenRef.current.delete(entry);
    }
    return recent && now - recent < 2_000;
  }, []);

  const openRequest = useCallback(
    (request: LoginApprovalRequest, options: { toast?: boolean; browserNotify?: boolean } = {}) => {
      if (!request.attemptId) return;
      if (request.status !== 'PENDING') {
        setActive((current) => (current?.attemptId === request.attemptId ? { ...current, status: request.status } : current));
        return;
      }
      const duplicate = remember(request);
      setActive((current) => {
        if (current?.attemptId === request.attemptId) return { ...current, ...request };
        return request;
      });
      setError(null);
      if (!duplicate && options.toast) {
        showNotification(
          'warning',
          'New sign-in request',
          'Review this new-device sign-in before allowing access.',
          undefined,
          9000
        );
      }
      if (!duplicate && options.browserNotify && typeof window !== 'undefined' && document.visibilityState === 'hidden') {
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            browserNotificationRef.current?.close?.();
            const note = new Notification('New sign-in request', {
              body: 'Review a new device trying to access your Scrolith account.',
              tag: `login-approval:${request.attemptId}`
            });
            note.onclick = () => {
              window.focus();
              window.dispatchEvent(
                new CustomEvent(LOGIN_APPROVAL_OPEN_EVENT, {
                  detail: { attemptId: request.attemptId, eventId: request.eventId || `login-approval:${request.attemptId}` }
                })
              );
            };
            browserNotificationRef.current = note;
          }
        } catch {
          // Browser notifications are best-effort only.
        }
      }
    },
    [remember, showNotification]
  );

  const openPendingByAttemptId = useCallback(
    async (attemptId: string, options: { toast?: boolean; browserNotify?: boolean } = {}) => {
      const target = String(attemptId || '').trim();
      if (!target) return;
      try {
        const rows = await DeviceSecurityService.listPendingApprovals();
        const match = Array.isArray(rows) ? rows.map(fromPendingRow).find((row) => row?.attemptId === target) : null;
        if (match && match.status === 'PENDING' && !hasExpired(match)) {
          openRequest(match, options);
        } else if (match) {
          setActive((current) => (current?.attemptId === target ? { ...current, status: match.status } : current));
        }
      } catch {
        // Stored notification clicks are best-effort; stale or unavailable requests are ignored.
      }
    },
    [openRequest]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setActive(null);
      return;
    }
    const handlers = REQUEST_EVENTS.map((eventName) => {
      const handler = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (eventName === LOGIN_APPROVAL_OPEN_EVENT) {
          const attemptId = getLoginApprovalAttemptId(detail);
          if (attemptId) {
            void openPendingByAttemptId(attemptId, { toast: false });
          }
          return;
        }
        const request = normalizeAttempt(detail);
        if (!request) return;
        if (eventName === 'mobile:push-notification-received' && !isLoginApprovalNotification(detail)) return;
        openRequest(request, { toast: eventName !== 'mobile:push-notification-received', browserNotify: true });
        void refreshNotifications({ force: true }).catch(() => undefined);
      };
      window.addEventListener(eventName, handler as EventListener);
      return () => window.removeEventListener(eventName, handler as EventListener);
    });
    return () => handlers.forEach((cleanup) => cleanup());
  }, [isAuthenticated, openPendingByAttemptId, openRequest, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const handlers = RESOLUTION_EVENTS.map((eventName) => {
      const handler = (event: Event) => {
        const request = normalizeAttempt((event as CustomEvent).detail);
        if (!request) return;
        setActive((current) => {
          if (!current || current.attemptId !== request.attemptId) return current;
          return { ...current, status: request.status };
        });
        if (request.status !== 'PENDING') {
          browserNotificationRef.current?.close?.();
          setTimeout(() => {
            setActive((current) => (current?.attemptId === request.attemptId ? null : current));
          }, 1200);
        }
      };
      window.addEventListener(eventName, handler as EventListener);
      return () => window.removeEventListener(eventName, handler as EventListener);
    });
    return () => handlers.forEach((cleanup) => cleanup());
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const attemptId = new URLSearchParams(location.search).get('approval');
    if (!attemptId) return;
    let cancelled = false;
    void openPendingByAttemptId(attemptId, { toast: false }).finally(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location.search, openPendingByAttemptId]);

  useEffect(() => {
    if (!active || !active.expiresAt || active.status !== 'PENDING') return undefined;
    const delay = Math.max(0, new Date(active.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setActive((current) => (current?.attemptId === active.attemptId ? { ...current, status: 'EXPIRED' } : current));
    }, delay + 500);
    return () => window.clearTimeout(timer);
  }, [active]);

  const submit = async (action: 'approve' | 'reject') => {
    if (!active || !canAct) return;
    setBusy(action);
    setError(null);
    try {
      if (action === 'approve' && isNativePlatform() && getBiometricPreference()) {
        const info = await checkBiometrics();
        if (info.available) {
          const auth = await authenticateBiometrics('Approve this Scrolith sign-in request');
          if (!auth.ok) {
            throw new Error(auth.error || 'Biometric verification is required before approving this login.');
          }
        }
      }
      if (action === 'approve') {
        await DeviceSecurityService.approveLogin(active.attemptId);
        showNotification('success', 'Login approved', 'The new device can now complete sign-in.');
      } else {
        await DeviceSecurityService.rejectLogin(active.attemptId);
        showNotification('success', 'Login rejected', 'The new-device sign-in was rejected.');
      }
      setActive((current) => (current?.attemptId === active.attemptId ? { ...current, status: action === 'approve' ? 'APPROVED' : 'REJECTED' } : current));
      void refreshNotifications({ force: true }).catch(() => undefined);
      window.setTimeout(() => setActive((current) => (current?.attemptId === active.attemptId ? null : current)), 900);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to update this login request.');
    } finally {
      setBusy(null);
    }
  };

  const statusTone = useMemo(() => {
    const status = activeExpired && active?.status === 'PENDING' ? 'EXPIRED' : active?.status;
    if (status === 'APPROVED' || status === 'CONSUMED') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (status === 'REJECTED' || status === 'EXPIRED') return 'text-red-700 bg-red-50 border-red-200';
    return 'text-amber-700 bg-amber-50 border-amber-200';
  }, [active?.status, activeExpired]);

  if (!active || !isAuthenticated) return null;

  const displayStatus = activeExpired && active.status === 'PENDING' ? 'EXPIRED' : active.status;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="login-approval-title">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="bg-slate-950 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p id="login-approval-title" className="text-base font-bold">New sign-in request</p>
                <p className="text-xs text-slate-300">Only approve this if you are signing in on the device shown.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            >
              Later
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold ${statusTone}`}>
            {displayStatus === 'PENDING' ? <AlertTriangle className="h-4 w-4" /> : displayStatus === 'APPROVED' || displayStatus === 'CONSUMED' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {displayStatus === 'PENDING' ? 'Awaiting your decision' : `Request ${displayStatus.toLowerCase()}`}
          </div>

          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Device</p>
              <p className="mt-1 font-semibold text-slate-900">{describeDevice(active)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Requested</p>
              <p className="mt-1 font-semibold text-slate-900">{formatDateTime(active.createdAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Expires</p>
              <p className="mt-1 font-semibold text-slate-900">{formatDateTime(active.expiresAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Protection</p>
              <p className="mt-1 font-semibold text-slate-900">{isNativePlatform() && getBiometricPreference() ? 'Biometric approval required' : 'Authenticated session required'}</p>
            </div>
          </div>

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => submit('reject')}
              disabled={!canAct}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'reject' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Reject'}
            </button>
            <button
              type="button"
              onClick={() => submit('approve')}
              disabled={!canAct}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'approve' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
