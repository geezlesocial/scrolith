import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import {
  type CreatorChallenge,
  type CreatorChallengeDashboard,
  type DailyMissionSummary,
  type FriendStreakDashboard,
  type InsightAchievement,
  InsightsService,
  type CareerDailyActionState,
  type FeedMode,
  type FriendStreakActiveSummary,
  type FriendStreakInviteSummary,
  type OpportunityBriefResult,
  type OpportunityHubData,
  type ProfessionalScore,
  type UserStreak,
  type UserQuest
} from '../../services/insights';

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
        const results = await withFastFail(
          Promise.allSettled([
            InsightsService.getMyPgs(),
            InsightsService.getMyStreak(),
            InsightsService.getMyAchievements(),
            InsightsService.getMyCreatorChallenges(),
            InsightsService.getMyQuests(),
            InsightsService.getOpportunityHub(),
            InsightsService.getMatches('all'),
            InsightsService.getFeedMode(),
            InsightsService.getSkillGap()
          ]),
          20000,
          'Insights request timed out. Please retry.'
        );

        const [
          pgsResult,
          streakResult,
          achievementsResult,
          creatorChallengesResult,
          questsResult,
          hubResult,
          matchesResult,
          feedModeResult,
          skillGapResult
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
              skillGap: skillGapData || null
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
    [compact, hasVisibleData, insightsCacheKey]
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
  const creatorChallenges = Array.isArray(creatorChallengeDashboard?.challenges) ? creatorChallengeDashboard.challenges : [];
  const earnedAchievements = achievements.filter((item) => item?.earned);
  const earnedBadges = earnedAchievements.filter((item) => ['bronze', 'silver'].includes(String(item?.tier || '').toLowerCase()));
  const earnedTrophies = earnedAchievements.filter((item) => ['gold', 'platinum'].includes(String(item?.tier || '').toLowerCase()));
  const lockedAchievementPreview = achievements.filter((item) => !item?.earned).slice(0, compact ? 2 : 3);

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
        dailyMissions: current?.dailyMissions || null
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
                                    {entry.author.name}
                                    {entry.author.username ? ` (@${entry.author.username})` : ''}
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
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{invite.partner.name}</p>
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
                              <p className="line-clamp-1 text-sm font-semibold text-slate-900">{invite.partner.name}</p>
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
                                    <img src={entry.partner.avatarUrl} alt={entry.partner.name} className="h-full w-full object-cover" />
                                  ) : (
                                    <span>{partnerInitial}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">{entry.partner.name}</p>
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

          {hub ? (
            <div className={`mt-3 grid gap-3 ${compact || isDesktopRail ? 'grid-cols-1' : 'xl:grid-cols-2'}`.trim()}>
              <div
                data-insights-section="identity-trust"
                className={`rounded-xl border border-slate-200 ${isDesktopRail ? 'p-4' : 'p-3'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Identity and trust</p>
                    <h4 className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{hub.identity.name}</h4>
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
                <span className="text-[11px] text-slate-400">{hub.actions.length} live</span>
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
