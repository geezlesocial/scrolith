import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, BookOpen, CheckCircle2, Clock3, FileText, Info, ShieldCheck, X } from 'lucide-react';
import { FoundingPartnersService, type FoundingPartnerProgram } from '../../services/foundingPartners';

const money = (value: string | number, currency = 'USD') => `${currency} ${Number(value || 0).toFixed(2)}`;

const PROGRAM_PAGES = {
  about: '/p/about-scrolith-founding-partners',
  guide: '/p/founding-partners-guide',
  terms: '/p/founding-partners-terms'
};

const FAQS = [
  ['What is Scrolith Founding Partners?', 'A long-term profit-participation program for early Scrolith members. Active partners share equally in 20% of defined, cleared annual platform profit.'],
  ['Who can join?', 'Registered Scrolith users may enroll while the program is open, until the first 1,000,000 members have successfully joined.'],
  ['How much does it cost?', 'Enrollment requires a one-time USD 2.00 fee. Supported currencies show the converted amount before checkout.'],
  ['Is this company equity or shares?', 'No. Founding Partners is profit participation only. It does not provide ownership, shares, securities, or voting rights.'],
  ['How do I get paid?', 'Approved annual distributions are credited to your Scrolith wallet and can be withdrawn through available payout methods.'],
  ['Is profit guaranteed?', 'No. Distributions depend on cleared annual profit, program rules, approval, and your active partner status.'],
  ['When is membership active?', 'Only after Scrolith verifies and confirms your payment on its servers. A checkout redirect alone does not activate membership.'],
  ['Can the program be paused?', 'Yes. Scrolith may pause or resume enrollment for operational, security, compliance, or program-integrity reasons.']
] as const;

const MODAL_COPY = {
  about: {
    eyebrow: 'Scrolith Founding Partners',
    title: 'Participate in Scrolith’s future platform success.',
    body: 'Active Founding Partners participate in 20% of defined cleared annual profit, split equally among active partners and credited to the Scrolith wallet.',
    points: ['Limited to the first 1,000,000 successful enrollments', '100-year program framework, subject to applicable rules', 'One-time enrollment fee: USD 2.00', 'Profit participation only—not company ownership or shares']
  },
  how: {
    eyebrow: 'How it works',
    title: 'A clear, verified annual process.',
    body: 'The program uses closed and approved profit periods. No distribution is created from open, pending, disputed, or unsettled amounts.',
    points: ['Join while capacity remains', 'Pay the one-time USD 2.00 enrollment fee', 'Scrolith closes and verifies the annual profit period', '20% is allocated to the partner pool', 'The pool is divided equally among active partners', 'Approved shares are credited to your wallet']
  },
  quick: {
    eyebrow: 'Quick guide',
    title: 'Join in a few steps.',
    body: 'Review the fee in your currency, complete secure checkout, and track your membership from Partner Earnings.',
    points: ['Tap Become a Founding Partner', 'Enter your name and location', 'Provide a tax ID if applicable', 'Review the converted fee', 'Pay USD 2.00 or the supported-currency equivalent', 'Wait for server-side payment confirmation']
  },
  terms: {
    eyebrow: 'Terms summary',
    title: 'The essentials before you enroll.',
    body: 'This summary is provided for convenience and does not replace the full Founding Partners Terms.',
    points: ['Profit participation—not equity, shares, or securities', 'One-time USD 2.00 enrollment fee', 'First 1,000,000 successful enrollments only', '20% of defined cleared annual profit', 'Equal split among active partners', 'Credits issued through the Scrolith wallet', 'Enrollment may be paused or restricted when necessary']
  }
} as const;

const FoundingPartnership: React.FC = () => {
  const [program, setProgram] = useState<FoundingPartnerProgram | null>(null);
  const [mine, setMine] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', country: '', city: '', stateRegion: '', taxId: '', currency: 'USD', termsAccepted: false });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [openModal, setOpenModal] = useState<keyof typeof MODAL_COPY | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try { const [p, m] = await Promise.all([FoundingPartnersService.getProgram(), FoundingPartnersService.getMine()]); setProgram(p); setMine(m); if (p.availableCurrencies?.length && !p.availableCurrencies.some((option) => option.code === form.currency)) setForm((current) => ({ ...current, currency: p.availableCurrencies![0].code })); }
    catch (e: any) { setError(e?.response?.data?.error || 'Unable to load Founding Partners.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const active = mine?.status === 'ACTIVE';
  const total = useMemo(() => (mine?.distributions || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0), [mine]);
  const selectedCurrency = program?.availableCurrencies?.find((option) => option.code === form.currency);

  const enroll = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; const result = await FoundingPartnersService.startCheckout({ ...form, idempotencyKey: `fp-${randomId}` }); if (result.checkoutUrl) window.location.assign(result.checkoutUrl); else await load(); }
    catch (e: any) { setError(e?.response?.data?.error || e?.message || 'Unable to start enrollment.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading Founding Partners...</div>;
  return <div className="space-y-6">
    <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 p-6 text-white shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Scrolith Founding Partners</p><h1 className="mt-2 text-2xl font-semibold">Build with Scrolith. Participate in future platform profit.</h1><p className="mt-2 max-w-2xl text-sm text-blue-100">A contractual profit-participation program for early members. This is not legal equity, stock ownership, or a promise of profit.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => setOpenModal('about')} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/25"><Info className="h-4 w-4" />About the program</button><button type="button" onClick={() => setOpenModal('how')} className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"><BookOpen className="h-4 w-4" />How it works</button></div></div><BadgeDollarSign className="h-10 w-10 shrink-0 text-cyan-200" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Capacity</p><p className="mt-1 text-xl font-semibold">{program?.enrolledCount.toLocaleString()} / {program?.capacity.toLocaleString()}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Profit pool</p><p className="mt-1 text-xl font-semibold">{program?.profitSharePercent}% annually</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Framework</p><p className="mt-1 text-xl font-semibold">Up to {program?.termYears} years</p></div></div></div>
    <div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => setOpenModal('quick')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Quick guide</p><p className="mt-1 font-semibold text-slate-900">Join in a few steps</p><p className="mt-1 text-xs text-slate-500">Review, pay, verify, and track.</p></button><a href={PROGRAM_PAGES.guide} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Full guide</p><p className="mt-1 font-semibold text-slate-900">Understand the program</p><p className="mt-1 text-xs text-slate-500">Read the complete participation model.</p></a><a href={PROGRAM_PAGES.terms} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Full terms</p><p className="mt-1 font-semibold text-slate-900">Review before enrolling</p><p className="mt-1 text-xs text-slate-500">The full terms govern participation.</p></a></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {active ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Your Founding Partnership is active</h2></div><p className="mt-2 text-sm text-emerald-900">Enrolled {new Date(mine.enrollmentDate).toLocaleDateString()} · Total credited participation: {money(total, program?.currency)}</p><div className="mt-5 space-y-2">{(mine.distributions || []).map((row: any) => <div key={row.id} className="flex items-center justify-between rounded-xl bg-white p-3 text-sm"><span>{new Date(row.createdAt).getFullYear()} distribution</span><span className="font-semibold">{money(row.amount, row.currency)}</span></div>)}</div></div> : <form onSubmit={enroll} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-semibold text-slate-900">Become a Founding Partner</h2></div><p className="mt-1 text-sm text-slate-500">Complete your details and pay the one-time {money(program?.enrollmentFee || 2, program?.currency)} enrollment fee. Your selected currency is converted using the active Scrolith FX rate.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{(['fullName','country','city','stateRegion','taxId'] as const).map((key) => <label key={key} className="text-sm font-medium text-slate-700">{key === 'stateRegion' ? 'State / Region' : key === 'taxId' ? 'Tax ID (optional)' : key.replace(/([A-Z])/g, ' $1')}<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={!['stateRegion','taxId'].includes(key)} /></label>)}<label className="text-sm font-medium text-slate-700">Payment currency<select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{(program?.availableCurrencies?.length ? program.availableCurrencies : [{ code: program?.currency || 'USD', amount: program?.enrollmentFee || '2.00' }]).map((option) => <option key={option.code} value={option.code}>{option.code} {money(option.amount, option.code)}</option>)}</select></label></div><p className="mt-3 text-xs text-slate-500">Amount charged: {money(selectedCurrency?.amount || program?.enrollmentFee || 2, form.currency)} · Settlement value: {money(program?.enrollmentFee || 2, program?.currency)}</p><label className="mt-4 flex gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })} /> I accept the Founding Partners profit-participation terms.</label><button disabled={busy || program?.status !== 'ACTIVE'} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Preparing secure checkout...' : `Pay ${money(selectedCurrency?.amount || program?.enrollmentFee || 2, form.currency)} and continue`}</button>{program?.status !== 'ACTIVE' && <p className="mt-3 flex items-center gap-2 text-sm text-amber-700"><Clock3 className="h-4 w-4" /> Enrollment is currently paused.</p>}</form>}
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-600" /><div><h2 className="text-lg font-semibold text-slate-900">Enrollment FAQ</h2><p className="text-sm text-slate-500">Clear answers before you decide.</p></div></div><div className="mt-5 divide-y divide-slate-100">{FAQS.map(([question, answer]) => <details key={question} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900"><span>{question}</span><span className="text-indigo-600 transition-transform group-open:rotate-45">+</span></summary><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{answer}</p></details>)}</div><div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4 text-sm"><a href={PROGRAM_PAGES.about} className="font-semibold text-indigo-600 hover:underline">About Founding Partners</a><a href={PROGRAM_PAGES.guide} className="font-semibold text-indigo-600 hover:underline">How Founding Partners Works</a><a href={PROGRAM_PAGES.terms} className="font-semibold text-indigo-600 hover:underline">Founding Partners Terms</a><button type="button" onClick={() => setOpenModal('terms')} className="font-semibold text-indigo-600 hover:underline">Terms summary</button></div></section>
    {openModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="founding-partners-modal-title"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{MODAL_COPY[openModal].eyebrow}</p><h2 id="founding-partners-modal-title" className="mt-2 text-xl font-semibold text-slate-950">{MODAL_COPY[openModal].title}</h2></div><button type="button" onClick={() => setOpenModal(null)} aria-label="Close dialog" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><p className="mt-4 text-sm leading-6 text-slate-600">{MODAL_COPY[openModal].body}</p><ul className="mt-5 space-y-3">{MODAL_COPY[openModal].points.map((point) => <li key={point} className="flex gap-3 text-sm text-slate-700"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />{point}</li>)}</ul><div className="mt-6 flex flex-wrap gap-3"><a href={PROGRAM_PAGES.guide} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Full guide</a><a href={PROGRAM_PAGES.terms} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Read terms</a><button type="button" onClick={() => setOpenModal(null)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Continue</button></div></div></div>}
  </div>;
};

export default FoundingPartnership;
