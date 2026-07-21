/**
 * Admin Google Authenticator enrollment + emergency waiver directory.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Shield, Unlock, RefreshCw, KeyRound } from 'lucide-react';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

type AdminRow = {
  id: string;
  email: string;
  name?: string | null;
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
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [myStatus, setMyStatus] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dir, me] = await Promise.all([
        api.get('/admin/security/2fa/admins'),
        api.get('/auth/2fa/status')
      ]);
      const dirData = dir?.data?.data || dir?.data || {};
      setAdmins(Array.isArray(dirData.admins) ? dirData.admins : []);
      setMyStatus(me?.data?.data || me?.data || null);
    } catch (e: any) {
      console.warn('Failed to load 2FA admin directory', e);
    } finally {
      setLoading(false);
    }
  }, []);

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
      showNotification('success', '2FA Enabled', 'Google Authenticator is now required for your admin login.');
      await load();
    } catch (e: any) {
      showNotification('error', '2FA Setup', e?.response?.data?.error || 'Invalid code');
    } finally {
      setEnrollBusy(false);
    }
  };

  const waive = async (userId: string) => {
    const hours = Number(window.prompt('Waiver duration in hours (1–168)?', '24') || '0');
    if (!Number.isFinite(hours) || hours < 1) return;
    const reason = window.prompt('Reason for emergency waiver?', 'Emergency access') || 'Emergency access';
    try {
      await api.post(`/admin/security/2fa/users/${encodeURIComponent(userId)}/waive`, { hours, reason });
      showNotification('success', '2FA Waiver', `Waiver granted for ${hours}h.`);
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
    if (!window.confirm('Reset this admin’s 2FA enrollment? They must set up Authenticator again.')) return;
    try {
      await api.post(`/admin/security/2fa/users/${encodeURIComponent(userId)}/reset`);
      showNotification('success', '2FA Reset', 'Enrollment cleared.');
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
            <Shield className="h-4 w-4" /> Google Authenticator (Admin 2FA)
          </h4>
          <p className="mt-1 text-xs text-indigo-900/80">
            Policy is {enabled ? <strong>enforced</strong> : <strong>off</strong>}. Enroll this admin account, grant
            emergency waivers, or reset lost authenticators without disabling platform access for other roles.
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
        {myStatus?.requiresSetup ? ' — setup required before next admin login.' : ''}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enrollBusy}
            onClick={() => void beginEnroll()}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {myStatus?.twoFactorEnabled ? 'Re-enroll 2FA' : 'Enroll Google Authenticator'}
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

      <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-indigo-50 text-indigo-900">
            <tr>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">2FA</th>
              <th className="px-3 py-2">Waiver</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{a.name || a.email}</div>
                  <div className="text-[11px] text-slate-500">{a.email}</div>
                </td>
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
                    title="Emergency waiver"
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
            {!admins.length && !loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No admin accounts found.
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
