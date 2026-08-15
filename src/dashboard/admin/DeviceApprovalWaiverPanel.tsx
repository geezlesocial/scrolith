import React, { useCallback, useEffect, useState } from 'react';
import { Search, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useSocket } from '../../context/SocketContext';

type WaiverMode = 'ONE_TIME' | 'UNLIMITED';

type WaiverState = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    username?: string | null;
    avatar?: string | null;
    isActive?: boolean;
    role?: string | null;
  };
  current: {
    id: string;
    mode: WaiverMode;
    status: string;
    createdAt: string;
    updatedAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
  } | null;
  history: Array<{
    id: string;
    mode: WaiverMode;
    status: string;
    createdAt: string;
    updatedAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
  }>;
};

const formatDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : 'Not recorded');

const DeviceApprovalWaiverPanel: React.FC = () => {
  const { socket } = useSocket();
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<WaiverState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');

  const refreshSettings = useCallback(async () => {
    try {
      const result = await AdminService.getDeviceApprovalWaiverSettings();
      setEnabled(Boolean(result?.enabled));
    } catch {
      setError('Unable to load device approval control status.');
    }
  }, []);

  const refreshSelected = useCallback(async () => {
    if (!state?.user?.id) return;
    try {
      setState(await AdminService.getDeviceApprovalWaiverState(state.user.id));
    } catch {
      setError('Unable to refresh the selected user.');
    }
  }, [state?.user?.id]);

  useEffect(() => {
    let mounted = true;
    void refreshSettings().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [refreshSettings]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void refreshSettings();
      void refreshSelected();
    };
    socket.on('security:device_approval_waiver_updated', refresh);
    return () => socket.off('security:device_approval_waiver_updated', refresh);
  }, [socket, refreshSettings, refreshSelected]);

  useEffect(() => {
    if (!state?.user?.id) return;
    const timer = window.setInterval(() => { void refreshSelected(); }, 15000);
    return () => window.clearInterval(timer);
  }, [state?.user?.id, refreshSelected]);

  const updateEnabled = async (next: boolean) => {
    const action = next ? 'Enable the global device-approval waiver control?' : 'Disable the global device-approval waiver control? Existing login approval remains enforced when disabled.';
    if (!window.confirm(action)) return;
    setMutating(true);
    setError('');
    try {
      const result = await AdminService.updateDeviceApprovalWaiverSettings(next);
      setEnabled(Boolean(result?.enabled));
    } catch {
      setError('Unable to update the global control.');
    } finally {
      setMutating(false);
    }
  };

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const exactEmail = email.trim().toLowerCase();
    if (!exactEmail || !exactEmail.includes('@')) {
      setError('Enter an exact email address.');
      return;
    }
    setLookingUp(true);
    setError('');
    try {
      setState(await AdminService.findDeviceApprovalWaiverUser(exactEmail));
    } catch {
      setState(null);
      setError('No exact user match found.');
    } finally {
      setLookingUp(false);
    }
  };

  const grant = async (mode: WaiverMode) => {
    if (!state?.user?.id) return;
    const label = mode === 'ONE_TIME' ? 'one-time' : 'unlimited';
    if (!window.confirm(`Grant a ${label} new-device approval waiver for this exact user?`)) return;
    setMutating(true);
    setError('');
    try {
      setState(await AdminService.grantDeviceApprovalWaiver(state.user.id, mode));
    } catch {
      setError('Unable to grant the waiver.');
    } finally {
      setMutating(false);
    }
  };

  const revoke = async () => {
    if (!state?.user?.id || !window.confirm('Revoke the active waiver for this user?')) return;
    setMutating(true);
    setError('');
    try {
      setState(await AdminService.revokeDeviceApprovalWaiver(state.user.id));
    } catch {
      setError('Unable to revoke the waiver.');
    } finally {
      setMutating(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5" aria-labelledby="device-approval-waiver-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <h3 id="device-approval-waiver-title" className="text-lg font-bold text-slate-900">Device Login Approval Admin Waivers</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">A narrowly scoped control for otherwise-valid new-device sign-ins. Passwords, human verification, MFA, account status, rate limits, device proof, and trusted-device security remain enforced.</p>
        </div>
        <button type="button" onClick={() => void updateEnabled(!enabled)} disabled={loading || mutating} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'}`} aria-pressed={enabled}>
          {enabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div className={`rounded-lg border p-3 text-sm ${enabled ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        {enabled ? 'Enabled: an authorized waiver may auto-approve only the new-device approval step.' : 'Disabled by default: normal trusted-device login approval is unchanged.'}
      </div>

      <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="device-approval-user-email" className="sr-only">Exact user email</label>
        <input id="device-approval-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Exact user email address" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" autoComplete="off" />
        <button type="submit" disabled={lookingUp || mutating} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Search className="h-4 w-4" />{lookingUp ? 'Finding...' : 'Find exact user'}</button>
      </form>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      {state && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {state.user.avatar ? <img src={state.user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><UserCheck className="h-5 w-5" /></div>}
              <div>
                <div className="font-semibold text-slate-900">{state.user.name || state.user.username || 'Scrolith user'}</div>
                <div className="text-sm text-slate-600">{state.user.email}{state.user.username ? ` - @${state.user.username}` : ''}</div>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.user.isActive === false ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{state.user.isActive === false ? 'Inactive account' : 'Active account'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-900">Current waiver:</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">{state.current ? `${state.current.mode} - ${state.current.status}` : 'None'}</span>
            <button type="button" onClick={() => void grant('ONE_TIME')} disabled={mutating || state.user.isActive === false} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Grant one-time</button>
            <button type="button" onClick={() => void grant('UNLIMITED')} disabled={mutating || state.user.isActive === false} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Grant unlimited</button>
            <button type="button" onClick={() => void revoke()} disabled={mutating || !state.current} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"><UserX className="h-3.5 w-3.5" />Revoke</button>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Recent waiver history</h4>
            {state.history.length === 0 ? <p className="text-sm text-slate-500">No waiver history.</p> : <div className="space-y-2">{state.history.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-white px-3 py-2 text-xs text-slate-600"><span><strong className="text-slate-900">{item.mode}</strong> - {item.status}</span><span>Created {formatDate(item.createdAt)}{item.consumedAt ? ` - Consumed ${formatDate(item.consumedAt)}` : ''}{item.revokedAt ? ` - Revoked ${formatDate(item.revokedAt)}` : ''}</span></div>)}</div>}
          </div>
        </div>
      )}
    </section>
  );
};

export default DeviceApprovalWaiverPanel;
