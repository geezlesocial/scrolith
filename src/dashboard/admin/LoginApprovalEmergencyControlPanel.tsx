import React from 'react';
import { Loader2, RefreshCw, ShieldAlert, Unlock, XCircle } from 'lucide-react';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

type Account = {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  loginApprovalWaivedUntil?: string | null;
  loginApprovalWaivedReason?: string | null;
  loginApprovalWaiverActive?: boolean;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Not waived';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not waived' : date.toLocaleString();
};

const LoginApprovalEmergencyControlPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [query, setQuery] = React.useState('');
  const [hours, setHours] = React.useState('24');
  const [reason, setReason] = React.useState('Emergency account access');
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/security/login-approvals/accounts', {
        params: { q: query.trim() || undefined, limit: 100 }
      });
      const data = response?.data?.data || response?.data || {};
      setAccounts(Array.isArray(data.users) ? data.users : []);
    } catch (error: any) {
      showNotification('error', 'Login approval controls', error?.response?.data?.error || 'Unable to load accounts');
    } finally {
      setLoading(false);
    }
  }, [query, showNotification]);

  React.useEffect(() => { void load(); }, [load]);

  const waive = async (account: Account) => {
    setBusyId(account.id);
    try {
      await api.post(`/admin/security/login-approvals/users/${encodeURIComponent(account.id)}/waive`, {
        hours: Number(hours),
        reason: reason.trim() || 'Emergency account access'
      });
      showNotification('success', 'Login approval waived', `${account.email} may sign in without device approval until the waiver expires. Any existing pending request was closed; retry login.`);
      await load();
    } catch (error: any) {
      showNotification('error', 'Waiver failed', error?.response?.data?.error || 'Unable to grant login-approval waiver');
    } finally {
      setBusyId(null);
    }
  };

  const clearWaiver = async (account: Account) => {
    setBusyId(account.id);
    try {
      await api.post(`/admin/security/login-approvals/users/${encodeURIComponent(account.id)}/clear-waiver`);
      showNotification('success', 'Login approval restored', 'The account will require trusted-device approval again.');
      await load();
    } catch (error: any) {
      showNotification('error', 'Clear failed', error?.response?.data?.error || 'Unable to clear login-approval waiver');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50/50 p-5" data-testid="login-approval-emergency-control">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Emergency Login Approval Control</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-700">Temporarily waive new-device approval for a specific account during an incident. This does not disable Google Authenticator 2FA, expires automatically, and does not trust the new device.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)_auto]">
        <input className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="Search account by email or name" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} />
        <select className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" value={hours} onChange={(event) => setHours(event.target.value)} aria-label="Waiver duration">
          <option value="1">1 hour</option><option value="4">4 hours</option><option value="24">24 hours</option><option value="72">72 hours</option><option value="168">7 days</option>
        </select>
        <input className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" maxLength={500} placeholder="Audit reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        <button type="button" onClick={() => void load()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800">Search</button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-amber-50 text-amber-950"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Waiver</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((account) => {
              const busy = busyId === account.id;
              return <tr key={account.id}>
                <td className="px-3 py-3"><div className="font-medium text-slate-900">{account.name || account.username || account.email}</div><div className="text-xs text-slate-500">{account.email}</div></td>
                <td className="px-3 py-3 capitalize">{String(account.role || '').toLowerCase()}</td>
                <td className="px-3 py-3">{account.loginApprovalWaiverActive ? <><span className="font-semibold text-amber-800">Active until {formatDate(account.loginApprovalWaivedUntil)}</span>{account.loginApprovalWaivedReason ? <span className="mt-1 block text-xs text-slate-500">{account.loginApprovalWaivedReason}</span> : null}</> : <span className="text-slate-400">Not active</span>}</td>
                <td className="px-3 py-3 text-right"><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => void waive(account)} className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Unlock className="h-3.5 w-3.5" /> Waive</button>{account.loginApprovalWaiverActive ? <button type="button" disabled={busy} onClick={() => void clearWaiver(account)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Clear</button> : null}{busy ? <Loader2 className="h-4 w-4 animate-spin self-center text-amber-700" /> : null}</div></td>
              </tr>;
            })}
            {!accounts.length && !loading ? <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No accounts match the search.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default LoginApprovalEmergencyControlPanel;
