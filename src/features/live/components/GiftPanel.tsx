import React, { useMemo, useState } from 'react';
import { Coins, Gift, Sparkles } from 'lucide-react';

type GiftPanelProps = {
  sending?: boolean;
  minAmount?: number;
  maxAmount?: number;
  title?: string;
  subtitle?: string;
  badgeLabel?: string;
  balance?: number | null;
  balanceLoading?: boolean;
  messageLabel?: string;
  submitLabel?: string;
  onCancel?: (() => void) | null;
  onSend: (payload: { amountGcoin: number; message?: string }) => Promise<void> | void;
};

const GiftPanel: React.FC<GiftPanelProps> = ({
  sending,
  minAmount = 1,
  maxAmount = 50000,
  title = 'Send a Gcoin gift without leaving the stream.',
  subtitle = 'Support the host in real time with a quick amount or a custom gift message.',
  badgeLabel = 'Dash support',
  balance = null,
  balanceLoading = false,
  messageLabel = 'Message',
  submitLabel = 'Send Gift',
  onCancel,
  onSend
}) => {
  const [amount, setAmount] = useState<number>(Math.max(1, Number(minAmount || 1)));
  const [message, setMessage] = useState('');

  const quickAmounts = useMemo(() => {
    return [1, 5, 20, 50].filter((value) => value >= Number(minAmount || 1) && value <= Number(maxAmount || 50000));
  }, [maxAmount, minAmount]);

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
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_40%),linear-gradient(135deg,_#ecfdf5,_#f8fafc)] px-5 py-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
          <Sparkles className="h-3.5 w-3.5" />
          {badgeLabel}
        </div>
        <h3 className="mt-3 text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {subtitle}
        </p>
        <div className="mt-3 rounded-2xl border border-emerald-200/70 bg-white/80 px-4 py-3 text-sm text-emerald-800 shadow-sm">
          {balanceLoading ? 'Loading your Gcoin balance...' : `Available balance: ${Number(balance || 0)} GC`}
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 gap-3">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Amount</span>
            <div className="relative">
              <Coins className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
              <input
                type="number"
                min={minAmount}
                max={maxAmount}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value || 0))}
                className="w-full rounded-2xl border border-slate-200 px-11 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                placeholder="Amount (Gcoin)"
              />
            </div>
          </label>

          {quickAmounts.length ? (
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(quickAmount)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    Number(amount || 0) === quickAmount
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {quickAmount} Gcoin
                </button>
              ))}
            </div>
          ) : null}

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{messageLabel}</span>
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              placeholder="Optional note for the host"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Gifts are delivered instantly while the livestream is active. Limits remain enforced by your current wallet settings.
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={Boolean(sending)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={Boolean(sending)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {sending ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Gift className="h-4 w-4" />}
              {sending ? 'Sending...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GiftPanel;
