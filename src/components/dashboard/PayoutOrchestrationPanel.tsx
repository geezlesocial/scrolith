import React from 'react';
import { CheckCircle2, CreditCard, RefreshCw, ShieldAlert, WalletCards } from 'lucide-react';
import { Phase3Service, type Phase3PayoutOrchestration } from '../../services/phase3';

const number = (value: unknown) => new Intl.NumberFormat().format(Number(value || 0));
const money = (value: unknown) => Number(value || 0).toFixed(2);

export default function PayoutOrchestrationPanel() {
  const [data, setData] = React.useState<Phase3PayoutOrchestration | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try { setData(await Phase3Service.getPayoutOrchestration({ limit: 5 })); }
    catch (cause: any) { setError(cause?.response?.data?.error || 'Payout readiness is temporarily unavailable.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const ready = data?.readiness || {};
  const wallet = data?.wallet;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="payout-orchestration-title">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div><h3 id="payout-orchestration-title" className="text-sm font-semibold text-slate-900">Payout Readiness</h3><p className="mt-0.5 text-[11px] text-slate-500">A read-only view of payout rails, wallet health, and settlement readiness.</p></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh payout readiness"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
      </header>
      <div className="p-4">
        {error ? <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
        {loading ? <div className="grid gap-2 sm:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div> : (
          <>
            <div className="grid gap-2 sm:grid-cols-4">{[
              ['Ready rails', `${number(ready.readyAccounts)} / ${number(ready.payoutAccounts)}`, CheckCircle2], ['Pending', number(ready.pendingWithdrawals), CreditCard], ['Processing', number(ready.processingWithdrawals), WalletCards], ['Stale FX locks', number(ready.staleFxLocks), ShieldAlert]
            ].map(([label, value, Icon]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-2 text-sm font-semibold text-slate-900">{String(value)}</p></div>)}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 px-3 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Wallet balance</p><p className="mt-1 text-lg font-semibold text-slate-900">{money(wallet?.balance)} Gcoin</p><p className="mt-1 text-[11px] text-slate-500">Status: {wallet?.status || 'not initialized'}</p></div><div className="rounded-xl border border-slate-200 px-3 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Withdrawal activity</p><p className="mt-1 text-lg font-semibold text-slate-900">{number(data?.withdrawals?.length)} recent records</p><p className="mt-1 text-[11px] text-slate-500">No transfers are initiated from this summary.</p></div></div>
          </>
        )}
      </div>
    </section>
  );
}
