import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import { FoundingPartnersService, type FoundingPartnerProgram } from '../../services/foundingPartners';

const money = (value: string | number, currency = 'USD') => `${currency} ${Number(value || 0).toFixed(2)}`;

const FoundingPartnership: React.FC = () => {
  const [program, setProgram] = useState<FoundingPartnerProgram | null>(null);
  const [mine, setMine] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', country: '', city: '', stateRegion: '', taxId: '', termsAccepted: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const [p, m] = await Promise.all([FoundingPartnersService.getProgram(), FoundingPartnersService.getMine()]); setProgram(p); setMine(m); }
    catch (e: any) { setError(e?.response?.data?.error || 'Unable to load Founding Partners.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const active = mine?.status === 'ACTIVE';
  const total = useMemo(() => (mine?.distributions || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0), [mine]);

  const enroll = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await FoundingPartnersService.startCheckout({ ...form, idempotencyKey: `fp-${crypto.randomUUID()}` });
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl); else await load();
    } catch (e: any) { setError(e?.response?.data?.error || e?.message || 'Unable to start enrollment.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading Founding Partners...</div>;
  return <div className="space-y-6">
    <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 p-6 text-white shadow-xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Scrolith Founding Partners</p><h1 className="mt-2 text-2xl font-semibold">Build with Scrolith. Participate in future platform profit.</h1><p className="mt-2 max-w-2xl text-sm text-blue-100">A contractual profit-participation program for the first enrolled members. This is not legal equity or stock ownership.</p></div><BadgeDollarSign className="h-10 w-10 text-cyan-200" /></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Capacity</p><p className="mt-1 text-xl font-semibold">{program?.enrolledCount.toLocaleString()} / {program?.capacity.toLocaleString()}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Profit pool</p><p className="mt-1 text-xl font-semibold">{program?.profitSharePercent}% annually</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Term</p><p className="mt-1 text-xl font-semibold">Up to {program?.termYears} years</p></div></div>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {active ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Your Founding Partnership is active</h2></div><p className="mt-2 text-sm text-emerald-900">Enrolled {new Date(mine.enrollmentDate).toLocaleDateString()} · Total credited participation: {money(total, program?.currency)}</p><div className="mt-5 space-y-2">{(mine.distributions || []).map((row: any) => <div key={row.id} className="flex items-center justify-between rounded-xl bg-white p-3 text-sm"><span>{new Date(row.createdAt).getFullYear()} distribution</span><span className="font-semibold">{money(row.amount, row.currency)}</span></div>)}</div></div> : <form onSubmit={enroll} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-semibold text-slate-900">Become a Founding Partner</h2></div><p className="mt-1 text-sm text-slate-500">Complete your details and pay the one-time {money(program?.enrollmentFee || 2, program?.currency)} enrollment fee.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{(['fullName','country','city','stateRegion','taxId'] as const).map((key) => <label key={key} className="text-sm font-medium text-slate-700">{key === 'stateRegion' ? 'State / Region' : key === 'taxId' ? 'Tax ID (optional)' : key.replace(/([A-Z])/g, ' $1')}<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={!['stateRegion','taxId'].includes(key)} /></label>)}</div><label className="mt-4 flex gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })} /> I accept the Founding Partners profit-participation terms.</label><button disabled={busy || program?.status !== 'ACTIVE'} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Preparing secure checkout...' : `Pay ${money(program?.enrollmentFee || 2, program?.currency)} and continue`}</button>{program?.status !== 'ACTIVE' && <p className="mt-3 flex items-center gap-2 text-sm text-amber-700"><Clock3 className="h-4 w-4" /> Enrollment is currently paused.</p>}</form>}
  </div>;
};

export default FoundingPartnership;
