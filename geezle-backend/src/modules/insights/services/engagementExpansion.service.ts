import type { Application } from 'express';
import prisma from '../../../utils/prismaClient';
import gcoinService from '../../../services/gcoinService';
import { COMMUNITY_CLUB_VISIBILITY } from '../../../utils/communityPrismaEnums';

const FAN_CHANNEL_PLAN_SCOPE = 'insights_fan_channel_plans_v1';
const MINI_GAMES_SCOPE = 'insights_skill_mini_games_v1';
const MINI_GAME_ATTEMPTS_SCOPE = 'insights_skill_mini_game_attempts_v1';
const EVENT_SEASONS_SCOPE = 'insights_event_seasons_v1';
const EVENT_SEASON_PASS_ACTIVATIONS_SCOPE = 'insights_event_season_pass_activations_v1';
const PREMIUM_SERIES_SCOPE = 'insights_premium_series_v1';
const PREMIUM_SERIES_UNLOCK_SCOPE = 'insights_premium_series_unlocks_v1';

type FanChannelPlanRecord = {
  channelId: string;
  active: boolean;
  isPaid: boolean;
  price: number;
  currency: string;
  trialDays: number;
  headline?: string | null;
  perks?: string[];
};

type MiniGameChoice = {
  id: string;
  label: string;
};

type MiniGameRecord = {
  id: string;
  title: string;
  prompt: string;
  category: string;
  active: boolean;
  rewardAmount: number;
  helperText?: string | null;
  explanation: string;
  choices: MiniGameChoice[];
  correctChoiceId: string;
};

type MiniGameAttemptRecord = {
  userId: string;
  gameId: string;
  dayKey: string;
  choiceId: string;
  correct: boolean;
  rewardGranted: boolean;
  createdAt: string;
};

type EventSeasonPassRecord = {
  id: string;
  label: string;
  description?: string | null;
  price: number;
  currency: string;
  active: boolean;
};

type EventSeasonRecord = {
  id: string;
  key: string;
  title: string;
  description: string;
  badge: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  targetEventCount: number;
  targetClubCount: number;
  targetMiniGames: number;
  eventTypes: string[];
  passes: EventSeasonPassRecord[];
};

type EventSeasonPassActivationRecord = {
  userId: string;
  seasonId: string;
  passId: string;
  activatedAt: string;
};

type PremiumSeriesRecord = {
  seriesId: string;
  active: boolean;
  price: number;
  currency: string;
  teaser: string;
  bonusLabel: string;
};

type PremiumSeriesUnlockRecord = {
  userId: string;
  seriesId: string;
  unlockedAt: string;
  amount: number;
  currency: string;
};

type UserSummary = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
};

export type EngagementExpansionSummary = {
  fanClubs: {
    freeClubs: Array<{
      id: string;
      title: string;
      description: string;
      visibility: 'public' | 'private';
      memberCount: number;
      owner: UserSummary;
      coverImage?: string | null;
      isJoined: boolean;
    }>;
    fanChannels: Array<{
      id: string;
      title: string;
      description: string;
      memberCount: number;
      updateCount: number;
      isFollowing: boolean;
      sourceType: 'creator' | 'page';
      owner: UserSummary & { href?: string | null };
      pricing: {
        isPaid: boolean;
        price: number;
        currency: string;
        trialDays: number;
        headline?: string | null;
        perks: string[];
        subscribed: boolean;
      };
      latestUpdate?: {
        content: string;
        createdAt?: string | null;
      } | null;
    }>;
  };
  miniGames: {
    dayKey: string;
    playedCount: number;
    totalCount: number;
    games: Array<{
      id: string;
      title: string;
      prompt: string;
      category: string;
      rewardAmount: number;
      helperText?: string | null;
      explanation: string;
      choices: MiniGameChoice[];
      playedToday: boolean;
      correctToday: boolean;
      selectedChoiceId?: string | null;
      rewardGranted: boolean;
    }>;
  };
  seasons: {
    items: Array<{
      id: string;
      key: string;
      title: string;
      description: string;
      badge: string;
      startsAt: string;
      endsAt: string;
      progress: {
        completedGoals: number;
        totalGoals: number;
        registeredEvents: number;
        joinedClubs: number;
        miniGamesCompleted: number;
      };
      nextEvents: Array<{
        id: string;
        title: string;
        type: string;
        startTime: string;
        isRegistered: boolean;
      }>;
      passes: Array<{
        id: string;
        label: string;
        description?: string | null;
        price: number;
        currency: string;
        active: boolean;
        activated: boolean;
      }>;
    }>;
  };
  premiumSeries: {
    items: Array<{
      id: string;
      title: string;
      description?: string | null;
      creator: UserSummary;
      itemCount: number;
      href: string;
      unlock: {
        available: boolean;
        unlocked: boolean;
        price: number;
        currency: string;
        teaser: string;
        bonusLabel: string;
      };
    }>;
  };
  expertBounties: {
    openCount: number;
    totalBountyAmount: number;
    questions: Array<{
      id: string;
      title: string;
      body: string;
      category?: string | null;
      tags: string[];
      status: string;
      bountyAmount: number;
      bountyCurrency: string;
      answerCount: number;
      acceptedAnswerId?: string | null;
      author: UserSummary;
      canAnswer: boolean;
      canAward: boolean;
      answers: Array<{
        id: string;
        body: string;
        isAccepted: boolean;
        createdAt: string;
        author: UserSummary;
      }>;
    }>;
  };
};

const toArray = <T = any>(value: any): T[] => (Array.isArray(value) ? (value as T[]) : []);
const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const normalizeAmount = (value: unknown) => Math.max(0, Number(value || 0));

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

const isMissingSchemaError = (error: any, extraTokens: string[] = []) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').replace(/\s+/g, ' ').toLowerCase();
  if (code === 'P2021' || code === 'P2022' || code === 'P2010') return true;
  const tokens = extraTokens.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
  return tokens.some((token) => message.includes(token));
};

const DEFAULT_MINI_GAMES: MiniGameRecord[] = [
  {
    id: 'pricing-margin-sprint',
    title: 'Pricing margin sprint',
    prompt: 'A service costs 60 Gcoin to deliver and sells for 90 Gcoin. Which gross margin is closest?',
    category: 'pricing',
    active: true,
    rewardAmount: 8,
    helperText: 'Sharpen pricing intuition with one quick scenario.',
    explanation: 'Gross margin is (90 - 60) / 90, which is 33.3%.',
    choices: [
      { id: 'pricing-25', label: '25%' },
      { id: 'pricing-33', label: '33%' },
      { id: 'pricing-40', label: '40%' }
    ],
    correctChoiceId: 'pricing-33'
  },
  {
    id: 'brief-scope-sanity',
    title: 'Brief scope sanity',
    prompt: 'Which line improves a vague client brief the fastest?',
    category: 'delivery',
    active: true,
    rewardAmount: 8,
    helperText: 'Practice tightening briefs before work starts.',
    explanation: 'Clear deliverables reduce rework fastest because both sides align on the output.',
    choices: [
      { id: 'brief-color', label: 'Ask which brand colors they like.' },
      { id: 'brief-deliverable', label: 'Confirm the exact deliverable and success outcome.' },
      { id: 'brief-bio', label: 'Ask for the client bio first.' }
    ],
    correctChoiceId: 'brief-deliverable'
  },
  {
    id: 'trust-signal-pick',
    title: 'Trust signal pick',
    prompt: 'Which action most quickly improves marketplace trust for a new profile?',
    category: 'trust',
    active: true,
    rewardAmount: 8,
    helperText: 'Build stronger buyer and employer confidence.',
    explanation: 'Proof of work plus verification gives the fastest visible trust lift.',
    choices: [
      { id: 'trust-post', label: 'Publish ten short posts in one day.' },
      { id: 'trust-proof', label: 'Add proof of work and complete verification.' },
      { id: 'trust-logo', label: 'Change the profile cover image.' }
    ],
    correctChoiceId: 'trust-proof'
  }
];

const DEFAULT_EVENT_SEASONS: EventSeasonRecord[] = [
  {
    id: 'season-builder-spring-2026',
    key: 'builder_spring_2026',
    title: 'Builder season',
    description: 'Join events, fan communities, and mini-games in one recurring season loop that builds visible momentum.',
    badge: 'Season live',
    startsAt: '2026-03-01T00:00:00.000Z',
    endsAt: '2026-04-30T23:59:59.000Z',
    active: true,
    targetEventCount: 1,
    targetClubCount: 1,
    targetMiniGames: 1,
    eventTypes: ['workshop', 'webinar', 'meetup'],
    passes: [
      {
        id: 'season-builder-starter',
        label: 'Starter pass',
        description: 'Track your season progress and unlock recurring attendance momentum.',
        price: 0,
        currency: 'GCOIN',
        active: true
      },
      {
        id: 'season-builder-priority',
        label: 'Priority RSVP pass',
        description: 'A premium attendance pass for priority participation and stronger season visibility.',
        price: 0,
        currency: 'GCOIN',
        active: true
      }
    ]
  }
];

const buildUserSummary = (row: any): UserSummary => ({
  id: String(row?.id || ''),
  name: String(row?.name || row?.username || 'Scrolith member').trim(),
  username: row?.username || null,
  avatarUrl: row?.avatar || row?.avatarUrl || null
});

const createNotification = async (userId: string, title: string, body: string, meta?: Record<string, any>) => {
  if (!String(userId || '').trim()) return;
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
      // Ignore realtime notification failures.
    }
  } catch {
    // Ignore notification persistence failures.
  }
};

const ensureMiniGames = async () => {
  const existing = toArray<MiniGameRecord>(await loadScope<any[]>(MINI_GAMES_SCOPE, []));
  if (existing.length) return existing;
  await saveScope(MINI_GAMES_SCOPE, DEFAULT_MINI_GAMES);
  return DEFAULT_MINI_GAMES;
};

const ensureEventSeasons = async () => {
  const existing = toArray<EventSeasonRecord>(await loadScope<any[]>(EVENT_SEASONS_SCOPE, []));
  if (existing.length) return existing;
  await saveScope(EVENT_SEASONS_SCOPE, DEFAULT_EVENT_SEASONS);
  return DEFAULT_EVENT_SEASONS;
};

const ensurePremiumSeriesCatalog = async () => {
  const existing = toArray<PremiumSeriesRecord>(await loadScope<any[]>(PREMIUM_SERIES_SCOPE, []));
  return existing;
};

const loadMiniGameAttempts = async () => toArray<MiniGameAttemptRecord>(await loadScope<any[]>(MINI_GAME_ATTEMPTS_SCOPE, []));
const saveMiniGameAttempts = async (data: MiniGameAttemptRecord[]) => saveScope(MINI_GAME_ATTEMPTS_SCOPE, data);
const loadSeasonActivations = async () =>
  toArray<EventSeasonPassActivationRecord>(await loadScope<any[]>(EVENT_SEASON_PASS_ACTIVATIONS_SCOPE, []));
const saveSeasonActivations = async (data: EventSeasonPassActivationRecord[]) => saveScope(EVENT_SEASON_PASS_ACTIVATIONS_SCOPE, data);
const loadPremiumSeriesUnlocks = async () =>
  toArray<PremiumSeriesUnlockRecord>(await loadScope<any[]>(PREMIUM_SERIES_UNLOCK_SCOPE, []));
const savePremiumSeriesUnlocks = async (data: PremiumSeriesUnlockRecord[]) => saveScope(PREMIUM_SERIES_UNLOCK_SCOPE, data);

const getFanClubsSummary = async (userId: string) => {
  let freeClubs: EngagementExpansionSummary['fanClubs']['freeClubs'] = [];
  let fanChannels: EngagementExpansionSummary['fanClubs']['fanChannels'] = [];

  try {
    const clubRows = await prisma.communityClub.findMany({
      where: { visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC },
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        memberships: {
          where: { userId },
          select: { id: true, userId: true }
        }
      },
      orderBy: [{ memberCount: 'desc' }, { updatedAt: 'desc' }],
      take: 3
    });
    freeClubs = clubRows.map((row: any) => ({
      id: row.id,
      title: String(row.name || 'Community club').trim(),
      description: String(row.description || '').trim(),
      visibility: String(row.visibility || 'public').toLowerCase() === 'private' ? 'private' : 'public',
      memberCount: Number(row.memberCount || 0),
      owner: buildUserSummary(row.owner),
      coverImage: row.coverImage || null,
      isJoined: Array.isArray(row.memberships) && row.memberships.length > 0
    }));
  } catch (error) {
    if (!isMissingSchemaError(error, ['communityclub', 'clubmembership'])) throw error;
  }

  try {
    const prismaAny = prisma as any;
    const channelRows = await prismaAny.communityChannel.findMany({
      where: { purpose: 'broadcast', isPublic: true },
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        businessPage: {
          select: { id: true, name: true, slug: true, ownerId: true }
        },
        memberships: {
          where: { userId },
          select: { id: true, userId: true }
        },
        channelSubscriptionPlan: {
          select: { id: true, isPaid: true, monthlyPrice: true, currency: true, trialDays: true, active: true }
        },
        channelSubscriptions: {
          where: { userId, status: 'active' },
          select: { id: true, userId: true, startedAt: true }
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true } },
        _count: { select: { messages: true, memberships: true } }
      },
      orderBy: [{ lastActivity: 'desc' }, { updatedAt: 'desc' }],
      take: 3
    });
    fanChannels = channelRows.map((row: any) => {
      const plan = row?.channelSubscriptionPlan;
      const owner = row?.businessPage
        ? {
            id: String(row.businessPage.id || row.ownerId || ''),
            name: String(row.businessPage.name || row.owner?.name || 'Scrolith page').trim(),
            username: row.owner?.username || null,
            avatarUrl: row.owner?.avatar || null,
            href: row.businessPage.slug ? `/community?page=${encodeURIComponent(String(row.businessPage.slug))}` : '/community'
          }
        : {
            ...buildUserSummary(row.owner),
            href: row.owner?.username ? `/u/${encodeURIComponent(String(row.owner.username))}` : '/community'
          };
      const subscribed = Array.isArray(row.channelSubscriptions) && row.channelSubscriptions.length > 0;
      const following = Array.isArray(row.memberships) && row.memberships.length > 0;
      return {
        id: row.id,
        title: String(row.name || owner.name || 'Creator room').trim(),
        description: String(row.description || '').trim(),
        memberCount: Number(row.memberCount || row?._count?.memberships || 0),
        updateCount: Number(row?._count?.messages || 0),
        isFollowing: following,
        sourceType: row?.businessPage ? 'page' : 'creator',
        owner,
        pricing: {
          isPaid: Boolean(plan?.active && plan?.isPaid && Number(plan?.monthlyPrice || 0) > 0),
          price: Number(plan?.monthlyPrice || 0),
          currency: String(plan?.currency || 'GCOIN'),
          trialDays: Number(plan?.trialDays || 0),
          headline: plan?.active && plan?.isPaid ? 'Premium fan room' : 'Open fan room',
          perks:
            plan?.active && plan?.isPaid
              ? ['Priority creator updates', 'Paid community identity', 'Recurring insider drop']
              : ['Creator updates', 'Fast follow loop', 'Community pulse'],
          subscribed
        },
        latestUpdate: row?.messages?.[0]
          ? {
              content: String(row.messages[0].content || '').trim().slice(0, 180),
              createdAt: row.messages[0].createdAt instanceof Date ? row.messages[0].createdAt.toISOString() : String(row.messages[0].createdAt || '')
            }
          : null
      };
    });
  } catch (error) {
    if (!isMissingSchemaError(error, ['communitychannel', 'channelmembership', 'channelsubscription'])) throw error;
  }

  return { freeClubs, fanChannels };
};

const getMiniGamesSummary = async (userId: string) => {
  const games = (await ensureMiniGames()).filter((entry) => entry.active !== false);
  const attempts = await loadMiniGameAttempts();
  const dayKey = todayKey();
  const todayAttempts = attempts.filter((entry) => entry.userId === userId && entry.dayKey === dayKey);
  return {
    dayKey,
    playedCount: todayAttempts.length,
    totalCount: games.length,
    games: games.map((game) => {
      const todayAttempt = todayAttempts.find((entry) => entry.gameId === game.id) || null;
      return {
        id: game.id,
        title: game.title,
        prompt: game.prompt,
        category: game.category,
        rewardAmount: game.rewardAmount,
        helperText: game.helperText || null,
        explanation: game.explanation,
        choices: game.choices,
        playedToday: Boolean(todayAttempt),
        correctToday: Boolean(todayAttempt?.correct),
        selectedChoiceId: todayAttempt?.choiceId || null,
        rewardGranted: Boolean(todayAttempt?.rewardGranted)
      };
    })
  };
};

const getSeasonsSummary = async (userId: string) => {
  const seasons = (await ensureEventSeasons()).filter((season) => season.active !== false);
  const activations = await loadSeasonActivations();
  const miniGames = await getMiniGamesSummary(userId);

  let eventRows: any[] = [];
  let joinedClubCount = 0;
  try {
    eventRows = await prisma.communityEvent.findMany({
      where: {
        startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      include: {
        registrations: {
          where: { userId },
          select: { userId: true }
        }
      },
      orderBy: [{ startTime: 'asc' }],
      take: 12
    });
  } catch (error) {
    if (!isMissingSchemaError(error, ['communityevent', 'eventregistration'])) throw error;
  }
  try {
    joinedClubCount = await prisma.clubMembership.count({ where: { userId } });
  } catch (error) {
    if (!isMissingSchemaError(error, ['clubmembership'])) throw error;
  }

  const todayGamesCompleted = miniGames.games.filter((entry) => entry.correctToday).length;

  return {
    items: seasons.map((season) => {
      const activatedPassIds = new Set(
        activations
          .filter((entry) => entry.userId === userId && entry.seasonId === season.id)
          .map((entry) => entry.passId)
      );
      const matchingEvents = eventRows.filter((row) =>
        season.eventTypes.includes(String(row.type || '').toLowerCase())
      );
      const registeredEvents = matchingEvents.filter(
        (row) => Array.isArray(row.registrations) && row.registrations.length > 0
      );
      const completedGoals = [
        registeredEvents.length >= season.targetEventCount,
        joinedClubCount >= season.targetClubCount,
        todayGamesCompleted >= season.targetMiniGames
      ].filter(Boolean).length;

      return {
        id: season.id,
        key: season.key,
        title: season.title,
        description: season.description,
        badge: season.badge,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        progress: {
          completedGoals,
          totalGoals: 3,
          registeredEvents: registeredEvents.length,
          joinedClubs: joinedClubCount,
          miniGamesCompleted: todayGamesCompleted
        },
        nextEvents: matchingEvents.slice(0, 3).map((row) => ({
          id: row.id,
          title: String(row.title || 'Community event').trim(),
          type: String(row.type || 'workshop').toLowerCase(),
          startTime: row.startTime instanceof Date ? row.startTime.toISOString() : String(row.startTime || ''),
          isRegistered: Array.isArray(row.registrations) && row.registrations.length > 0
        })),
        passes: toArray<EventSeasonPassRecord>(season.passes)
          .filter((pass) => pass.active !== false)
          .map((pass) => ({
            id: pass.id,
            label: pass.label,
            description: pass.description || null,
            price: Number(pass.price || 0),
            currency: String(pass.currency || 'GCOIN'),
            active: pass.active !== false,
            activated: activatedPassIds.has(pass.id)
          }))
      };
    })
  };
};

const getPremiumSeriesSummary = async (userId: string) => {
  let rows: any[] = [];
  try {
    const prismaAny = prisma as any;
    rows = await prismaAny.scrollSeries.findMany({
      where: {
        status: 'active',
        visibility: 'public',
        items: {
          some: {
            scroll: { status: 'active' }
          }
        }
      },
      include: {
        creator: { select: { id: true, name: true, username: true, avatar: true } },
        items: { select: { id: true }, take: 6 }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 3
    });
  } catch (error) {
    if (!isMissingSchemaError(error, ['scrollseries', 'scrollseriesitem', 'scrollvideo'])) throw error;
  }

  const catalog = await ensurePremiumSeriesCatalog();
  const unlocks = await loadPremiumSeriesUnlocks();
  const unlockSet = new Set(
    unlocks.filter((entry) => entry.userId === userId).map((entry) => `${entry.seriesId}:${entry.userId}`)
  );

  return {
    items: rows.map((row: any) => {
      const catalogEntry = catalog.find((entry) => entry.seriesId === row.id) || {
        seriesId: row.id,
        active: true,
        price: Math.max(12, Number((row?.items || []).length || 1) * 4),
        currency: 'GCOIN',
        teaser: 'Support unlock this series to back the creator and turn bingeable content into a monetized loop.',
        bonusLabel: 'Supporter unlock'
      };
      const unlocked = String(row.creatorUserId || '') === userId || unlockSet.has(`${row.id}:${userId}`);
      return {
        id: row.id,
        title: String(row.title || 'Premium series').trim(),
        description: String(row.description || '').trim() || null,
        creator: buildUserSummary(row.creator),
        itemCount: Number((row?.items || []).length || 0),
        href: `/scroll?series=${encodeURIComponent(String(row.id || ''))}`,
        unlock: {
          available: catalogEntry.active !== false,
          unlocked,
          price: Number(catalogEntry.price || 0),
          currency: String(catalogEntry.currency || 'GCOIN'),
          teaser: String(catalogEntry.teaser || '').trim(),
          bonusLabel: String(catalogEntry.bonusLabel || 'Support unlock').trim()
        }
      };
    })
  };
};

const getExpertBountiesSummary = async (userId: string) => {
  let questionRows: any[] = [];
  try {
    questionRows = await prisma.question.findMany({
      where: {
        status: { in: ['open', 'active', 'answered'] },
        OR: [{ bountyAmount: { gt: 0 } }, { bounties: { some: { status: 'open' } } }]
      },
      include: {
        author: { select: { id: true, name: true, username: true, avatar: true } },
        answers: {
          include: {
            author: { select: { id: true, name: true, username: true, avatar: true } }
          },
          orderBy: { createdAt: 'asc' },
          take: 3
        },
        bounties: {
          where: { status: 'open' },
          select: { id: true, amount: true, currency: true }
        },
        _count: { select: { answers: true } }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 4
    });
  } catch (error) {
    if (!isMissingSchemaError(error, ['question', 'answer', 'bounty'])) throw error;
  }

  return {
    openCount: questionRows.length,
    totalBountyAmount: questionRows.reduce((sum, row) => sum + Number(row.bountyAmount || 0), 0),
    questions: questionRows.map((row: any) => {
      const openBountyAmount =
        Array.isArray(row.bounties) && row.bounties.length
          ? row.bounties.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
          : Number(row.bountyAmount || 0);
      const bountyCurrency = String(row.bountyCurrency || row?.bounties?.[0]?.currency || 'GCOIN');
      return {
        id: row.id,
        title: String(row.title || 'Expert bounty').trim(),
        body: String(row.body || '').trim(),
        category: row.category || null,
        tags: Array.isArray(row.tags) ? row.tags.map((entry: any) => String(entry)) : [],
        status: String(row.status || 'open'),
        bountyAmount: openBountyAmount,
        bountyCurrency,
        answerCount: Number(row?._count?.answers || row?.answers?.length || 0),
        acceptedAnswerId: row.acceptedAnswerId || null,
        author: buildUserSummary(row.author),
        canAnswer: String(row.authorId || '') !== userId,
        canAward:
          String(row.authorId || '') === userId &&
          !row.acceptedAnswerId &&
          Array.isArray(row.answers) &&
          row.answers.length > 0,
        answers: Array.isArray(row.answers)
          ? row.answers.map((answer: any) => ({
              id: answer.id,
              body: String(answer.body || '').trim(),
              isAccepted: Boolean(answer.isAccepted),
              createdAt: answer.createdAt instanceof Date ? answer.createdAt.toISOString() : String(answer.createdAt || ''),
              author: buildUserSummary(answer.author)
            }))
          : []
      };
    })
  };
};

export const getEngagementExpansionSummary = async (userId: string): Promise<EngagementExpansionSummary> => {
  const [fanClubs, miniGames, seasons, premiumSeries, expertBounties] = await Promise.all([
    getFanClubsSummary(userId),
    getMiniGamesSummary(userId),
    getSeasonsSummary(userId),
    getPremiumSeriesSummary(userId),
    getExpertBountiesSummary(userId)
  ]);

  return {
    fanClubs,
    miniGames,
    seasons,
    premiumSeries,
    expertBounties
  };
};

export const subscribeFanChannel = async ({
  userId,
  channelId,
  app
}: {
  userId: string;
  channelId: string;
  app?: Application;
}) => {
  const prismaAny = prisma as any;
  const channel = await prismaAny.communityChannel.findUnique({
    where: { id: channelId },
    include: {
      owner: { select: { id: true, name: true, username: true } },
      businessPage: { select: { id: true, name: true, ownerId: true } },
      channelSubscriptionPlan: { select: { id: true, isPaid: true, monthlyPrice: true, currency: true, trialDays: true, active: true } },
      channelSubscriptions: {
        where: { userId, status: 'active' },
        select: { id: true }
      }
    }
  });
  if (!channel || String(channel.purpose || '') !== 'broadcast') {
    throw new Error('Fan channel not found.');
  }
  if (!channel.isPublic) {
    throw new Error('This fan channel is private.');
  }
  if (Array.isArray(channel.channelSubscriptions) && channel.channelSubscriptions.length) {
    return getEngagementExpansionSummary(userId);
  }
  const plan = channel.channelSubscriptionPlan;
  if (!plan || !plan.active || !plan.isPaid || Number(plan.monthlyPrice || 0) <= 0) {
    throw new Error('This channel does not require a paid subscription. Follow it directly instead.');
  }
  const recipientUserId = String(channel.businessPage?.ownerId || channel.ownerId || '').trim();
  if (!recipientUserId || recipientUserId === userId) {
    throw new Error('You cannot subscribe to your own fan channel.');
  }

  await gcoinService.transfer(userId, {
    toRecipientId: recipientUserId,
    amount: Number(plan.monthlyPrice || 0),
    note: `Subscribed to ${channel.name}`,
    reference: { type: 'fan_channel_subscription', channelId, planId: plan.id }
  });

  await prisma.$transaction(async (tx) => {
    const membership = await tx.channelMembership.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });
    if (!membership) {
      await tx.channelMembership.create({ data: { channelId, userId } });
    }
    await tx.channelSubscription.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: {
        channelId,
        userId,
        planId: plan.id,
        status: 'active'
      },
      update: {
        status: 'active',
        planId: plan.id,
        endsAt: null,
        cancelAtPeriodEnd: false
      }
    });
    const memberCount = await tx.channelMembership.count({ where: { channelId } });
    await tx.communityChannel.update({
      where: { id: channelId },
      data: { memberCount, lastActivity: new Date() }
    });
  });

  await createNotification(
    recipientUserId,
    'New fan channel subscriber',
    `${channel.owner?.name || channel.businessPage?.name || 'A member'} gained a new premium fan channel subscriber.`,
    { channelId, type: 'fan_channel_subscription', appName: app?.get?.('name') || 'Scrolith' }
  );

  return getEngagementExpansionSummary(userId);
};

export const submitSkillMiniGameAnswer = async ({
  userId,
  gameId,
  choiceId
}: {
  userId: string;
  gameId: string;
  choiceId: string;
}) => {
  const games = await ensureMiniGames();
  const game = games.find((entry) => entry.id === gameId && entry.active !== false);
  if (!game) throw new Error('Mini-game not found.');
  const choice = game.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Choose a valid answer option.');
  const attempts = await loadMiniGameAttempts();
  const dayKey = todayKey();
  if (attempts.some((entry) => entry.userId === userId && entry.gameId === gameId && entry.dayKey === dayKey)) {
    throw new Error('You already played this mini-game today.');
  }
  const correct = choiceId === game.correctChoiceId;
  const rewardGranted = correct && Number(game.rewardAmount || 0) > 0;
  attempts.push({
    userId,
    gameId,
    dayKey,
    choiceId,
    correct,
    rewardGranted,
    createdAt: new Date().toISOString()
  });
  await saveMiniGameAttempts(attempts);
  if (rewardGranted) {
    await gcoinService.award(userId, Number(game.rewardAmount || 0), `Skill mini-game: ${game.title}`);
  }
  return getEngagementExpansionSummary(userId);
};

export const activateEventSeasonPass = async ({
  userId,
  seasonId,
  passId
}: {
  userId: string;
  seasonId: string;
  passId: string;
}) => {
  const seasons = await ensureEventSeasons();
  const season = seasons.find((entry) => entry.id === seasonId && entry.active !== false);
  if (!season) throw new Error('Season not found.');
  const pass = toArray<EventSeasonPassRecord>(season.passes).find((entry) => entry.id === passId && entry.active !== false);
  if (!pass) throw new Error('Season pass not found.');
  const activations = await loadSeasonActivations();
  const existingIndex = activations.findIndex((entry) => entry.userId === userId && entry.seasonId === seasonId);
  const record: EventSeasonPassActivationRecord = {
    userId,
    seasonId,
    passId,
    activatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    activations.splice(existingIndex, 1, record);
  } else {
    activations.push(record);
  }
  await saveSeasonActivations(activations);
  return getEngagementExpansionSummary(userId);
};

export const unlockPremiumSeries = async ({ userId, seriesId }: { userId: string; seriesId: string }) => {
  const prismaAny = prisma as any;
  const series = await prismaAny.scrollSeries.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      title: true,
      creatorUserId: true,
      creator: { select: { id: true, name: true, username: true } }
    }
  });
  if (!series) throw new Error('Series not found.');
  if (String(series.creatorUserId || '') === userId) {
    throw new Error('Creators already have access to their own series.');
  }
  const catalog = await ensurePremiumSeriesCatalog();
  const catalogEntry =
    catalog.find((entry) => entry.seriesId === seriesId && entry.active !== false) || {
      seriesId,
      active: true,
      price: 16,
      currency: 'GCOIN',
      teaser: 'Support unlock this series to back the creator and deepen the binge loop.',
      bonusLabel: 'Supporter unlock'
    };
  const unlocks = await loadPremiumSeriesUnlocks();
  if (unlocks.some((entry) => entry.userId === userId && entry.seriesId === seriesId)) {
    return getEngagementExpansionSummary(userId);
  }
  await gcoinService.transfer(userId, {
    toRecipientId: String(series.creatorUserId || '').trim(),
    amount: Number(catalogEntry.price || 0),
    note: `Unlocked premium series support for ${series.title}`,
    reference: { type: 'premium_series_unlock', seriesId }
  });
  unlocks.push({
    userId,
    seriesId,
    unlockedAt: new Date().toISOString(),
    amount: Number(catalogEntry.price || 0),
    currency: String(catalogEntry.currency || 'GCOIN')
  });
  await savePremiumSeriesUnlocks(unlocks);
  await createNotification(
    String(series.creatorUserId || '').trim(),
    'Premium series unlocked',
    `${series.creator?.name || 'A supporter'} unlocked premium support for ${series.title}.`,
    { seriesId, type: 'premium_series_unlock' }
  );
  return getEngagementExpansionSummary(userId);
};

export const createExpertBountyQuestion = async ({
  userId,
  title,
  body,
  category,
  tags,
  bountyAmount
}: {
  userId: string;
  title: string;
  body: string;
  category?: string | null;
  tags?: string[];
  bountyAmount?: number;
}) => {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  const cleanTags = toArray(tags).map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 6);
  const nextBountyAmount = normalizeAmount(bountyAmount);
  if (cleanTitle.length < 8) throw new Error('Add a clearer question title.');
  if (cleanBody.length < 20) throw new Error('Add more detail so experts know how to answer.');
  const created = await prisma.question.create({
    data: {
      authorId: userId,
      title: cleanTitle,
      body: cleanBody,
      category: String(category || '').trim() || null,
      tags: cleanTags,
      status: 'open',
      bountyAmount: nextBountyAmount,
      bountyCurrency: nextBountyAmount > 0 ? 'GCOIN' : null
    }
  });
  if (nextBountyAmount > 0) {
    await prisma.bounty.create({
      data: {
        questionId: created.id,
        sponsorUserId: userId,
        amount: nextBountyAmount,
        currency: 'GCOIN',
        status: 'open'
      }
    });
  }
  return getEngagementExpansionSummary(userId);
};

export const answerExpertBountyQuestion = async ({
  userId,
  questionId,
  body,
  app
}: {
  userId: string;
  questionId: string;
  body: string;
  app?: Application;
}) => {
  const cleanBody = String(body || '').trim();
  if (cleanBody.length < 12) throw new Error('Add a more useful answer before submitting.');
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      author: { select: { id: true, name: true, username: true } }
    }
  });
  if (!question) throw new Error('Question not found.');
  if (String(question.authorId || '') === userId) throw new Error('You cannot answer your own bounty question.');
  await prisma.answer.create({
    data: {
      questionId,
      authorId: userId,
      body: cleanBody,
      status: 'active'
    }
  });
  await createNotification(
    String(question.authorId || '').trim(),
    'New expert answer',
    `A new answer just landed on "${question.title}".`,
    { questionId, type: 'bounty_answer', appName: app?.get?.('name') || 'Scrolith' }
  );
  return getEngagementExpansionSummary(userId);
};

export const awardExpertBounty = async ({
  userId,
  questionId,
  answerId
}: {
  userId: string;
  questionId: string;
  answerId: string;
}) => {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      answers: {
        include: {
          author: { select: { id: true, name: true, username: true } }
        }
      },
      bounties: {
        where: { status: 'open' }
      }
    }
  });
  if (!question) throw new Error('Question not found.');
  if (String(question.authorId || '') !== userId) throw new Error('Only the question owner can award the bounty.');
  if (question.acceptedAnswerId) throw new Error('This bounty already has an accepted answer.');
  const answer = Array.isArray(question.answers) ? question.answers.find((entry) => entry.id === answerId) : null;
  if (!answer) throw new Error('Answer not found for this question.');

  const openBounties = Array.isArray(question.bounties) ? question.bounties : [];
  for (const bounty of openBounties) {
    await gcoinService.transfer(String(bounty.sponsorUserId || '').trim(), {
      toRecipientId: String(answer.authorId || '').trim(),
      amount: Number(bounty.amount || 0),
      note: `Awarded expert answer bounty for ${question.title}`,
      reference: { type: 'expert_bounty_award', questionId, answerId, bountyId: bounty.id }
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: {
        acceptedAnswerId: answerId,
        status: 'answered'
      }
    });
    await tx.answer.update({
      where: { id: answerId },
      data: {
        isAccepted: true
      }
    });
    if (openBounties.length) {
      await tx.bounty.updateMany({
        where: { questionId, status: 'open' },
        data: {
          status: 'awarded',
          awardedAnswerId: answerId,
          awardedAt: new Date()
        }
      });
    }
  });

  await createNotification(
    String(answer.authorId || '').trim(),
    'Bounty awarded',
    `Your answer on "${question.title}" was selected and awarded.`,
    { questionId, answerId, type: 'bounty_awarded' }
  );

  return getEngagementExpansionSummary(userId);
};
