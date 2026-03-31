import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '../../context/UserContext';
import {
  type CreatorChallengeDashboard,
  type InsightAchievement,
  InsightsService,
  type OpportunityHubData,
  type ProfessionalScore,
  type UserQuest,
  type UserStreak
} from '../../services/insights';
import InsightsQuickPanel from './InsightsQuickPanel';

type MobileInsightsSectionId =
  | 'career-daily'
  | 'daily-missions'
  | 'badges-trophies'
  | 'league-tiers'
  | 'weekly-challenges'
  | 'polls-versus'
  | 'scrolitha-coach'
  | 'fan-clubs'
  | 'skill-mini-games'
  | 'event-passes-seasons'
  | 'premium-series'
  | 'expert-answer-bounties'
  | 'scroll-series'
  | 'broadcast-channels'
  | 'live-office-hours'
  | 'shared-accountability'
  | 'referral-squads'
  | 'gcoin-reward-drops'
  | 'identity-trust'
  | 'delivery-packaging'
  | 'brief-to-match'
  | 'feed-mode'
  | 'opportunity-actions'
  | 'opportunity-matches'
  | 'career-quests'
  | 'skill-gap';

type MobileInsightsGroupId = 'growth' | 'opportunity';

type GroupCard = {
  id: MobileInsightsGroupId;
  label: string;
  description: string;
  value?: string | null;
};

const INSIGHTS_CACHE_VERSION = 'v2';
const INSIGHTS_CACHE_TTL_MS = 15 * 60 * 1000;

const DEFAULT_CAREER_GOAL_COUNT = 4;
const DEFAULT_MISSION_COUNT = 3;
const DEFAULT_ACTIVE_STREAK_LIMIT = 3;
const GROWTH_SECTIONS: MobileInsightsSectionId[] = [
  'career-daily',
  'daily-missions',
  'badges-trophies',
  'league-tiers',
  'weekly-challenges',
  'polls-versus',
  'scrolitha-coach',
  'skill-mini-games',
  'premium-series',
  'scroll-series',
  'shared-accountability',
  'referral-squads',
  'gcoin-reward-drops',
  'career-quests',
  'skill-gap'
];
const OPPORTUNITY_SECTIONS: MobileInsightsSectionId[] = [
  'fan-clubs',
  'event-passes-seasons',
  'expert-answer-bounties',
  'broadcast-channels',
  'live-office-hours',
  'identity-trust',
  'delivery-packaging',
  'brief-to-match',
  'feed-mode',
  'opportunity-actions',
  'opportunity-matches'
];

const compactNumberFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1
});

const formatMetric = (value: number) => compactNumberFormatter.format(Number.isFinite(value) ? value : 0);

const withFastFail = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackMessage: string): Promise<T> => {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
};

const takeValue = <T,>(result: PromiseSettledResult<T>) => (result.status === 'fulfilled' ? result.value : null);

export default function MobileInsightsHubLauncher() {
  const { user } = useUser();
  const currentUserId = String((user as any)?.id || (user as any)?.user_id || '').trim();
  const insightsCacheKey = useMemo(
    () => `insights_quick_panel:${INSIGHTS_CACHE_VERSION}:${currentUserId || 'guest'}`,
    [currentUserId]
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pgs, setPgs] = useState<ProfessionalScore | null>(null);
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [achievements, setAchievements] = useState<InsightAchievement[]>([]);
  const [creatorChallengeDashboard, setCreatorChallengeDashboard] = useState<CreatorChallengeDashboard | null>(null);
  const [quests, setQuests] = useState<UserQuest[]>([]);
  const [hub, setHub] = useState<OpportunityHubData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<MobileInsightsGroupId>('growth');
  const [pendingSectionId, setPendingSectionId] = useState<MobileInsightsSectionId | null>(null);

  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  const hasSummaryData =
    Boolean(pgs) ||
    Boolean(streak) ||
    Boolean(hub) ||
    Boolean(creatorChallengeDashboard) ||
    achievements.length > 0 ||
    quests.length > 0;

  const readCachedSummary = useCallback(() => {
    let hydrated = false;
    if (!currentUserId) return false;
    try {
      const raw = localStorage.getItem(insightsCacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as {
        ts?: number;
        pgs?: ProfessionalScore | null;
        streak?: UserStreak | null;
        achievements?: InsightAchievement[];
        creatorChallenges?: CreatorChallengeDashboard | null;
        quests?: UserQuest[];
        hub?: OpportunityHubData | null;
      };
      const ts = Number(parsed?.ts || 0);
      if (Date.now() - ts > INSIGHTS_CACHE_TTL_MS) return false;
      if (parsed?.pgs) setPgs(parsed.pgs);
      if (parsed?.streak) setStreak(parsed.streak);
      if (Array.isArray(parsed?.achievements)) setAchievements(parsed.achievements);
      if (parsed?.creatorChallenges) setCreatorChallengeDashboard(parsed.creatorChallenges);
      if (Array.isArray(parsed?.quests)) setQuests(parsed.quests);
      if (parsed?.hub) setHub(parsed.hub);
      setLoading(false);
      hydrated = true;
    } catch {
      // Ignore cache parse errors.
    }
    return hydrated;
  }, [currentUserId, insightsCacheKey]);

  const persistSummary = useCallback(
    (payload: {
      pgs: ProfessionalScore | null;
      streak: UserStreak | null;
      achievements: InsightAchievement[];
      creatorChallenges: CreatorChallengeDashboard | null;
      quests: UserQuest[];
      hub: OpportunityHubData | null;
    }) => {
      try {
        const existing = localStorage.getItem(insightsCacheKey);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(
          insightsCacheKey,
          JSON.stringify({
            ...parsed,
            ts: Date.now(),
            pgs: payload.pgs,
            streak: payload.streak,
            achievements: payload.achievements,
            creatorChallenges: payload.creatorChallenges,
            quests: payload.quests,
            hub: payload.hub
          })
        );
      } catch {
        // Ignore cache write failures.
      }
    },
    [insightsCacheKey]
  );

  const refreshSummary = useCallback(async (options?: { quiet?: boolean }) => {
    const quiet = Boolean(options?.quiet);
    if (!quiet) setError(null);
    if (!quiet) setRefreshing(true);
    if (!quiet && !hasSummaryData) setLoading(true);
    try {
      const results = await Promise.allSettled([
        withFastFail(InsightsService.getMyPgs(), 15000, 'Professional score request timed out.'),
        withFastFail(InsightsService.getMyStreak(), 15000, 'Career streak request timed out.'),
        withFastFail(InsightsService.getMyAchievements(), 15000, 'Achievement request timed out.'),
        withFastFail(InsightsService.getMyCreatorChallenges(), 15000, 'Challenge request timed out.'),
        withFastFail(InsightsService.getMyQuests(), 15000, 'Quest request timed out.'),
        withFastFail(InsightsService.getOpportunityHub(), 15000, 'Opportunity hub request timed out.')
      ]);

      const [pgsResult, streakResult, achievementsResult, creatorChallengesResult, questsResult, hubResult] = results;
      const nextPgs = pgsResult.status === 'fulfilled' ? pgsResult.value || null : pgs;
      const nextStreak = streakResult.status === 'fulfilled' ? streakResult.value || null : streak;
      const nextAchievements =
        achievementsResult.status === 'fulfilled' && Array.isArray(achievementsResult.value)
          ? achievementsResult.value
          : achievements;
      const nextCreatorChallenges =
        creatorChallengesResult.status === 'fulfilled' ? creatorChallengesResult.value || null : creatorChallengeDashboard;
      const nextQuests =
        questsResult.status === 'fulfilled' && Array.isArray(questsResult.value) ? questsResult.value : quests;
      const nextHub = hubResult.status === 'fulfilled' ? hubResult.value || null : hub;

      if (pgsResult.status === 'fulfilled') setPgs(nextPgs || null);
      if (streakResult.status === 'fulfilled') setStreak(nextStreak || null);
      if (achievementsResult.status === 'fulfilled') setAchievements(Array.isArray(nextAchievements) ? nextAchievements : []);
      if (creatorChallengesResult.status === 'fulfilled') setCreatorChallengeDashboard(nextCreatorChallenges || null);
      if (questsResult.status === 'fulfilled') setQuests(Array.isArray(nextQuests) ? nextQuests : []);
      if (hubResult.status === 'fulfilled') setHub(nextHub || null);
      if (results.some((result) => result.status === 'fulfilled')) {
        persistSummary({
          pgs: nextPgs || null,
          streak: nextStreak || null,
          achievements: Array.isArray(nextAchievements) ? nextAchievements : [],
          creatorChallenges: nextCreatorChallenges || null,
          quests: Array.isArray(nextQuests) ? nextQuests : [],
          hub: nextHub || null
        });
      } else {
        throw new Error('Insights request timed out. Please retry.');
      }
    } catch (e: any) {
      if (!hasSummaryData && !quiet) {
        setError(e?.response?.data?.message || e?.message || 'Unable to refresh mobile insights.');
      }
    } finally {
      setLoading(false);
      if (!quiet) setRefreshing(false);
    }
  }, [achievements, creatorChallengeDashboard, hasSummaryData, hub, persistSummary, pgs, quests, streak]);

  useEffect(() => {
    const hydrated = readCachedSummary();
    let cancelled = false;
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const runRefresh = () => {
      if (cancelled) return;
      void refreshSummary({ quiet: hydrated });
    };

    if (typeof (window as any).requestIdleCallback === 'function') {
      idleHandle = (window as any).requestIdleCallback(runRefresh, { timeout: hydrated ? 1400 : 2200 });
    } else {
      timer = window.setTimeout(runRefresh, hydrated ? 900 : 1600);
    }

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      if (idleHandle !== null && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [readCachedSummary, refreshSummary]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    let attempts = 0;
    const visibleSections = activeGroup === 'growth' ? GROWTH_SECTIONS : OPPORTUNITY_SECTIONS;

    const syncSheetSections = () => {
      if (cancelled) return;
      const root = sheetBodyRef.current;
      if (!root) {
        if (attempts >= 20) return;
        attempts += 1;
        window.setTimeout(syncSheetSections, 120);
        return;
      }

      const nodes = Array.from(root.querySelectorAll('[data-insights-section]')) as HTMLElement[];
      nodes.forEach((node) => {
        const sectionId = String(node.getAttribute('data-insights-section') || '').trim() as MobileInsightsSectionId;
        node.classList.toggle('hidden', !visibleSections.includes(sectionId));
      });

      const requestedSection =
        pendingSectionId && visibleSections.includes(pendingSectionId)
          ? pendingSectionId
          : visibleSections[0];
      const target = root.querySelector(`[data-insights-section="${requestedSection}"]`) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (pendingSectionId) setPendingSectionId(null);
        return;
      }

      if (attempts >= 20) return;
      attempts += 1;
      window.setTimeout(syncSheetSections, 120);
    };

    const timer = window.setTimeout(syncSheetSections, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeGroup, pendingSectionId, sheetOpen]);

  useEffect(() => {
    const onOpenSection = (event: Event) => {
      const detail = (event as CustomEvent<{ group?: MobileInsightsGroupId; section?: MobileInsightsSectionId }>).detail || {};
      if (detail.group) setActiveGroup(detail.group);
      if (detail.section) setPendingSectionId(detail.section);
      setSheetOpen(true);
    };
    window.addEventListener('insights:open_section', onOpenSection as EventListener);
    return () => window.removeEventListener('insights:open_section', onOpenSection as EventListener);
  }, []);

  const earnedAchievements = achievements.filter((item) => item?.earned);
  const careerDaily = streak?.careerDaily || null;
  const dailyMissions = streak?.dailyMissions || null;
  const friendStreaks = streak?.friendStreaks || null;

  const groupCards = useMemo<GroupCard[]>(() => {
    const verificationState = String(hub?.identity?.verificationState || 'Trust building').trim();
    const activeChallengeCount = Number(creatorChallengeDashboard?.activeCount || 0);
    const activeFriendCount = Number(friendStreaks?.activeCount || 0);
    const friendLimit = Number(friendStreaks?.maxActive || DEFAULT_ACTIVE_STREAK_LIMIT);
    const deliveryTotal = Number(hub?.delivery?.activeContracts || 0) + Number(hub?.delivery?.activeOrders || 0);
    const opportunityMatches = Number(hub?.matching?.matches?.length || 0);
    const opportunityActions = Number(hub?.actions?.length || 0);
    const opportunityTotal = opportunityMatches + opportunityActions;
    const growthProgress = `${Number(careerDaily?.completedCount || 0)}/${Number(careerDaily?.goalCount || DEFAULT_CAREER_GOAL_COUNT)} today`;

    return [
      {
        id: 'growth',
        label: 'Growth controls',
        description:
          'Career streak, daily missions, badges, league tiers, polls, challenges, Scrolitha coach, mini-games, premium series, accountability, referral squads, reward drops, quests, and skill gap.',
        value: growthProgress
      },
      {
        id: 'opportunity',
        label: 'Opportunity controls',
        description:
          'Fan clubs, event seasons, expert bounties, broadcast updates, live office hours, identity, trust, delivery, brief matching, feed mode, actions, and ranked opportunities.',
        value: opportunityTotal > 0 ? `${opportunityTotal} live` : verificationState
      }
    ];
  }, [
    careerDaily?.completedCount,
    careerDaily?.goalCount,
    creatorChallengeDashboard?.activeCount,
    dailyMissions?.completedCount,
    dailyMissions?.totalCount,
    earnedAchievements.length,
    friendStreaks?.activeCount,
    friendStreaks?.maxActive,
    hub,
    quests.length
  ]);

  const openGroup = useCallback((groupId: MobileInsightsGroupId) => {
    setActiveGroup(groupId);
    setSheetOpen(true);
  }, []);

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-500">Insights</p>
            <h3 className="text-sm font-semibold text-slate-900">Professional Opportunity Hub</h3>
          </div>
          <button
            type="button"
            onClick={() => void refreshSummary()}
            disabled={refreshing || loading}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600 disabled:opacity-50"
            aria-busy={refreshing}
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 min-h-[112px] rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-end justify-between gap-3">
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{pgs ? Number(pgs.score || 0).toFixed(0) : '--'}</div>
            <div className="max-w-[112px] text-right text-xs uppercase tracking-wide text-slate-500">
              <div className="leading-4">Streak {Number(streak?.currentStreakDays || 0)}d</div>
              <div className="mt-1 line-clamp-2 leading-4">{hub?.trust?.trustTier || 'Building'} tier</div>
            </div>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-indigo-500 transition-[width] duration-300 ease-out"
              style={{
                width: `${Math.max(0, Math.min(100, (Number(pgs?.score || 0) / 1000) * 100))}%`
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Achievements: {earnedAchievements.length}/{achievements.length}</span>
            <span>Best streak: {Number(streak?.bestStreakDays || 0)}d</span>
          </div>
        </div>

        {error && !hasSummaryData ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick toggles</p>
          <span className="shrink-0 text-[11px] text-slate-400">2 grouped controls</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {groupCards.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => openGroup(group.id)}
              className="min-h-[172px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-sm font-semibold text-slate-900">{group.label}</span>
                {group.value ? (
                  <span className="max-w-[84px] shrink-0 rounded-full bg-white px-2 py-0.5 text-right text-[10px] font-semibold leading-3 text-indigo-700">
                    {group.value}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-4 text-[11px] leading-5 text-slate-500">{group.description}</p>
            </button>
          ))}
        </div>
      </section>

      {sheetOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-end justify-center">
              <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
              <div
                className="relative flex h-[88dvh] w-full max-w-xl flex-col rounded-t-[2rem] border border-slate-200 bg-white shadow-2xl"
                role="dialog"
                aria-label="Insights mobile controls"
              >
                <div className="px-4 pt-3">
                  <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Insights</p>
                      <h3 className="text-base font-semibold text-slate-900">Opportunity Hub Controls</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {groupCards.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveGroup(group.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          activeGroup === group.id
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div ref={sheetBodyRef} className="mt-3 flex-1 overflow-y-auto px-4 pb-6">
                  <InsightsQuickPanel compact className="rounded-3xl" />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
