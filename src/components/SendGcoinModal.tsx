import React, { useEffect, useState } from 'react';
import { GcoinService } from '../services/gcoin';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefillRecipientId?: string;
  donatePostId?: string;
  donateScrollId?: string;
  titleOverride?: string;
  subtitleOverride?: string;
  onSuccess?: (result: any) => void;
}

const SendGcoinModal: React.FC<Props> = ({
  isOpen,
  onClose,
  prefillRecipientId,
  donatePostId,
  donateScrollId,
  titleOverride,
  subtitleOverride,
  onSuccess
}) => {
  const [recipient, setRecipient] = useState(prefillRecipientId || '');
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<any | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [wallet, setWallet] = useState<any | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    setRecipient(prefillRecipientId || '');
  }, [prefillRecipientId]);

  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setNote('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadSettings = async () => {
      setSettingsLoading(true);
      setWalletLoading(true);
      try {
        const [settingsResult, walletResult] = await Promise.allSettled([
          GcoinService.getSettings(),
          GcoinService.getMe()
        ]);
        if (!active) return;
        setSettings(settingsResult.status === 'fulfilled' ? settingsResult.value : null);
        setWallet(walletResult.status === 'fulfilled' ? walletResult.value : null);
      } catch {
        if (active) {
          setSettings(null);
          setWallet(null);
        }
      } finally {
        if (active) {
          setSettingsLoading(false);
          setWalletLoading(false);
        }
      }
    };
    void loadSettings();
    return () => {
      active = false;
    };
  }, [isOpen]);

  const isDonationMode = Boolean(donatePostId || donateScrollId);
  const transfersEnabled = settings?.userTransfersEnabled !== false;
  const feeType = (settings?.transferFeeType || 'percentage').toString();
  const feeValue = Number(settings?.transferFeeValue || 0);
  const numericAmount = Number(amount || 0);
  const availableBalance = Number(wallet?.balance ?? 0);
  const hasBalance = availableBalance > 0;
  const feeAmount =
    numericAmount > 0
      ? feeType === 'percentage'
        ? Number((numericAmount * (feeValue / 100)).toFixed(4))
        : Number(feeValue || 0)
      : 0;
  const totalWithFee = numericAmount > 0 ? Number((numericAmount + feeAmount).toFixed(4)) : 0;
  const exceedsBalance =
    numericAmount > 0 && (isDonationMode ? numericAmount > availableBalance : totalWithFee > availableBalance);
  const canSubmit = numericAmount > 0 && hasBalance && !exceedsBalance && (isDonationMode || transfersEnabled);

  const submit = async () => {
    setError(null);
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
    if (!hasBalance) return setError('You do not have any Gcoin available.');
    if (exceedsBalance) return setError('Insufficient Gcoin balance for this amount.');
    if (!isDonationMode && !transfersEnabled) return setError('Transfers are currently disabled.');

    setLoading(true);
    try {
      if (donatePostId) {
        const resp = await GcoinService.donate(donatePostId, Number(amount), note || undefined);
        if (!resp?.success) {
          setError(resp?.message || 'Donation failed');
          return;
        }
        onSuccess?.(resp);
        onClose();
        return;
      }

      if (donateScrollId) {
        const resp = await GcoinService.donateScroll(donateScrollId, Number(amount), note || undefined);
        if (!resp?.success) {
          setError(resp?.message || 'Donation failed');
          return;
        }
        onSuccess?.(resp);
        onClose();
        return;
      }

      const target = recipient || prefillRecipientId || '';
      if (!target) {
        setError('Enter a recipient');
        return;
      }
      const resp = await GcoinService.transfer(target, Number(amount), note || undefined);
      if (!resp?.success) {
        setError(resp?.message || 'Transfer failed');
        return;
      }
      onSuccess?.(resp);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 text-slate-900 shadow-lg">
        <h3 className="mb-1 text-lg font-bold text-slate-900">{titleOverride || (isDonationMode ? 'Dash Gcoin' : 'Send Gcoin')}</h3>
        {(subtitleOverride || isDonationMode) && (
          <p className="mb-3 text-xs text-slate-600">
            {subtitleOverride || 'Dash lets you gift Gcoin to support creators and posts instantly.'}
          </p>
        )}
        {error ? <div className="mb-2 text-sm text-red-600">{error}</div> : null}
        <div className="mb-3 text-xs text-slate-600">
          {walletLoading ? 'Loading your Gcoin balance...' : `Your Gcoin balance: ${availableBalance} GC`}
        </div>
        {!hasBalance ? (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
            You need Gcoin in your wallet to {isDonationMode ? 'Dash' : 'send'}.
          </div>
        ) : null}
        {!isDonationMode && !transfersEnabled ? (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
            Transfers are currently disabled by the admin.
          </div>
        ) : null}
        {!isDonationMode ? (
          <>
            <label className="block text-sm text-slate-700">Recipient (email or Wallet ID)</label>
            <input
              className="mt-1 mb-3 w-full rounded border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-400"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="recipient@domain or GC-xxxx"
            />
          </>
        ) : null}

        <label className="block text-sm text-slate-700">Amount</label>
        <input
          type="number"
          className="mt-1 mb-3 w-full rounded border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-400"
          value={amount as any}
          onChange={(event) => setAmount(event.target.value === '' ? '' : Number(event.target.value))}
        />
        {!isDonationMode ? (
          <div className="mb-3 text-xs text-slate-500">
            {settingsLoading
              ? 'Loading transfer fee...'
              : `Transfer fee: ${feeType === 'percentage' ? `${feeValue}%` : `${feeValue} GC`}${
                  numericAmount > 0 ? ` - Fee: ${feeAmount} GC - Total: ${totalWithFee} GC` : ''
                }`}
          </div>
        ) : null}

        <label className="block text-sm text-slate-700">Note</label>
        <input
          className="mt-1 mb-4 w-full rounded border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-400"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <div className="flex justify-end gap-2">
          <button className="rounded bg-slate-100 px-4 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60" onClick={submit} disabled={loading || !canSubmit}>
            {loading ? (isDonationMode ? 'Dashing...' : 'Sending...') : isDonationMode ? 'Dash' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendGcoinModal;
