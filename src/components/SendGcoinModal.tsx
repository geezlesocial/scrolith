import React, { useState } from 'react';
import { useUser } from '../context/UserContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SendGcoinModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user } = useUser();
  const [toEmail, setToEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = { toEmail: toEmail || undefined, amount: Number(amount) } as any;
      const resp = await fetch('/api/community/gcoin/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await resp.json();
      if (!j.success) throw new Error(j.error?.message || 'Failed');
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Send Gcoin</h3>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600">Recipient email (or leave blank for id)</label>
            <input value={toEmail} onChange={(e)=>setToEmail(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded" placeholder="recipient@example.com" />
          </div>
          <div>
            <label className="block text-sm text-gray-600">Amount</label>
            <input value={amount} onChange={(e)=>setAmount(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded" placeholder="10" />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="flex justify-end">
            <button type="button" className="mr-2 px-4 py-2 rounded border" onClick={onClose}>Cancel</button>
            <button disabled={loading} type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">{loading ? 'Sending...' : 'Send'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SendGcoinModal;
