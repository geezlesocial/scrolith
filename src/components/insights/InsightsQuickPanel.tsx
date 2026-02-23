import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import { InsightsService, type FeedMode, type ProfessionalScore } from '../../services/insights';

type Props = {
  compact?: boolean;
  className?: string;
};

const FEED_MODE_OPTIONS: Array<{ value: FeedMode; label: string }> = [
  { value: 'growth', label: 'Growth' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'network', label: 'Network' },
  { value: 'learning', label: 'Learning' }
];

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export default function InsightsQuickPanel({ compact = false, className = '' }: Props) {
  const { socket } = useSocket();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pgs, setPgs] = useState<ProfessionalScore | null>(null);
  const [streak, setStreak] = useState<any>(null);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>('growth');
  const [updatingFeedMode, setUpdatingFeedMode] = useState(false);
  const [skillGapBusy, setSkillGapBusy] = useState(false);
  const [skillGap, setSkillGap] = useState<any>(null);
  const [skillGapStatus, setSkillGapStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const lastSocketRefreshRef = useRef(0);
  const currentUserId = String((user as any)?.id || (user as any)?.user_id || '').trim();

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      if (!silent && !hasLoadedRef.current) setLoading(true);
      if (silent && hasLoadedRef.current) setRefreshing(true);
      setError(null);
      try {
        const [pgsData, streakData, achievementsData, matchesData, feedModeData, skillGapData] = await Promise.all([
          InsightsService.getMyPgs(),
          InsightsService.getMyStreak(),
          InsightsService.getMyAchievements(),
          InsightsService.getMatches('all'),
          InsightsService.getFeedMode(),
          InsightsService.getSkillGap()
        ]);
        setPgs(pgsData);
        setStreak(streakData);
        setAchievements(achievementsData);
        setMatches(matchesData.slice(0, compact ? 2 : 3));
        setFeedMode((feedModeData?.mode || 'growth') as FeedMode);
        setSkillGap(skillGapData);
        hasLoadedRef.current = true;
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load insights.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [compact]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onRefresh = (payload?: any) => {
      const payloadUserId = String(payload?.userId || '').trim();
      if (payloadUserId && currentUserId && payloadUserId !== currentUserId) return;
      const now = Date.now();
      if (now - lastSocketRefreshRef.current < 5000) return;
      lastSocketRefreshRef.current = now;
      void refresh({ silent: true });
    };

    const socketHandlers = [
      'insights:pgs_updated',
      'insights:achievement_unlocked',
      'insights:streak_updated',
      'insights:opportunity_match_ready'
    ] as const;
    socketHandlers.forEach((eventName) => socket?.on(eventName, onRefresh));
    return () => {
      socketHandlers.forEach((eventName) => socket?.off(eventName, onRefresh));
    };
  }, [socket, refresh, currentUserId]);

  const scorePercent = useMemo(() => {
    const raw = Number(pgs?.score || 0);
    return clampPercent((raw / 1000) * 100);
  }, [pgs?.score]);

  const skillGapLines = useMemo(() => {
    const list = Array.isArray(skillGap?.recommendations) ? skillGap.recommendations : [];
    return list
      .map((entry: any) => {
        if (typeof entry === 'string') return entry.trim();
        const skill = String(entry?.skill || '').trim();
        const nextStep = String(entry?.nextStep || '').trim();
        const reason = String(entry?.reason || '').trim();
        if (skill && nextStep) return `${skill}: ${nextStep}`;
        if (skill && reason) return `${skill}: ${reason}`;
        if (nextStep) return nextStep;
        if (reason) return reason;
        return '';
      })
      .filter(Boolean);
  }, [skillGap]);

  const updateFeedMode = async (mode: FeedMode) => {
    setFeedMode(mode);
    setUpdatingFeedMode(true);
    try {
      await InsightsService.setFeedMode(mode);
    } catch (_error) {
      const latest = await InsightsService.getFeedMode().catch(() => ({ mode: 'growth' as FeedMode }));
      setFeedMode((latest.mode || 'growth') as FeedMode);
    } finally {
      setUpdatingFeedMode(false);
    }
  };

  const generateSkillGap = async () => {
    setSkillGapBusy(true);
    setSkillGapStatus(null);
    try {
      const report = await InsightsService.generateSkillGap();
      setSkillGap(report);
      setSkillGapStatus('Skill gap report generated successfully.');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to generate skill gap report.');
      setSkillGapStatus('Skill gap generation failed. Please try again.');
    } finally {
      setSkillGapBusy(false);
    }
  };

  return (
    <section className={`rounded-3xl border border-white/70 bg-white p-4 shadow-sm ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-500">Insights</p>
          <h3 className="text-sm font-semibold text-slate-900">Professional Growth Score</h3>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading}
          className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading insights...</p>
      ) : error ? (
        <p className="mt-3 text-sm text-rose-600">{error}</p>
      ) : (
        <>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-end justify-between">
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{Number(pgs?.score || 0).toFixed(0)}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Streak {Number(streak?.currentStreakDays || 0)}d
              </div>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full bg-indigo-500 ${compact ? '' : 'transition-[width] duration-300 ease-out'}`.trim()}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Achievements: {achievements.length}</span>
              <span>Best streak: {Number(streak?.bestStreakDays || 0)}d</span>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Feed mode</label>
            <select
              value={feedMode}
              disabled={updatingFeedMode}
              onChange={(event) => void updateFeedMode(event.target.value as FeedMode)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              {FEED_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Opportunity matches</p>
              <span className="text-[11px] text-slate-400">{matches.length} shown</span>
            </div>
            {matches.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No matches yet. Keep your profile updated for better recommendations.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {matches.map((match) => (
                  <div key={match.id} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-800">
                        {match.target?.title || match.target?.name || `${String(match.targetType || '').toUpperCase()} match`}
                      </p>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                        {Number(match.score || 0).toFixed(0)}%
                      </span>
                    </div>
                    {Array.isArray(match.reasons) && match.reasons.length > 0 ? (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{String(match.reasons[0])}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Skill gap</p>
              <button
                type="button"
                onClick={() => void generateSkillGap()}
                disabled={skillGapBusy}
                className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase text-slate-600 disabled:opacity-50"
              >
                {skillGapBusy ? 'Generating...' : 'Generate'}
              </button>
            </div>
            {skillGapLines.length ? (
              <ul className="mt-2 space-y-1">
                {skillGapLines.slice(0, compact ? 2 : 3).map((entry: string, index: number) => (
                  <li key={`${entry}-${index}`} className="line-clamp-1 text-xs text-slate-600">
                    - {entry}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Generate a personalized report to unlock next best actions.</p>
            )}
            {skillGapStatus ? <p className="mt-2 text-xs text-slate-500">{skillGapStatus}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
