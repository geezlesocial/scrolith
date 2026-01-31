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

  const submit = async () => {
    setError(null);
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
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
        <h3 className="text-lg font-bold mb-4">{donatePostId ? 'Donate Gcoin' : 'Send Gcoin'}</h3>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {!donatePostId && (
          <>
            <label className="block text-sm text-gray-600">Recipient (email or Wallet ID)</label>
            <input className="w-full border p-2 rounded mt-1 mb-3" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="recipient@domain or GC-xxxx" />
          </>
        )}

        <label className="block text-sm text-gray-600">Amount</label>
        <input type="number" className="w-full border p-2 rounded mt-1 mb-3" value={amount as any} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />

        <label className="block text-sm text-gray-600">Note</label>
        <input className="w-full border p-2 rounded mt-1 mb-4" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-100" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={submit} disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
};

export default SendGcoinModal;
