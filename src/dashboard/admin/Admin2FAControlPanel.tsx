/**
 * Admin control plane for platform 2FA: policy status, enroll self,
 * search any user, emergency waive / clear / reset.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Shield, Unlock, RefreshCw, KeyRound, Search } from 'lucide-react';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

type UserRow = {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  role?: string;
  isActive?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorEnrolledAt?: string | null;
  twoFactorWaivedUntil?: string | null;
  twoFactorWaivedReason?: string | null;
  waived?: boolean;
  lastLoginAt?: string | null;
};

const Admin2FAControlPanel: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [enrolledOnly, setEnrolledOnly] = useState(false);
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [myStatus, setMyStatus] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (enrolledOnly) params.set('enrolled', '1');
      if (adminsOnly) params.set('adminsOnly', '1');
      params.set('limit', '100');
      const [dir, me] = await Promise.all([
        api.get(`/admin/security/2fa/admins?${params.toString()}`),
        api.get('/auth/2fa/status')
      ]);
      const dirData = dir?.data?.data || dir?.data || {};
      const list = Array.isArray(dirData.users)
        ? dirData.users
        : Array.isArray(dirData.admins)
          ? dirData.admins
          : [];
      setUsers(list);
      setMyStatus(me?.data?.data || me?.data || null);
    } catch (e: any) {
      console.warn('Failed to load 2FA directory', e);
      showNotification('error', '2FA Directory', e?.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, enrolledOnly, adminsOnly, showNotification]);

  useEffect(() => {
    void load();
  }, [load, enabled]);

  const beginEnroll = async () => {
    setEnrollBusy(true);
    setBackupCodes(null);
    try {
      const res = await api.post('/auth/2fa/enroll/begin');
      const data = res?.data?.data || res?.data || {};
      setEnrollSecret(data.secret || null);
      setEnrollQr(data.qrImageUrl || null);
      showNotification('success', '2FA Setup', 'Scan the QR code with Google Authenticator, then enter a code.');
    } catch (e: any) {
      showNotification('error', '2FA Setup', e?.response?.data?.error || 'Failed to start enrollment');
    } finally {
      setEnrollBusy(false);
    }
  };

  const confirmEnroll = async () => {
    setEnrollBusy(true);
    try {
      const res = await api.post('/auth/2fa/enroll/confirm', { token: enrollCode });
      const data = res?.data?.data || res?.data || {};
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      setEnrollSecret(null);
      setEnrollQr(null);
      setEnrollCode('');
      showNotification('success', '2FA Enabled', 'Google Authenticator is now active for your login.');
      await load();
    } catch (e: any) {
      showNotification('error', '2FA Setup', e?.response?.data?.error || 'Invalid code');
    } finally {
      setEnrollBusy(false);
    }
  };

  const waive = async (userId: string) => {
    const hours = Number(window.prompt('Emergency waiver duration in hours (1–168)?', '24') || '0');
    if (!Number.isFinite(hours) || hours < 1) return;
    const reason =
      window.prompt('Reason for emergency waiver?', 'User lost authenticator device') ||
      'User lost authenticator device';
    try {
      await api.post(`/admin/security/2fa/users/${encodeURIComponent(userId)}/waive`, { hours, reason });
      showNotification(
        'success',
        '2FA Waiver',
        `User can sign in without 2FA for ${hours}h. Ask them to re-enroll promptly.`
      );
      await load();
    } catch (e: any) {
      showNotification('error', 'Waiver Failed', e?.response?.data?.error || 'Could not waive 2FA');
    }
  };

  const clearWaiver = async (userId: string) => {
    try {
      await api.post(`/admin/security/2fa/users/${encodeURIComponent(userId)}/clear-waiver`);
      showNotification('success', 'Waiver Cleared', 'Emergency waiver removed.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Clear Failed', e?.response?.data?.error || 'Could not clear waiver');
    }
  };

  const reset2fa = async (userId: string) => {
    if (
      !window.confirm(
        'Reset this user’s 2FA? Their authenticator will stop working and they must set it up again (or use a waiver to log in first).'
      )
    ) {
      return;
    }
    try {
      await api.post(`/admin/security/2fa/users/${encodeURIComponent(userId)}/reset`);
      showNotification('success', '2FA Reset', 'Enrollment cleared for the user.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Reset Failed', e?.response?.data?.error || 'Could not reset 2FA');
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4" data-testid="admin-2fa-control-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-indigo-950 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Platform 2FA Control (Google Authenticator)
          </h4>
          <p className="mt-1 text-xs text-indigo-900/80">
            Admin policy is {enabled ? <strong>enforced for admins</strong> : <strong>optional for admins</strong>}.
            Any user who enables 2FA is challenged at login. Use search to waive, clear, or reset lost authenticators.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-800"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-white bg-white/80 p-3 text-xs text-slate-700">
        Your status:{' '}
        <strong>
          {myStatus?.twoFactorEnabled
            ? 'Enrolled'
            : myStatus?.waived
              ? 'Waived (temporary)'
              : 'Not enrolled'}
        </strong>
        {myStatus?.requiresSetup ? ' — setup required before next admin login when policy is on.' : ''}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enrollBusy}
            onClick={() => void beginEnroll()}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {myStatus?.twoFactorEnabled ? 'Re-enroll my 2FA' : 'Enroll my Google Authenticator'}
          </button>
        </div>
        {enrollQr || enrollSecret ? (
          <div className="mt-3 space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
            {enrollQr ? (
              <img src={enrollQr} alt="Authenticator QR" className="mx-auto h-40 w-40 rounded-lg border bg-white p-2" />
            ) : null}
            {enrollSecret ? (
              <p className="break-all text-center font-mono text-[11px] text-slate-800">Secret: {enrollSecret}</p>
            ) : null}
            <input
              className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-center tracking-widest"
              placeholder="123456"
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value)}
            />
            <button
              type="button"
              disabled={enrollBusy || enrollCode.trim().length < 6}
              onClick={() => void confirmEnroll()}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Confirm & enable
            </button>
          </div>
        ) : null}
        {backupCodes?.length ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="font-semibold text-amber-900">Save these backup codes now (shown once):</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-amber-950">
              {backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-indigo-200 bg-white py-2 pl-8 pr-3 text-xs"
            placeholder="Search any user by email, name, username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
            data-testid="admin-2fa-user-search"
          />
        </div>
        <label className="inline-flex items-center gap-1 text-[11px] text-indigo-900">
          <input type="checkbox" checked={enrolledOnly} onChange={(e) => setEnrolledOnly(e.target.checked)} />
          2FA on only
        </label>
        <label className="inline-flex items-center gap-1 text-[11px] text-indigo-900">
          <input type="checkbox" checked={adminsOnly} onChange={(e) => setAdminsOnly(e.target.checked)} />
          Admins only
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white"
        >
          Search
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-indigo-50 text-indigo-900">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">2FA</th>
              <th className="px-3 py-2">Waiver</th>
              <th className="px-3 py-2 text-right">Admin actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{a.name || a.username || a.email}</div>
                  <div className="text-[11px] text-slate-500">{a.email}</div>
                </td>
                <td className="px-3 py-2 capitalize">{String(a.role || '').toLowerCase()}</td>
                <td className="px-3 py-2">
                  {a.twoFactorEnabled ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">On</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Off</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {a.waived || (a.twoFactorWaivedUntil && new Date(a.twoFactorWaivedUntil) > new Date()) ? (
                    <span className="text-amber-800">
                      Until {a.twoFactorWaivedUntil ? new Date(a.twoFactorWaivedUntil).toLocaleString() : '—'}
                      {a.twoFactorWaivedReason ? (
                        <span className="mt-0.5 block text-[10px] text-amber-700/80">{a.twoFactorWaivedReason}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right space-x-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900"
                    onClick={() => void waive(a.id)}
                    title="Emergency access without 2FA"
                  >
                    <Unlock className="h-3 w-3" /> Waive
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-700"
                    onClick={() => void clearWaiver(a.id)}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700"
                    onClick={() => void reset2fa(a.id)}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            ))}
            {!users.length && !loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No users match. Search by email to manage 2FA for any account.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Admin2FAControlPanel;
