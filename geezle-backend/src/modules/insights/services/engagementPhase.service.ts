import { randomUUID } from 'crypto';
import type { Application } from 'express';
import prisma from '../../../utils/prismaClient';
import gcoinService from '../../../services/gcoinService';
import { getCareerStreakSummary } from './careerStreak.service';
import {
  AFFILIATE_EARNINGS_SCOPE,
  AFFILIATE_PARTNERS_SCOPE,
  AFFILIATE_REFERRALS_SCOPE
} from '../../../services/affiliateProgram.service';
import { emitInsightsEvent } from '../realtime/insights.realtime';

const REFERRAL_SQUADS_SCOPE = 'referral_squads_v1';
const REFERRAL_SQUAD_INVITES_SCOPE = 'referral_squad_invites_v1';
const GCOIN_REWARD_DROPS_SCOPE = 'gcoin_reward_drops_v1';

type CareerDailyLike = {
  actionDate?: string | null;
  completedCount?: number | null;
  goalCount?: number | null;
  allCompleted?: boolean | null;
  actions?: Array<{ type?: string | null; completed?: boolean | null }>;
} | null;

type LeagueTierSummary = {
  userId: string;
  monthKey: string;
  rank: number | null;
  totalRanked: number;
  percentile: number;
  score: number;
  tier: {
    key: string;
    label: string;
    badge: string;
    accent: string;
  };
  nextTier: {
    key: string;
    label: string;
    minPercentile: number;
    remainingPercentile: number;
  } | null;
  leaders: Array<{
    userId: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    score: number;
    rank: number;
  }>;
};

type ReferralSquadMemberRecord = {
  userId: string;
  role: 'captain' | 'member';
  joinedAt: string;
};

type ReferralSquadRecord = {
  id: string;
  name: string;
  code: string;
  captainUserId: string;
  maxMembers: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  members: ReferralSquadMemberRecord[];
};

type ReferralSquadInviteRecord = {
  id: string;
  squadId: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  sentAt: string;
  respondedAt?: string | null;
};

type RewardDropRule =
  | { type: 'career_daily_min'; minCompleted: number }
  | { type: 'league_tier_any'; tiers: string[] }
  | { type: 'squad_min_members'; minMembers: number };

type RewardDropRecord = {
  id: string;
  key: string;
  title: string;
  description: string;
  amount: number;
  cadence: 'daily' | 'monthly' | 'once';
  status: 'active' | 'inactive';
  startsAt?: string | null;
  endsAt?: string | null;
  helperText?: string | null;
  rule: RewardDropRule;
};

type RewardDropCard = RewardDropRecord & {
  claimRef: string;
  eligible: boolean;
  claimed: boolean;
  statusLabel: string;
  helperText: string;
};

type ReferralUserSummary = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  reason?: string | null;
};

type ReferralSquadSummary = {
  userId: string;
  canInvite: boolean;
  currentSquad: null | {
    id: string;
    name: string;
    code: string;
    memberCount: number;
    maxMembers: number;
    referralCount: number;
    earnings: number;
    rank: number | null;
    totalSquads: number;
    members: Array<ReferralUserSummary & { role: 'captain' | 'member'; joinedAt: string; referrals: number; earnings: number }>;
  };
  incomingInvites: Array<{
    id: string;
    squadId: string;
    squadName: string;
    from: ReferralUserSummary;
    sentAt: string;
  }>;
  outgoingInvites: Array<{
    id: string;
    squadId: string;
    squadName: string;
    to: ReferralUserSummary;
    sentAt: string;
  }>;
  candidates: ReferralUserSummary[];
};

type RewardDropSummary = {
  userId: string;
  totalActive: number;
  claimableCount: number;
  drops: RewardDropCard[];
};

type EngagementPhaseSummary = {
  leagueTier: LeagueTierSummary;
  referralSquads: ReferralSquadSummary;
  rewardDrops: RewardDropSummary;
};

const LEAGUE_TIERS = [
  { key: 'legend', label: 'Legend tier', badge: 'Top 1%', accent: 'amber', minPercentile: 99 },
  { key: 'elite', label: 'Elite tier', badge: 'Top 5%', accent: 'violet', minPercentile: 95 },
  { key: 'pro', label: 'Pro tier', badge: 'Top 15%', accent: 'indigo', minPercentile: 85 },
  { key: 'rising', label: 'Rising tier', badge: 'Top 35%', accent: 'emerald', minPercentile: 65 },
  { key: 'building', label: 'Building tier', badge: 'Active', accent: 'slate', minPercentile: 0 }
] as const;

const DEFAULT_REWARD_DROPS: RewardDropRecord[] = [
  {
    id: 'daily-action-spark',
    key: 'daily_action_spark',
    title: 'Daily Action Spark',
    description: 'Complete any one core action today to unlock a quick Gcoin drop.',
    amount: 12,
    cadence: 'daily',
    status: 'active',
    helperText: 'Show up once today and collect a starter drop.',
    rule: { type: 'career_daily_min', minCompleted: 1 }
  },
  {
    id: 'momentum-pair-drop',
    key: 'momentum_pair_drop',
    title: 'Momentum Pair Drop',
    description: 'Complete any two distinct core actions today to keep your momentum rolling.',
    amount: 24,
    cadence: 'daily',
    status: 'active',
    helperText: 'Pair two actions in one day to claim a stronger drop.',
    rule: { type: 'career_daily_min', minCompleted: 2 }
  },
  {
    id: 'league-identity-drop',
    key: 'league_identity_drop',
    title: 'League Identity Drop',
    description: 'Hold Rising tier or better this month to unlock a monthly league reward.',
    amount: 40,
    cadence: 'monthly',
    status: 'active',
    helperText: 'Your league rank now carries a monthly Gcoin upside.',
    rule: { type: 'league_tier_any', tiers: ['rising', 'pro', 'elite', 'legend'] }
  },
  {
    id: 'squad-sync-drop',
    key: 'squad_sync_drop',
    title: 'Squad Sync Drop',
    description: 'Build a referral squad with at least two members and claim a monthly team drop.',
    amount: 30,
    cadence: 'monthly',
    status: 'active',
    helperText: 'Invite one strong operator and turn referrals into a team loop.',
    rule: { type: 'squad_min_members', minMembers: 2 }
  }
];

const toArray = <T = any>(value: any): T[] => (Array.isArray(value) ? (value as T[]) : []);
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const monthKeyForDate = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const normalizeLeagueTier = (percentile: number) =>
  LEAGUE_TIERS.find((tier) => percentile >= tier.minPercentile) || LEAGUE_TIERS[LEAGUE_TIERS.length - 1];

const loadScope = async <T>(scope: string, fallback: T): Promise<T> => {
  const record = await prisma.appSetting.findUnique({ where: { scope } });
  if (!record || record.data === null || record.data === undefined) return fallback;
  return (record.data as T) || fallback;
};

const saveScope = async <T>(scope: string, data: T): Promise<T> => {
  await prisma.appSetting.upsert({
    where: { scope },
    create: { scope, data: data as any },
    update: { data: data as any }
  });
  return data;
};

const loadReferralSquads = async () => toArray<ReferralSquadRecord>(await loadScope<any[]>(REFERRAL_SQUADS_SCOPE, []));
const loadReferralSquadInvites = async () => toArray<ReferralSquadInviteRecord>(await loadScope<any[]>(REFERRAL_SQUAD_INVITES_SCOPE, []));
const saveReferralSquads = async (data: ReferralSquadRecord[]) => saveScope(REFERRAL_SQUADS_SCOPE, data);
const saveReferralSquadInvites = async (data: ReferralSquadInviteRecord[]) => saveScope(REFERRAL_SQUAD_INVITES_SCOPE, data);

const ensureRewardDrops = async () => {
  const existing = toArray<RewardDropRecord>(await loadScope<any[]>(GCOIN_REWARD_DROPS_SCOPE, []));
  if (existing.length) return existing;
  await saveScope(GCOIN_REWARD_DROPS_SCOPE, DEFAULT_REWARD_DROPS);
  return DEFAULT_REWARD_DROPS;
};

const getStoryActionCompletedCount = (careerDaily: CareerDailyLike) => {
  if (!careerDaily) return 0;
  const direct = Number(careerDaily.completedCount || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return toArray(careerDaily.actions).filter((entry) => entry?.completed === true).length;
};

const createNotification = async (userId: string, title: string, body: string, meta?: Record<string, any>) => {
  try {
    const created = await prisma.notification.create({
      data: {
        userId,
        type: 'insights',
        title,
        body,
        meta: meta || undefined
      }
    });
    try {
      const io = (global as any).appIo;
      const communityIo = (global as any).appCommunityIo;
      io?.to(userId).emit('notifications:new', created);
      communityIo?.to(`community:user:${userId}`).emit('notifications:new', created);
      communityIo?.to(userId).emit('notifications:new', created);
    } catch {
      // non-blocking
    }
  } catch {
    // non-blocking
  }
};

const loadAffiliateReferrals = async () => toArray<any>(await loadScope<any[]>(AFFILIATE_REFERRALS_SCOPE, []));
const loadAffiliateEarnings = async () => toArray<any>(await loadScope<any[]>(AFFILIATE_EARNINGS_SCOPE, []));
const loadAffiliatePartners = async () => toArray<any>(await loadScope<any[]>(AFFILIATE_PARTNERS_SCOPE, []));

const getMutualFollowCandidates = async (userId: string, excludedIds: Set<string>) => {
  const [following, followers] = await Promise.all([
    prisma.userFollow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
    prisma.userFollow.findMany({ where: { followeeId: userId }, select: { followerId: true } })
  ]);
  const followerSet = new Set(followers.map((entry) => String(entry.followerId)));
  const mutualIds = following
    .map((entry) => String(entry.followeeId))
    .filter((id) => followerSet.has(id) && id !== userId && !excludedIds.has(id));
  if (!mutualIds.length) return [];
  const rows = await prisma.user.findMany({
    where: { id: { in: mutualIds } },
    select: { id: true, name: true, username: true, avatar: true }
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name || row.username || 'Scrolith member',
    username: row.username || null,
    avatarUrl: row.avatar || null,
    reason: 'Mutual follow'
  }));
};

const getActiveSquadForUser = (squads: ReferralSquadRecord[], userId: string) =>
  squads.find((squad) => squad.status === 'active' && squad.members.some((member) => member.userId === userId)) || null;

const getReferralSquadMetrics = async (squads: ReferralSquadRecord[]) => {
  const [referrals, earnings] = await Promise.all([loadAffiliateReferrals(), loadAffiliateEarnings()]);
  const stats = squads.map((squad) => {
    const memberIds = new Set(squad.members.map((member) => member.userId));
    const referralCount = referrals.filter((entry) => memberIds.has(String(entry?.affiliateUserId || ''))).length;
    const totalEarnings = roundMoney(
      earnings
        .filter((entry) => memberIds.has(String(entry?.affiliateUserId || '')))
        .reduce((sum, entry) => sum + Number(entry?.commissionAmount || 0), 0)
    );
    return {
      squadId: squad.id,
      referralCount,
      earnings: totalEarnings
    };
  });

  const ranked = [...stats].sort((left, right) => {
    if (right.referralCount !== left.referralCount) return right.referralCount - left.referralCount;
    if (right.earnings !== left.earnings) return right.earnings - left.earnings;
    return left.squadId.localeCompare(right.squadId);
  });

  const rankMap = new Map<string, { rank: number; total: number }>();
  ranked.forEach((entry, index) => {
    rankMap.set(entry.squadId, { rank: index + 1, total: ranked.length });
  });

  return { stats, rankMap };
};

export const buildEmptyLeagueTierSummary = (userId: string): LeagueTierSummary => ({
  userId,
  monthKey: monthKeyForDate(),
  rank: null,
  totalRanked: 0,
  percentile: 0,
  score: 0,
  tier: {
    key: 'building',
    label: 'Building tier',
    badge: 'Active',
    accent: 'slate'
  },
  nextTier: {
    key: 'rising',
    label: 'Rising tier',
    minPercentile: 65,
    remainingPercentile: 65
  },
  leaders: []
});

export const buildEmptyReferralSquadSummary = (userId: string): ReferralSquadSummary => ({
  userId,
  canInvite: true,
  currentSquad: null,
  incomingInvites: [],
  outgoingInvites: [],
  candidates: []
});

export const buildEmptyRewardDropSummary = (userId: string): RewardDropSummary => ({
  userId,
  totalActive: 0,
  claimableCount: 0,
  drops: []
});

export const getLeagueTierSummary = async (userId: string): Promise<LeagueTierSummary> => {
  const record = await prisma.professionalScore.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true
        }
      }
    }
  });

  if (!record) return buildEmptyLeagueTierSummary(userId);

  const [totalRanked, higherRanked, leaders] = await Promise.all([
    prisma.professionalScore.count(),
    prisma.professionalScore.count({ where: { score: { gt: Number(record.score || 0) } } }),
    prisma.professionalScore.findMany({
      orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
      take: 5,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true
          }
        }
      }
    })
  ]);

  const rank = totalRanked > 0 ? higherRanked + 1 : null;
  const percentile =
    totalRanked > 0 && rank
      ? Math.max(0, Math.min(100, Number((100 - ((rank - 1) / totalRanked) * 100).toFixed(1))))
      : 0;
  const tier = normalizeLeagueTier(percentile);
  const nextTier = LEAGUE_TIERS.find((entry) => entry.minPercentile > tier.minPercentile) || null;

  return {
    userId,
    monthKey: monthKeyForDate(),
    rank,
    totalRanked,
    percentile,
    score: Number(record.score || 0),
    tier: {
      key: tier.key,
      label: tier.label,
      badge: tier.badge,
      accent: tier.accent
    },
    nextTier: nextTier
      ? {
          key: nextTier.key,
          label: nextTier.label,
          minPercentile: nextTier.minPercentile,
          remainingPercentile: Math.max(0, Number((nextTier.minPercentile - percentile).toFixed(1)))
        }
      : null,
    leaders: leaders.map((entry, index) => ({
      userId: entry.userId,
      name: entry.user?.name || entry.user?.username || 'Scrolith member',
      username: entry.user?.username || null,
      avatarUrl: entry.user?.avatar || null,
      score: Number(entry.score || 0),
      rank: index + 1
    }))
  };
};

export const getReferralSquadSummary = async (userId: string): Promise<ReferralSquadSummary> => {
  const [squads, invites] = await Promise.all([loadReferralSquads(), loadReferralSquadInvites()]);
  const activeSquads = squads.filter((entry) => entry.status === 'active');
  const currentSquad = getActiveSquadForUser(activeSquads, userId);
  const currentUserPendingInviteIds = new Set(
    invites
      .filter((invite) => invite.status === 'pending' && (invite.fromUserId === userId || invite.toUserId === userId))
      .flatMap((invite) => [invite.fromUserId, invite.toUserId])
      .filter(Boolean)
      .map(String)
  );
  const activeMemberIds = new Set(
    activeSquads.flatMap((squad) => squad.members.map((member) => String(member.userId || '')).filter(Boolean))
  );
  if (currentSquad) {
    currentSquad.members.forEach((member) => activeMemberIds.delete(member.userId));
  }
  currentUserPendingInviteIds.forEach((id) => activeMemberIds.add(id));

  const candidates = await getMutualFollowCandidates(userId, activeMemberIds);
  const [statsData, users, partners] = await Promise.all([
    getReferralSquadMetrics(activeSquads),
    prisma.user.findMany({
      where: {
        id: {
          in: Array.from(
            new Set(
              [
                ...activeSquads.flatMap((entry) => entry.members.map((member) => member.userId)),
                ...invites.flatMap((entry) => [entry.fromUserId, entry.toUserId])
              ].filter(Boolean)
            )
          )
        }
      },
      select: { id: true, name: true, username: true, avatar: true }
    }),
    loadAffiliatePartners()
  ]);

  const userMap = new Map<string, ReferralUserSummary>(
    users.map(
      (user): [string, ReferralUserSummary] => [
        user.id,
        {
          id: user.id,
          name: user.name || user.username || 'Scrolith member',
          username: user.username || null,
          avatarUrl: user.avatar || null
        }
      ]
    )
  );
  const partnerByUserId = new Map(partners.map((entry) => [String(entry?.userId || ''), entry]));
  const squadMetricById = new Map(statsData.stats.map((entry) => [entry.squadId, entry]));

  const incomingInvites = invites
    .filter((invite) => invite.toUserId === userId && invite.status === 'pending')
    .map((invite) => {
      const squad = squads.find((entry) => entry.id === invite.squadId);
      const fromUser: ReferralUserSummary = userMap.get(invite.fromUserId) || {
        id: invite.fromUserId,
        name: 'Scrolith member',
        username: null,
        avatarUrl: null
      };
      return {
        id: invite.id,
        squadId: invite.squadId,
        squadName: squad?.name || 'Referral squad',
        from: fromUser,
        sentAt: invite.sentAt
      };
    });

  const outgoingInvites = invites
    .filter((invite) => invite.fromUserId === userId && invite.status === 'pending')
    .map((invite) => {
      const squad = squads.find((entry) => entry.id === invite.squadId);
      const toUser: ReferralUserSummary = userMap.get(invite.toUserId) || {
        id: invite.toUserId,
        name: 'Scrolith member',
        username: null,
        avatarUrl: null
      };
      return {
        id: invite.id,
        squadId: invite.squadId,
        squadName: squad?.name || 'Referral squad',
        to: toUser,
        sentAt: invite.sentAt
      };
    });

  if (!currentSquad) {
    return {
      userId,
      canInvite: true,
      currentSquad: null,
      incomingInvites,
      outgoingInvites,
      candidates
    };
  }

  const squadMetric = squadMetricById.get(currentSquad.id) || { referralCount: 0, earnings: 0 };
  const rank = statsData.rankMap.get(currentSquad.id) || { rank: null, total: statsData.stats.length };
  const referrals = await loadAffiliateReferrals();
  const earnings = await loadAffiliateEarnings();

  const members = currentSquad.members.map((member) => {
    const referralCount = referrals.filter((entry) => String(entry?.affiliateUserId || '') === member.userId).length;
    const earningTotal = roundMoney(
      earnings
        .filter((entry) => String(entry?.affiliateUserId || '') === member.userId)
        .reduce((sum, entry) => sum + Number(entry?.commissionAmount || 0), 0)
    );
    const baseUser: ReferralUserSummary = userMap.get(member.userId) || {
      id: member.userId,
      name: partnerByUserId.get(member.userId)?.userName || 'Scrolith member',
      username: null,
      avatarUrl: null
    };
    return {
      ...baseUser,
      role: member.role,
      joinedAt: member.joinedAt,
      referrals: referralCount,
      earnings: earningTotal
    };
  });

  return {
    userId,
    canInvite: currentSquad.members.length < currentSquad.maxMembers,
    currentSquad: {
      id: currentSquad.id,
      name: currentSquad.name,
      code: currentSquad.code,
      memberCount: currentSquad.members.length,
      maxMembers: currentSquad.maxMembers,
      referralCount: squadMetric.referralCount,
      earnings: squadMetric.earnings,
      rank: rank.rank,
      totalSquads: rank.total,
      members
    },
    incomingInvites,
    outgoingInvites,
    candidates
  };
};

export const inviteReferralSquadMember = async (params: {
  userId: string;
  partnerUserId: string;
  squadName?: string | null;
  app?: Application;
}) => {
  const userId = String(params.userId || '').trim();
  const partnerUserId = String(params.partnerUserId || '').trim();
  if (!userId || !partnerUserId) throw new Error('partnerUserId is required');
  if (userId === partnerUserId) throw new Error('You cannot invite yourself');

  const [squads, invites] = await Promise.all([loadReferralSquads(), loadReferralSquadInvites()]);
  const activeSquads = squads.filter((entry) => entry.status === 'active');
  const existingUserSquad = getActiveSquadForUser(activeSquads, userId);
  const existingPartnerSquad = getActiveSquadForUser(activeSquads, partnerUserId);
  if (existingPartnerSquad && existingPartnerSquad.id !== existingUserSquad?.id) {
    throw new Error('That member is already in another referral squad');
  }
  if (existingUserSquad?.members.some((member) => member.userId === partnerUserId)) {
    throw new Error('That member is already in your referral squad');
  }
  const pendingPair = invites.find(
    (invite) =>
      invite.status === 'pending' &&
      ((invite.fromUserId === userId && invite.toUserId === partnerUserId) ||
        (invite.fromUserId === partnerUserId && invite.toUserId === userId))
  );
  if (pendingPair) throw new Error('A pending referral squad invite already exists for this pair');

  const [following, follower] = await Promise.all([
    prisma.userFollow.findFirst({ where: { followerId: userId, followeeId: partnerUserId }, select: { id: true } }),
    prisma.userFollow.findFirst({ where: { followerId: partnerUserId, followeeId: userId }, select: { id: true } })
  ]);
  if (!following?.id || !follower?.id) {
    throw new Error('Referral squad invites require a mutual follow first');
  }

  let squad = existingUserSquad;
  if (!squad) {
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true }
    });
    const baseName = String(params.squadName || '').trim() || `${owner?.name || owner?.username || 'Scrolith'} Referral Squad`;
    squad = {
      id: randomUUID(),
      name: baseName,
      code: `SQ-${Date.now().toString().slice(-6)}`,
      captainUserId: userId,
      maxMembers: 5,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: [{ userId, role: 'captain', joinedAt: new Date().toISOString() }]
    };
    squads.unshift(squad);
  }

  if (squad.members.length >= squad.maxMembers) {
    throw new Error('This referral squad is already full');
  }

  invites.unshift({
    id: randomUUID(),
    squadId: squad.id,
    fromUserId: userId,
    toUserId: partnerUserId,
    status: 'pending',
    sentAt: new Date().toISOString(),
    respondedAt: null
  });
  squad.updatedAt = new Date().toISOString();

  await Promise.all([saveReferralSquads(squads), saveReferralSquadInvites(invites)]);
  await createNotification(
    partnerUserId,
    'Referral squad invite',
    'You have a new referral squad invite waiting in member_home.',
    { fromUserId: userId, squadId: squad.id }
  );
  emitInsightsEvent(params.app, 'insights:streak_updated', { userId });
  emitInsightsEvent(params.app, 'insights:streak_updated', { userId: partnerUserId });
  return getReferralSquadSummary(userId);
};

export const respondReferralSquadInvite = async (params: {
  userId: string;
  inviteId: string;
  response: 'accept' | 'decline';
  app?: Application;
}) => {
  const userId = String(params.userId || '').trim();
  const inviteId = String(params.inviteId || '').trim();
  const response = String(params.response || '').trim().toLowerCase();
  if (!userId || !inviteId) throw new Error('inviteId is required');
  if (response !== 'accept' && response !== 'decline') throw new Error('response must be accept or decline');

  const [squads, invites] = await Promise.all([loadReferralSquads(), loadReferralSquadInvites()]);
  const invite = invites.find((entry) => entry.id === inviteId);
  if (!invite || invite.toUserId !== userId) throw new Error('Referral squad invite not found');
  if (invite.status !== 'pending') throw new Error('Referral squad invite is no longer pending');

  invite.status = response === 'accept' ? 'accepted' : 'declined';
  invite.respondedAt = new Date().toISOString();

  if (response === 'accept') {
    const activeSquad = getActiveSquadForUser(squads, userId);
    if (activeSquad && activeSquad.id !== invite.squadId) {
      throw new Error('Leave your current referral squad before accepting another invite');
    }
    const squad = squads.find((entry) => entry.id === invite.squadId && entry.status === 'active');
    if (!squad) throw new Error('Referral squad not found');
    if (squad.members.length >= squad.maxMembers) throw new Error('This referral squad is already full');
    if (!squad.members.some((member) => member.userId === userId)) {
      squad.members.push({ userId, role: 'member', joinedAt: new Date().toISOString() });
    }
    squad.updatedAt = new Date().toISOString();
    await createNotification(
      invite.fromUserId,
      'Referral squad accepted',
      'Your referral squad invite was accepted.',
      { squadId: squad.id, partnerUserId: userId }
    );
  }

  await Promise.all([saveReferralSquads(squads), saveReferralSquadInvites(invites)]);
  emitInsightsEvent(params.app, 'insights:streak_updated', { userId });
  emitInsightsEvent(params.app, 'insights:streak_updated', { userId: invite.fromUserId });
  return getReferralSquadSummary(userId);
};

export const leaveReferralSquad = async (params: {
  userId: string;
  squadId: string;
  app?: Application;
}) => {
  const userId = String(params.userId || '').trim();
  const squadId = String(params.squadId || '').trim();
  if (!userId || !squadId) throw new Error('squadId is required');
  const squads = await loadReferralSquads();
  const squad = squads.find((entry) => entry.id === squadId && entry.status === 'active');
  if (!squad || !squad.members.some((member) => member.userId === userId)) {
    throw new Error('Referral squad not found');
  }
  squad.members = squad.members.filter((member) => member.userId !== userId);
  if (!squad.members.length) {
    squad.status = 'archived';
  } else if (squad.captainUserId === userId) {
    squad.captainUserId = squad.members[0].userId;
    squad.members = squad.members.map((member, index) => ({
      ...member,
      role: index === 0 ? 'captain' : 'member'
    }));
  }
  squad.updatedAt = new Date().toISOString();
  await saveReferralSquads(squads);
  emitInsightsEvent(params.app, 'insights:streak_updated', { userId });
  return getReferralSquadSummary(userId);
};

const isRewardDropActive = (drop: RewardDropRecord, now = new Date()) => {
  if (String(drop.status || '').toLowerCase() !== 'active') return false;
  const startsAt = drop.startsAt ? new Date(drop.startsAt) : null;
  const endsAt = drop.endsAt ? new Date(drop.endsAt) : null;
  if (startsAt && Number.isFinite(startsAt.getTime()) && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() < now.getTime()) return false;
  return true;
};

const buildRewardDropClaimRef = (drop: RewardDropRecord, now = new Date()) => {
  if (drop.cadence === 'daily') return `${drop.key}:${todayKey(now)}`;
  if (drop.cadence === 'monthly') return `${drop.key}:${monthKeyForDate(now)}`;
  return `${drop.key}:once`;
};

const isRewardDropEligible = (
  drop: RewardDropRecord,
  context: {
    careerDaily: CareerDailyLike;
    leagueTier: LeagueTierSummary;
    referralSquads: ReferralSquadSummary;
  }
) => {
  switch (drop.rule.type) {
    case 'career_daily_min':
      return getStoryActionCompletedCount(context.careerDaily) >= Number(drop.rule.minCompleted || 0);
    case 'league_tier_any':
      return drop.rule.tiers.includes(String(context.leagueTier.tier?.key || '').trim().toLowerCase());
    case 'squad_min_members':
      return Number(context.referralSquads.currentSquad?.memberCount || 0) >= Number(drop.rule.minMembers || 0);
    default:
      return false;
  }
};

const awardRewardDrop = async (params: {
  userId: string;
  amount: number;
  drop: RewardDropRecord;
  claimRef: string;
}) => {
  const wallet = await gcoinService.ensureWalletForUser(params.userId);
  return prisma.$transaction(async (prismaTx) => {
    const created = await prismaTx.gcoinTransaction.create({
      data: {
        userId: params.userId,
        walletId: wallet.id,
        amount: params.amount,
        type: 'award',
        source: 'reward_drop',
        reason: params.drop.title,
        referenceId: params.claimRef,
        status: 'completed',
        netAmount: params.amount,
        feeAmount: 0,
        metadata: {
          dropId: params.drop.id,
          dropKey: params.drop.key,
          cadence: params.drop.cadence
        }
      }
    });

    await prismaTx.gcoinWallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: params.amount },
        lifetimeEarned: { increment: params.amount }
      } as any
    });

    await prismaTx.transaction.create({
      data: {
        walletId: null,
        userId: params.userId,
        type: 'REWARD',
        amount: Number(params.amount),
        currency: 'GCOIN',
        status: 'COMPLETED',
        description: `Gcoin reward drop: ${params.drop.title}`,
        metadata: {
          gcoinTransactionId: created.id,
          rewardDropKey: params.drop.key,
          rewardDropRef: params.claimRef
        }
      }
    });

    return created;
  });
};

export const getRewardDropSummary = async (params: {
  userId: string;
  careerDaily?: CareerDailyLike;
  leagueTier?: LeagueTierSummary | null;
  referralSquads?: ReferralSquadSummary | null;
}): Promise<RewardDropSummary> => {
  const userId = String(params.userId || '').trim();
  if (!userId) return buildEmptyRewardDropSummary('');
  const rewardDrops = (await ensureRewardDrops()).filter((drop) => isRewardDropActive(drop));
  if (!rewardDrops.length) return buildEmptyRewardDropSummary(userId);

  const [careerDaily, leagueTier, referralSquads] = await Promise.all([
    params.careerDaily ? Promise.resolve(params.careerDaily) : getCareerStreakSummary(userId),
    params.leagueTier ? Promise.resolve(params.leagueTier) : getLeagueTierSummary(userId),
    params.referralSquads ? Promise.resolve(params.referralSquads) : getReferralSquadSummary(userId)
  ]);

  const claimRefs = rewardDrops.map((drop) => buildRewardDropClaimRef(drop));
  const claimedRows = await prisma.gcoinTransaction.findMany({
    where: {
      userId,
      source: 'reward_drop',
      status: 'completed',
      referenceId: { in: claimRefs }
    },
    select: { referenceId: true }
  });
  const claimedSet = new Set(claimedRows.map((row) => String(row.referenceId || '').trim()).filter(Boolean));

  const cards: RewardDropCard[] = rewardDrops.map((drop) => {
    const claimRef = buildRewardDropClaimRef(drop);
    const claimed = claimedSet.has(claimRef);
    const eligible = isRewardDropEligible(drop, {
      careerDaily,
      leagueTier: leagueTier || buildEmptyLeagueTierSummary(userId),
      referralSquads: referralSquads || buildEmptyReferralSquadSummary(userId)
    });
    const statusLabel = claimed ? 'Claimed' : eligible ? 'Ready to claim' : 'In progress';
    const helperText =
      drop.helperText ||
      (claimed
        ? 'You already claimed this reward for the current cadence.'
        : eligible
          ? 'Eligible now. Claim this Gcoin drop when ready.'
          : 'Complete the requirement to unlock this drop.');
    return {
      ...drop,
      claimRef,
      claimed,
      eligible,
      statusLabel,
      helperText
    };
  });

  return {
    userId,
    totalActive: cards.length,
    claimableCount: cards.filter((drop) => drop.eligible && !drop.claimed).length,
    drops: cards
  };
};

export const claimRewardDrop = async (params: {
  userId: string;
  dropId: string;
  app?: Application;
}) => {
  const userId = String(params.userId || '').trim();
  const dropId = String(params.dropId || '').trim();
  if (!userId || !dropId) throw new Error('dropId is required');

  const rewardDrops = await ensureRewardDrops();
  const drop = rewardDrops.find((entry) => String(entry.id || '') === dropId || String(entry.key || '') === dropId);
  if (!drop || !isRewardDropActive(drop)) throw new Error('Reward drop not found');

  const [careerDaily, leagueTier, referralSquads] = await Promise.all([
    getCareerStreakSummary(userId),
    getLeagueTierSummary(userId),
    getReferralSquadSummary(userId)
  ]);
  const claimRef = buildRewardDropClaimRef(drop);
  const alreadyClaimed = await prisma.gcoinTransaction.findFirst({
    where: {
      userId,
      source: 'reward_drop',
      referenceId: claimRef,
      status: 'completed'
    },
    select: { id: true }
  });
  if (alreadyClaimed?.id) throw new Error('Reward drop already claimed for this cadence');
  if (
    !isRewardDropEligible(drop, {
      careerDaily,
      leagueTier,
      referralSquads
    })
  ) {
    throw new Error('Reward drop is not eligible yet');
  }

  await awardRewardDrop({
    userId,
    amount: drop.amount,
    drop,
    claimRef
  });
  await createNotification(
    userId,
    'Gcoin reward claimed',
    `${drop.title} added ${drop.amount} Gcoin to your wallet.`,
    { dropId: drop.id, claimRef }
  );
  emitInsightsEvent(params.app, 'insights:streak_updated', { userId });
  return getRewardDropSummary({ userId, careerDaily, leagueTier, referralSquads });
};

export const getEngagementPhaseSummary = async (params: {
  userId: string;
  careerDaily?: CareerDailyLike;
}) : Promise<EngagementPhaseSummary> => {
  const userId = String(params.userId || '').trim();
  if (!userId) {
    return {
      leagueTier: buildEmptyLeagueTierSummary(userId),
      referralSquads: buildEmptyReferralSquadSummary(userId),
      rewardDrops: buildEmptyRewardDropSummary(userId)
    };
  }
  const [leagueTier, referralSquads] = await Promise.all([
    getLeagueTierSummary(userId),
    getReferralSquadSummary(userId)
  ]);
  const rewardDrops = await getRewardDropSummary({
    userId,
    careerDaily: params.careerDaily,
    leagueTier,
    referralSquads
  });
  return {
    leagueTier,
    referralSquads,
    rewardDrops
  };
};
