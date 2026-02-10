import React, { useEffect, useState } from 'react';
import { GcoinService } from '../services/gcoin';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefillRecipientId?: string; // recipientId or email
  donatePostId?: string;
}

const SendGcoinModal: React.FC<Props> = ({ isOpen, onClose, prefillRecipientId, donatePostId }) => {
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
      } catch (e) {
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
    loadSettings();
    return () => {
      active = false;
    };
  }, [isOpen]);

  const transfersEnabled = settings?.userTransfersEnabled !== false;
  const feeType = (settings?.transferFeeType || 'percentage').toString();
  const feeValue = Number(settings?.transferFeeValue || 0);
  const numericAmount = Number(amount || 0);
  const availableBalance = Number(wallet?.balance ?? 0);
  const hasBalance = availableBalance > 0;
  const feeAmount = numericAmount > 0
    ? feeType === 'percentage'
      ? Number((numericAmount * (feeValue / 100)).toFixed(4))
      : Number(feeValue || 0)
    : 0;
  const totalWithFee = numericAmount > 0 ? Number((numericAmount + feeAmount).toFixed(4)) : 0;
  const exceedsBalance = numericAmount > 0 && (donatePostId ? numericAmount > availableBalance : totalWithFee > availableBalance);
  const canSubmit = numericAmount > 0 && hasBalance && !exceedsBalance && (donatePostId || transfersEnabled);

  const submit = async () => {
    setError(null);
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
    if (!hasBalance) return setError('You do not have any Gcoin available.');
    if (exceedsBalance) return setError('Insufficient Gcoin balance for this amount.');
    if (!donatePostId && !transfersEnabled) return setError('Transfers are currently disabled.');
    setLoading(true);
    try {
      if (donatePostId) {
        const resp = await GcoinService.donate(donatePostId, Number(amount), note || undefined);
        if (resp?.success) {
          onClose();
        } else {
          setError(resp?.message || 'Donation failed');
        }
      } else {
        const target = recipient || prefillRecipientId || '';
        if (!target) {
          setError('Enter a recipient');
          return;
        }
        const resp = await GcoinService.transfer(target, Number(amount), note || undefined);
        if (resp?.success) {
        onClose();
        } else {
          setError(resp?.message || 'Transfer failed');
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-lg">
        <h3 className="text-lg font-bold mb-1">{donatePostId ? 'Dash Gcoin' : 'Send Gcoin'}</h3>
        {donatePostId && (
          <p className="text-xs text-gray-600 mb-3">
            Dash lets you gift Gcoin to support creators and posts instantly.
          </p>
        )}
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <div className="text-xs text-gray-600 mb-3">
          {walletLoading ? 'Loading your Gcoin balance...' : `Your Gcoin balance: ${availableBalance} GC`}
        </div>
        {!hasBalance && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
            You need Gcoin in your wallet to {donatePostId ? 'Dash' : 'send'}.
          </div>
        )}
        {!donatePostId && !transfersEnabled && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
            Transfers are currently disabled by the admin.
          </div>
        )}
        {!donatePostId && (
          <>
            <label className="block text-sm text-gray-600">Recipient (email or Wallet ID)</label>
            <input className="w-full border p-2 rounded mt-1 mb-3" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="recipient@domain or GC-xxxx" />
          </>
        )}

        <label className="block text-sm text-gray-600">Amount</label>
        <input type="number" className="w-full border p-2 rounded mt-1 mb-3" value={amount as any} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
        {!donatePostId && (
          <div className="text-xs text-gray-500 mb-3">
            {settingsLoading ? 'Loading transfer fee...' : (
              <>Transfer fee: {feeType === 'percentage' ? `${feeValue}%` : `${feeValue} GC`} {numericAmount > 0 ? `• Fee: ${feeAmount} GC • Total: ${totalWithFee} GC` : ''}</>
            )}
          </div>
        )}

        <label className="block text-sm text-gray-600">Note</label>
        <input className="w-full border p-2 rounded mt-1 mb-4" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-100" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white"
            onClick={submit}
            disabled={loading || !canSubmit}
          >
            {loading ? (donatePostId ? 'Dashing...' : 'Sending...') : (donatePostId ? 'Dash' : 'Send')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendGcoinModal;
