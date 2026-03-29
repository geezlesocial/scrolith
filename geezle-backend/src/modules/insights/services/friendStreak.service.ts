import type { Application } from 'express';
import prisma from '../../../utils/prismaClient';
import { notifyUser } from '../../../utils/notify';
import { CAREER_DAILY_ACTION_TYPES } from './careerStreak.service';
import { emitInsightsEvent } from '../realtime/insights.realtime';

const FRIEND_STREAK_MAX_ACTIVE = 3;
const FRIEND_STREAK_CANDIDATE_LIMIT = 12;
const FRIEND_STREAK_STREAK_LOOKBACK_DAYS = 30;

const FRIEND_STREAK_PENDING = 'PENDING';
const FRIEND_STREAK_ACTIVE = 'ACTIVE';
const FRIEND_STREAK_DECLINED = 'DECLINED';
const FRIEND_STREAK_ENDED = 'ENDED';

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const startOfUtcDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addUtcDays = (value: Date, offset: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + offset);
  return startOfUtcDay(next);
};

const toDateKey = (value: Date) => value.toISOString().slice(0, 10);

const getPairIds = (userId: string, otherUserId: string) =>
  String(userId).trim() < String(otherUserId).trim()
    ? { userLowId: String(userId).trim(), userHighId: String(otherUserId).trim() }
    : { userLowId: String(otherUserId).trim(), userHighId: String(userId).trim() };

const uniqueIds = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

export const buildEmptyFriendStreakDashboard = (userId: string, actionDate = todayUtc()) => ({
  userId,
  actionDate: actionDate.toISOString(),
  maxActive: FRIEND_STREAK_MAX_ACTIVE,
  activeCount: 0,
  pendingIncomingCount: 0,
  pendingOutgoingCount: 0,
  canInvite: true,
  active: [] as any[],
  incomingInvites: [] as any[],
  outgoingInvites: [] as any[],
  candidates: [] as any[]
});

const buildUserPreview = (user: any) => ({
  id: String(user?.id || '').trim(),
  name: String(user?.name || user?.username || 'Scrolith user').trim(),
  username: user?.username ? String(user.username).trim() : null,
  avatarUrl: user?.avatar ? String(user.avatar).trim() : null,
  role: user?.role ? String(user.role).trim() : null
});

const emitFriendStreakRefresh = (app: Application | undefined, userIds: string[], streakId: string, reason: string) => {
  uniqueIds(userIds).forEach((userId) => {
    emitInsightsEvent(app, 'insights:friend_streak_updated', {
      userId,
      streakId,
      reason
    });
  });
};

const createNotificationRecord = async (input: {
  userId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body: string;
  meta?: Record<string, any>;
  actionUrl?: string;
}) => {
  const userId = String(input.userId || '').trim();
  if (!userId) return null;
  const created = await prisma.notification.create({
    data: {
      userId,
      actorId: input.actorId ? String(input.actorId).trim() : null,
      type: input.type,
      title: input.title,
      body: input.body,
      meta: input.meta || null
    }
  });

  notifyUser(userId, {
    id: created.id,
    type: created.type,
    title: created.title || input.title,
    body: created.body || input.body,
    actionUrl: input.actionUrl || '/dashboard',
    meta: (created.meta as Record<string, any> | undefined) || input.meta,
    createdAt: created.createdAt.toISOString()
  });
  return created;
};

const ensureParticipantExists = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, avatar: true, role: true, isActive: true }
  });
  if (!user || user.isActive === false) {
    throw new Error('User not found');
  }
  return user;
};

const ensureMutualFollow = async (userId: string, partnerUserId: string) => {
  const follows = await prisma.userFollow.findMany({
    where: {
      OR: [
        { followerId: userId, followeeId: partnerUserId },
        { followerId: partnerUserId, followeeId: userId }
      ]
    },
    select: {
      followerId: true,
      followeeId: true
    }
  });

  const viewerFollowsPartner = follows.some((row) => row.followerId === userId && row.followeeId === partnerUserId);
  const partnerFollowsViewer = follows.some((row) => row.followerId === partnerUserId && row.followeeId === userId);
  if (!viewerFollowsPartner || !partnerFollowsViewer) {
    throw new Error('Friend streaks require a mutual follow relationship.');
  }
};

const countActiveFriendStreaks = async (userId: string) =>
  prisma.friendStreak.count({
    where: {
      status: FRIEND_STREAK_ACTIVE,
      OR: [{ userLowId: userId }, { userHighId: userId }]
    }
  });

const loadCareerDailyMaps = async (userIds: string[], startDate: Date, endDate: Date) => {
  const rows = await prisma.careerDailyAction.findMany({
    where: {
      userId: { in: userIds },
      actionDate: {
        gte: startDate,
        lte: endDate
      }
    },
    select: {
      userId: true,
      actionDate: true,
      actionType: true
    }
  });

  const actionMap = new Map<string, Map<string, Set<string>>>();
  rows.forEach((row) => {
    const userId = String(row.userId || '').trim();
    const dateKey = toDateKey(row.actionDate);
    const actionType = String(row.actionType || '').trim().toLowerCase();
    if (!userId || !dateKey || !actionType) return;
    let byDate = actionMap.get(userId);
    if (!byDate) {
      byDate = new Map<string, Set<string>>();
      actionMap.set(userId, byDate);
    }
    let actions = byDate.get(dateKey);
    if (!actions) {
      actions = new Set<string>();
      byDate.set(dateKey, actions);
    }
    actions.add(actionType);
  });

  return actionMap;
};

const getDailyProgress = (actionMap: Map<string, Map<string, Set<string>>>, userId: string, actionDate: Date) => {
  const actions = Array.from(actionMap.get(userId)?.get(toDateKey(actionDate)) || []);
  return {
    completedActions: actions,
    completedCount: actions.length,
    allCompleted: actions.length >= CAREER_DAILY_ACTION_TYPES.length
  };
};

const computeSharedCurrentStreakDays = (
  actionMap: Map<string, Map<string, Set<string>>>,
  viewerId: string,
  partnerId: string,
  acceptedAt: Date | null | undefined,
  today: Date
) => {
  const acceptedDay = acceptedAt ? startOfUtcDay(acceptedAt) : addUtcDays(today, -FRIEND_STREAK_STREAK_LOOKBACK_DAYS);
  const lookbackFloor = addUtcDays(today, -(FRIEND_STREAK_STREAK_LOOKBACK_DAYS - 1));
  const startDay = acceptedDay > lookbackFloor ? acceptedDay : lookbackFloor;

  let count = 0;
  for (let cursor = today; cursor >= startDay; cursor = addUtcDays(cursor, -1)) {
    const viewerActions = actionMap.get(viewerId)?.get(toDateKey(cursor));
    const partnerActions = actionMap.get(partnerId)?.get(toDateKey(cursor));
    const bothCompleted =
      (viewerActions?.size || 0) >= CAREER_DAILY_ACTION_TYPES.length &&
      (partnerActions?.size || 0) >= CAREER_DAILY_ACTION_TYPES.length;
    if (!bothCompleted) break;
    count += 1;
  }

  return count;
};

export const getFriendStreakDashboard = async (userId: string) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return buildEmptyFriendStreakDashboard('');

  const today = todayUtc();
  const partnerships = await prisma.friendStreak.findMany({
    where: {
      OR: [{ userLowId: normalizedUserId }, { userHighId: normalizedUserId }]
    },
    include: {
      userLow: {
        select: { id: true, name: true, username: true, avatar: true, role: true }
      },
      userHigh: {
        select: { id: true, name: true, username: true, avatar: true, role: true }
      }
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]
  });

  const active = partnerships.filter((entry) => entry.status === FRIEND_STREAK_ACTIVE);
  const pending = partnerships.filter((entry) => entry.status === FRIEND_STREAK_PENDING);

  const partnerIds = uniqueIds(
    partnerships.map((entry) => (entry.userLowId === normalizedUserId ? entry.userHighId : entry.userLowId))
  );

  const activePartnerIds = uniqueIds(
    active.map((entry) => (entry.userLowId === normalizedUserId ? entry.userHighId : entry.userLowId))
  );

  const earliestAcceptedAt =
    active.reduce((current: Date | null, entry) => {
      const candidate = startOfUtcDay(entry.acceptedAt || entry.invitedAt || entry.createdAt);
      if (!current || candidate < current) return candidate;
      return current;
    }, null as Date | null) || addUtcDays(today, -(FRIEND_STREAK_STREAK_LOOKBACK_DAYS - 1));

  const actionMap = await loadCareerDailyMaps(uniqueIds([normalizedUserId, ...activePartnerIds]), earliestAcceptedAt, today);

  const incomingInvites = pending
    .filter((entry) => entry.initiatedByUserId !== normalizedUserId)
    .map((entry) => {
      const partner = entry.userLowId === normalizedUserId ? entry.userHigh : entry.userLow;
      return {
        id: entry.id,
        status: entry.status,
        invitedAt: entry.invitedAt.toISOString(),
        initiatedByUserId: entry.initiatedByUserId,
        partner: buildUserPreview(partner)
      };
    });

  const outgoingInvites = pending
    .filter((entry) => entry.initiatedByUserId === normalizedUserId)
    .map((entry) => {
      const partner = entry.userLowId === normalizedUserId ? entry.userHigh : entry.userLow;
      return {
        id: entry.id,
        status: entry.status,
        invitedAt: entry.invitedAt.toISOString(),
        initiatedByUserId: entry.initiatedByUserId,
        partner: buildUserPreview(partner)
      };
    });

  const activeSummaries = active.map((entry) => {
    const partner = entry.userLowId === normalizedUserId ? entry.userHigh : entry.userLow;
    const partnerUserId = String(partner.id || '').trim();
    const viewerToday = getDailyProgress(actionMap, normalizedUserId, today);
    const partnerToday = getDailyProgress(actionMap, partnerUserId, today);
    return {
      id: entry.id,
      status: entry.status,
      acceptedAt: entry.acceptedAt ? entry.acceptedAt.toISOString() : null,
      initiatedByUserId: entry.initiatedByUserId,
      partner: buildUserPreview(partner),
      sharedCurrentStreakDays: computeSharedCurrentStreakDays(
        actionMap,
        normalizedUserId,
        partnerUserId,
        entry.acceptedAt || entry.invitedAt || entry.createdAt,
        today
      ),
      today: {
        actionDate: today.toISOString(),
        goalCount: CAREER_DAILY_ACTION_TYPES.length,
        viewerCompletedCount: viewerToday.completedCount,
        partnerCompletedCount: partnerToday.completedCount,
        viewerCompletedActions: viewerToday.completedActions,
        partnerCompletedActions: partnerToday.completedActions,
        viewerAllCompleted: viewerToday.allCompleted,
        partnerAllCompleted: partnerToday.allCompleted,
        bothCompleted: viewerToday.allCompleted && partnerToday.allCompleted
      }
    };
  });

  const [following, followers] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: normalizedUserId },
      select: { followeeId: true }
    }),
    prisma.userFollow.findMany({
      where: { followeeId: normalizedUserId },
      select: { followerId: true }
    })
  ]);

  const followingIds = new Set<string>(following.map((row) => String(row.followeeId || '').trim()).filter(Boolean));
  const followerIds = new Set<string>(followers.map((row) => String(row.followerId || '').trim()).filter(Boolean));
  const candidateIds = Array.from(followingIds).filter(
    (candidateId: string) => followerIds.has(candidateId) && !partnerIds.includes(candidateId)
  );

  const candidateUsers = candidateIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: candidateIds.slice(0, FRIEND_STREAK_CANDIDATE_LIMIT) },
          isActive: true
        },
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          role: true
        },
        orderBy: [{ name: 'asc' }, { username: 'asc' }]
      })
    : [];

  return {
    userId: normalizedUserId,
    actionDate: today.toISOString(),
    maxActive: FRIEND_STREAK_MAX_ACTIVE,
    activeCount: activeSummaries.length,
    pendingIncomingCount: incomingInvites.length,
    pendingOutgoingCount: outgoingInvites.length,
    canInvite: activeSummaries.length < FRIEND_STREAK_MAX_ACTIVE,
    active: activeSummaries,
    incomingInvites,
    outgoingInvites,
    candidates: candidateUsers.map((user) => ({
      ...buildUserPreview(user),
      reason: 'Mutual follow'
    }))
  };
};

export const createFriendStreakInvite = async (input: {
  userId?: string | null;
  partnerUserId?: string | null;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const partnerUserId = String(input.partnerUserId || '').trim();
  if (!userId || !partnerUserId) throw new Error('partnerUserId is required.');
  if (userId === partnerUserId) throw new Error('You cannot start a friend streak with yourself.');

  const [viewer] = await Promise.all([ensureParticipantExists(userId), ensureParticipantExists(partnerUserId)]);
  await ensureMutualFollow(userId, partnerUserId);

  const [{ userLowId, userHighId }, viewerActiveCount] = await Promise.all([
    Promise.resolve(getPairIds(userId, partnerUserId)),
    countActiveFriendStreaks(userId)
  ]);

  if (viewerActiveCount >= FRIEND_STREAK_MAX_ACTIVE) {
    throw new Error(`You can only keep ${FRIEND_STREAK_MAX_ACTIVE} active accountability partners at once.`);
  }

  const existing = await prisma.friendStreak.findUnique({
    where: {
      userLowId_userHighId: {
        userLowId,
        userHighId
      }
    }
  });

  let updatedId = existing?.id || '';

  if (existing?.status === FRIEND_STREAK_ACTIVE) {
    throw new Error('This accountability streak is already active.');
  }

  if (existing?.status === FRIEND_STREAK_PENDING && existing.initiatedByUserId !== userId) {
    const partnerActiveCount = await countActiveFriendStreaks(partnerUserId);
    if (partnerActiveCount >= FRIEND_STREAK_MAX_ACTIVE) {
      throw new Error('Your partner has reached the active accountability limit.');
    }

    const accepted = await prisma.friendStreak.update({
      where: { id: existing.id },
      data: {
        status: FRIEND_STREAK_ACTIVE,
        acceptedAt: new Date(),
        respondedAt: new Date(),
        endedAt: null
      }
    });
    updatedId = accepted.id;

    await createNotificationRecord({
      userId: partnerUserId,
      actorId: userId,
      type: 'friend_streak_accepted',
      title: 'Accountability streak accepted',
      body: `${viewer.name || viewer.username || 'A mutual'} accepted your friend streak invite.`,
      actionUrl: '/dashboard',
      meta: { friendStreakId: accepted.id, actorId: userId }
    });
    emitFriendStreakRefresh(input.app, [userId, partnerUserId], accepted.id, 'accepted');
    return getFriendStreakDashboard(userId);
  }

  if (existing?.status === FRIEND_STREAK_PENDING && existing.initiatedByUserId === userId) {
    throw new Error('This accountability invite is already pending.');
  }

  if (existing) {
    const refreshed = await prisma.friendStreak.update({
      where: { id: existing.id },
      data: {
        initiatedByUserId: userId,
        status: FRIEND_STREAK_PENDING,
        invitedAt: new Date(),
        respondedAt: null,
        acceptedAt: null,
        endedAt: null
      }
    });
    updatedId = refreshed.id;
  } else {
    const created = await prisma.friendStreak.create({
      data: {
        userLowId,
        userHighId,
        initiatedByUserId: userId,
        status: FRIEND_STREAK_PENDING
      }
    });
    updatedId = created.id;
  }

  await createNotificationRecord({
    userId: partnerUserId,
    actorId: userId,
    type: 'friend_streak_invite',
    title: 'New accountability invite',
    body: `${viewer.name || viewer.username || 'A mutual'} invited you to share a daily career streak.`,
    actionUrl: '/dashboard',
    meta: { friendStreakId: updatedId, actorId: userId }
  });

  emitFriendStreakRefresh(input.app, [userId, partnerUserId], updatedId, 'invited');
  return getFriendStreakDashboard(userId);
};

export const respondToFriendStreakInvite = async (input: {
  userId?: string | null;
  friendStreakId?: string | null;
  response?: 'accept' | 'decline' | string;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const friendStreakId = String(input.friendStreakId || '').trim();
  const response = String(input.response || '').trim().toLowerCase();
  if (!userId || !friendStreakId) throw new Error('friendStreakId is required.');
  if (response !== 'accept' && response !== 'decline') throw new Error('response must be accept or decline.');

  const streak = await prisma.friendStreak.findUnique({ where: { id: friendStreakId } });
  if (!streak) throw new Error('Friend streak invite not found.');
  if (streak.status !== FRIEND_STREAK_PENDING) throw new Error('This invite is no longer pending.');

  const participantIds = [streak.userLowId, streak.userHighId];
  if (!participantIds.includes(userId)) throw new Error('Friend streak invite not found.');
  if (streak.initiatedByUserId === userId) throw new Error('You cannot respond to your own invite.');

  const partnerUserId = streak.userLowId === userId ? streak.userHighId : streak.userLowId;
  const actor = await ensureParticipantExists(userId);
  await ensureMutualFollow(userId, partnerUserId);

  if (response === 'accept') {
    const [viewerActiveCount, partnerActiveCount] = await Promise.all([
      countActiveFriendStreaks(userId),
      countActiveFriendStreaks(partnerUserId)
    ]);
    if (viewerActiveCount >= FRIEND_STREAK_MAX_ACTIVE || partnerActiveCount >= FRIEND_STREAK_MAX_ACTIVE) {
      throw new Error('One of the partners has reached the active accountability limit.');
    }
  }

  const updated = await prisma.friendStreak.update({
    where: { id: streak.id },
    data:
      response === 'accept'
        ? {
            status: FRIEND_STREAK_ACTIVE,
            acceptedAt: new Date(),
            respondedAt: new Date(),
            endedAt: null
          }
        : {
            status: FRIEND_STREAK_DECLINED,
            respondedAt: new Date(),
            acceptedAt: null
          }
  });

  await createNotificationRecord({
    userId: partnerUserId,
    actorId: userId,
    type: response === 'accept' ? 'friend_streak_accepted' : 'friend_streak_declined',
    title: response === 'accept' ? 'Accountability streak accepted' : 'Accountability invite declined',
    body:
      response === 'accept'
        ? `${actor.name || actor.username || 'Your partner'} accepted your friend streak invite.`
        : `${actor.name || actor.username || 'Your partner'} declined your friend streak invite.`,
    actionUrl: '/dashboard',
    meta: { friendStreakId: updated.id, actorId: userId }
  });

  emitFriendStreakRefresh(input.app, [userId, partnerUserId], updated.id, response === 'accept' ? 'accepted' : 'declined');
  return getFriendStreakDashboard(userId);
};

export const endFriendStreak = async (input: {
  userId?: string | null;
  friendStreakId?: string | null;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const friendStreakId = String(input.friendStreakId || '').trim();
  if (!userId || !friendStreakId) throw new Error('friendStreakId is required.');

  const streak = await prisma.friendStreak.findUnique({ where: { id: friendStreakId } });
  if (!streak) throw new Error('Friend streak not found.');
  if (![FRIEND_STREAK_ACTIVE, FRIEND_STREAK_PENDING].includes(String(streak.status || '').toUpperCase())) {
    throw new Error('This friend streak is already closed.');
  }
  if (streak.userLowId !== userId && streak.userHighId !== userId) {
    throw new Error('Friend streak not found.');
  }

  const partnerUserId = streak.userLowId === userId ? streak.userHighId : streak.userLowId;
  const actor = await ensureParticipantExists(userId);

  const updated = await prisma.friendStreak.update({
    where: { id: streak.id },
    data: {
      status: FRIEND_STREAK_ENDED,
      endedAt: new Date(),
      respondedAt: new Date()
    }
  });

  await createNotificationRecord({
    userId: partnerUserId,
    actorId: userId,
    type: 'friend_streak_ended',
    title: 'Accountability streak ended',
    body: `${actor.name || actor.username || 'Your partner'} ended the shared career streak.`,
    actionUrl: '/dashboard',
    meta: { friendStreakId: updated.id, actorId: userId }
  });

  emitFriendStreakRefresh(input.app, [userId, partnerUserId], updated.id, 'ended');
  return getFriendStreakDashboard(userId);
};
