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
  | 'weekly-challenges'
  | 'shared-accountability'
  | 'identity-trust'
  | 'delivery-packaging'
  | 'brief-to-match'
  | 'feed-mode'
  | 'opportunity-actions'
  | 'opportunity-matches'
  | 'career-quests'
  | 'skill-gap';

type SectionCard = {
  id: MobileInsightsSectionId;
  label: string;
  description: string;
  value?: string | null;
};

const INSIGHTS_CACHE_VERSION = 'v2';
const INSIGHTS_CACHE_TTL_MS = 15 * 60 * 1000;

const DEFAULT_CAREER_GOAL_COUNT = 4;
const DEFAULT_MISSION_COUNT = 3;
const DEFAULT_ACTIVE_STREAK_LIMIT = 3;

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
  const [activeSection, setActiveSection] = useState<MobileInsightsSectionId>('career-daily');

  const sheetBodyRef = useRef<HTMLDivElement | null>(null);

  const readCachedSummary = useCallback(() => {
    if (!currentUserId) return;
    try {
      const raw = localStorage.getItem(insightsCacheKey);
      if (!raw) return;
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
      if (Date.now() - ts > INSIGHTS_CACHE_TTL_MS) return;
      if (parsed?.pgs) setPgs(parsed.pgs);
      if (parsed?.streak) setStreak(parsed.streak);
      if (Array.isArray(parsed?.achievements)) setAchievements(parsed.achievements);
      if (parsed?.creatorChallenges) setCreatorChallengeDashboard(parsed.creatorChallenges);
      if (Array.isArray(parsed?.quests)) setQuests(parsed.quests);
      if (parsed?.hub) setHub(parsed.hub);
      setLoading(false);
    } catch {
      // Ignore cache parse errors.
    }
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

  const refreshSummary = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    if (!pgs && !streak && !hub) setLoading(true);
    try {
      const results = await withFastFail(
        Promise.allSettled([
          InsightsService.getMyPgs(),
          InsightsService.getMyStreak(),
          InsightsService.getMyAchievements(),
          InsightsService.getMyCreatorChallenges(),
          InsightsService.getMyQuests(),
          InsightsService.getOpportunityHub()
        ]),
        15000,
        'Insights request timed out. Please retry.'
      );

      const [pgsResult, streakResult, achievementsResult, creatorChallengesResult, questsResult, hubResult] = results;
      const nextPgs = takeValue(pgsResult);
      const nextStreak = takeValue(streakResult);
      const nextAchievements = takeValue(achievementsResult);
      const nextCreatorChallenges = takeValue(creatorChallengesResult);
      const nextQuests = takeValue(questsResult);
      const nextHub = takeValue(hubResult);

      setPgs(nextPgs || null);
      setStreak(nextStreak || null);
      setAchievements(Array.isArray(nextAchievements) ? nextAchievements : []);
      setCreatorChallengeDashboard(nextCreatorChallenges || null);
      setQuests(Array.isArray(nextQuests) ? nextQuests : []);
      setHub(nextHub || null);
      persistSummary({
        pgs: nextPgs || null,
        streak: nextStreak || null,
        achievements: Array.isArray(nextAchievements) ? nextAchievements : [],
        creatorChallenges: nextCreatorChallenges || null,
        quests: Array.isArray(nextQuests) ? nextQuests : [],
        hub: nextHub || null
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Unable to refresh mobile insights.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hub, persistSummary, pgs, streak]);

  useEffect(() => {
    readCachedSummary();
    void refreshSummary();
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

    const scrollToActiveSection = () => {
      if (cancelled) return;
      const root = sheetBodyRef.current;
      const target = root?.querySelector?.(`[data-insights-section="${activeSection}"]`) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (attempts >= 20) return;
      attempts += 1;
      window.setTimeout(scrollToActiveSection, 120);
    };

    const timer = window.setTimeout(scrollToActiveSection, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, sheetOpen]);

  const earnedAchievements = achievements.filter((item) => item?.earned);
  const careerDaily = streak?.careerDaily || null;
  const dailyMissions = streak?.dailyMissions || null;
  const friendStreaks = streak?.friendStreaks || null;

  const sectionCards = useMemo<SectionCard[]>(() => {
    const verificationState = String(hub?.identity?.verificationState || 'Trust building').trim();
    const activeChallengeCount = Number(creatorChallengeDashboard?.activeCount || 0);
    const activeFriendCount = Number(friendStreaks?.activeCount || 0);
    const friendLimit = Number(friendStreaks?.maxActive || DEFAULT_ACTIVE_STREAK_LIMIT);
    const deliveryTotal = Number(hub?.delivery?.activeContracts || 0) + Number(hub?.delivery?.activeOrders || 0);
    const opportunityMatches = Number(hub?.matching?.matches?.length || 0);
    const opportunityActions = Number(hub?.actions?.length || 0);
    const skillGapCount = Array.isArray((hub as any)?.skillGap?.recommendations)
      ? (hub as any).skillGap.recommendations.length
      : 0;

    return [
      {
        id: 'career-daily',
        label: 'Career streak',
        description: 'Post, reply, apply, learn daily.',
        value: `${Number(careerDaily?.completedCount || 0)}/${Number(careerDaily?.goalCount || DEFAULT_CAREER_GOAL_COUNT)}`
      },
      {
        id: 'daily-missions',
        label: 'Daily missions',
        description: 'Rotated goals that bring users back.',
        value: `${Number(dailyMissions?.completedCount || 0)}/${Number(dailyMissions?.totalCount || DEFAULT_MISSION_COUNT)}`
      },
      {
        id: 'badges-trophies',
        label: 'Badges and trophies',
        description: 'Visible status and progress cabinet.',
        value: `${earnedAchievements.length} earned`
      },
      {
        id: 'weekly-challenges',
        label: 'Weekly challenges',
        description: 'Submit, vote, and compete to win.',
        value: `${activeChallengeCount} active`
      },
      {
        id: 'shared-accountability',
        label: 'Shared accountability',
        description: 'Mutual-follow friend streaks.',
        value: `${activeFriendCount}/${friendLimit} active`
      },
      {
        id: 'identity-trust',
        label: 'Identity and trust',
        description: 'Profile health, trust, and visibility.',
        value: verificationState
      },
      {
        id: 'delivery-packaging',
        label: 'Delivery and packaging',
        description: 'Contracts, orders, gigs, and jobs.',
        value: `${deliveryTotal} live`
      },
      {
        id: 'brief-to-match',
        label: 'Brief to match',
        description: 'Generate hiring and packaging briefs.',
        value: 'Generate'
      },
      {
        id: 'feed-mode',
        label: 'Feed mode',
        description: 'Tune the member-home recommendation mode.',
        value: 'Open'
      },
      {
        id: 'opportunity-actions',
        label: 'Opportunity actions',
        description: 'Recommended next moves from the hub.',
        value: `${opportunityActions} live`
      },
      {
        id: 'opportunity-matches',
        label: 'Opportunity matches',
        description: 'Jobs, gigs, and pages ranked for you.',
        value: `${opportunityMatches} shown`
      },
      {
        id: 'career-quests',
        label: 'Career quests',
        description: 'Actionable tasks tied to growth.',
        value: `${quests.length} active`
      },
      {
        id: 'skill-gap',
        label: 'Skill gap',
        description: 'Generate next-step recommendations.',
        value: skillGapCount > 0 ? `${skillGapCount} ready` : 'Generate'
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

  const openSection = useCallback((sectionId: MobileInsightsSectionId) => {
    setActiveSection(sectionId);
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
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-end justify-between gap-3">
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{pgs ? Number(pgs.score || 0).toFixed(0) : '--'}</div>
            <div className="text-right text-xs uppercase tracking-wide text-slate-500">
              <div>Streak {Number(streak?.currentStreakDays || 0)}d</div>
              <div className="mt-1">{hub?.trust?.trustTier || 'Building'} tier</div>
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

        {error ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick toggles</p>
          <span className="text-[11px] text-slate-400">Open what you need</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {sectionCards.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => openSection(section.id)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{section.label}</span>
                {section.value ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{section.value}</span>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">{section.description}</p>
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
                    {sectionCards.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSection(section.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          activeSection === section.id
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {section.label}
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
