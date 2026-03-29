import prisma from '../../../utils/prismaClient';
import { CAREER_DAILY_ACTION_TYPES, getCareerStreakSummary } from './careerStreak.service';
import { buildEmptyFriendStreakDashboard, getFriendStreakDashboard } from './friendStreak.service';

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const ACTION_LABELS: Record<string, string> = {
  post: 'Post',
  reply: 'Reply',
  apply: 'Apply',
  learn: 'Learn'
};

const normalizeRole = (value: unknown) => String(value || 'USER').trim().toUpperCase();

const getRelevantActionTypes = (roleInput: unknown) => {
  const role = normalizeRole(roleInput);
  if (role === 'EMPLOYER' || role === 'CLIENT') {
    return ['post', 'reply', 'learn'] as string[];
  }
  return [...CAREER_DAILY_ACTION_TYPES] as string[];
};

const deterministicIndex = (seed: string, length: number) => {
  if (!length) return 0;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
};

const rotateBuilders = <T,>(items: T[], seed: string) => {
  if (items.length <= 1) return items;
  const start = deterministicIndex(seed, items.length);
  return [...items.slice(start), ...items.slice(0, start)];
};

const toCompletedActionSet = (careerDaily: any): Set<string> =>
  new Set<string>(
    Array.isArray(careerDaily?.actions)
      ? careerDaily.actions
          .filter((item: any) => item?.completed)
          .map((item: any) => String(item?.type || '').trim().toLowerCase())
          .filter(Boolean)
      : []
  );

const buildMissionProgressLabel = (progress: number, target: number) => `${Math.max(0, progress)}/${Math.max(1, target)}`;

const buildAnyActionMission = (input: {
  key: string;
  title: string;
  description: string;
  badge: string;
  relevantActions: string[];
  completedActionSet: Set<string>;
  target: number;
  ctaLabel: string;
  ctaUrl: string;
}) => {
  const progress = input.relevantActions.filter((actionType) => input.completedActionSet.has(actionType)).length;
  const target = Math.min(Math.max(1, input.target), input.relevantActions.length);
  const completed = progress >= target;
  return {
    key: input.key,
    badge: input.badge,
    title: input.title,
    description: input.description,
    progress: Math.min(progress, target),
    target,
    progressLabel: buildMissionProgressLabel(Math.min(progress, target), target),
    completed,
    helperText: completed
      ? 'Mission complete for today.'
      : `${Math.max(0, target - progress)} more action${target - progress === 1 ? '' : 's'} will complete this mission.`,
    remainingActionTypes: input.relevantActions.filter((actionType) => !input.completedActionSet.has(actionType)),
    remainingActionLabels: input.relevantActions
      .filter((actionType) => !input.completedActionSet.has(actionType))
      .map((actionType) => ACTION_LABELS[actionType] || actionType),
    ctaLabel: completed ? null : input.ctaLabel,
    ctaUrl: completed ? null : input.ctaUrl,
    category: 'momentum'
  };
};

const buildSpecificActionMission = (input: {
  key: string;
  title: string;
  description: string;
  badge: string;
  requiredActions: string[];
  completedActionSet: Set<string>;
  ctaLabel: string;
  ctaUrl: string;
}) => {
  const progress = input.requiredActions.filter((actionType) => input.completedActionSet.has(actionType)).length;
  const target = input.requiredActions.length;
  const completed = progress >= target;
  return {
    key: input.key,
    badge: input.badge,
    title: input.title,
    description: input.description,
    progress,
    target,
    progressLabel: buildMissionProgressLabel(progress, target),
    completed,
    helperText: completed
      ? 'Mission complete for today.'
      : `Remaining: ${input.requiredActions
          .filter((actionType) => !input.completedActionSet.has(actionType))
          .map((actionType) => ACTION_LABELS[actionType] || actionType)
          .join(', ')}.`,
    remainingActionTypes: input.requiredActions.filter((actionType) => !input.completedActionSet.has(actionType)),
    remainingActionLabels: input.requiredActions
      .filter((actionType) => !input.completedActionSet.has(actionType))
      .map((actionType) => ACTION_LABELS[actionType] || actionType),
    ctaLabel: completed ? null : input.ctaLabel,
    ctaUrl: completed ? null : input.ctaUrl,
    category: 'focus'
  };
};

const buildPartnerSyncMission = (input: {
  careerDaily: any;
  friendStreaks: any;
}) => {
  const viewerCompleted = Number(input.careerDaily?.completedCount || 0) > 0;
  const partnerCompleted = Array.isArray(input.friendStreaks?.active)
    ? input.friendStreaks.active.some((entry: any) => Number(entry?.today?.partnerCompletedCount || 0) > 0)
    : false;
  const progress = Number(viewerCompleted) + Number(partnerCompleted);
  const completed = progress >= 2;
  return {
    key: 'partner_sync',
    badge: 'Shared',
    title: 'Partner Sync',
    description: 'Both you and at least one accountability partner should show up today.',
    progress,
    target: 2,
    progressLabel: buildMissionProgressLabel(progress, 2),
    completed,
    helperText: completed
      ? 'Both sides showed up today.'
      : viewerCompleted
        ? 'You are in. Waiting for your accountability partner to show up.'
        : partnerCompleted
          ? 'Your accountability partner is in. Show up to complete the mission.'
          : 'No one has checked in yet today.',
    remainingActionTypes: [],
    remainingActionLabels: [],
    ctaLabel: completed ? null : 'Open insights',
    ctaUrl: completed ? null : '/dashboard?tab=insights',
    category: 'shared'
  };
};

const buildRoleMissionPool = (input: {
  role: string;
  relevantActions: string[];
  completedActionSet: Set<string>;
}) => {
  const isEmployerLike = input.role === 'EMPLOYER' || input.role === 'CLIENT';
  if (isEmployerLike) {
    return [
      () =>
        buildSpecificActionMission({
          key: 'community_loop',
          badge: 'Focus',
          title: 'Community Loop',
          description: 'Publish something and join a conversation to keep your network warm.',
          requiredActions: ['post', 'reply'],
          completedActionSet: input.completedActionSet,
          ctaLabel: 'Open community',
          ctaUrl: '/community'
        }),
      () =>
        buildSpecificActionMission({
          key: 'authority_loop',
          badge: 'Focus',
          title: 'Authority Loop',
          description: 'Learn something useful and publish a signal today.',
          requiredActions: ['post', 'learn'],
          completedActionSet: input.completedActionSet,
          ctaLabel: 'Open Scrolitha',
          ctaUrl: '/answers'
        }),
      () =>
        buildSpecificActionMission({
          key: 'full_loop',
          badge: 'Stretch',
          title: 'Full Loop',
          description: 'Complete all role-relevant actions today to keep the momentum high.',
          requiredActions: [...input.relevantActions],
          completedActionSet: input.completedActionSet,
          ctaLabel: 'Finish the loop',
          ctaUrl: '/dashboard?tab=insights'
        })
    ];
  }

  return [
    () =>
      buildSpecificActionMission({
        key: 'visibility_loop',
        badge: 'Focus',
        title: 'Visibility Loop',
        description: 'Publish and reply on the same day to stay visible in the feed.',
        requiredActions: ['post', 'reply'],
        completedActionSet: input.completedActionSet,
        ctaLabel: 'Open community',
        ctaUrl: '/community'
      }),
    () =>
      buildSpecificActionMission({
        key: 'opportunity_loop',
        badge: 'Focus',
        title: 'Opportunity Loop',
        description: 'Learn and apply on the same day to turn insight into pipeline.',
        requiredActions: ['learn', 'apply'],
        completedActionSet: input.completedActionSet,
        ctaLabel: 'Browse jobs',
        ctaUrl: '/browse-jobs'
      }),
    () =>
      buildSpecificActionMission({
        key: 'full_loop',
        badge: 'Stretch',
        title: 'Full Loop',
        description: 'Complete all four core actions today to finish the full career loop.',
        requiredActions: [...input.relevantActions],
        completedActionSet: input.completedActionSet,
        ctaLabel: 'Finish the loop',
        ctaUrl: '/dashboard?tab=insights'
      })
  ];
};

export const buildEmptyDailyMissionSummary = (userId: string, roleInput: unknown = 'USER', actionDate = todayUtc()) => {
  const relevantActions = [...getRelevantActionTypes(roleInput)];
  const completedActionSet = new Set<string>();
  const role = normalizeRole(roleInput);
  const fallbackFriendStreaks = buildEmptyFriendStreakDashboard(userId, actionDate);

  const missions = [
    buildAnyActionMission({
      key: 'start_strong',
      badge: 'Daily',
      title: 'Start Strong',
      description: 'Show up with any one core action today.',
      relevantActions,
      completedActionSet,
      target: 1,
      ctaLabel: 'Open community',
      ctaUrl: '/community'
    }),
    buildAnyActionMission({
      key: 'momentum_pair',
      badge: 'Daily',
      title: 'Momentum Pair',
      description: 'Complete any two distinct core actions today.',
      relevantActions,
      completedActionSet,
      target: Math.min(2, relevantActions.length),
      ctaLabel: 'Open insights',
      ctaUrl: '/dashboard?tab=insights'
    }),
    ...buildRoleMissionPool({
      role,
      relevantActions,
      completedActionSet
    }).map((builder) => builder()),
    buildPartnerSyncMission({
      careerDaily: { completedCount: 0 },
      friendStreaks: fallbackFriendStreaks
    })
  ].slice(0, 3);

  return {
    userId: String(userId || '').trim(),
    actionDate: actionDate.toISOString(),
    completedCount: missions.filter((mission) => mission.completed).length,
    totalCount: missions.length,
    allCompleted: missions.every((mission) => mission.completed),
    missions
  };
};

export const getDailyMissionSummary = async (input: {
  userId: string;
  role?: unknown;
  careerDaily?: any;
  friendStreaks?: any;
}) => {
  const userId = String(input.userId || '').trim();
  const actionDate = todayUtc();
  if (!userId) return buildEmptyDailyMissionSummary('', input.role, actionDate);

  const [userRole, careerDaily, friendStreaks] = await Promise.all([
    input.role !== undefined
      ? Promise.resolve(normalizeRole(input.role))
      : prisma.user
          .findUnique({
            where: { id: userId },
            select: { role: true }
          })
          .then((user) => normalizeRole(user?.role)),
    input.careerDaily ? Promise.resolve(input.careerDaily) : getCareerStreakSummary(userId, actionDate),
    input.friendStreaks ? Promise.resolve(input.friendStreaks) : getFriendStreakDashboard(userId)
  ]);

  const relevantActions = [...getRelevantActionTypes(userRole)];
  const completedActionSet = toCompletedActionSet(careerDaily);
  const completedRelevantCount = relevantActions.filter((actionType) => completedActionSet.has(actionType)).length;
  const hasActivePartner = Array.isArray(friendStreaks?.active) && friendStreaks.active.length > 0;

  const selected: Array<Record<string, any>> = [];
  const seen = new Set<string>();
  const pushMission = (mission: Record<string, any>) => {
    if (!mission?.key || seen.has(mission.key)) return;
    seen.add(mission.key);
    selected.push(mission);
  };

  if (completedRelevantCount < 1) {
    pushMission(
      buildAnyActionMission({
        key: 'start_strong',
        badge: 'Daily',
        title: 'Start Strong',
        description: 'Show up with any one core action today.',
        relevantActions,
        completedActionSet,
        target: 1,
        ctaLabel: 'Open community',
        ctaUrl: '/community'
      })
    );
  }

  if (completedRelevantCount < Math.min(2, relevantActions.length)) {
    pushMission(
      buildAnyActionMission({
        key: 'momentum_pair',
        badge: 'Daily',
        title: 'Momentum Pair',
        description: 'Complete any two distinct core actions today.',
        relevantActions,
        completedActionSet,
        target: Math.min(2, relevantActions.length),
        ctaLabel: 'Open insights',
        ctaUrl: '/dashboard?tab=insights'
      })
    );
  }

  if (hasActivePartner) {
    pushMission(
      buildPartnerSyncMission({
        careerDaily,
        friendStreaks
      })
    );
  }

  const roleMissionPool = rotateBuilders(
    buildRoleMissionPool({
      role: userRole,
      relevantActions,
      completedActionSet
    }),
    `${userId}:${actionDate.toISOString().slice(0, 10)}:${userRole}`
  );

  roleMissionPool.forEach((builder) => {
    if (selected.length >= 3) return;
    pushMission(builder());
  });

  if (selected.length < 3) {
    pushMission(
      buildAnyActionMission({
        key: 'start_strong',
        badge: 'Daily',
        title: 'Start Strong',
        description: 'Show up with any one core action today.',
        relevantActions,
        completedActionSet,
        target: 1,
        ctaLabel: 'Open community',
        ctaUrl: '/community'
      })
    );
  }

  const missions = selected.slice(0, 3);
  return {
    userId,
    actionDate: actionDate.toISOString(),
    completedCount: missions.filter((mission) => mission.completed).length,
    totalCount: missions.length,
    allCompleted: missions.length > 0 && missions.every((mission) => mission.completed),
    missions
  };
};
