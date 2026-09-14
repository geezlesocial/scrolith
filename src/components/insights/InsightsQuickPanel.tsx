import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import { CommunityService, type BroadcastChannelSummary, type CommunityPollSummary } from '../../services/community';
import {
  type CreatorChallenge,
  type CreatorChallengeDashboard,
  type DailyMissionSummary,
  type EngagementExpansionSummary,
  type EventSeasonSummary,
  type ExpertBountyQuestionSummary,
  type FanClubCard,
  type FriendStreakDashboard,
  type InsightAchievement,
  InsightsService,
  type CareerDailyActionState,
  type FeedMode,
  type FriendStreakActiveSummary,
  type FriendStreakInviteSummary,
  type LeagueTierSummary,
  type OpportunityBriefResult,
  type OpportunityHubData,
  type PremiumSeriesCard,
  type ProfessionalScore,
  type ReferralSquadSummary,
  type RewardDropSummary,
  type SkillMiniGameSummary,
  type UserStreak,
  type UserQuest
} from '../../services/insights';
import { ScrolithaService, type ScrolithaRewriteMode } from '../../services/scrolitha';
import { readCoachDraft, writeCoachDraft, type CoachDraftSnapshot } from '../../utils/scrolithaDrafts';
import { classifyScrolithaClientError } from '../../utils/scrolithaErrors';
import { runScrolithaRewrite } from '../../utils/scrolithaRewrite';
import { extractScrolithaRewrittenText, extractScrolithaWarning } from '../../utils/scrolithaText';
import { ScrollService, type ScrollSeriesDiscovery } from '../../services/scroll';
import { getHighlightedCommunityEvents, type HighlightCommunityEvent } from '../../utils/communityEventHighlights';

type Props = {
  compact?: boolean;
  className?: string;
  desktopMode?: 'rail' | 'wide';
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

const takeErrorMessage = (results: Array<PromiseSettledResult<unknown>>) => {
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
  const reason = rejected?.reason as any;
  return reason?.response?.data?.message || reason?.message || 'Failed to load insights.';
};

const compactNumberFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1
});

const wholeNumberFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 0
});

const formatMetric = (value: number) => compactNumberFormatter.format(Number.isFinite(value) ? value : 0);

const formatWholeNumber = (value: number) => wholeNumberFormatter.format(Number.isFinite(value) ? value : 0);

const tierClassName = (tier: string) => {
  switch (String(tier || '').toLowerCase()) {
    case 'platinum':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700';
    case 'gold':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'silver':
      return 'border-slate-300 bg-slate-100 text-slate-700';
    default:
      return 'border-orange-200 bg-orange-50 text-orange-700';
  }
};

const leagueAccentClassName = (accent: string) => {
  switch (String(accent || '').toLowerCase()) {
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'violet':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'indigo':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
};

const formatRelativeDeadline = (isoValue?: string | null) => {
  if (!isoValue) return 'No deadline';
  const target = new Date(isoValue);
  const diffMs = target.getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return 'No deadline';
  if (diffMs <= 0) return 'Ended';
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.ceil(diffMs / 86400000);
  return `${days}d left`;
};

const DEFAULT_CAREER_DAILY_ACTIONS: CareerDailyActionState[] = [
  { type: 'post', label: 'Post', completed: false },
  { type: 'reply', label: 'Reply', completed: false },
  { type: 'apply', label: 'Apply', completed: false },
  { type: 'learn', label: 'Learn', completed: false }
];

type CoachSurface = 'post' | 'gig' | 'brief';
type CoachActionKey = 'grammar' | 'rephrase' | 'professional' | 'shorten' | 'expand' | 'improve-gig' | 'clarify-brief';

const COACH_SURFACE_OPTIONS: Array<{ value: CoachSurface; label: string; helper: string }> = [
  { value: 'post', label: 'Posts', helper: 'Polish updates before you publish.' },
  { value: 'gig', label: 'Gigs', helper: 'Sharpen your listing copy and offer framing.' },
  { value: 'brief', label: 'Briefs', helper: 'Clarify requirements before you match or hire.' }
];

const COACH_PLACEHOLDERS: Record<CoachSurface, string> = {
  post: 'Paste a post draft, announcement, or community update for Scrolitha to improve.',
  gig: 'Paste your gig title, pitch, or package copy for a stronger offer.',
  brief: 'Paste a service need, hiring brief, or project outline to tighten before matching.'
};

const COACH_ACTIONS: Record<CoachSurface, Array<{ key: CoachActionKey; label: string; mode?: ScrolithaRewriteMode }>> = {
  post: [
    { key: 'grammar', label: 'Improve grammar', mode: 'grammar' },
    { key: 'rephrase', label: 'Rephrase', mode: 'rephrase' },
    { key: 'professional', label: 'Make professional', mode: 'professional' },
    { key: 'shorten', label: 'Shorten', mode: 'shorten' },
    { key: 'expand', label: 'Expand', mode: 'expand' }
  ],
  gig: [
    { key: 'improve-gig', label: 'Improve gig' },
    { key: 'professional', label: 'Make professional', mode: 'professional' },
    { key: 'shorten', label: 'Shorten', mode: 'shorten' }
  ],
  brief: [
    { key: 'clarify-brief', label: 'Clarify brief', mode: 'rephrase' },
    { key: 'professional', label: 'Make professional', mode: 'professional' },
    { key: 'expand', label: 'Expand', mode: 'expand' }
  ]
};

const INSIGHTS_CACHE_VERSION = 'v2';
const INSIGHTS_CACHE_TTL_MS = 15 * 60 * 1000;

export default function InsightsQuickPanel({
  compact = false,
  className = '',
  desktopMode = 'rail'
}: Props) {
  const { socket } = useSocket();
  const { user } = useUser();
  const isDesktopRail = !compact && desktopMode === 'rail';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pgs, setPgs] = useState<ProfessionalScore | null>(null);
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [achievements, setAchievements] = useState<InsightAchievement[]>([]);
  const [creatorChallengeDashboard, setCreatorChallengeDashboard] = useState<CreatorChallengeDashboard | null>(null);
  const [quests, setQuests] = useState<UserQuest[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [hub, setHub] = useState<OpportunityHubData | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>('growth');
  const [updatingFeedMode, setUpdatingFeedMode] = useState(false);
  const [skillGapBusy, setSkillGapBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [questBusyId, setQuestBusyId] = useState<string | null>(null);
  const [questStatus, setQuestStatus] = useState<string | null>(null);
  const [skillGap, setSkillGap] = useState<any>(null);
  const [skillGapStatus, setSkillGapStatus] = useState<string | null>(null);
  const [briefPrompt, setBriefPrompt] = useState('');
  const [briefResult, setBriefResult] = useState<OpportunityBriefResult | null>(null);
  const [briefStatus, setBriefStatus] = useState<string | null>(null);
  const [friendStreakActionBusy, setFriendStreakActionBusy] = useState<string | null>(null);
  const [friendStreakStatus, setFriendStreakStatus] = useState<string | null>(null);
  const [selectedFriendCandidateId, setSelectedFriendCandidateId] = useState('');
  const [challengeActionBusy, setChallengeActionBusy] = useState<string | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<string | null>(null);
  const [selectedChallengeSubmissionMap, setSelectedChallengeSubmissionMap] = useState<Record<string, string>>({});
  const [featuredSeries, setFeaturedSeries] = useState<ScrollSeriesDiscovery[]>([]);
  const [broadcastChannels, setBroadcastChannels] = useState<BroadcastChannelSummary[]>([]);
  const [officeHours, setOfficeHours] = useState<HighlightCommunityEvent[]>([]);
  const [pollCards, setPollCards] = useState<CommunityPollSummary[]>([]);
  const [broadcastActionBusy, setBroadcastActionBusy] = useState<string | null>(null);
  const [officeHourActionBusy, setOfficeHourActionBusy] = useState<string | null>(null);
  const [officeHourStatus, setOfficeHourStatus] = useState<string | null>(null);
  const [pollActionBusy, setPollActionBusy] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [coachSurface, setCoachSurface] = useState<CoachSurface>('post');
  const [coachInput, setCoachInput] = useState('');
  const [coachOutput, setCoachOutput] = useState('');
  const [coachBusyAction, setCoachBusyAction] = useState<CoachActionKey | null>(null);
  const [coachStatus, setCoachStatus] = useState<string | null>(null);
  const [coachRetryable, setCoachRetryable] = useState(false);
  const [lastCoachAction, setLastCoachAction] = useState<CoachActionKey | null>(null);
  const coachInFlightRef = useRef(false);
  const coachDraftHydratedRef = useRef(false);
  const coachDraftBySurfaceRef = useRef<NonNullable<CoachDraftSnapshot['bySurface']>>({});
  const [referralSquadActionBusy, setReferralSquadActionBusy] = useState<string | null>(null);
  const [referralSquadStatus, setReferralSquadStatus] = useState<string | null>(null);
  const [selectedReferralCandidateId, setSelectedReferralCandidateId] = useState('');
  const [rewardDropActionBusy, setRewardDropActionBusy] = useState<string | null>(null);
  const [rewardDropStatus, setRewardDropStatus] = useState<string | null>(null);
  const [engagementExpansion, setEngagementExpansion] = useState<EngagementExpansionSummary | null>(null);
  const [fanClubActionBusy, setFanClubActionBusy] = useState<string | null>(null);
  const [fanClubStatus, setFanClubStatus] = useState<string | null>(null);
  const [miniGameActionBusy, setMiniGameActionBusy] = useState<string | null>(null);
  const [miniGameStatus, setMiniGameStatus] = useState<string | null>(null);
  const [selectedMiniGameChoiceMap, setSelectedMiniGameChoiceMap] = useState<Record<string, string>>({});
  const [seasonActionBusy, setSeasonActionBusy] = useState<string | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<string | null>(null);
  const [premiumSeriesActionBusy, setPremiumSeriesActionBusy] = useState<string | null>(null);
  const [premiumSeriesStatus, setPremiumSeriesStatus] = useState<string | null>(null);
  const [bountyActionBusy, setBountyActionBusy] = useState<string | null>(null);
  const [bountyStatus, setBountyStatus] = useState<string | null>(null);
  const [bountyTitle, setBountyTitle] = useState('');
  const [bountyBody, setBountyBody] = useState('');
  const [bountyCategory, setBountyCategory] = useState('');
  const [bountyTags, setBountyTags] = useState('');
  const [bountyAmount, setBountyAmount] = useState('');
  const [bountyAnswerDrafts, setBountyAnswerDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const lastSocketRefreshRef = useRef(0);
  const currentUserId = String((user as any)?.id || (user as any)?.user_id || '').trim();
  const insightsCacheKey = useMemo(
    () => `insights_quick_panel:${INSIGHTS_CACHE_VERSION}:${currentUserId || 'guest'}`,
    [currentUserId]
  );
  const hasVisibleData =
    Boolean(pgs) ||
    Boolean(streak) ||
    Boolean(hub) ||
    Boolean(skillGap) ||
    Boolean(creatorChallengeDashboard?.challenges?.length) ||
    featuredSeries.length > 0 ||
    broadcastChannels.length > 0 ||
    officeHours.length > 0 ||
    pollCards.length > 0 ||
    Boolean(engagementExpansion?.fanClubs?.freeClubs?.length) ||
    Boolean(engagementExpansion?.fanClubs?.fanChannels?.length) ||
    Boolean(engagementExpansion?.miniGames?.games?.length) ||
    Boolean(engagementExpansion?.seasons?.items?.length) ||
    Boolean(engagementExpansion?.premiumSeries?.items?.length) ||
    Boolean(engagementExpansion?.expertBounties?.questions?.length) ||
    achievements.length > 0 ||
    quests.length > 0 ||
    matches.length > 0;

  useEffect(() => {
    if (!currentUserId) return;
    try {
      const raw = localStorage.getItem(insightsCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        ts?: number;
        pgs?: ProfessionalScore | null;
        streak?: any;
        achievements?: InsightAchievement[];
        creatorChallenges?: CreatorChallengeDashboard | null;
        quests?: UserQuest[];
        hub?: OpportunityHubData | null;
        matches?: any[];
        feedMode?: FeedMode;
        skillGap?: any;
        featuredSeries?: ScrollSeriesDiscovery[];
        broadcastChannels?: BroadcastChannelSummary[];
        officeHours?: HighlightCommunityEvent[];
        pollCards?: CommunityPollSummary[];
        engagementExpansion?: EngagementExpansionSummary | null;
      };
      const ts = Number(parsed?.ts || 0);
      if (Date.now() - ts > INSIGHTS_CACHE_TTL_MS) return;
      if (parsed?.pgs) setPgs(parsed.pgs);
      if (parsed?.streak) setStreak(parsed.streak);
      if (Array.isArray(parsed?.achievements)) setAchievements(parsed.achievements);
      if (parsed?.creatorChallenges) setCreatorChallengeDashboard(parsed.creatorChallenges);
      if (Array.isArray(parsed?.quests)) setQuests(parsed.quests.slice(0, compact ? 2 : 4));
      if (parsed?.hub) setHub(parsed.hub);
      if (Array.isArray(parsed?.matches)) setMatches(parsed.matches.slice(0, compact ? 2 : 3));
      if (parsed?.feedMode) setFeedMode(parsed.feedMode);
      if (parsed?.skillGap) setSkillGap(parsed.skillGap);
      if (Array.isArray(parsed?.featuredSeries)) setFeaturedSeries(parsed.featuredSeries.slice(0, compact ? 2 : 3));
      if (Array.isArray(parsed?.broadcastChannels)) setBroadcastChannels(parsed.broadcastChannels.slice(0, compact ? 2 : 3));
      if (Array.isArray(parsed?.officeHours)) setOfficeHours(parsed.officeHours.slice(0, compact ? 2 : 3));
      if (Array.isArray(parsed?.pollCards)) setPollCards(parsed.pollCards.slice(0, compact ? 2 : 3));
      if (parsed?.engagementExpansion) setEngagementExpansion(parsed.engagementExpansion);
      hasLoadedRef.current = true;
      setLoading(false);
      setError(null);
    } catch {
      // Ignore cache parse errors.
    }
  }, [compact, currentUserId, insightsCacheKey]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      if (!silent && !hasLoadedRef.current && !hasVisibleData) setLoading(true);
      if (silent && hasLoadedRef.current) setRefreshing(true);
      setError(null);
      setStatusMessage(null);
      try {
        const results = await Promise.allSettled([
          withFastFail(InsightsService.getMyPgs(), 15000, 'Professional score request timed out.'),
          withFastFail(InsightsService.getMyStreak(), 15000, 'Career streak request timed out.'),
          withFastFail(InsightsService.getMyAchievements(), 15000, 'Achievement request timed out.'),
          withFastFail(InsightsService.getMyCreatorChallenges(), 15000, 'Challenge request timed out.'),
          withFastFail(InsightsService.getMyQuests(), 15000, 'Quest request timed out.'),
          withFastFail(InsightsService.getOpportunityHub(), 15000, 'Opportunity hub request timed out.'),
          withFastFail(InsightsService.getMatches('all'), 15000, 'Opportunity matches request timed out.'),
          withFastFail(InsightsService.getFeedMode(), 15000, 'Feed mode request timed out.'),
          withFastFail(InsightsService.getSkillGap(), 15000, 'Skill gap request timed out.'),
          withFastFail(ScrollService.getDiscoverableSeries(compact ? 2 : 3), 15000, 'Series request timed out.'),
          withFastFail(CommunityService.getBroadcastChannels(compact ? 2 : 3), 15000, 'Broadcast request timed out.'),
          withFastFail(CommunityService.getEvents(), 15000, 'Office hours request timed out.'),
          withFastFail(CommunityService.getPolls(compact ? 2 : 3), 15000, 'Poll request timed out.'),
          withFastFail(InsightsService.getEngagementExpansion(), 15000, 'Next-phase discovery request timed out.')
        ]);

        const [
          pgsResult,
          streakResult,
          achievementsResult,
          creatorChallengesResult,
          questsResult,
          hubResult,
          matchesResult,
          feedModeResult,
          skillGapResult,
          featuredSeriesResult,
          broadcastChannelsResult,
          officeHoursResult,
          pollCardsResult,
          engagementExpansionResult
        ] = results;
        const pgsData = takeValue(pgsResult);
        const streakData = takeValue(streakResult);
        const achievementsData = takeValue(achievementsResult);
        const creatorChallengesData = takeValue(creatorChallengesResult);
        const questsData = takeValue(questsResult);
        const hubData = takeValue(hubResult);
        const matchesData = takeValue(matchesResult);
        const feedModeData = takeValue(feedModeResult);
        const skillGapData = takeValue(skillGapResult);
        const featuredSeriesData = takeValue(featuredSeriesResult);
        const broadcastChannelsData = takeValue(broadcastChannelsResult);
        const officeHoursData =
          officeHoursResult.status === 'fulfilled'
            ? getHighlightedCommunityEvents(Array.isArray(officeHoursResult.value) ? officeHoursResult.value : [], compact ? 2 : 3)
            : null;
        const pollCardsData = takeValue(pollCardsResult);
        const engagementExpansionData = takeValue(engagementExpansionResult);

        if (pgsData) setPgs(pgsData);
        if (streakData) setStreak(streakData);
        if (Array.isArray(achievementsData)) setAchievements(achievementsData);
        if (creatorChallengesData) setCreatorChallengeDashboard(creatorChallengesData);
        if (Array.isArray(questsData)) setQuests(questsData.slice(0, compact ? 2 : 4));
        if (hubData) setHub(hubData);
        const sourceMatches = Array.isArray(hubData?.matching?.matches)
          ? hubData.matching.matches
          : Array.isArray(matchesData)
            ? matchesData
            : [];
        setMatches(sourceMatches.slice(0, compact ? 2 : 3));
        if (feedModeData?.mode) setFeedMode((feedModeData.mode || 'growth') as FeedMode);
        if (skillGapData) setSkillGap(skillGapData);
        if (Array.isArray(featuredSeriesData)) setFeaturedSeries(featuredSeriesData.slice(0, compact ? 2 : 3));
        if (Array.isArray(broadcastChannelsData)) setBroadcastChannels(broadcastChannelsData.slice(0, compact ? 2 : 3));
        if (Array.isArray(officeHoursData)) setOfficeHours(officeHoursData.slice(0, compact ? 2 : 3));
        if (Array.isArray(pollCardsData)) setPollCards(pollCardsData.slice(0, compact ? 2 : 3));
        if (engagementExpansionData) setEngagementExpansion(engagementExpansionData);
        try {
          localStorage.setItem(
            insightsCacheKey,
            JSON.stringify({
              ts: Date.now(),
              pgs: pgsData || null,
              streak: streakData || null,
              achievements: Array.isArray(achievementsData) ? achievementsData : [],
              creatorChallenges: creatorChallengesData || null,
              quests: Array.isArray(questsData) ? questsData : [],
              hub: hubData || null,
              matches: sourceMatches,
              feedMode: (feedModeData?.mode || 'growth') as FeedMode,
              skillGap: skillGapData || null,
              featuredSeries: Array.isArray(featuredSeriesData) ? featuredSeriesData : [],
              broadcastChannels: Array.isArray(broadcastChannelsData) ? broadcastChannelsData : [],
              officeHours: Array.isArray(officeHoursData) ? officeHoursData : [],
              pollCards: Array.isArray(pollCardsData) ? pollCardsData : [],
              engagementExpansion: engagementExpansionData || null
            })
          );
        } catch {
          // Ignore cache write errors.
        }

        if (!results.some((result) => result.status === 'fulfilled')) {
          throw new Error(takeErrorMessage(results));
        }
        hasLoadedRef.current = true;
      } catch (e: any) {
        const nextMessage = e?.response?.data?.message || e?.message || 'Failed to load insights.';
        if (hasVisibleData) {
          setError(null);
          setStatusMessage('Showing saved insights while we reconnect.');
        } else {
          setStatusMessage(null);
          setError(nextMessage);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      broadcastChannels.length,
      compact,
      engagementExpansion?.expertBounties?.questions?.length,
      engagementExpansion?.fanClubs?.fanChannels?.length,
      engagementExpansion?.fanClubs?.freeClubs?.length,
      engagementExpansion?.miniGames?.games?.length,
      engagementExpansion?.premiumSeries?.items?.length,
      engagementExpansion?.seasons?.items?.length,
      featuredSeries.length,
      hasVisibleData,
      insightsCacheKey,
      officeHours.length,
      pollCards.length
    ]
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
      'insights:career_daily_updated',
      'insights:friend_streak_updated',
      'insights:creator_challenge_updated',
      'insights:quests_assigned',
      'insights:quests_progress',
      'insights:quests_completed',
      'insights:quest_reward_granted',
      'insights:opportunity_match_ready',
      'insights:copilot_tip'
    ] as const;
    socketHandlers.forEach((eventName) => socket?.on(eventName, onRefresh));
    return () => {
      socketHandlers.forEach((eventName) => socket?.off(eventName, onRefresh));
    };
  }, [socket, refresh, currentUserId]);

  useEffect(() => {
    const onEventRefresh = () => {
      void refresh({ silent: true });
    };
    const browserEvents = [
      'community:event_registered',
      'community:event_unregistered',
      'community:event_created',
      'community:event_updated',
      'community:event_deleted'
    ] as const;
    browserEvents.forEach((eventName) => window.addEventListener(eventName, onEventRefresh as EventListener));
    return () => {
      browserEvents.forEach((eventName) => window.removeEventListener(eventName, onEventRefresh as EventListener));
    };
  }, [refresh]);

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

  const topHubSkills = useMemo(() => {
    if (!Array.isArray(hub?.identity?.skills)) return [];
    return hub.identity.skills.slice(0, compact ? 4 : 6);
  }, [hub?.identity?.skills, compact]);

  const briefMatches = useMemo(
    () => ({
      jobs: Array.isArray(briefResult?.matches?.jobs) ? briefResult.matches.jobs.slice(0, compact ? 2 : 3) : [],
      gigs: Array.isArray(briefResult?.matches?.gigs) ? briefResult.matches.gigs.slice(0, compact ? 2 : 3) : [],
      pages: Array.isArray(briefResult?.matches?.pages) ? briefResult.matches.pages.slice(0, compact ? 1 : 2) : []
    }),
    [briefResult, compact]
  );

  const resolveMatchTitle = (match: any) =>
    String(match?.title || match?.name || match?.target?.title || match?.target?.name || `${String(match?.targetType || 'opportunity').toUpperCase()} match`);

  const resolveMatchHref = (match: any) => {
    const direct = String(match?.destinationUrl || '').trim();
    if (direct) return direct;
    const targetType = String(match?.targetType || '').toLowerCase();
    const targetId = String(match?.targetId || match?.target?.id || '').trim();
    if (targetType === 'job' && targetId) return `/jobs/${targetId}`;
    if (targetType === 'gig' && targetId) return `/gigs/${targetId}`;
    const slug = String(match?.slug || match?.target?.slug || '').trim();
    if ((targetType === 'page' || targetType === 'company') && slug) return `/company/${slug}`;
    return '';
  };

  const resolveMatchMeta = (match: any) => {
    if (match?.clientName) return `Client: ${match.clientName}`;
    if (match?.sellerName) return `Seller: ${match.sellerName}`;
    if (match?.industry) return `Industry: ${match.industry}`;
    if (match?.targetType === 'job') {
      const budget = String(match?.target?.budget || match?.budget || '').trim();
      return budget ? `Budget: ${budget}` : 'Job opportunity';
    }
    if (match?.targetType === 'gig') {
      const price = Number(match?.target?.price ?? match?.price ?? 0);
      return price > 0 ? `From ${formatWholeNumber(price)}` : 'Packaged service';
    }
    return 'Recommended opportunity';
  };

  const careerDaily = streak?.careerDaily || null;
  const careerDailyActions =
    Array.isArray(careerDaily?.actions) && careerDaily.actions.length
      ? careerDaily.actions
      : DEFAULT_CAREER_DAILY_ACTIONS;
  const dailyMissions = (streak?.dailyMissions || null) as DailyMissionSummary | null;
  const missionCards = Array.isArray(dailyMissions?.missions) ? dailyMissions.missions : [];
  const friendStreaks = (streak?.friendStreaks || null) as FriendStreakDashboard | null;
  const activeFriendStreaks = Array.isArray(friendStreaks?.active) ? friendStreaks.active : [];
  const incomingFriendInvites = Array.isArray(friendStreaks?.incomingInvites) ? friendStreaks.incomingInvites : [];
  const outgoingFriendInvites = Array.isArray(friendStreaks?.outgoingInvites) ? friendStreaks.outgoingInvites : [];
  const friendCandidates = Array.isArray(friendStreaks?.candidates) ? friendStreaks.candidates : [];
  const leagueTier = (streak?.leagueTier || null) as LeagueTierSummary | null;
  const referralSquads = (streak?.referralSquads || null) as ReferralSquadSummary | null;
  const rewardDrops = (streak?.rewardDrops || null) as RewardDropSummary | null;
  const referralCandidates = Array.isArray(referralSquads?.candidates) ? referralSquads.candidates : [];
  const incomingReferralInvites = Array.isArray(referralSquads?.incomingInvites) ? referralSquads.incomingInvites : [];
  const outgoingReferralInvites = Array.isArray(referralSquads?.outgoingInvites) ? referralSquads.outgoingInvites : [];
  const rewardDropCards = Array.isArray(rewardDrops?.drops) ? rewardDrops.drops : [];
  const fanClubGroups = engagementExpansion?.fanClubs || { freeClubs: [], fanChannels: [] };
  const freeFanClubs = Array.isArray(fanClubGroups.freeClubs) ? fanClubGroups.freeClubs : [];
  const paidFanChannels = Array.isArray(fanClubGroups.fanChannels) ? fanClubGroups.fanChannels : [];
  const miniGames = Array.isArray(engagementExpansion?.miniGames?.games) ? engagementExpansion?.miniGames?.games : [];
  const seasonItems = Array.isArray(engagementExpansion?.seasons?.items) ? engagementExpansion?.seasons?.items : [];
  const premiumSeriesCards = Array.isArray(engagementExpansion?.premiumSeries?.items) ? engagementExpansion?.premiumSeries?.items : [];
  const expertBountyQuestions = Array.isArray(engagementExpansion?.expertBounties?.questions)
    ? engagementExpansion?.expertBounties?.questions
    : [];
  const creatorChallenges = Array.isArray(creatorChallengeDashboard?.challenges) ? creatorChallengeDashboard.challenges : [];
  const earnedAchievements = achievements.filter((item) => item?.earned);
  const earnedBadges = earnedAchievements.filter((item) => ['bronze', 'silver'].includes(String(item?.tier || '').toLowerCase()));
  const earnedTrophies = earnedAchievements.filter((item) => ['gold', 'platinum'].includes(String(item?.tier || '').toLowerCase()));
  const lockedAchievementPreview = achievements.filter((item) => !item?.earned).slice(0, compact ? 2 : 3);
  const buildSeriesHref = useCallback((seriesId?: string | null) => {
    const id = String(seriesId || '').trim();
    if (!id) return '/scroll';
    return `/scroll?series=${encodeURIComponent(id)}`;
  }, []);
  const resolveBroadcastHref = useCallback((channel?: BroadcastChannelSummary | null) => {
    const direct = String(channel?.source?.href || '').trim();
    return direct || '/community';
  }, []);
  const buildActorLabel = useCallback((person?: { name?: string | null; username?: string | null } | null) => {
    if (!person) return 'Scrolith member';
    const name = String(person.name || '').trim();
    const username = String(person.username || '').trim();
    if (name && username) return `${name} (@${username})`;
    return name || (username ? `@${username}` : 'Scrolith member');
  }, []);
  const focusInsightsSection = useCallback((sectionId: string, group?: 'growth' | 'opportunity') => {
    if (typeof window !== 'undefined' && group) {
      window.dispatchEvent(
        new CustomEvent('insights:open_section', {
          detail: { group, section: sectionId }
        })
      );
    }
    if (typeof document === 'undefined') return;
    window.setTimeout(() => {
      document.querySelector(`[data-insights-section="${sectionId}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, group ? 120 : 0);
  }, []);

  // Desktop rail: respond to Open Coach / section focus without full page reload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOpenSection = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: string }>).detail || {};
      const sectionId = String(detail.section || '').trim();
      if (!sectionId) return;
      window.setTimeout(() => {
        const target = document.querySelector(
          `[data-insights-section="${CSS.escape(sectionId)}"]`
        ) as HTMLElement | null;
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }, 80);
    };
    window.addEventListener('insights:open_section', onOpenSection as EventListener);
    return () => window.removeEventListener('insights:open_section', onOpenSection as EventListener);
  }, []);

  // Hydrate Scrolitha coach drafts once per session (survives refresh / route return)
  useEffect(() => {
    if (coachDraftHydratedRef.current) return;
    coachDraftHydratedRef.current = true;
    const draft = readCoachDraft();
    if (!draft) return;
    if (draft.bySurface) coachDraftBySurfaceRef.current = { ...draft.bySurface };
    const surface = (draft.surface || 'post') as CoachSurface;
    const surfaceDraft = draft.bySurface?.[surface];
    setCoachSurface(surface);
    setCoachInput(String(surfaceDraft?.input || ''));
    setCoachOutput(String(surfaceDraft?.output || ''));
  }, []);

  // Persist active surface drafts without touching Member Home layout
  useEffect(() => {
    if (!coachDraftHydratedRef.current) return;
    coachDraftBySurfaceRef.current = {
      ...coachDraftBySurfaceRef.current,
      [coachSurface]: {
        input: coachInput,
        output: coachOutput,
        updatedAt: Date.now()
      }
    };
    writeCoachDraft({
      surface: coachSurface,
      bySurface: coachDraftBySurfaceRef.current
    });
  }, [coachSurface, coachInput, coachOutput]);

  const switchCoachSurface = useCallback((next: CoachSurface) => {
    if (next === coachSurface) return;
    // Save current before switch
    coachDraftBySurfaceRef.current = {
      ...coachDraftBySurfaceRef.current,
      [coachSurface]: {
        input: coachInput,
        output: coachOutput,
        updatedAt: Date.now()
      }
    };
    const restored = coachDraftBySurfaceRef.current[next];
    setCoachSurface(next);
    setCoachInput(String(restored?.input || ''));
    setCoachOutput(String(restored?.output || ''));
    setCoachStatus(null);
    setCoachRetryable(false);
  }, [coachInput, coachOutput, coachSurface]);

  useEffect(() => {
    if (!miniGames.length) return;
    setSelectedMiniGameChoiceMap((current) => {
      const next = { ...current };
      let changed = false;
      miniGames.forEach((game) => {
        const gameId = String(game?.id || '').trim();
        const currentChoice = String(next[gameId] || '').trim();
        const preferredChoice =
          String(game?.selectedChoiceId || '').trim() ||
          String(game?.choices?.[0]?.id || '').trim();
        if (gameId && preferredChoice && currentChoice !== preferredChoice && !game.playedToday) {
          next[gameId] = preferredChoice;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [miniGames]);

  const runCoachAction = useCallback(
    async (actionKey: CoachActionKey) => {
      const text = String(coachInput || '').trim();
      if (text.length < 12) {
        setCoachStatus('Add a little more detail so Scrolitha has enough context to improve the draft.');
        setCoachRetryable(false);
        return;
      }
      if (coachInFlightRef.current || coachBusyAction !== null) return;

      coachInFlightRef.current = true;
      setCoachBusyAction(actionKey);
      setLastCoachAction(actionKey);
      setCoachStatus(null);
      setCoachRetryable(false);
      try {
        let nextOutput = '';
        let nextWarning = '';
        if (coachSurface === 'gig' && actionKey === 'improve-gig') {
          const result = await ScrolithaService.gigImprove({
            text,
            context: { surface: 'member_home', target: 'gig', source: 'insights_quick_panel' }
          });
          nextOutput = extractScrolithaRewrittenText(result);
          nextWarning = extractScrolithaWarning(result);
          if (!nextOutput) {
            throw new Error('Scrolitha returned an empty result. Please try again.');
          }
          setCoachOutput(nextOutput);
          setCoachStatus(nextWarning || 'Scrolitha coach updated your draft.');
          setCoachRetryable(false);
        } else {
          const rewriteMode =
            actionKey === 'clarify-brief'
              ? 'rephrase'
              : (COACH_ACTIONS[coachSurface].find((entry) => entry.key === actionKey)?.mode || 'professional');
          const goal =
            coachSurface === 'post'
              ? 'Polish this post for a professional community feed while keeping it concise and credible.'
              : coachSurface === 'gig'
                ? 'Improve this gig copy so the offer is clearer, stronger, and easier for buyers to trust.'
                : 'Clarify this brief so the need, scope, and expected outcome are easy to understand and match.';
          const result = await runScrolithaRewrite({
            text,
            scope: coachSurface,
            mode: rewriteMode as ScrolithaRewriteMode,
            tone: actionKey === 'professional' ? 'professional' : undefined,
            goal
          });
          if (!result.ok) {
            setCoachStatus(result.message);
            setCoachRetryable(result.retryable);
            return;
          }
          setCoachOutput(result.text);
          setCoachStatus(result.warning || 'Scrolitha coach updated your draft.');
          setCoachRetryable(false);
        }
      } catch (e: any) {
        const classified = classifyScrolithaClientError(
          e,
          'Scrolitha coach could not improve this draft right now.'
        );
        setCoachStatus(classified.message);
        setCoachRetryable(classified.retryable);
      } finally {
        coachInFlightRef.current = false;
        setCoachBusyAction(null);
      }
    },
    [coachBusyAction, coachInput, coachSurface]
  );

  const copyCoachOutput = useCallback(async () => {
    const text = String(coachOutput || '').trim();
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCoachStatus('Draft copied.');
      } else {
        throw new Error('Clipboard not available.');
      }
    } catch {
      setCoachStatus('Copy is unavailable on this device. Select the text manually.');
    }
  }, [coachOutput]);

  const sendCoachOutputToBrief = useCallback(() => {
    const text = String(coachOutput || coachInput || '').trim();
    if (!text) return;
    setBriefPrompt(text);
    setBriefStatus('Scrolitha coach sent this draft into Brief to match.');
    setCoachStatus('Draft moved to Brief to match.');
    focusInsightsSection('brief-to-match', 'opportunity');
  }, [coachInput, coachOutput, focusInsightsSection]);

  const toggleBroadcastFollow = useCallback(
    async (channel: BroadcastChannelSummary) => {
      const channelId = String(channel?.id || '').trim();
      if (!channelId) return;
      setBroadcastActionBusy(channelId);
      setStatusMessage(null);
      try {
        const next = channel.isFollowing
          ? await CommunityService.unfollowBroadcastChannel(channelId)
          : await CommunityService.followBroadcastChannel(channelId);
        if (next?.id) {
          setBroadcastChannels((current) =>
            current.map((entry) => (String(entry.id) === channelId ? { ...entry, ...next } : entry))
          );
        }
        setStatusMessage(channel.isFollowing ? 'Broadcast channel unfollowed.' : 'Broadcast channel followed.');
      } catch (e: any) {
        setStatusMessage(e?.response?.data?.message || e?.message || 'Unable to update broadcast follow status.');
      } finally {
        setBroadcastActionBusy(null);
      }
    },
    []
  );

  const toggleOfficeHourRegistration = useCallback(
    async (event: HighlightCommunityEvent) => {
      const eventId = String(event?.id || '').trim();
      if (!eventId) return;
      setOfficeHourActionBusy(eventId);
      setOfficeHourStatus(null);
      try {
        if (event.isRegistered) {
          await CommunityService.unregisterEvent(eventId);
        } else {
          await CommunityService.registerEvent(eventId);
        }
        setOfficeHours((current) =>
          current.map((entry) =>
            entry.id === eventId
              ? {
                  ...entry,
                  isRegistered: !event.isRegistered,
                  badge: !event.isRegistered ? (entry.isLive ? 'Live now' : 'Joined') : entry.isLive ? 'Live now' : entry.category === 'ama' ? 'AMA' : entry.category === 'office-hours' ? 'Office hours' : 'Event'
                }
              : entry
          )
        );
        setOfficeHourStatus(event.isRegistered ? 'Office hours registration removed.' : 'You are registered for this session.');
        void refresh({ silent: true });
      } catch (e: any) {
        setOfficeHourStatus(e?.response?.data?.message || e?.message || 'Unable to update event registration.');
      } finally {
        setOfficeHourActionBusy(null);
      }
    },
    [refresh]
  );

  const mergeEngagementExpansion = useCallback((summary: EngagementExpansionSummary | null | undefined) => {
    if (!summary) return;
    setEngagementExpansion(summary);
  }, []);

  const toggleFreeFanClubMembership = useCallback(
    async (club: FanClubCard) => {
      const clubId = String(club?.id || '').trim();
      if (!clubId) return;
      setFanClubActionBusy(`club:${clubId}`);
      setFanClubStatus(null);
      try {
        if (club.isJoined) {
          await CommunityService.leaveClub(clubId);
        } else {
          await CommunityService.joinClub(clubId);
        }
        setEngagementExpansion((current) => {
          if (!current) return current;
          return {
            ...current,
            fanClubs: {
              ...current.fanClubs,
              freeClubs: current.fanClubs.freeClubs.map((entry) =>
                entry.id === clubId
                  ? {
                      ...entry,
                      isJoined: !club.isJoined,
                      memberCount: Math.max(0, Number(entry.memberCount || 0) + (club.isJoined ? -1 : 1))
                    }
                  : entry
              )
            }
          };
        });
        setFanClubStatus(club.isJoined ? 'Fan club left.' : 'Fan club joined.');
        void refresh({ silent: true });
      } catch (e: any) {
        setFanClubStatus(e?.response?.data?.message || e?.message || 'Unable to update fan club membership.');
      } finally {
        setFanClubActionBusy(null);
      }
    },
    [refresh]
  );

  const handleFanChannelAction = useCallback(
    async (channel: FanClubCard) => {
      const channelId = String(channel?.id || '').trim();
      if (!channelId) return;
      setFanClubActionBusy(`channel:${channelId}`);
      setFanClubStatus(null);
      try {
        let nextSummary: EngagementExpansionSummary | null = null;
        if (channel.pricing?.isPaid && !channel.pricing?.subscribed) {
          nextSummary = await InsightsService.subscribeFanChannel(channelId);
          setFanClubStatus('Premium fan channel unlocked.');
        } else {
          const next = channel.isFollowing
            ? await CommunityService.unfollowBroadcastChannel(channelId)
            : await CommunityService.followBroadcastChannel(channelId);
          setEngagementExpansion((current) => {
            if (!current) return current;
            return {
              ...current,
              fanClubs: {
                ...current.fanClubs,
                fanChannels: current.fanClubs.fanChannels.map((entry) =>
                  entry.id === channelId
                    ? {
                        ...entry,
                        isFollowing: Boolean(next?.isFollowing ?? !channel.isFollowing),
                        memberCount: Math.max(
                          0,
                          Number(next?.memberCount ?? entry.memberCount ?? 0) + (channel.isFollowing ? -1 : 1)
                        ),
                        latestUpdate: next?.latestUpdate || entry.latestUpdate || null
                      }
                    : entry
                )
              }
            };
          });
          setFanClubStatus(channel.isFollowing ? 'Fan channel unfollowed.' : 'Fan channel followed.');
        }
        if (nextSummary) mergeEngagementExpansion(nextSummary);
        void refresh({ silent: true });
      } catch (e: any) {
        setFanClubStatus(e?.response?.data?.message || e?.message || 'Unable to update the fan channel right now.');
      } finally {
        setFanClubActionBusy(null);
      }
    },
    [mergeEngagementExpansion, refresh]
  );

  const submitMiniGame = useCallback(
    async (game: SkillMiniGameSummary) => {
      const gameId = String(game?.id || '').trim();
      const choiceId = String(selectedMiniGameChoiceMap[gameId] || '').trim();
      if (!gameId || !choiceId) {
        setMiniGameStatus('Choose an answer first.');
        return;
      }
      setMiniGameActionBusy(gameId);
      setMiniGameStatus(null);
      try {
        const next = await InsightsService.submitSkillMiniGame(gameId, choiceId);
        mergeEngagementExpansion(next);
        const selectedChoice = game.choices.find((entry) => entry.id === choiceId);
        const correctChoice = game.choices.find((entry) => entry.id === game.selectedChoiceId);
        setMiniGameStatus(
          next?.miniGames?.games?.find((entry) => entry.id === gameId)?.correctToday
            ? `Correct. ${selectedChoice?.label || 'That answer'} earned your Gcoin reward.`
            : game.explanation || 'Answer recorded.'
        );
        void refresh({ silent: true });
      } catch (e: any) {
        setMiniGameStatus(e?.response?.data?.message || e?.message || 'Unable to submit the mini-game answer.');
      } finally {
        setMiniGameActionBusy(null);
      }
    },
    [mergeEngagementExpansion, refresh, selectedMiniGameChoiceMap]
  );

  const activateSeasonPass = useCallback(
    async (seasonId: string, passId: string) => {
      const normalizedSeasonId = String(seasonId || '').trim();
      const normalizedPassId = String(passId || '').trim();
      if (!normalizedSeasonId || !normalizedPassId) return;
      setSeasonActionBusy(`${normalizedSeasonId}:${normalizedPassId}`);
      setSeasonStatus(null);
      try {
        const next = await InsightsService.activateEventSeasonPass(normalizedSeasonId, normalizedPassId);
        mergeEngagementExpansion(next);
        setSeasonStatus('Season pass activated.');
        void refresh({ silent: true });
      } catch (e: any) {
        setSeasonStatus(e?.response?.data?.message || e?.message || 'Unable to activate the season pass.');
      } finally {
        setSeasonActionBusy(null);
      }
    },
    [mergeEngagementExpansion, refresh]
  );

  const unlockSeriesSupport = useCallback(
    async (seriesId: string) => {
      const normalizedSeriesId = String(seriesId || '').trim();
      if (!normalizedSeriesId) return;
      setPremiumSeriesActionBusy(normalizedSeriesId);
      setPremiumSeriesStatus(null);
      try {
        const next = await InsightsService.unlockPremiumSeries(normalizedSeriesId);
        mergeEngagementExpansion(next);
        setPremiumSeriesStatus('Premium series unlocked.');
        void refresh({ silent: true });
      } catch (e: any) {
        setPremiumSeriesStatus(e?.response?.data?.message || e?.message || 'Unable to unlock this premium series.');
      } finally {
        setPremiumSeriesActionBusy(null);
      }
    },
    [mergeEngagementExpansion, refresh]
  );

  const createBountyQuestion = useCallback(async () => {
    const title = String(bountyTitle || '').trim();
    const body = String(bountyBody || '').trim();
    if (title.length < 8 || body.length < 20) {
      setBountyStatus('Add a clear title and a more detailed question before posting a bounty.');
      return;
    }
    setBountyActionBusy('create');
    setBountyStatus(null);
    try {
      const next = await InsightsService.createExpertBountyQuestion({
        title,
        body,
        category: String(bountyCategory || '').trim() || null,
        tags: String(bountyTags || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 6),
        bountyAmount: Number(bountyAmount || 0) > 0 ? Number(bountyAmount || 0) : 0
      });
      mergeEngagementExpansion(next);
      setBountyTitle('');
      setBountyBody('');
      setBountyCategory('');
      setBountyTags('');
      setBountyAmount('');
      setBountyStatus('Expert bounty posted.');
      void refresh({ silent: true });
    } catch (e: any) {
      setBountyStatus(e?.response?.data?.message || e?.message || 'Unable to create the expert bounty.');
    } finally {
      setBountyActionBusy(null);
    }
  }, [bountyAmount, bountyBody, bountyCategory, bountyTags, bountyTitle, mergeEngagementExpansion, refresh]);

  const answerBountyQuestion = useCallback(
    async (question: ExpertBountyQuestionSummary) => {
      const questionId = String(question?.id || '').trim();
      const body = String(bountyAnswerDrafts[questionId] || '').trim();
      if (!questionId || body.length < 12) {
        setBountyStatus('Add a more useful answer before submitting.');
        return;
      }
      setBountyActionBusy(`answer:${questionId}`);
      setBountyStatus(null);
      try {
        const next = await InsightsService.answerExpertBountyQuestion(questionId, body);
        mergeEngagementExpansion(next);
        setBountyAnswerDrafts((current) => ({ ...current, [questionId]: '' }));
        setBountyStatus('Expert answer submitted.');
        void refresh({ silent: true });
      } catch (e: any) {
        setBountyStatus(e?.response?.data?.message || e?.message || 'Unable to submit this answer.');
      } finally {
        setBountyActionBusy(null);
      }
    },
    [bountyAnswerDrafts, mergeEngagementExpansion, refresh]
  );

  const awardBountyAnswer = useCallback(
    async (questionId: string, answerId: string) => {
      const normalizedQuestionId = String(questionId || '').trim();
      const normalizedAnswerId = String(answerId || '').trim();
      if (!normalizedQuestionId || !normalizedAnswerId) return;
      setBountyActionBusy(`award:${normalizedAnswerId}`);
      setBountyStatus(null);
      try {
        const next = await InsightsService.awardExpertBounty(normalizedQuestionId, normalizedAnswerId);
        mergeEngagementExpansion(next);
        setBountyStatus('Bounty awarded.');
        void refresh({ silent: true });
      } catch (e: any) {
        setBountyStatus(e?.response?.data?.message || e?.message || 'Unable to award this bounty.');
      } finally {
        setBountyActionBusy(null);
      }
    },
    [mergeEngagementExpansion, refresh]
  );

  const mergeFriendStreakDashboard = useCallback(
    (dashboard: FriendStreakDashboard | null | undefined) => {
      if (!dashboard) return;
      setStreak((current) => ({
        userId: current?.userId || currentUserId || dashboard.userId,
        currentStreakDays: Number(current?.currentStreakDays || 0),
        bestStreakDays: Number(current?.bestStreakDays || 0),
        lastActiveDate: current?.lastActiveDate || null,
        createdAt: current?.createdAt || null,
        updatedAt: current?.updatedAt || null,
        careerDaily: current?.careerDaily || null,
        friendStreaks: dashboard,
        dailyMissions: current?.dailyMissions || null,
        leagueTier: current?.leagueTier || null,
        referralSquads: current?.referralSquads || null,
        rewardDrops: current?.rewardDrops || null
      }));
    },
    [currentUserId]
  );

  const mergeStreakPhaseSections = useCallback(
    (patch: Partial<Pick<UserStreak, 'leagueTier' | 'referralSquads' | 'rewardDrops'>>) => {
      setStreak((current) => ({
        userId: current?.userId || currentUserId || '',
        currentStreakDays: Number(current?.currentStreakDays || 0),
        bestStreakDays: Number(current?.bestStreakDays || 0),
        lastActiveDate: current?.lastActiveDate || null,
        createdAt: current?.createdAt || null,
        updatedAt: current?.updatedAt || null,
        careerDaily: current?.careerDaily || null,
        friendStreaks: current?.friendStreaks || null,
        dailyMissions: current?.dailyMissions || null,
        leagueTier: patch.leagueTier ?? current?.leagueTier ?? null,
        referralSquads: patch.referralSquads ?? current?.referralSquads ?? null,
        rewardDrops: patch.rewardDrops ?? current?.rewardDrops ?? null
      }));
    },
    [currentUserId]
  );

  useEffect(() => {
    if (!creatorChallenges.length) return;
    setSelectedChallengeSubmissionMap((current) => {
      const next = { ...current };
      let changed = false;
      creatorChallenges.forEach((challenge) => {
        const challengeId = String(challenge?.id || '').trim();
        if (!challengeId) return;
        const options = Array.isArray(challenge.submissionOptions) ? challenge.submissionOptions : [];
        const selected = String(next[challengeId] || '').trim();
        const isValid = options.some((option) => `${option.contentType}:${option.contentId}` === selected);
        if (!isValid) {
          next[challengeId] = options.length ? `${options[0].contentType}:${options[0].contentId}` : '';
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [creatorChallenges]);

  const resolveMatchReason = (match: any) =>
    Array.isArray(match?.reasons) && match.reasons.length > 0 ? String(match.reasons[0]) : 'Aligned with your current professional graph.';

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

  const generateOpportunityBrief = async () => {
    const prompt = String(briefPrompt || '').trim();
    if (prompt.length < 12) {
      setBriefStatus('Describe the opportunity in a little more detail to generate a useful brief.');
      return;
    }
    setBriefBusy(true);
    setBriefStatus(null);
    try {
      const result = await InsightsService.generateOpportunityBrief(prompt);
      setBriefResult(result);
      setBriefStatus('Opportunity brief generated.');
      void refresh({ silent: true });
    } catch (e: any) {
      setBriefStatus(e?.response?.data?.message || e?.message || 'Failed to generate opportunity brief.');
    } finally {
      setBriefBusy(false);
    }
  };

  const completeQuest = async (quest: UserQuest) => {
    const questId = String(quest.id || '').trim();
    if (!questId) return;
    setQuestBusyId(questId);
    setQuestStatus(null);
    try {
      const completed = await InsightsService.completeMyQuest(questId);
      setQuests((current) =>
        current.map((item) => {
          if (item.id !== completed.id) return item;
          return completed;
        })
      );
      setQuestStatus('Quest completion updated.');
      void refresh({ silent: true });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to complete quest.');
      setQuestStatus('Quest completion failed. Please try again.');
    } finally {
      setQuestBusyId(null);
    }
  };

  useEffect(() => {
    const hasSelectedCandidate = friendCandidates.some((candidate) => candidate.id === selectedFriendCandidateId);
    if (!friendCandidates.length) {
      if (selectedFriendCandidateId) setSelectedFriendCandidateId('');
      return;
    }
    if (!hasSelectedCandidate) {
      setSelectedFriendCandidateId(String(friendCandidates[0]?.id || '').trim());
    }
  }, [friendCandidates, selectedFriendCandidateId]);

  useEffect(() => {
    const hasSelectedCandidate = referralCandidates.some((candidate) => candidate.id === selectedReferralCandidateId);
    if (!referralCandidates.length) {
      if (selectedReferralCandidateId) setSelectedReferralCandidateId('');
      return;
    }
    if (!hasSelectedCandidate) {
      setSelectedReferralCandidateId(String(referralCandidates[0]?.id || '').trim());
    }
  }, [referralCandidates, selectedReferralCandidateId]);

  const inviteFriendStreak = async () => {
    const partnerUserId = String(selectedFriendCandidateId || '').trim();
    if (!partnerUserId) {
      setFriendStreakStatus('Choose a mutual follow to invite first.');
      return;
    }
    setFriendStreakActionBusy(`invite:${partnerUserId}`);
    setFriendStreakStatus(null);
    try {
      const updated = await InsightsService.inviteFriendStreak(partnerUserId);
      if (updated?.friendStreaks) mergeFriendStreakDashboard(updated.friendStreaks);
      setFriendStreakStatus('Accountability invite sent.');
      void refresh({ silent: true });
    } catch (e: any) {
      setFriendStreakStatus(e?.response?.data?.message || e?.message || 'Unable to send the accountability invite.');
    } finally {
      setFriendStreakActionBusy(null);
    }
  };

  const respondToFriendInvite = async (invite: FriendStreakInviteSummary, responseValue: 'accept' | 'decline') => {
    const inviteId = String(invite?.id || '').trim();
    if (!inviteId) return;
    setFriendStreakActionBusy(`${responseValue}:${inviteId}`);
    setFriendStreakStatus(null);
    try {
      const updated = await InsightsService.respondFriendStreak(inviteId, responseValue);
      if (updated?.friendStreaks) mergeFriendStreakDashboard(updated.friendStreaks);
      setFriendStreakStatus(responseValue === 'accept' ? 'Accountability streak activated.' : 'Invite declined.');
      void refresh({ silent: true });
    } catch (e: any) {
      setFriendStreakStatus(e?.response?.data?.message || e?.message || 'Unable to update the invite.');
    } finally {
      setFriendStreakActionBusy(null);
    }
  };

  const closeFriendStreak = async (item: FriendStreakActiveSummary | FriendStreakInviteSummary, mode: 'end' | 'cancel') => {
    const streakId = String(item?.id || '').trim();
    if (!streakId) return;
    setFriendStreakActionBusy(`${mode}:${streakId}`);
    setFriendStreakStatus(null);
    try {
      const updated = await InsightsService.endFriendStreak(streakId);
      if (updated?.friendStreaks) mergeFriendStreakDashboard(updated.friendStreaks);
      setFriendStreakStatus(mode === 'end' ? 'Shared accountability streak ended.' : 'Pending invite cancelled.');
      void refresh({ silent: true });
    } catch (e: any) {
      setFriendStreakStatus(e?.response?.data?.message || e?.message || 'Unable to update the shared streak.');
    } finally {
      setFriendStreakActionBusy(null);
    }
  };

  const inviteReferralSquadMember = async () => {
    const partnerUserId = String(selectedReferralCandidateId || '').trim();
    if (!partnerUserId) {
      setReferralSquadStatus('Choose a mutual follow to invite first.');
      return;
    }
    setReferralSquadActionBusy(`invite:${partnerUserId}`);
    setReferralSquadStatus(null);
    try {
      const updated = await InsightsService.inviteReferralSquad(partnerUserId);
      if (updated?.referralSquads) mergeStreakPhaseSections({ referralSquads: updated.referralSquads });
      setReferralSquadStatus('Referral squad invite sent.');
      void refresh({ silent: true });
    } catch (e: any) {
      setReferralSquadStatus(e?.response?.data?.message || e?.message || 'Unable to send the referral squad invite.');
    } finally {
      setReferralSquadActionBusy(null);
    }
  };

  const respondToReferralInvite = async (
    invite: NonNullable<ReferralSquadSummary['incomingInvites']>[number],
    responseValue: 'accept' | 'decline'
  ) => {
    const inviteId = String(invite?.id || '').trim();
    if (!inviteId) return;
    setReferralSquadActionBusy(`${responseValue}:${inviteId}`);
    setReferralSquadStatus(null);
    try {
      const updated = await InsightsService.respondReferralSquadInvite(inviteId, responseValue);
      if (updated?.referralSquads) mergeStreakPhaseSections({ referralSquads: updated.referralSquads });
      setReferralSquadStatus(responseValue === 'accept' ? 'Referral squad updated.' : 'Referral squad invite declined.');
      void refresh({ silent: true });
    } catch (e: any) {
      setReferralSquadStatus(e?.response?.data?.message || e?.message || 'Unable to update the referral squad invite.');
    } finally {
      setReferralSquadActionBusy(null);
    }
  };

  const leaveReferralSquadGroup = async () => {
    const squadId = String(referralSquads?.currentSquad?.id || '').trim();
    if (!squadId) return;
    setReferralSquadActionBusy(`leave:${squadId}`);
    setReferralSquadStatus(null);
    try {
      const updated = await InsightsService.leaveReferralSquad(squadId);
      if (updated?.referralSquads) mergeStreakPhaseSections({ referralSquads: updated.referralSquads });
      setReferralSquadStatus('Referral squad updated.');
      void refresh({ silent: true });
    } catch (e: any) {
      setReferralSquadStatus(e?.response?.data?.message || e?.message || 'Unable to leave the referral squad.');
    } finally {
      setReferralSquadActionBusy(null);
    }
  };

  const claimRewardDropCard = async (dropId: string) => {
    const normalizedDropId = String(dropId || '').trim();
    if (!normalizedDropId) return;
    setRewardDropActionBusy(normalizedDropId);
    setRewardDropStatus(null);
    try {
      const updated = await InsightsService.claimRewardDrop(normalizedDropId);
      if (updated?.rewardDrops) mergeStreakPhaseSections({ rewardDrops: updated.rewardDrops });
      setRewardDropStatus('Gcoin reward claimed.');
      void refresh({ silent: true });
    } catch (e: any) {
      setRewardDropStatus(e?.response?.data?.message || e?.message || 'Unable to claim this reward drop.');
    } finally {
      setRewardDropActionBusy(null);
    }
  };

  const castPollVote = async (pollId: string, optionId: string) => {
    const normalizedPollId = String(pollId || '').trim();
    const normalizedOptionId = String(optionId || '').trim();
    if (!normalizedPollId || !normalizedOptionId) return;
    setPollActionBusy(`${normalizedPollId}:${normalizedOptionId}`);
    setPollStatus(null);
    try {
      const updated = await CommunityService.votePoll(normalizedPollId, normalizedOptionId);
      if (updated?.id) {
        setPollCards((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      }
      setPollStatus('Vote recorded.');
      void refresh({ silent: true });
    } catch (e: any) {
      setPollStatus(e?.response?.data?.message || e?.message || 'Unable to record your vote.');
    } finally {
      setPollActionBusy(null);
    }
  };

  const submitChallengeEntry = async (challenge: CreatorChallenge) => {
    const challengeId = String(challenge?.id || '').trim();
    const selected = String(selectedChallengeSubmissionMap[challengeId] || '').trim();
    if (!challengeId || !selected) {
      setChallengeStatus('Choose a post or Scroll to submit first.');
      return;
    }
    const [contentType, contentId] = selected.split(':');
    if (!contentType || !contentId) {
      setChallengeStatus('Choose a valid submission first.');
      return;
    }
    setChallengeActionBusy(`submit:${challengeId}`);
    setChallengeStatus(null);
    try {
      const updated = await InsightsService.submitCreatorChallengeEntry(challengeId, { contentType, contentId });
      if (updated) setCreatorChallengeDashboard(updated);
      setChallengeStatus('Challenge entry submitted.');
      void refresh({ silent: true });
    } catch (e: any) {
      setChallengeStatus(e?.response?.data?.message || e?.message || 'Unable to submit the challenge entry.');
    } finally {
      setChallengeActionBusy(null);
    }
  };

  const castChallengeVote = async (challenge: CreatorChallenge, entryId: string) => {
    const challengeId = String(challenge?.id || '').trim();
    const normalizedEntryId = String(entryId || '').trim();
    if (!challengeId || !normalizedEntryId) return;
    setChallengeActionBusy(`vote:${normalizedEntryId}`);
    setChallengeStatus(null);
    try {
      const updated = await InsightsService.voteCreatorChallengeEntry(challengeId, normalizedEntryId);
      if (updated) setCreatorChallengeDashboard(updated);
      setChallengeStatus('Challenge vote recorded.');
      void refresh({ silent: true });
    } catch (e: any) {
      setChallengeStatus(e?.response?.data?.message || e?.message || 'Unable to record the challenge vote.');
    } finally {
      setChallengeActionBusy(null);
    }
  };

  return (
    <section
      className={`rounded-3xl border border-white/70 bg-white p-4 shadow-sm ${isDesktopRail ? 'lg:p-5 xl:p-6' : ''} ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-500">Insights</p>
          <h3 className={`${compact ? 'text-sm' : isDesktopRail ? 'text-lg leading-tight' : 'text-sm'} font-semibold text-slate-900`}>
            {compact ? 'Opportunity Hub' : 'Professional Opportunity Hub'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading}
          className={`rounded-full border border-slate-200 px-3 py-1 font-semibold uppercase text-slate-600 disabled:opacity-50 ${isDesktopRail ? 'text-[10px] lg:px-3.5 lg:py-1.5' : 'text-[11px]'}`}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && !hasVisibleData ? (
        <p className="mt-3 text-sm text-slate-500">Loading insights...</p>
      ) : error && !hasVisibleData ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Retry insights
          </button>
        </div>
      ) : (
        <>
          {statusMessage ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">{statusMessage}</p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-2 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Retry insights
              </button>
            </div>
          ) : null}
          <div className={`mt-3 rounded-2xl border border-slate-200 bg-slate-50 ${isDesktopRail ? 'p-4' : 'p-3'}`}>
            <div className="flex items-end justify-between gap-3">
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{pgs ? Number(pgs.score || 0).toFixed(0) : '--'}</div>
              <div className="text-right text-xs uppercase tracking-wide text-slate-500">
                <div>Streak {Number(streak?.currentStreakDays || 0)}d</div>
                <div className="mt-1">{hub?.trust?.trustTier || 'Building'} tier</div>
              </div>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full bg-indigo-500 ${compact ? '' : 'transition-[width] duration-300 ease-out'}`.trim()}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Achievements: {earnedAchievements.length}/{achievements.length}</span>
              <span>Best streak: {Number(streak?.bestStreakDays || 0)}d</span>
            </div>
          </div>

          <div
            data-insights-section="career-daily"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Career streak today</p>
                <p className="mt-1 text-xs text-slate-500">Complete each action once per day: post, reply, apply, and learn.</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {Number(careerDaily?.completedCount || 0)}/{Number(careerDaily?.goalCount || careerDailyActions.length || 4)}
              </span>
            </div>
            <div className={`mt-3 grid gap-2 ${compact || isDesktopRail ? 'grid-cols-2' : 'sm:grid-cols-4'}`.trim()}>
              {careerDailyActions.map((action) => (
                <div
                  key={action.type}
                  className={`rounded-xl border px-3 py-2 text-xs transition ${
                    action.completed
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{action.label}</span>
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                        action.completed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {action.completed ? 'OK' : '--'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px]">{action.completed ? 'Completed today' : 'Pending today'}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              {careerDaily?.allCompleted
                ? 'All four career actions are complete for today.'
                : 'Your streak counts once per day, and this checklist helps you stay consistent across all four actions.'}
            </p>
          </div>

          <div
            data-insights-section="daily-missions"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Daily missions</p>
                <p className="mt-1 text-xs text-slate-500">
                  Rotated, higher-level goals built on top of today&apos;s checklist so the loop stays focused without duplicating tasks.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  dailyMissions?.allCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {Number(dailyMissions?.completedCount || 0)}/{Number(dailyMissions?.totalCount || missionCards.length || 3)}
              </span>
            </div>

            <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-3'}`}>
              {missionCards.map((mission) => (
                <div
                  key={mission.key}
                  className={`rounded-xl border p-3 transition ${
                    mission.completed ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          mission.completed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {mission.badge || 'Daily'}
                      </span>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{mission.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{mission.description}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        mission.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-700'
                      }`}
                    >
                      {mission.progressLabel}
                    </span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-white/80">
                    <div
                      className={`h-2 rounded-full transition-[width] duration-300 ease-out ${
                        mission.completed ? 'bg-emerald-500' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${clampPercent((Number(mission.progress || 0) / Math.max(Number(mission.target || 1), 1)) * 100)}%` }}
                    />
                  </div>

                  {mission.helperText ? <p className="mt-2 text-[11px] text-slate-500">{mission.helperText}</p> : null}

                  {Array.isArray(mission.remainingActionLabels) && mission.remainingActionLabels.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {mission.remainingActionLabels.map((label) => (
                        <span key={`${mission.key}:${label}`} className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {!mission.completed && mission.ctaUrl && mission.ctaLabel ? (
                    <Link
                      to={mission.ctaUrl}
                      className="mt-3 inline-flex rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                    >
                      {mission.ctaLabel}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              {dailyMissions?.allCompleted
                ? 'All daily missions are complete. Tomorrow rotates in a fresh mission mix.'
                : 'Missions rotate by day and role so users get a clear reason to come back now without repeating the raw checklist.'}
            </p>
          </div>

          <div
            data-insights-section="badges-trophies"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Badges and trophies</p>
                <p className="mt-1 text-xs text-slate-500">
                  Visible status earned through streak consistency, challenge wins, trust, and marketplace momentum.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {earnedAchievements.length} earned
              </span>
            </div>

            <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-2'}`}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900">Badges</p>
                  <span className="text-[11px] text-slate-500">{earnedBadges.length}</span>
                </div>
                {earnedBadges.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {earnedBadges.slice(0, compact ? 4 : 6).map((item) => (
                      <div key={item.id} className={`rounded-xl border px-3 py-2 text-xs ${tierClassName(item.tier)}`}>
                        <div className="font-semibold">{item.title}</div>
                        <div className="mt-1 text-[11px] opacity-80">{String(item.tier || 'badge').toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No badges earned yet. Finish streaks and submit challenge entries to start the cabinet.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900">Trophies</p>
                  <span className="text-[11px] text-slate-500">{earnedTrophies.length}</span>
                </div>
                {earnedTrophies.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {earnedTrophies.slice(0, compact ? 3 : 4).map((item) => (
                      <div key={item.id} className={`rounded-xl border px-3 py-2 text-xs ${tierClassName(item.tier)}`}>
                        <div className="font-semibold">{item.title}</div>
                        <div className="mt-1 text-[11px] opacity-80">{String(item.tier || 'trophy').toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No trophies yet. Weekly creator challenge wins and major milestones unlock them.</p>
                )}
              </div>
            </div>

            {lockedAchievementPreview.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lockedAchievementPreview.map((item) => (
                  <span key={item.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500">
                    Next: {item.title}
                  </span>
                ))}
              </div>
              ) : null}
          </div>

          <div
            data-insights-section="league-tiers"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">League tiers</p>
                <p className="mt-1 text-xs text-slate-500">
                  Monthly ranking identity that turns score momentum into a visible tier, leaderboard context, and next-rank target.
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${leagueAccentClassName(leagueTier?.tier?.accent || 'slate')}`}>
                {leagueTier?.tier?.badge || 'Active'}
              </span>
            </div>

            <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-3'}`}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current tier</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{leagueTier?.tier?.label || 'Building tier'}</div>
                <div className="mt-1 text-[11px] text-slate-500">Monthly percentile: {Number(leagueTier?.percentile || 0).toFixed(1)}%</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rank</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {leagueTier?.rank ? `#${formatWholeNumber(leagueTier.rank)}` : 'Unranked'}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {leagueTier?.totalRanked ? `${formatWholeNumber(leagueTier.totalRanked)} ranked this month` : 'Keep building actions to enter the monthly board.'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Score</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{formatWholeNumber(Number(leagueTier?.score || 0))}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {leagueTier?.nextTier
                    ? `${Number(leagueTier.nextTier.remainingPercentile || 0).toFixed(1)} percentile points to ${leagueTier.nextTier.label}.`
                    : 'You are already in the top league tier.'}
                </div>
              </div>
            </div>

            {Array.isArray(leagueTier?.leaders) && leagueTier.leaders.length ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900">Top monthly operators</p>
                  <span className="text-[11px] text-slate-500">{leagueTier.monthKey}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {leagueTier.leaders.map((leader) => (
                    <div key={leader.userId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                          #{leader.rank} {leader.name}
                        </p>
                        <p className="text-[11px] text-slate-500">{leader.username ? `@${leader.username}` : 'Scrolith member'}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {formatWholeNumber(Number(leader.score || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div
            data-insights-section="weekly-challenges"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Weekly creator challenges</p>
                <p className="mt-1 text-xs text-slate-500">
                  Submit one strong piece of content, vote on standout work, and compete for weekly visible status.
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {Number(creatorChallengeDashboard?.activeCount || 0)} active
              </span>
            </div>

            {challengeStatus ? <p className="mt-3 text-xs text-slate-500">{challengeStatus}</p> : null}

            {creatorChallenges.length ? (
              <div className="mt-3 space-y-3">
                {creatorChallenges.map((challenge) => {
                  const challengeId = String(challenge.id || '').trim();
                  const selectedSubmission = String(selectedChallengeSubmissionMap[challengeId] || '').trim();
                  return (
                    <div key={challengeId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {challenge.category || 'Creator'}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                challenge.status === 'finalized' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {challenge.status}
                            </span>
                            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                              {formatRelativeDeadline(challenge.endAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{challenge.title}</p>
                          <p className="mt-1 text-xs text-slate-600">{challenge.description}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-[11px] text-slate-500">
                          <div>{challenge.stats.totalEntries} entries</div>
                          <div className="mt-1">{challenge.stats.totalVotes} votes</div>
                        </div>
                      </div>

                      {challenge.viewerEntry ? (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold">Your entry</p>
                              <p className="mt-1 text-emerald-700">{challenge.viewerEntry.title}</p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              {challenge.viewerEntry.voteCount} votes
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-emerald-700">
                            {challenge.viewerEntry.isWinner
                              ? 'This entry is currently in the winner set.'
                              : challenge.status === 'finalized'
                                ? 'Voting is closed for this weekly challenge.'
                                : 'You already submitted to this weekly challenge. You can still vote on another creator.'}
                          </p>
                        </div>
                      ) : challenge.canSubmit ? (
                        <div className={`mt-3 grid gap-2 ${compact || isDesktopRail ? 'grid-cols-1' : 'md:grid-cols-[1fr_auto]'}`}>
                          <select
                            value={selectedSubmission}
                            onChange={(event) =>
                              setSelectedChallengeSubmissionMap((current) => ({
                                ...current,
                                [challengeId]: event.target.value
                              }))
                            }
                            disabled={!challenge.submissionOptions.length}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                          >
                            {challenge.submissionOptions.length ? null : <option value="">No eligible public content available yet</option>}
                            {challenge.submissionOptions.map((option) => (
                              <option key={`${option.contentType}:${option.contentId}`} value={`${option.contentType}:${option.contentId}`}>
                                {option.title} ({option.contentType === 'scroll_video' ? 'Scroll' : 'Post'})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void submitChallengeEntry(challenge)}
                            disabled={!selectedSubmission || !challenge.submissionOptions.length || challengeActionBusy === `submit:${challengeId}`}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {challengeActionBusy === `submit:${challengeId}` ? 'Submitting...' : 'Submit'}
                          </button>
                        </div>
                      ) : null}

                      <div className="mt-3 grid gap-2">
                        {challenge.topEntries.length ? (
                          challenge.topEntries.map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">{entry.title}</p>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {entry.author?.name || 'Member'}
                                    {entry.author?.username ? ` (@${entry.author.username})` : ''}
                                    {' • '}
                                    {entry.contentType === 'scroll_video' ? 'Scroll' : 'Post'}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    {entry.voteCount} votes
                                  </span>
                                  {challenge.status === 'active' && entry.viewerCanVote ? (
                                    <button
                                      type="button"
                                      onClick={() => void castChallengeVote(challenge, entry.id)}
                                      disabled={challengeActionBusy === `vote:${entry.id}`}
                                      className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold ${
                                        entry.viewerHasVoted
                                          ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                                          : 'bg-slate-900 text-white'
                                      } disabled:opacity-50`}
                                    >
                                      {challengeActionBusy === `vote:${entry.id}` ? 'Voting...' : entry.viewerHasVoted ? 'Voted' : 'Vote'}
                                    </button>
                                  ) : entry.isWinner ? (
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Winner</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500">No entries yet. Submit the first standout piece for this week.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Weekly creator challenges will appear here when the current week opens.</p>
            )}
          </div>

          <div
            data-insights-section="polls-versus"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Polls and versus cards</p>
                <p className="mt-1 text-xs text-slate-500">
                  Quick participation loops that let members signal their next move, compare options, and vote in a few seconds.
                </p>
              </div>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                {pollCards.length} live
              </span>
            </div>

            {pollStatus ? <p className="mt-3 text-xs text-slate-500">{pollStatus}</p> : null}

            {pollCards.length ? (
              <div className="mt-3 space-y-3">
                {pollCards.map((poll) => (
                  <div key={poll.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {poll.kind === 'versus' ? 'Versus' : 'Poll'}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                            {formatWholeNumber(Number(poll.totalVotes || 0))} votes
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{poll.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{poll.prompt}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {poll.options.map((option) => {
                        const busyKey = `${poll.id}:${option.id}`;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => void castPollVote(poll.id, option.id)}
                            disabled={pollActionBusy === busyKey}
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition disabled:opacity-50 ${
                              option.selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                                {option.description ? <p className="mt-1 text-[11px] text-slate-500">{option.description}</p> : null}
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${option.selected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                {Number(option.percentage || 0).toFixed(0)}%
                              </span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-slate-100">
                              <div
                                className={`h-2 rounded-full transition-[width] duration-300 ${option.selected ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                style={{ width: `${clampPercent(Number(option.percentage || 0))}%` }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">New polls and versus cards will appear here as soon as the member_home loop rotates in the next prompt.</p>
            )}
          </div>

          <div
            data-insights-section="scroll-series"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Series and playlists</p>
                <p className="mt-1 text-xs text-slate-500">
                  Bingeable creator collections built on top of existing Scrolls, so viewers can keep watching the best work in sequence.
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {featuredSeries.length} live
              </span>
            </div>

            {featuredSeries.length ? (
              <div className="mt-3 grid gap-3">
                {featuredSeries.map((series) => {
                  const preview = series.previewItems?.[0] || series.featuredScroll || series.items?.[0]?.scroll || null;
                  return (
                    <div key={series.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-slate-900">{series.title}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {series.creator?.name || 'Creator'}
                            {series.creator.username ? ` (@${series.creator.username})` : ''}
                            {' · '}
                            {series.itemCount} items
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {series.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {series.description || preview?.description || preview?.title || 'Open the playlist to keep watching without breaking the flow.'}
                      </p>
                      {preview ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                          <div className="font-semibold text-slate-700">{preview.title || 'Featured Scroll'}</div>
                          <div className="mt-1 line-clamp-2">{preview.description || 'Top item ready to watch.'}</div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          to={buildSeriesHref(series.id)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                        >
                          Open series
                        </Link>
                        <Link
                          to="/scroll"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                        >
                          Browse Scroll
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Public creator series will appear here when members start organizing Scrolls into playlists.</p>
            )}
          </div>

          <div
            data-insights-section="broadcast-channels"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Broadcast channels</p>
                <p className="mt-1 text-xs text-slate-500">
                  Follow creator and company broadcast channels to receive focused updates without digging through the full community feed.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {broadcastChannels.length} live
              </span>
            </div>

            {broadcastChannels.length ? (
              <div className="mt-3 grid gap-3">
                {broadcastChannels.map((channel) => (
                  <div key={channel.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{channel.name || 'Channel'}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {channel.source?.name || (channel.sourceType === 'page' ? 'Company' : 'Creator')}
                          {' · '}
                          {channel.memberCount} followers
                          {' · '}
                          {channel.updateCount} updates
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {channel.sourceType === 'page' ? 'Company' : 'Creator'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {channel.latestUpdate?.content || channel.description || 'Follow this channel to receive the next update directly in your member_home workflow.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleBroadcastFollow(channel)}
                        disabled={broadcastActionBusy === channel.id}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                          channel.isFollowing ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-slate-900 text-white'
                        } disabled:opacity-50`}
                      >
                        {broadcastActionBusy === channel.id ? 'Working...' : channel.isFollowing ? 'Following' : 'Follow'}
                      </button>
                      <Link
                        to={resolveBroadcastHref(channel)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                      >
                        Open source
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Creator and company broadcast updates will appear here as channels go live.</p>
            )}
          </div>

          <div
            data-insights-section="scrolitha-coach"
            data-testid="scrolitha-coach-panel"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
            role="region"
            aria-label="Scrolitha coach"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scrolitha coach</p>
                <p className="mt-1 text-xs text-slate-500">
                  Improve posts, gigs, and briefs inside member_home without switching to a separate editor or assistant flow.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                {coachBusyAction ? 'Working' : 'Live coach'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Coach surface">
              {COACH_SURFACE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={coachSurface === option.value}
                  onClick={() => switchCoachSurface(option.value)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                    coachSurface === option.value
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="mt-2 text-[11px] text-slate-500">
              {COACH_SURFACE_OPTIONS.find((option) => option.value === coachSurface)?.helper}
            </p>

            <textarea
              value={coachInput}
              onChange={(event) => setCoachInput(event.target.value)}
              placeholder={COACH_PLACEHOLDERS[coachSurface]}
              aria-label={`Scrolitha coach ${coachSurface} draft`}
              disabled={coachBusyAction !== null}
              className="mt-3 min-h-[110px] w-full max-w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
            />

            {coachStatus ? (
              <p
                className="mt-2 text-xs text-slate-500"
                role="status"
                aria-live="polite"
                data-testid="scrolitha-coach-status"
              >
                {coachStatus}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {COACH_ACTIONS[coachSurface].map((action) => (
                <button
                  key={`${coachSurface}:${action.key}`}
                  type="button"
                  onClick={() => void runCoachAction(action.key)}
                  disabled={coachBusyAction !== null}
                  aria-busy={coachBusyAction === action.key}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                    coachBusyAction === action.key
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-700'
                  } disabled:opacity-50`}
                >
                  {coachBusyAction === action.key ? 'Working...' : action.label}
                </button>
              ))}
              {coachRetryable && lastCoachAction ? (
                <button
                  type="button"
                  onClick={() => void runCoachAction(lastCoachAction)}
                  disabled={coachBusyAction !== null}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                  data-testid="scrolitha-coach-retry"
                >
                  Retry
                </button>
              ) : null}
              {coachOutput ? (
                <button
                  type="button"
                  onClick={() => void copyCoachOutput()}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Copy
                </button>
              ) : null}
              {coachSurface === 'brief' ? (
                <button
                  type="button"
                  onClick={sendCoachOutputToBrief}
                  disabled={!String(coachOutput || coachInput || '').trim()}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Use in Brief to match
                </button>
              ) : null}
            </div>

            {coachOutput ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" aria-live="polite">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Updated draft</p>
                  <span className="text-[11px] text-slate-400">{coachSurface}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{coachOutput}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Choose a surface above, run a Scrolitha action, and the improved draft will appear here.
              </p>
            )}
          </div>

          <div
            data-insights-section="live-office-hours"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Live AMAs / office hours</p>
                <p className="mt-1 text-xs text-slate-500">
                  Join creator or company sessions, register early, and keep the attendance loop inside your existing community events flow.
                </p>
              </div>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                {officeHours.length} live
              </span>
            </div>

            {officeHourStatus ? <p className="mt-3 text-xs text-slate-500">{officeHourStatus}</p> : null}

            {officeHours.length ? (
              <div className="mt-3 grid gap-3">
                {officeHours.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{event.title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{event.metaLabel}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {event.badge}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{event.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{event.timingLabel}</span>
                      {event.maxAttendees ? <span>{event.attendees}/{event.maxAttendees} seats</span> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleOfficeHourRegistration(event)}
                        disabled={officeHourActionBusy === event.id}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                          event.isRegistered ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-slate-900 text-white'
                        } disabled:opacity-50`}
                      >
                        {officeHourActionBusy === event.id
                          ? 'Working...'
                          : event.isRegistered
                            ? event.isLive
                              ? 'Joined'
                              : 'Registered'
                            : event.isLive
                              ? 'Join live'
                              : 'RSVP'}
                      </button>
                      <Link
                        to="/community/events"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                      >
                        Open events
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  Live AMAs and office hours will appear here as soon as creators or companies schedule upcoming sessions.
                </p>
                <Link
                  to="/community/events"
                  className="mt-3 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  Browse events
                </Link>
              </div>
            )}
          </div>

          <div
            data-insights-section="fan-clubs"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fan clubs</p>
                <p className="mt-1 text-xs text-slate-500">
                  Free and paid micro-communities for creators and companies, built on top of clubs and broadcast channels.
                </p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                {freeFanClubs.length + paidFanChannels.length} live
              </span>
            </div>

            {fanClubStatus ? <p className="mt-3 text-xs text-slate-500">{fanClubStatus}</p> : null}

            {freeFanClubs.length || paidFanChannels.length ? (
              <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-2'}`}>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Free fan clubs</p>
                    <span className="text-[11px] text-slate-500">{freeFanClubs.length} clubs</span>
                  </div>
                  {freeFanClubs.length ? (
                    <div className="mt-3 space-y-3">
                      {freeFanClubs.map((club) => (
                        <div key={club.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-slate-900">{club.title}</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {buildActorLabel(club.owner)} • {formatWholeNumber(Number(club.memberCount || 0))} members
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {club.visibility}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">{club.description || 'A focused member club ready for your next update, discussion, and event loop.'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void toggleFreeFanClubMembership(club)}
                              disabled={fanClubActionBusy === `club:${club.id}`}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                club.isJoined ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-slate-900 text-white'
                              } disabled:opacity-50`}
                            >
                              {fanClubActionBusy === `club:${club.id}` ? 'Working...' : club.isJoined ? 'Joined' : 'Join club'}
                            </button>
                            <Link
                              to="/community/clubs"
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                            >
                              Browse clubs
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">Fan clubs will appear here as soon as the community clubs loop is seeded with public rooms.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Paid / creator channels</p>
                    <span className="text-[11px] text-slate-500">{paidFanChannels.length} channels</span>
                  </div>
                  {paidFanChannels.length ? (
                    <div className="mt-3 space-y-3">
                      {paidFanChannels.map((channel) => (
                        <div key={channel.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-slate-900">{channel.title}</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {buildActorLabel(channel.owner)} • {formatWholeNumber(Number(channel.memberCount || 0))} followers
                              </p>
                            </div>
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              {channel.pricing?.isPaid ? `${formatWholeNumber(Number(channel.pricing.price || 0))} ${channel.pricing.currency}` : 'Free'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            {channel.latestUpdate?.content || channel.description || 'Focused updates, creator drops, and recurring insider signals.'}
                          </p>
                          {channel.pricing?.perks?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {channel.pricing.perks.slice(0, compact ? 2 : 3).map((perk) => (
                                <span key={perk} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                  {perk}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleFanChannelAction(channel)}
                              disabled={fanClubActionBusy === `channel:${channel.id}`}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                channel.pricing?.isPaid && !channel.pricing?.subscribed
                                  ? 'bg-slate-900 text-white'
                                  : channel.isFollowing
                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border border-slate-200 bg-white text-slate-700'
                              } disabled:opacity-50`}
                            >
                              {fanClubActionBusy === `channel:${channel.id}`
                                ? 'Working...'
                                : channel.pricing?.isPaid && !channel.pricing?.subscribed
                                  ? `Unlock ${formatWholeNumber(Number(channel.pricing.price || 0))} ${channel.pricing.currency}`
                                  : channel.isFollowing
                                    ? 'Following'
                                    : 'Follow channel'}
                            </button>
                            <Link
                              to={channel.owner?.href || '/community'}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                            >
                              Open source
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">Paid creator and company fan channels will appear here as soon as the first plans are published.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Fan clubs and paid micro-communities will show up here when the first public rooms go live.</p>
            )}
          </div>

          <div
            data-insights-section="skill-mini-games"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Skill mini-games</p>
                <p className="mt-1 text-xs text-slate-500">
                  Quick professional drills with instant feedback and Gcoin upside, designed to keep the daily loop useful instead of noisy.
                </p>
              </div>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                {Number(engagementExpansion?.miniGames?.playedCount || 0)}/{Number(engagementExpansion?.miniGames?.totalCount || 0)}
              </span>
            </div>

            {miniGameStatus ? <p className="mt-3 text-xs text-slate-500">{miniGameStatus}</p> : null}

            {miniGames.length ? (
              <div className="mt-3 grid gap-3">
                {miniGames.map((game) => (
                  <div key={game.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {game.category}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                            +{formatWholeNumber(Number(game.rewardAmount || 0))} Gcoin
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{game.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{game.prompt}</p>
                      </div>
                    </div>
                    {game.helperText ? <p className="mt-2 text-[11px] text-slate-500">{game.helperText}</p> : null}
                    <div className="mt-3 grid gap-2">
                      {game.choices.map((choice) => {
                        const selectedId = String(selectedMiniGameChoiceMap[game.id] || game.selectedChoiceId || '').trim();
                        const isSelected = selectedId === choice.id;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() =>
                              setSelectedMiniGameChoiceMap((current) => ({
                                ...current,
                                [game.id]: choice.id
                              }))
                            }
                            disabled={game.playedToday}
                            className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                              isSelected ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'
                            } disabled:opacity-70`}
                          >
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void submitMiniGame(game)}
                        disabled={game.playedToday || miniGameActionBusy === game.id}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {miniGameActionBusy === game.id ? 'Submitting...' : game.playedToday ? (game.correctToday ? 'Completed' : 'Played today') : 'Submit answer'}
                      </button>
                      {game.playedToday ? (
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${game.correctToday ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {game.correctToday ? 'Correct today' : 'Try again tomorrow'}
                        </span>
                      ) : null}
                    </div>
                    {game.playedToday ? <p className="mt-2 text-[11px] text-slate-500">{game.explanation}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">New skill mini-games will appear here as the daily training rotation opens.</p>
            )}
          </div>

          <div
            data-insights-section="event-passes-seasons"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Event passes / seasons</p>
                <p className="mt-1 text-xs text-slate-500">
                  Recurring seasonal attendance loops that combine events, clubs, and mini-games into one visible habit cycle.
                </p>
              </div>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                {seasonItems.length} seasons
              </span>
            </div>

            {seasonStatus ? <p className="mt-3 text-xs text-slate-500">{seasonStatus}</p> : null}

            {seasonItems.length ? (
              <div className="mt-3 grid gap-3">
                {seasonItems.map((season) => (
                  <div key={season.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {season.badge}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                            {season.progress.completedGoals}/{season.progress.totalGoals} goals
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{season.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{season.description}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {formatRelativeDeadline(season.endsAt)}
                      </span>
                    </div>
                    <div className={`mt-3 grid gap-2 ${compact || isDesktopRail ? 'grid-cols-1' : 'sm:grid-cols-3'}`}>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                        <div className="font-semibold uppercase tracking-wide text-slate-500">Events joined</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{season.progress.registeredEvents}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                        <div className="font-semibold uppercase tracking-wide text-slate-500">Clubs joined</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{season.progress.joinedClubs}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                        <div className="font-semibold uppercase tracking-wide text-slate-500">Mini-games won</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{season.progress.miniGamesCompleted}</div>
                      </div>
                    </div>
                    {season.passes.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {season.passes.map((pass) => (
                          <button
                            key={pass.id}
                            type="button"
                            onClick={() => void activateSeasonPass(season.id, pass.id)}
                            disabled={pass.activated || seasonActionBusy === `${season.id}:${pass.id}`}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                              pass.activated ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-white text-slate-700'
                            } disabled:opacity-50`}
                          >
                            {seasonActionBusy === `${season.id}:${pass.id}`
                              ? 'Activating...'
                              : pass.activated
                                ? `${pass.label} active`
                                : pass.price > 0
                                  ? `${pass.label} • ${formatWholeNumber(Number(pass.price || 0))} ${pass.currency}`
                                  : `${pass.label} • Free`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {season.nextEvents.length ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next events</p>
                        <div className="mt-2 space-y-2">
                          {season.nextEvents.map((event) => (
                            <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <p className="line-clamp-1 text-sm font-semibold text-slate-900">{event.title}</p>
                                <p className="text-[11px] text-slate-500">{event.type} • {new Date(event.startTime).toLocaleString()}</p>
                              </div>
                              <Link to="/community/events" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                                {event.isRegistered ? 'Open' : 'RSVP'}
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Season passes will appear here when the next recurring event cycle opens.</p>
            )}
          </div>

          <div
            data-insights-section="premium-series"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Premium content series</p>
                <p className="mt-1 text-xs text-slate-500">
                  Monetized binge content for creators, with support-unlock style access that fits the Scroll series model already live on the platform.
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                {premiumSeriesCards.length} series
              </span>
            </div>

            {premiumSeriesStatus ? <p className="mt-3 text-xs text-slate-500">{premiumSeriesStatus}</p> : null}

            {premiumSeriesCards.length ? (
              <div className="mt-3 grid gap-3">
                {premiumSeriesCards.map((series) => (
                  <div key={series.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{series.title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {buildActorLabel(series.creator)} • {series.itemCount} items
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        series.unlock.unlocked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {series.unlock.unlocked ? 'Unlocked' : series.unlock.bonusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {series.description || series.unlock.teaser || 'Support unlock this creator series to back the work and keep the binge loop alive.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {series.unlock.available && !series.unlock.unlocked ? (
                        <button
                          type="button"
                          onClick={() => void unlockSeriesSupport(series.id)}
                          disabled={premiumSeriesActionBusy === series.id}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {premiumSeriesActionBusy === series.id
                            ? 'Unlocking...'
                            : `Unlock ${formatWholeNumber(Number(series.unlock.price || 0))} ${series.unlock.currency}`}
                        </button>
                      ) : null}
                      <Link
                        to={series.href || buildSeriesHref(series.id)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        {series.unlock.unlocked ? 'Open premium series' : 'Preview series'}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Premium series will appear here as creators start turning Scroll playlists into monetized collections.</p>
            )}
          </div>

          <div
            data-insights-section="expert-answer-bounties"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expert answer bounties</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pay-to-answer or tip-to-answer questions that turn high-value knowledge into a faster, clearer response loop.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {formatWholeNumber(Number(engagementExpansion?.expertBounties?.totalBountyAmount || 0))} Gcoin open
              </span>
            </div>

            {bountyStatus ? <p className="mt-3 text-xs text-slate-500">{bountyStatus}</p> : null}

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Create a bounty-backed question</p>
                  <p className="mt-1 text-[11px] text-slate-500">Attract focused expert answers with a clear question and optional Gcoin bounty.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void createBountyQuestion()}
                  disabled={bountyActionBusy === 'create'}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {bountyActionBusy === 'create' ? 'Posting...' : 'Post bounty'}
                </button>
              </div>
              <div className="mt-3 grid gap-3">
                <input
                  value={bountyTitle}
                  onChange={(event) => setBountyTitle(event.target.value)}
                  placeholder="Question title"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <textarea
                  value={bountyBody}
                  onChange={(event) => setBountyBody(event.target.value)}
                  placeholder="Describe the problem, the context, and the kind of expert answer you want."
                  className="min-h-[92px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <div className={`grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'sm:grid-cols-3'}`}>
                  <input
                    value={bountyCategory}
                    onChange={(event) => setBountyCategory(event.target.value)}
                    placeholder="Category"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                  <input
                    value={bountyTags}
                    onChange={(event) => setBountyTags(event.target.value)}
                    placeholder="Tags, comma separated"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                  <input
                    value={bountyAmount}
                    onChange={(event) => setBountyAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Bounty amount"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
            </div>

            {expertBountyQuestions.length ? (
              <div className="mt-3 grid gap-3">
                {expertBountyQuestions.map((question) => (
                  <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{question.title}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {buildActorLabel(question.author)} • {question.answerCount} answers
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        {formatWholeNumber(Number(question.bountyAmount || 0))} {question.bountyCurrency}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{question.body}</p>
                    {question.tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {question.tags.slice(0, compact ? 3 : 5).map((tag) => (
                          <span key={tag} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {question.answers.length ? (
                      <div className="mt-3 space-y-2">
                        {question.answers.map((answer) => (
                          <div key={answer.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{buildActorLabel(answer.author)}</p>
                                <p className="mt-1 text-xs text-slate-600">{answer.body}</p>
                              </div>
                              {answer.isAccepted ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Accepted</span>
                              ) : question.canAward ? (
                                <button
                                  type="button"
                                  onClick={() => void awardBountyAnswer(question.id, answer.id)}
                                  disabled={bountyActionBusy === `award:${answer.id}`}
                                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                >
                                  {bountyActionBusy === `award:${answer.id}` ? 'Awarding...' : 'Award'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {question.canAnswer && !question.acceptedAnswerId ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                        <textarea
                          value={bountyAnswerDrafts[question.id] || ''}
                          onChange={(event) =>
                            setBountyAnswerDrafts((current) => ({
                              ...current,
                              [question.id]: event.target.value
                            }))
                          }
                          placeholder="Write a concise expert answer."
                          className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void answerBountyQuestion(question)}
                            disabled={bountyActionBusy === `answer:${question.id}`}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {bountyActionBusy === `answer:${question.id}` ? 'Submitting...' : 'Submit answer'}
                          </button>
                          <Link
                            to="/answers"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                          >
                            Open Answers
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Open expert bounties will appear here as soon as members start funding high-value questions.</p>
            )}
          </div>

          <div
            data-insights-section="shared-accountability"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Shared accountability</p>
                <p className="mt-1 text-xs text-slate-500">
                  Invite a mutual follow to share the same daily four-action streak and keep each other accountable.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {Number(friendStreaks?.activeCount || 0)}/{Number(friendStreaks?.maxActive || 3)} active
              </span>
            </div>

            {friendStreakStatus ? <p className="mt-3 text-xs text-slate-500">{friendStreakStatus}</p> : null}

            <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-[1.2fr_0.8fr]'}`}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Invite a mutual follow</p>
                    <p className="mt-1 text-[11px] text-slate-500">One invite per pair, no duplicate streak records.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void inviteFriendStreak()}
                    disabled={!selectedFriendCandidateId || Boolean(friendStreakActionBusy) || friendStreaks?.canInvite === false}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {friendStreakActionBusy?.startsWith('invite:') ? 'Inviting...' : 'Invite'}
                  </button>
                </div>
                <select
                  value={selectedFriendCandidateId}
                  onChange={(event) => setSelectedFriendCandidateId(event.target.value)}
                  disabled={!friendCandidates.length || friendStreaks?.canInvite === false}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                >
                  {friendCandidates.length ? null : <option value="">No mutual follows available yet</option>}
                  {friendCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                      {candidate.username ? ` (@${candidate.username})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-slate-500">
                  {friendStreaks?.canInvite === false
                    ? 'You have reached the active accountability limit. End one shared streak before inviting another partner.'
                    : friendCandidates.length
                      ? 'Only mutual follows appear here to keep invites high-signal and spam-resistant.'
                      : 'Follow each other first to unlock shared accountability streaks.'}
                </p>

                {outgoingFriendInvites.length ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending invites</p>
                    {outgoingFriendInvites.map((invite) => (
                      <div key={invite.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{invite.partner?.name || 'Member'}</p>
                            <p className="text-[11px] text-slate-500">
                              Waiting for {invite.partner.username ? `@${invite.partner.username}` : 'your partner'} to accept.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void closeFriendStreak(invite, 'cancel')}
                            disabled={friendStreakActionBusy === `cancel:${invite.id}`}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
                          >
                            {friendStreakActionBusy === `cancel:${invite.id}` ? 'Cancelling...' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                {incomingFriendInvites.length ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Incoming invites</p>
                    <div className="mt-2 space-y-2">
                      {incomingFriendInvites.map((invite) => (
                        <div key={invite.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-slate-900">{invite.partner?.name || 'Member'}</p>
                              <p className="text-[11px] text-slate-500">
                                {invite.partner.username ? `@${invite.partner.username}` : 'Your mutual'} wants to share a daily streak.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void respondToFriendInvite(invite, 'decline')}
                                disabled={friendStreakActionBusy === `decline:${invite.id}`}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                onClick={() => void respondToFriendInvite(invite, 'accept')}
                                disabled={friendStreakActionBusy === `accept:${invite.id}`}
                                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                              >
                                {friendStreakActionBusy === `accept:${invite.id}` ? 'Accepting...' : 'Accept'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active partners</p>
                    <span className="text-[11px] text-slate-500">
                      {Number(friendStreaks?.pendingIncomingCount || 0)} incoming / {Number(friendStreaks?.pendingOutgoingCount || 0)} outgoing
                    </span>
                  </div>
                  {activeFriendStreaks.length ? (
                    <div className="mt-2 space-y-2">
                      {activeFriendStreaks.map((entry) => {
                        const partnerInitial = String(entry.partner?.name || entry.partner?.username || '?').trim().charAt(0).toUpperCase() || '?';
                        return (
                          <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-800 text-sm font-semibold text-white">
                                  {entry.partner.avatarUrl ? (
                                    <img src={entry.partner?.avatarUrl || ''} alt={entry.partner?.name || 'Member'} className="h-full w-full object-cover" />
                                  ) : (
                                    <span>{partnerInitial}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">{entry.partner?.name || 'Member'}</p>
                                  <p className="text-[11px] text-slate-500">
                                    {entry.partner.username ? `@${entry.partner.username}` : 'Mutual follow'} · Shared streak {entry.sharedCurrentStreakDays}d
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void closeFriendStreak(entry, 'end')}
                                disabled={friendStreakActionBusy === `end:${entry.id}`}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
                              >
                                {friendStreakActionBusy === `end:${entry.id}` ? 'Ending...' : 'End'}
                              </button>
                            </div>
                            <div className={`mt-3 grid gap-2 ${compact || isDesktopRail ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                                <div className="font-semibold uppercase tracking-wide text-slate-500">You</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900">
                                  {entry.today.viewerCompletedCount}/{entry.today.goalCount}
                                </div>
                                <div className="mt-1">{entry.today.viewerAllCompleted ? 'All four actions complete.' : 'Still in progress today.'}</div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                                <div className="font-semibold uppercase tracking-wide text-slate-500">Partner</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900">
                                  {entry.today.partnerCompletedCount}/{entry.today.goalCount}
                                </div>
                                <div className="mt-1">
                                  {entry.today.partnerAllCompleted ? 'All four actions complete.' : 'Waiting on the remaining actions.'}
                                </div>
                              </div>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">
                              {entry.today.bothCompleted
                                ? 'Both partners completed all four actions today.'
                                : 'The shared streak advances when both partners complete all four actions on the same day.'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      No shared streaks are active yet. Invite a mutual follow to start the accountability loop.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            data-insights-section="referral-squads"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Referral squads</p>
                <p className="mt-1 text-xs text-slate-500">
                  Invite mutual follows into a small squad, compete on referrals, and turn warm intros into a visible team identity.
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                {referralSquads?.currentSquad ? `${referralSquads.currentSquad.memberCount}/${referralSquads.currentSquad.maxMembers}` : 'Open'}
              </span>
            </div>

            {referralSquadStatus ? <p className="mt-3 text-xs text-slate-500">{referralSquadStatus}</p> : null}

            {referralSquads?.currentSquad ? (
              <div className="mt-3 space-y-3">
                <div className={`grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-3'}`}>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Squad</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{referralSquads.currentSquad.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500">Code {referralSquads.currentSquad.code}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rank</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {referralSquads.currentSquad.rank ? `#${formatWholeNumber(referralSquads.currentSquad.rank)}` : 'Unranked'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {referralSquads.currentSquad.totalSquads
                        ? `${formatWholeNumber(referralSquads.currentSquad.totalSquads)} squads tracked`
                        : 'Invite members to enter the squad board.'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payout</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {formatWholeNumber(Number(referralSquads.currentSquad.referralCount || 0))} referrals
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{formatWholeNumber(Number(referralSquads.currentSquad.earnings || 0))} Gcoin-equivalent earnings tracked</div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900">Members</p>
                    <button
                      type="button"
                      onClick={() => void leaveReferralSquadGroup()}
                      disabled={referralSquadActionBusy === `leave:${referralSquads.currentSquad.id}`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
                    >
                      {referralSquadActionBusy === `leave:${referralSquads.currentSquad.id}` ? 'Updating...' : 'Leave squad'}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {referralSquads.currentSquad.members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-slate-900">{member.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {member.username ? `@${member.username}` : 'Scrolith member'} · {member.role}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {formatWholeNumber(Number(member.referrals || 0))} refs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-[1.1fr_0.9fr]'}`}>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Invite a referral operator</p>
                      <p className="mt-1 text-[11px] text-slate-500">One squad per user, invite only from mutual follows.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void inviteReferralSquadMember()}
                      disabled={!selectedReferralCandidateId || Boolean(referralSquadActionBusy) || referralSquads?.canInvite === false}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {referralSquadActionBusy?.startsWith('invite:') ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                  <select
                    value={selectedReferralCandidateId}
                    onChange={(event) => setSelectedReferralCandidateId(event.target.value)}
                    disabled={!referralCandidates.length || referralSquads?.canInvite === false}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                  >
                    {referralCandidates.length ? null : <option value="">No mutual follows available yet</option>}
                    {referralCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                        {candidate.username ? ` (@${candidate.username})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Referral squads unlock team ranking, shared referral competition, and monthly reward eligibility.
                  </p>
                </div>

                <div className="space-y-3">
                  {incomingReferralInvites.length ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Incoming invites</p>
                      <div className="mt-2 space-y-2">
                        {incomingReferralInvites.map((invite) => (
                          <div key={invite.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-sm font-semibold text-slate-900">{invite.from?.name || 'Scrolith member'}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{invite.squadName}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void respondToReferralInvite(invite, 'decline')}
                                disabled={referralSquadActionBusy === `decline:${invite.id}`}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                onClick={() => void respondToReferralInvite(invite, 'accept')}
                                disabled={referralSquadActionBusy === `accept:${invite.id}`}
                                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                              >
                                {referralSquadActionBusy === `accept:${invite.id}` ? 'Accepting...' : 'Accept'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outgoing invites</p>
                      <span className="text-[11px] text-slate-500">{outgoingReferralInvites.length} pending</span>
                    </div>
                    {outgoingReferralInvites.length ? (
                      <div className="mt-2 space-y-2">
                        {outgoingReferralInvites.map((invite) => (
                          <div key={invite.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">{invite.to?.name || 'Scrolith member'}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{invite.squadName}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">No pending referral squad invites yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            data-insights-section="gcoin-reward-drops"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gcoin reward drops</p>
                <p className="mt-1 text-xs text-slate-500">
                  Anticipation and reward loops tied to daily activity, league progress, and squad participation.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {Number(rewardDrops?.claimableCount || 0)} claimable
              </span>
            </div>

            {rewardDropStatus ? <p className="mt-3 text-xs text-slate-500">{rewardDropStatus}</p> : null}

            {rewardDropCards.length ? (
              <div className="mt-3 grid gap-3">
                {rewardDropCards.map((drop) => (
                  <div key={drop.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{drop.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{drop.description}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        +{formatWholeNumber(Number(drop.amount || 0))} Gcoin
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">{drop.helperText}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        drop.claimed ? 'bg-slate-100 text-slate-600' : drop.eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {drop.statusLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => void claimRewardDropCard(drop.id)}
                        disabled={!drop.eligible || drop.claimed || rewardDropActionBusy === drop.id}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {rewardDropActionBusy === drop.id ? 'Claiming...' : drop.claimed ? 'Claimed' : 'Claim'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Reward drops will appear here as soon as the current streak, tier, and squad triggers are available.</p>
            )}
          </div>

          {hub ? (
            <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-2'}`.trim()}>
              <div
                data-insights-section="identity-trust"
                className={`rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Identity and trust</p>
                    <h4 className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{hub.identity?.name || 'Hub'}</h4>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {hub.identity.title || hub.identity.role}
                      {hub.identity.location ? ` | ${hub.identity.location}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    {hub.identity.verificationState || 'Trust building'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Trust score</div>
                    <div className="mt-1 text-sm font-semibold text-indigo-700">{formatWholeNumber(hub.trust.score)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Profile</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{clampPercent(hub.identity.profileCompleteness)}% complete</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Rating</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{hub.trust.averageRating.toFixed(1)} avg</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Win rate</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{hub.trust.proposalWinRate.toFixed(0)}%</div>
                  </div>
                </div>
                {topHubSkills.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topHubSkills.map((skill) => (
                      <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>{formatMetric(hub.identity.followersCount)} followers</span>
                  <span>{formatMetric(hub.identity.postsCount)} posts</span>
                  <span>{formatMetric(hub.identity.portfolioProofs)} proofs</span>
                </div>
              </div>

              <div
                data-insights-section="delivery-packaging"
                className={`rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Delivery and packaging</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Active contracts</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMetric(hub.delivery.activeContracts)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Active orders</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMetric(hub.delivery.activeOrders)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Open proposals</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMetric(hub.delivery.openProposals)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Tracked hours</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMetric(hub.delivery.trackedHours)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Active gigs</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMetric(hub.packaging.activeGigs)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="font-semibold uppercase tracking-wide text-slate-500">Active jobs</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMetric(hub.packaging.activeJobs)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>Wallet {formatMetric(hub.delivery.walletBalance)}</span>
                  <span>Pending due {formatMetric(hub.delivery.pendingDue)}</span>
                  <span>{formatMetric(hub.packaging.activePages)} pages</span>
                </div>
                {Array.isArray(hub.packaging.pages) && hub.packaging.pages.length ? (
                  <div className="mt-3 space-y-2">
                    {hub.packaging.pages.slice(0, compact ? 1 : 2).map((page) => (
                      <div key={page.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-800">{page.name}</p>
                            <p className="line-clamp-1 text-[11px] text-slate-500">{page.tagline || page.industry || 'Business page'}</p>
                          </div>
                          <Link to={`/company/${page.slug}`} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                            Open
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            data-insights-section="brief-to-match"
            className={`mt-3 rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Brief to match</p>
                <p className="mt-1 text-xs text-slate-500">Turn a rough need into a structured brief, package plan, and live matches.</p>
              </div>
              <button
                type="button"
                onClick={() => void generateOpportunityBrief()}
                disabled={briefBusy}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {briefBusy ? 'Generating...' : 'Generate'}
              </button>
            </div>
            <textarea
              value={briefPrompt}
              onChange={(event) => setBriefPrompt(event.target.value)}
              placeholder="Describe who you want to hire, the service you want to package, or the opportunity you want to pursue."
              className="mt-3 min-h-[96px] w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            {briefStatus ? <p className="mt-2 text-xs text-slate-500">{briefStatus}</p> : null}
            {briefResult ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{briefResult.brief.title}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase text-indigo-600">
                      {briefResult.brief.intent}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">{briefResult.brief.summary}</p>
                  <div className={`mt-3 grid gap-2 ${compact || isDesktopRail ? 'grid-cols-1' : 'sm:grid-cols-2'}`.trim()}>
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-[11px] text-slate-500">
                      <div className="font-semibold uppercase tracking-wide">Budget range</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{briefResult.brief.budgetRange}</div>
                    </div>
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-[11px] text-slate-500">
                      <div className="font-semibold uppercase tracking-wide">Timeline</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{briefResult.brief.timeline}</div>
                    </div>
                  </div>
                  {Array.isArray(briefResult.brief.skills) && briefResult.brief.skills.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {briefResult.brief.skills.slice(0, compact ? 4 : 6).map((skill) => (
                        <span key={skill} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {Array.isArray(briefResult.packageBlueprint) && briefResult.packageBlueprint.length ? (
                  <div className={`grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-3'}`.trim()}>
                    {briefResult.packageBlueprint.slice(0, compact ? 2 : 3).map((blueprint) => (
                      <div key={blueprint.tier} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{blueprint.tier}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{blueprint.name}</p>
                        <p className="mt-2 text-xs text-slate-500">{blueprint.positioning}</p>
                        <div className="mt-2 text-[11px] text-slate-500">
                          <div>Turnaround: {blueprint.turnaround}</div>
                          <div>Pricing: {blueprint.pricingGuidance}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className={`grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-3'}`.trim()}>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Job matches</p>
                    <div className="mt-2 space-y-2">
                      {briefMatches.jobs.length ? (
                        briefMatches.jobs.map((match) => {
                          const href = resolveMatchHref(match);
                          return (
                            <div key={match.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold text-slate-800">{resolveMatchTitle(match)}</p>
                                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{resolveMatchMeta(match)}</p>
                                </div>
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                                  {Number(match.score || 0).toFixed(0)}%
                                </span>
                              </div>
                              {href ? <Link to={href} className="mt-2 inline-block text-[11px] font-semibold text-indigo-600">Open</Link> : null}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-500">No job matches yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Packaged offers</p>
                    <div className="mt-2 space-y-2">
                      {briefMatches.gigs.length ? (
                        briefMatches.gigs.map((match) => {
                          const href = resolveMatchHref(match);
                          return (
                            <div key={match.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold text-slate-800">{resolveMatchTitle(match)}</p>
                                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{resolveMatchMeta(match)}</p>
                                </div>
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                                  {Number(match.score || 0).toFixed(0)}%
                                </span>
                              </div>
                              {href ? <Link to={href} className="mt-2 inline-block text-[11px] font-semibold text-indigo-600">Open</Link> : null}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-500">No packaged-offer matches yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Page visibility</p>
                    <div className="mt-2 space-y-2">
                      {briefMatches.pages.length ? (
                        briefMatches.pages.map((match) => {
                          const href = resolveMatchHref(match);
                          return (
                            <div key={match.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold text-slate-800">{resolveMatchTitle(match)}</p>
                                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{resolveMatchMeta(match)}</p>
                                </div>
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                                  {Number(match.score || 0).toFixed(0)}%
                                </span>
                              </div>
                              {href ? <Link to={href} className="mt-2 inline-block text-[11px] font-semibold text-indigo-600">Open</Link> : null}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-500">No page matches yet.</p>
                      )}
                    </div>
                  </div>
                </div>
                {Array.isArray(briefResult.suggestedActions) && briefResult.suggestedActions.length ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next actions</p>
                    <ul className="mt-2 space-y-1">
                      {briefResult.suggestedActions.slice(0, compact ? 2 : 4).map((action) => (
                        <li key={action} className="text-xs text-slate-600">
                          - {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div data-insights-section="feed-mode" className="mt-3">
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

          {Array.isArray(hub?.actions) && hub.actions.length ? (
            <div
              data-insights-section="opportunity-actions"
              className={`mt-3 rounded-xl border border-slate-200 bg-slate-50 ${isDesktopRail ? 'p-4' : 'p-3'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Opportunity actions</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">{hub.actions.length} live</span>
                  <Link to="/opportunities" className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    Action center
                  </Link>
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                {hub.actions.slice(0, compact ? 3 : 5).map((action) => (
                  <li key={action} className="text-xs text-slate-600">
                    - {action}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div data-insights-section="opportunity-matches" className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Opportunity matches</p>
              <span className="text-[11px] text-slate-400">
                {matches.length} shown{hub?.matching?.total ? ` of ${hub.matching.total}` : ''}
              </span>
            </div>
            {matches.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No matches yet. Keep your profile updated for better recommendations.</p>
            ) : (
              <div className={`mt-2 ${isDesktopRail ? 'space-y-3' : 'space-y-2'}`}>
                {matches.map((match) => {
                  const href = resolveMatchHref(match);
                  return (
                    <div key={match.id} className={`rounded-xl border border-slate-200 ${isDesktopRail ? 'px-4 py-3' : 'px-3 py-2'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-semibold text-slate-800">{resolveMatchTitle(match)}</p>
                          <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{resolveMatchMeta(match)}</p>
                        </div>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                          {Number(match.score || 0).toFixed(0)}%
                        </span>
                      </div>
                      <p className={`mt-2 text-xs text-slate-500 ${compact ? 'line-clamp-1' : 'line-clamp-2'}`.trim()}>{resolveMatchReason(match)}</p>
                      {href ? (
                        <Link to={href} className="mt-2 inline-block text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                          Open opportunity
                        </Link>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div data-insights-section="career-quests" className="mt-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Career quests</p>
              <span className="text-[11px] text-slate-400">{quests.length} active</span>
            </div>
            {quests.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No quests assigned yet. Stay active and refresh to receive new goals.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {quests.map((quest) => {
                  const isCompleted = String(quest.status || '').toLowerCase() === 'completed';
                  const isExpired = String(quest.status || '').toLowerCase() === 'expired';
                  const progress = Math.max(0, Number(quest.progress || 0));
                  const target = Math.max(1, Number(quest.target || 1));
                  const progressPercent = clampPercent((progress / target) * 100);
                  return (
                    <div key={quest.id} className="rounded-xl border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-800">
                          {quest.quest?.title || quest.quest?.key || 'Quest'}
                        </p>
                        {isCompleted ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">Completed</span>
                        ) : isExpired ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Expired</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void completeQuest(quest)}
                            disabled={questBusyId === quest.id}
                            className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
                          >
                            {questBusyId === quest.id ? 'Checking...' : 'Complete'}
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {progress}/{target} progress
                      </p>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                        <div className="h-1.5 rounded-full bg-indigo-500 transition-[width] duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {questStatus ? <p className="mt-2 text-xs text-slate-500">{questStatus}</p> : null}
          </div>

          <div data-insights-section="skill-gap" className="mt-3 rounded-xl border border-slate-200 p-3">
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
