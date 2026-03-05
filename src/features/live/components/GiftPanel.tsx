import React, { useState } from 'react';

type GiftPanelProps = {
  sending?: boolean;
  minAmount?: number;
  maxAmount?: number;
  onSend: (payload: { amountGcoin: number; message?: string }) => Promise<void> | void;
};

const GiftPanel: React.FC<GiftPanelProps> = ({ sending, minAmount = 1, maxAmount = 50000, onSend }) => {
  const [amount, setAmount] = useState<number>(Math.max(1, Number(minAmount || 1)));
  const [message, setMessage] = useState('');

  const submit = async () => {
    const safeAmount = Math.max(Number(minAmount || 1), Math.min(Number(maxAmount || 50000), Number(amount || 0)));
    if (!safeAmount) return;
    await onSend({
      amountGcoin: safeAmount,
      message: String(message || '').trim() || undefined
    });
    setMessage('');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Dash Gcoin Gift</h3>
      <p className="mt-1 text-xs text-slate-500">Support this streamer in real time.</p>
      <div className="mt-3 grid grid-cols-1 gap-2">
        <input
          type="number"
          min={minAmount}
          max={maxAmount}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value || 0))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          placeholder="Amount (Gcoin)"
        />
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          placeholder="Message (optional)"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(sending)}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending ? 'Sending...' : 'Send Gift'}
        </button>
      </div>
    </div>
  );
};

export default GiftPanel;
