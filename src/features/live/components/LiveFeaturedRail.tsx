import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Radio, Users } from 'lucide-react';
import { useLiveFeature } from '../../../context/LiveFeatureContext';
import { LiveService, type LiveSession } from '../../../services/live';

type LiveFeaturedSurface = 'scrollFeed' | 'communityHome' | 'memberHome';

type LiveFeaturedRailProps = {
  surface: LiveFeaturedSurface;
  title?: string;
  subtitle?: string;
  limit?: number;
  className?: string;
};

const resolveSurfaceEnabled = (surface: LiveFeaturedSurface, experienceConfig: any) => {
  if (surface === 'communityHome') return experienceConfig?.showFeaturedRailInCommunityHome !== false;
  if (surface === 'memberHome') return experienceConfig?.showFeaturedRailInMemberHome !== false;
  return experienceConfig?.showFeaturedRailInScrollFeed !== false;
};

const formatViewerCount = (value: number) => {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(safe >= 10000 ? 0 : 1)}K`;
  return String(safe);
};

const LiveFeaturedRail: React.FC<LiveFeaturedRailProps> = ({
  surface,
  title = 'Featured Live',
  subtitle = 'Watch active livestreams in real time without leaving your current flow.',
  limit = 10,
  className = ''
}) => {
  const navigate = useNavigate();
  const { status: liveFeatureStatus } = useLiveFeature();
  const [items, setItems] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = useMemo(
    () =>
      Boolean(liveFeatureStatus.enabled) &&
      resolveSurfaceEnabled(surface, liveFeatureStatus.experienceConfig || {}),
    [liveFeatureStatus.enabled, liveFeatureStatus.experienceConfig, surface]
  );

  const load = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await LiveService.getActiveSessions(limit);
      setItems(Array.isArray(response?.items) ? response.items : []);
      setError(null);
    } catch (nextError: any) {
      const message =
        nextError?.response?.data?.error ||
        nextError?.response?.data?.message ||
        nextError?.message ||
        'Failed to load featured live streams.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  if (!enabled) return null;
  if (!loading && !error && items.length === 0) return null;

  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700">
            <Radio className="h-3.5 w-3.5" />
            Live now
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/scroll')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Explore Scroll
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {error ? (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
        >
          {error} Tap to retry.
        </button>
      ) : null}

      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {loading && items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Loading featured live streams...
          </div>
        ) : null}

        {items.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => navigate(`/live/${encodeURIComponent(session.id)}`)}
            className="group min-w-[260px] max-w-[300px] overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#0f172a,_#172554_55%,_#1d4ed8)] p-4 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white/15 bg-white/10">
                  {session.host?.avatar ? (
                    <img src={session.host.avatar} alt={session.host?.name || 'Host'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold">
                      {String(session.host?.name || 'S').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{session.host?.name || session.host?.username || 'Scrolith host'}</p>
                  <p className="mt-1 truncate text-xs text-white/75">{session.title || 'Live session'}</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90">
                <Users className="h-3.5 w-3.5" />
                {formatViewerCount(Number(session.viewerCount || 0))}
              </span>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/35 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100">
                  <Radio className="h-3.5 w-3.5" />
                  Live
                </span>
                <span className="text-[11px] text-white/70">Peak {formatViewerCount(Number(session.peakViewerCount || 0))}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/85">
                {session.description || 'Join the stream, react in real time, and support the host without leaving the session.'}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition group-hover:bg-cyan-100">
                Watch live
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default LiveFeaturedRail;
