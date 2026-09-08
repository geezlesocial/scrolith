import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { PasskeyService, passkeySupport, type PasskeyRecord } from '../../services/passkeys';

const formatDate = (value?: string | null) => {
  if (!value) return 'Never used';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const PasskeySettingsPanel = () => {
  const { showNotification } = useNotification();
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [label, setLabel] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    if (!passkeySupport.available()) return;
    try {
      setPasskeys(await PasskeyService.list());
    } catch (error) {
      showNotification('alert', 'Passkeys unavailable', PasskeyService.getErrorMessage(error, 'Unable to load passkeys.'));
    }
  }, [showNotification]);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  if (!passkeySupport.available()) return null;

  const addPasskey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await PasskeyService.register(label, currentPassword);
      setLabel('');
      setCurrentPassword('');
      await loadPasskeys();
      showNotification('success', 'Passkey added', 'You can now use this device or credential to sign in securely.');
    } catch (error) {
      showNotification('alert', 'Passkey setup failed', PasskeyService.getErrorMessage(error, 'Unable to add this passkey.'));
    } finally {
      setLoading(false);
    }
  };

  const renamePasskey = async (passkey: PasskeyRecord) => {
    const nextLabel = window.prompt('Passkey name', passkey.label || 'Scrolith passkey');
    if (nextLabel === null || !nextLabel.trim()) return;
    setBusyId(passkey.id);
    try {
      await PasskeyService.rename(passkey.id, nextLabel);
      await loadPasskeys();
      showNotification('success', 'Passkey renamed', 'The passkey name was updated.');
    } catch (error) {
      showNotification('alert', 'Rename failed', PasskeyService.getErrorMessage(error, 'Unable to rename this passkey.'));
    } finally {
      setBusyId(null);
    }
  };

  const revokePasskey = async (passkey: PasskeyRecord) => {
    if (!window.confirm(`Revoke “${passkey.label || 'this passkey'}”? You will no longer be able to use it to sign in.`)) return;
    setBusyId(passkey.id);
    try {
      await PasskeyService.revoke(passkey.id);
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
      showNotification('success', 'Passkey revoked', 'The credential can no longer sign in to Scrolith.');
    } catch (error) {
      showNotification('alert', 'Revoke failed', PasskeyService.getErrorMessage(error, 'Unable to revoke this passkey.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5" aria-labelledby="passkeys-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="passkeys-title" className="flex items-center gap-2 text-base font-bold text-gray-900">
            <KeyRound className="h-5 w-5 text-emerald-700" /> Passkeys
          </h3>
          <p className="mt-1 text-sm text-gray-600">Use your device screen lock, security key, or password manager instead of typing your password.</p>
        </div>
        <ShieldCheck className="hidden h-6 w-6 text-emerald-700 sm:block" aria-hidden="true" />
      </div>

      <form onSubmit={addPasskey} className="mt-4 grid gap-3 rounded-xl border border-emerald-100 bg-white p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="text-sm font-semibold text-gray-700">
          Name
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="My phone or laptop" maxLength={80} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        <label className="text-sm font-semibold text-gray-700">
          Current password (password accounts)
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="Required for password accounts" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
        </label>
        <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {loading ? 'Waiting...' : 'Add passkey'}
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {passkeys.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-600">No passkeys registered on this account.</p>
        ) : passkeys.map((passkey) => (
          <div key={passkey.id} className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-gray-900">{passkey.label || 'Scrolith passkey'}</p>
              <p className="mt-1 text-xs text-gray-500">Added {formatDate(passkey.createdAt)} · Last used {formatDate(passkey.lastUsedAt)}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void renamePasskey(passkey)} disabled={busyId === passkey.id} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"><Pencil className="h-3.5 w-3.5" /> Rename</button>
              <button type="button" onClick={() => void revokePasskey(passkey)} disabled={busyId === passkey.id} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" /> Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PasskeySettingsPanel;
