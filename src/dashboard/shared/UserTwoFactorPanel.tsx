/**
 * User-facing Google Authenticator 2FA (freelancer/employer/user settings).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Shield, KeyRound } from 'lucide-react';
import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

type Props = {
  enabled: boolean;
  onChanged?: (enabled: boolean) => void;
};

const UserTwoFactorPanel: React.FC<Props> = ({ enabled, onChanged }) => {
  const { showNotification } = useNotification();
  const [busy, setBusy] = useState(false);
  const [isOn, setIsOn] = useState(enabled);
  const [mode, setMode] = useState<'idle' | 'enroll' | 'disable'>('idle');
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    setIsOn(enabled);
  }, [enabled]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.get('/auth/2fa/status');
      const data = res?.data?.data || res?.data || {};
      const next = Boolean(data.twoFactorEnabled);
      setIsOn(next);
      onChanged?.(next);
    } catch {
      /* ignore */
    }
  }, [onChanged]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const beginEnroll = async () => {
    setBusy(true);
    setBackupCodes(null);
    try {
      const res = await api.post('/auth/2fa/enroll/begin');
      const data = res?.data?.data || res?.data || {};
      setSecret(data.secret || null);
      setQr(data.qrImageUrl || null);
      setMode('enroll');
      setCode('');
      showNotification('info', '2FA Setup', 'Scan the QR with Google Authenticator, then enter a 6-digit code.');
    } catch (e: any) {
      showNotification('error', '2FA Setup', e?.response?.data?.error || 'Unable to start enrollment');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    setBusy(true);
    try {
      const res = await api.post('/auth/2fa/enroll/confirm', { token: code.trim() });
      const data = res?.data?.data || res?.data || {};
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      setIsOn(true);
      onChanged?.(true);
      setMode('idle');
      setSecret(null);
      setQr(null);
      setCode('');
      showNotification('success', '2FA Enabled', 'Google Authenticator protects your login.');
    } catch (e: any) {
      showNotification('error', '2FA Setup', e?.response?.data?.error || 'Invalid authenticator code');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { token: code.trim() });
      setIsOn(false);
      onChanged?.(false);
      setMode('idle');
      setCode('');
      showNotification('success', '2FA Disabled', 'Two-factor authentication has been turned off.');
    } catch (e: any) {
      showNotification('error', '2FA Disable', e?.response?.data?.error || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const onToggleClick = () => {
    if (busy) return;
    if (isOn) {
      setMode('disable');
      setCode('');
      return;
    }
    void beginEnroll();
  };

  return (
    <div className="pt-6 border-t border-gray-200" data-testid="user-2fa-panel">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-gray-900 flex items-center">
            <Shield className="w-4 h-4 mr-2 text-green-600" /> Two-Factor Authentication
          </h4>
          <p className="text-sm text-gray-500 mt-1">
            Add Google Authenticator protection to your account. If you lose access, contact support/admin for a temporary
            waiver.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Status: <strong className={isOn ? 'text-emerald-700' : 'text-gray-600'}>{isOn ? 'Enabled' : 'Off'}</strong>
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isOn}
            onChange={onToggleClick}
            className="sr-only peer"
            disabled={busy}
            data-testid="user-2fa-toggle"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
        </label>
      </div>

      {mode === 'enroll' && (
        <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-semibold text-emerald-950 flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Set up Google Authenticator
          </p>
          {qr ? (
            <img src={qr} alt="2FA QR code" className="mx-auto h-40 w-40 rounded-lg border bg-white p-2" />
          ) : null}
          {secret ? (
            <p className="break-all text-center font-mono text-[11px] text-slate-700">Manual key: {secret}</p>
          ) : null}
          <input
            className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-center text-lg tracking-[0.3em]"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            data-testid="user-2fa-enroll-code"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || code.trim().length < 6}
              onClick={() => void confirmEnroll()}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Confirm & enable'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={() => {
                setMode('idle');
                setCode('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'disable' && (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-950">Enter authenticator (or backup) code to disable 2FA</p>
          <input
            className="w-full rounded-lg border border-amber-200 px-3 py-2 text-center text-lg tracking-[0.3em]"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            data-testid="user-2fa-disable-code"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || code.trim().length < 6}
              onClick={() => void disable()}
              className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Disable 2FA
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={() => {
                setMode('idle');
                setCode('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {backupCodes?.length ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Save these backup codes now (shown once):</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-amber-950">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default UserTwoFactorPanel;
