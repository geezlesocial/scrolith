import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Check, ExternalLink, MapPin, RefreshCw, Sparkles, Users, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useSocket } from '../context/SocketContext';
import { ScrolithMatchService, type MatchAccountType, type MatchTab, type ScrolithMatchFeed, type ScrolithMatchItem } from '../services/scrolithMatch';

const resolveAccountType = (value: string | null, role: unknown): MatchAccountType => {
  const requested = String(value || '').toUpperCase();
  if (requested === 'CLIENT' || requested === 'EMPLOYER') return 'CLIENT';
  if (requested === 'FREELANCER' || requested === 'SELLER') return 'FREELANCER';
  const currentRole = String(role || '').toUpperCase();
  return currentRole === 'CLIENT' || currentRole === 'EMPLOYER' ? 'CLIENT' : 'FREELANCER';
};

const emptyFeed = (accountType: MatchAccountType): ScrolithMatchFeed => ({
  enabled: false, accountType, items: [], mutual: [], limits: { dailyInterestLimit: 0, interestsUsed: 0 }
});

const MatchCard: React.FC<{
  item: ScrolithMatchItem;
  busy: boolean;
  onInterest: () => void;
  onDismiss: () => void;
  onChat: () => void;
}> = ({ item, busy, onInterest, onDismiss, onChat }) => (
  <article className="border border-slate-200 bg-white rounded-lg p-4 shadow-sm">
    <div className="flex items-start gap-3">
      {item.avatar ? (
        <img src={item.avatar} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover border border-slate-200" />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold" aria-hidden="true">
          {item.name.trim().slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900 truncate">{item.name}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3 w-3" /> {item.matchScore}% match
          </span>
          {item.mutual && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Mutual</span>}
        </div>
        <p className="mt-1 text-sm text-slate-700">{item.title || 'Scrolith professional'}</p>
        {item.location && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{item.location}</p>}
      </div>
    </div>
    {item.bio && <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">{item.bio}</p>}
    {item.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{item.skills.slice(0, 6).map((skill) => <span key={skill} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{skill}</span>)}</div>}
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Why this match</p>
      <ul className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">{item.reasons.slice(0, 4).map((reason) => <li key={reason} className="flex gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />{reason}</li>)}</ul>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {item.mutual ? (
        <button type="button" onClick={onChat} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Users className="h-4 w-4" /> Start chat</button>
      ) : (
        <button type="button" onClick={onInterest} disabled={busy || item.interaction === 'INTERESTED'} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />{item.interaction === 'INTERESTED' ? 'Interested' : 'Interested'}</button>
      )}
      <button type="button" onClick={onDismiss} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /> Not now</button>
      <a href={item.href} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><ExternalLink className="h-4 w-4" /> Profile</a>
    </div>
  </article>
);

const MatchPage: React.FC = () => {
  const { user } = useUser();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountType = resolveAccountType(searchParams.get('as'), user?.role);
  const tab: MatchTab = searchParams.get('tab') === 'mutual' ? 'mutual' : 'matches';
  const [feed, setFeed] = useState<ScrolithMatchFeed>(() => emptyFeed(accountType));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setFeed(await ScrolithMatchService.getFeed(accountType, tab)); }
    catch (cause: any) { setError(cause?.response?.data?.error || cause?.message || 'Match is temporarily unavailable.'); setFeed(emptyFeed(accountType)); }
    finally { setLoading(false); }
  }, [accountType, tab]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { void load(); };
    socket.on('match:updated', refresh);
    socket.on('match:mutual', refresh);
    return () => { socket.off('match:updated', refresh); socket.off('match:mutual', refresh); };
  }, [load, socket]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  const setContext = (next: MatchAccountType, nextTab: MatchTab = tab) => setSearchParams({ as: next.toLowerCase(), ...(nextTab === 'mutual' ? { tab: 'mutual' } : {}) });
  const items = useMemo(() => tab === 'mutual' ? feed.mutual : feed.items, [feed, tab]);
  const act = async (item: ScrolithMatchItem, action: 'interest' | 'dismiss') => {
    setBusyId(item.id);
    try { await ScrolithMatchService.postAction(action, item.id, accountType); await load(); }
    catch (cause: any) { setError(cause?.response?.data?.error || cause?.message || 'Unable to update this Match.'); }
    finally { setBusyId(''); }
  };
  const openChat = async (item: ScrolithMatchItem) => {
    if (!user?.id || !item.mutual) return;
    setBusyId(item.id);
    try { const conversation = await ScrolithMatchService.createMutualConversation(item.id); navigate(`/messages/${conversation.id}`); }
    catch (cause: any) { setError(cause?.message || 'Unable to open the conversation.'); }
    finally { setBusyId(''); }
  };

  return <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Scrolith Match</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Mutual professional opportunities</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Connect with people whose active hiring intent and professional signals align with yours.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh matches" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
    </div>
    <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Match context">
      <button type="button" onClick={() => setContext('FREELANCER')} className={`rounded-md px-3 py-2 text-sm font-semibold ${accountType === 'FREELANCER' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}><BriefcaseBusiness className="mr-1 inline h-4 w-4" /> As freelancer</button>
      <button type="button" onClick={() => setContext('CLIENT')} className={`rounded-md px-3 py-2 text-sm font-semibold ${accountType === 'CLIENT' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}><Users className="mr-1 inline h-4 w-4" /> As client</button>
      <span className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
      <button type="button" onClick={() => setContext(accountType, 'matches')} className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === 'matches' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>Matches</button>
      <button type="button" onClick={() => setContext(accountType, 'mutual')} className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === 'mutual' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>Mutual connections</button>
    </div>
    {feed.limits.dailyInterestLimit > 0 && <p className="mt-3 text-xs text-slate-500">Daily interest usage: {feed.limits.interestsUsed} / {feed.limits.dailyInterestLimit}</p>}
    {error && <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {loading ? <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true">{[1, 2].map((id) => <div key={id} className="h-64 animate-pulse rounded-lg bg-slate-100" />)}</div> : !feed.enabled ? <div className="mt-6 rounded-lg border border-slate-200 bg-white px-5 py-10 text-center"><h2 className="font-semibold text-slate-900">Match is not active for this profile</h2><p className="mt-2 text-sm text-slate-600">Activate the relevant Available for Hire or We Are Hiring status to participate.</p></div> : feed.reason === 'activate_status' ? <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-10 text-center"><h2 className="font-semibold text-amber-950">Activate your hiring status</h2><p className="mt-2 text-sm text-amber-900">Match requires an active, public status for the selected account context.</p></div> : items.length === 0 ? <div className="mt-6 rounded-lg border border-slate-200 bg-white px-5 py-10 text-center"><h2 className="font-semibold text-slate-900">No matches right now</h2><p className="mt-2 text-sm text-slate-600">We will refresh this list as eligible opportunities change.</p></div> : <div className="mt-6 grid gap-4 md:grid-cols-2">{items.map((item) => <MatchCard key={item.id} item={item} busy={busyId === item.id} onInterest={() => void act(item, 'interest')} onDismiss={() => void act(item, 'dismiss')} onChat={() => void openChat(item)} />)}</div>}
    <div className="mt-6 flex items-center gap-2 text-xs text-slate-500"><ArrowRight className="h-3.5 w-3.5" /> Matching is deterministic first; optional intelligence never blocks the platform.</div>
  </div>;
};

export default MatchPage;
