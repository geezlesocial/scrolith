import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellRing,
  ShieldCheck,
  CalendarClock,
  Globe2,
  Heart,
  PlusCircle,
  Radio,
  RefreshCw,
  Signal,
  Sparkles,
  Users,
  Video
} from 'lucide-react';
import { LiveService, type LiveRealtimeConfig, type LiveSession, type LiveVisibility } from '../../services/live';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { DEFAULT_LIVE_REALTIME_CONFIG, normalizeLiveRealtimeConfig } from './liveRealtimeConfig';
import OfferTagSelector from '../../components/commerce/OfferTagSelector';
import type { OfferTagSelection } from '../../utils/contentOffers';

const VISIBILITY_OPTIONS: Array<{ value: LiveVisibility; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'network', label: 'Network' },
  { value: 'followers', label: 'Followers' },
  { value: 'private', label: 'Private' }
];

const parseList = (value: string, options?: { stripAt?: boolean }) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[,\s]+/g)
        .map((entry) => {
          const trimmed = String(entry || '').trim();
          if (!trimmed) return '';
          if (options?.stripAt && trimmed.startsWith('@')) return trimmed.slice(1).trim();
          return trimmed;
        })
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 30);

const formatMetric = (value: number) => {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(safe >= 10000 ? 0 : 1)}K`;
  return String(safe);
};

const getStatusClasses = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'live') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'ended') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const LiveStudio: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<LiveVisibility>('public');
  const [mentionUserDraft, setMentionUserDraft] = useState('');
  const [taggedPageDraft, setTaggedPageDraft] = useState('');
  const [offerTags, setOfferTags] = useState<OfferTagSelection[]>([]);
  const [notifyFollowersOnLive, setNotifyFollowersOnLive] = useState(true);
  const [notifyNetworkOnLive, setNotifyNetworkOnLive] = useState(false);
  const [inviteDraft, setInviteDraft] = useState('');
  const [inviteBusySessionId, setInviteBusySessionId] = useState<string | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<LiveRealtimeConfig>(DEFAULT_LIVE_REALTIME_CONFIG);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [response, runtime] = await Promise.all([
        LiveService.getMyLive(),
        LiveService.getRuntimeConfig().catch(() => DEFAULT_LIVE_REALTIME_CONFIG)
      ]);
      setSessions(Array.isArray(response?.hosted) ? response.hosted : []);
      setRuntimeConfig(normalizeLiveRealtimeConfig(runtime));
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to load livestream studio.';
      showNotification('error', 'Live Studio', message);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const createSession = useCallback(async () => {
    if (!title.trim()) {
      showNotification('warning', 'Live Studio', 'Session title is required.');
      return;
    }
    try {
      setCreating(true);
      const created = await LiveService.createSession({
        title: title.trim(),
        description: description.trim(),
        visibility,
        metadata: {
          mentionUsernames: parseList(mentionUserDraft, { stripAt: true }),
          taggedPageRefs: parseList(taggedPageDraft),
          offerTags,
          notifyFollowersOnLive: Boolean(notifyFollowersOnLive),
          notifyNetworkOnLive: Boolean(notifyNetworkOnLive)
        }
      });
      setSessions((prev) => [created, ...prev.filter((entry) => entry.id !== created.id)]);
      showNotification('success', 'Live Studio', 'Livestream session created. Opening preview.');
      setTitle('');
      setDescription('');
      setMentionUserDraft('');
      setTaggedPageDraft('');
      setOfferTags([]);
      navigate(`/live/${encodeURIComponent(created.id)}?preview=1`);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to create session.';
      showNotification('error', 'Live Studio', message);
    } finally {
      setCreating(false);
    }
  }, [description, mentionUserDraft, navigate, notifyFollowersOnLive, notifyNetworkOnLive, offerTags, showNotification, taggedPageDraft, title, visibility]);

  const endSession = useCallback(
    async (session: LiveSession) => {
      try {
        const updated = await LiveService.endSession(session.id);
        setSessions((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
        showNotification('success', 'Live Studio', 'Livestream ended.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to end livestream.';
        showNotification('error', 'Live Studio', message);
      }
    },
    [showNotification]
  );

  const inviteUsers = useCallback(
    async (session: LiveSession) => {
      const ids = inviteDraft
        .split(/[,\s]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!ids.length) {
        showNotification('warning', 'Live Studio', 'Enter at least one user ID to invite.');
        return;
      }
      try {
        setInviteBusySessionId(session.id);
        await LiveService.invite(session.id, ids);
        showNotification('success', 'Live Studio', `Invited ${ids.length} participant(s).`);
        setInviteDraft('');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to invite participants.';
        showNotification('error', 'Live Studio', message);
      } finally {
        setInviteBusySessionId(null);
      }
    },
    [inviteDraft, showNotification]
  );

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      ),
    [sessions]
  );

  const studioStats = useMemo(() => {
    return sortedSessions.reduce(
      (acc, session) => {
        const sessionStatus = String(session.status || '').toLowerCase();
        acc.total += 1;
        if (sessionStatus === 'live') acc.live += 1;
        else if (sessionStatus === 'ended') acc.ended += 1;
        else acc.scheduled += 1;
        acc.viewers += Number(session.viewerCount || 0);
        acc.reactions += Number(session.likesCount || 0) + Number(session.lovesCount || 0);
        return acc;
      },
      { total: 0, live: 0, ended: 0, scheduled: 0, viewers: 0, reactions: 0 }
    );
  }, [sortedSessions]);

  const runtimeReadiness = useMemo(() => {
    if (runtimeConfig.relayConfigured) {
      return {
        title: 'Relay protected',
        body: 'TURN relay is configured, so live sessions can recover better across carrier NAT, restrictive Wi-Fi, and mixed mobile/desktop viewers.',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700'
      };
    }
    return {
      title: 'Direct WebRTC mode',
      body: 'The platform is currently running without TURN relay. Friendly networks will work, but restrictive mobile networks can still block some viewers until relay credentials are configured.',
      tone: 'border-amber-200 bg-amber-50 text-amber-700'
    };
  }, [runtimeConfig]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.14),_transparent_42%),linear-gradient(135deg,_#020617,_#0f172a_52%,_#172554)] px-5 py-6 text-white lg:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100">
                <Sparkles className="h-3.5 w-3.5" />
                Enterprise Live Studio
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-[2.15rem]">
                Run live sessions with a cleaner control room and sharper discovery signals.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                Create sessions, control audience reach, tag collaborators, and launch polished livestreams without
                leaving the studio.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-200">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Realtime host controls</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Follower and network alerts</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Mentions and page tags</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Sessions</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatMetric(studioStats.total)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Live now</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatMetric(studioStats.live)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Scheduled</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatMetric(studioStats.scheduled)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Audience</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatMetric(studioStats.viewers)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Reactions</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatMetric(studioStats.reactions)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-7">
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))] p-5 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Launch setup</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Create a broadcast that feels prepared before it goes live.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Define the session, set visibility, mention collaborators, and control how Scrolith alerts your audience.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Name your live show"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Audience visibility</span>
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as LiveVisibility)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                >
                  {VISIBILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session brief</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Tell viewers what this live session covers and why they should join."
                />
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mentions</span>
                <input
                  type="text"
                  value={mentionUserDraft}
                  onChange={(event) => setMentionUserDraft(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Mention users, for example @jane @john"
                />
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tagged pages</span>
                <input
                  type="text"
                  value={taggedPageDraft}
                  onChange={(event) => setTaggedPageDraft(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="Tag pages by page ID, handle, or slug"
                />
              </label>
              <div className="lg:col-span-2">
                <OfferTagSelector
                  mode="user"
                  ownerUserId={user?.id}
                  value={offerTags}
                  onChange={setOfferTags}
                  label="Tag storefront offers"
                  helperText="Attach services to this live session so viewers can open your storefront, message you, or start a brief directly from LIVE."
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={notifyFollowersOnLive}
                  onChange={(event) => setNotifyFollowersOnLive(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <BellRing className="h-4 w-4 text-sky-600" />
                    Notify followers
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Alert followers as soon as the stream goes live.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={notifyNetworkOnLive}
                  onChange={(event) => setNotifyNetworkOnLive(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Notify network
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Reach followers and following connections for broader discovery.</span>
                </span>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3">
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Studio launch checklist</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Create the session first, then Scrolith sends you into a host preview where you can review camera, framing, and launch timing before going live.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createSession()}
                disabled={creating}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                <PlusCircle className="h-4 w-4" />
                {creating ? 'Creating...' : 'Create Preview'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Connection readiness</p>
              <div className="mt-4 space-y-3">
                <div className={`rounded-2xl border px-4 py-3 ${runtimeReadiness.tone}`}>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    {runtimeReadiness.title}
                  </p>
                  <p className="mt-1 text-xs leading-5">{runtimeReadiness.body}</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Signal className="h-4 w-4 text-sky-600" />
                      Viewer recovery cadence
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Retry every {Math.round(runtimeConfig.viewerRetryIntervalMs / 1000)}s, up to {runtimeConfig.viewerRetryLimit} fresh negotiations.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Radio className="h-4 w-4 text-rose-500" />
                      Connection timeout window
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Viewers are recycled after {Math.round(runtimeConfig.connectionTimeoutMs / 1000)}s if no live track arrives.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Reach overview</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Radio className="h-4 w-4 text-rose-500" />
                    Active broadcasts
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Keep live sessions visible and easy to re-enter from the control room.</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{formatMetric(studioStats.live)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <CalendarClock className="h-4 w-4 text-amber-500" />
                    Scheduled sessions
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Prepare upcoming live sessions before the stream begins.</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{formatMetric(studioStats.scheduled)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Globe2 className="h-4 w-4 text-sky-500" />
                    Total audience seen
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Combined live viewers tracked across your current studio sessions.</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{formatMetric(studioStats.viewers)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Studio quality notes</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    Premium live presentation
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Build sessions with cleaner audience cues, better discovery controls, and a more polished on-air presence.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <Heart className="h-4 w-4 text-rose-500" />
                    Reaction-ready
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Host actions, gifts, chat, reactions, and alerts remain on the same realtime pipeline.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-sm">
            Loading livestream sessions...
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-sm">
            No livestream sessions yet.
          </div>
        ) : (
          sortedSessions.map((session) => {
            const isLive = String(session.status || '').toLowerCase() === 'live';
            const isEnded = String(session.status || '').toLowerCase() === 'ended';
            return (
              <div
                key={session.id}
                className={`overflow-hidden rounded-[28px] border bg-white shadow-sm transition ${
                  isLive ? 'border-rose-200 shadow-[0_18px_45px_-30px_rgba(244,63,94,0.5)]' : 'border-slate-200'
                }`}
              >
                <div className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_38%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))] px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusClasses(
                            session.status || 'scheduled'
                          )}`}
                        >
                          {String(session.status || 'scheduled').toUpperCase()}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                          {String(session.visibility || 'public').toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-xl font-semibold text-slate-950">{session.title || 'Untitled live session'}</p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{session.description || 'No description provided.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isLive && !isEnded ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/live/${encodeURIComponent(session.id)}?preview=1`)}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Preview
                        </button>
                      ) : null}
                      {isLive ? (
                        <button
                          type="button"
                          onClick={() => void endSession(session)}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                        >
                          End
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            !isLive && !isEnded
                              ? `/live/${encodeURIComponent(session.id)}?preview=1`
                              : `/live/${encodeURIComponent(session.id)}`
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Video className="h-3.5 w-3.5" />
                        {isLive ? 'Open Live Room' : isEnded ? 'Open Session' : 'Open Preview'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Viewers</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.viewerCount || 0))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Likes</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.likesCount || 0))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Loves</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.lovesCount || 0))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Created</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {session.createdAt ? new Date(session.createdAt).toLocaleDateString() : 'Just now'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Guest invites</p>
                      <p className="mt-1 text-sm text-slate-600">Add collaborators or guests without leaving the control room.</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      Session ID {session.id.slice(0, 12)}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={inviteBusySessionId === session.id ? '' : inviteDraft}
                      onChange={(event) => setInviteDraft(event.target.value)}
                      className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="Invite user IDs (comma separated)"
                    />
                    <button
                      type="button"
                      onClick={() => void inviteUsers(session)}
                      disabled={inviteBusySessionId === session.id}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      {inviteBusySessionId === session.id ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LiveStudio;
