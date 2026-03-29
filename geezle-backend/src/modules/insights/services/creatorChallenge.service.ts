import type { Application } from 'express';
import prisma from '../../../utils/prismaClient';
import { emitInsightsEvent } from '../realtime/insights.realtime';
import { grantAchievementByKeyIfMissing } from './insights.service';

const CREATOR_CHALLENGE_STATUS_ACTIVE = 'active';
const CREATOR_CHALLENGE_STATUS_DRAFT = 'draft';
const CREATOR_CHALLENGE_STATUS_FINALIZED = 'finalized';
const CREATOR_CHALLENGE_STATUS_ARCHIVED = 'archived';

const CREATOR_CHALLENGE_ENTRY_STATUS_ACTIVE = 'active';
const CREATOR_CHALLENGE_ENTRY_STATUS_WINNER = 'winner';
const CREATOR_CHALLENGE_ENTRY_STATUS_FINALIST = 'finalist';

const CREATOR_CHALLENGE_CONTENT_TYPES = ['community_post', 'scroll_video'] as const;

const DEFAULT_WEEKLY_CHALLENGE_TEMPLATES = [
  {
    key: 'WEEKLY_SCROLL_SPOTLIGHT',
    title: 'Weekly Scroll Spotlight',
    description: 'Submit one strong Scroll that teaches, inspires, or entertains with professional value.',
    category: 'scroll',
    contentTypes: ['scroll_video'],
    reward: {
      winnerAchievementKey: 'WEEKLY_SPOTLIGHT_WINNER',
      badgeCopy: 'Weekly spotlight trophy'
    }
  },
  {
    key: 'WEEKLY_COMMUNITY_BREAKDOWN',
    title: 'Weekly Community Breakdown',
    description: 'Share one clear, useful post that gives the community a practical takeaway worth saving.',
    category: 'community',
    contentTypes: ['community_post'],
    reward: {
      winnerAchievementKey: 'WEEKLY_SPOTLIGHT_WINNER',
      badgeCopy: 'Community breakdown trophy'
    }
  },
  {
    key: 'WEEKLY_CREATOR_SHOWCASE',
    title: 'Weekly Creator Showcase',
    description: 'Put forward your best creator work for the week and let the community vote on the standout submission.',
    category: 'showcase',
    contentTypes: ['scroll_video', 'community_post'],
    reward: {
      winnerAchievementKey: 'WEEKLY_SPOTLIGHT_WINNER',
      badgeCopy: 'Creator showcase trophy'
    }
  }
] as const;

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const isoWeekKey = (input = new Date()) => {
  const value = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const getCurrentWeekBoundsUtc = () => {
  const today = todayUtc();
  const day = today.getUTCDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() + mondayDelta);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return {
    start,
    end,
    weekKey: isoWeekKey(today)
  };
};

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

const normalizeContentType = (input: unknown) => {
  const value = String(input || '').trim().toLowerCase();
  return CREATOR_CHALLENGE_CONTENT_TYPES.includes(value as (typeof CREATOR_CHALLENGE_CONTENT_TYPES)[number]) ? value : null;
};

const normalizeContentTypes = (input: unknown) => {
  if (Array.isArray(input)) {
    return uniqueStrings(input.map((entry) => normalizeContentType(entry)).filter(Boolean));
  }
  if (typeof input === 'string') {
    return uniqueStrings(
      input
        .split(',')
        .map((entry) => normalizeContentType(entry))
        .filter(Boolean)
    );
  }
  return [];
};

const sanitizeText = (value: unknown, fallback = '') => {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
};

const truncateText = (value: unknown, maxLength: number, fallback = '') => {
  const normalized = sanitizeText(value, fallback);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const buildUserPreview = (user: any) => ({
  id: String(user?.id || '').trim(),
  name: sanitizeText(user?.name || user?.username, 'Scrolith creator'),
  username: user?.username ? String(user.username).trim() : null,
  avatarUrl: user?.avatar ? String(user.avatar).trim() : null,
  role: user?.role ? String(user.role).trim() : null
});

const emitCreatorChallengeRefresh = (app: Application | undefined, challengeId: string, reason: string) => {
  emitInsightsEvent(app, 'insights:creator_challenge_updated', {
    challengeId,
    reason
  });
};

export const buildEmptyCreatorChallengeDashboard = (userId: string, weekKey = getCurrentWeekBoundsUtc().weekKey) => ({
  userId: String(userId || '').trim(),
  weekKey,
  activeCount: 0,
  totalWins: 0,
  challenges: [] as any[]
});

const resolveCommunityPostOption = (row: any) => ({
  contentType: 'community_post',
  contentId: String(row?.id || '').trim(),
  title: truncateText(row?.title || row?.content, 64, 'Community post'),
  description: truncateText(row?.content, 160),
  coverUrl: Array.isArray(row?.attachments) && row.attachments.length ? String(row.attachments[0] || '').trim() : null,
  destinationUrl: '/community',
  createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null
});

const resolveScrollOption = (row: any) => ({
  contentType: 'scroll_video',
  contentId: String(row?.id || '').trim(),
  title: truncateText(row?.title || row?.description, 64, 'Scroll video'),
  description: truncateText(row?.description, 160),
  coverUrl: row?.media?.thumbnailUrl ? String(row.media.thumbnailUrl).trim() : null,
  destinationUrl: '/community',
  createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null
});

const loadSubmissionOptions = async (userId: string) => {
  const [posts, scrolls] = await Promise.all([
    prisma.communityPost.findMany({
      where: {
        authorId: userId,
        status: 'active',
        visibility: 'public'
      },
      select: {
        id: true,
        title: true,
        content: true,
        attachments: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 12
    }),
    prisma.scrollVideo.findMany({
      where: {
        authorId: userId,
        status: 'active',
        visibility: 'public'
      },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 12
    })
  ]);

  return {
    community_post: posts.map(resolveCommunityPostOption),
    scroll_video: scrolls.map(resolveScrollOption)
  };
};

const ensureChallengeContentSnapshot = async (input: {
  userId: string;
  contentType: string;
  contentId: string;
}) => {
  if (input.contentType === 'community_post') {
    const row = await prisma.communityPost.findFirst({
      where: {
        id: input.contentId,
        authorId: input.userId,
        status: 'active',
        visibility: 'public'
      },
      select: {
        id: true,
        title: true,
        content: true,
        attachments: true,
        createdAt: true
      }
    });
    if (!row) throw new Error('Community post not found or not eligible for challenge submission.');
    return resolveCommunityPostOption(row);
  }

  if (input.contentType === 'scroll_video') {
    const row = await prisma.scrollVideo.findFirst({
      where: {
        id: input.contentId,
        authorId: input.userId,
        status: 'active',
        visibility: 'public'
      },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true
      }
    });
    if (!row) throw new Error('Scroll video not found or not eligible for challenge submission.');
    return resolveScrollOption(row);
  }

  throw new Error('Unsupported challenge content type.');
};

const finalizeChallengeInternal = async (challengeId: string, app?: Application) => {
  const challenge = await prisma.creatorChallenge.findUnique({
    where: { id: challengeId },
    include: {
      entries: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true,
              role: true
            }
          }
        },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }]
      }
    }
  });
  if (!challenge) throw new Error('Creator challenge not found.');
  if (challenge.status === CREATOR_CHALLENGE_STATUS_FINALIZED || challenge.status === CREATOR_CHALLENGE_STATUS_ARCHIVED) {
    return challenge;
  }

  const winningEntries = challenge.entries.slice(0, Math.max(1, Number(challenge.maxWinners || 3)));
  const winningIds = winningEntries.map((entry) => entry.id);

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < challenge.entries.length; index += 1) {
      const entry = challenge.entries[index];
      const rank = index + 1;
      const isWinner = winningIds.includes(entry.id);
      await tx.creatorChallengeEntry.update({
        where: { id: entry.id },
        data: {
          position: rank,
          isWinner,
          status: isWinner
            ? CREATOR_CHALLENGE_ENTRY_STATUS_WINNER
            : rank <= Math.max(3, Number(challenge.maxWinners || 3))
              ? CREATOR_CHALLENGE_ENTRY_STATUS_FINALIST
              : CREATOR_CHALLENGE_ENTRY_STATUS_ACTIVE
        }
      });
    }

    await tx.creatorChallenge.update({
      where: { id: challenge.id },
      data: {
        status: CREATOR_CHALLENGE_STATUS_FINALIZED,
        finalizedAt: new Date(),
        winningEntryIds: winningIds
      }
    });
  });

  const firstPlace = winningEntries[0];
  if (firstPlace?.userId) {
    await grantAchievementByKeyIfMissing({
      userId: firstPlace.userId,
      achievementKey: 'WEEKLY_SPOTLIGHT_WINNER',
      meta: {
        source: 'creator-challenge',
        challengeId: challenge.id,
        challengeKey: challenge.key,
        rank: 1
      },
      app
    });
  }

  emitCreatorChallengeRefresh(app, challenge.id, 'finalized');

  return prisma.creatorChallenge.findUnique({
    where: { id: challenge.id },
    include: {
      entries: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true,
              role: true
            }
          }
        },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }]
      }
    }
  });
};

export const ensureDefaultCreatorChallenges = async () => {
  const { weekKey, start, end } = getCurrentWeekBoundsUtc();
  for (const template of DEFAULT_WEEKLY_CHALLENGE_TEMPLATES) {
    await prisma.creatorChallenge.upsert({
      where: {
        weekKey_key: {
          weekKey,
          key: template.key
        }
      },
      create: {
        key: template.key,
        weekKey,
        title: template.title,
        description: template.description,
        category: template.category,
        contentTypes: [...template.contentTypes],
        reward: template.reward,
        entryLimitPerUser: 1,
        maxWinners: 3,
        status: CREATOR_CHALLENGE_STATUS_ACTIVE,
        isActive: true,
        startAt: start,
        endAt: end
      },
      update: {}
    });
  }
};

export const finalizeDueCreatorChallenges = async (app?: Application) => {
  const now = new Date();
  const due = await prisma.creatorChallenge.findMany({
    where: {
      isActive: true,
      status: CREATOR_CHALLENGE_STATUS_ACTIVE,
      endAt: { lt: now }
    },
    select: { id: true }
  });

  for (const row of due) {
    await finalizeChallengeInternal(row.id, app);
  }
};

const formatChallengeEntry = (entry: any, currentUserId: string, viewerVoteEntryId: string | null) => ({
  id: String(entry?.id || '').trim(),
  userId: String(entry?.userId || '').trim(),
  contentType: String(entry?.contentType || '').trim(),
  contentId: String(entry?.contentId || '').trim(),
  title: truncateText(entry?.titleSnapshot, 72, 'Challenge entry'),
  description: truncateText(entry?.descriptionSnapshot, 180),
  coverUrl: entry?.coverUrl ? String(entry.coverUrl).trim() : null,
  destinationUrl: entry?.destinationUrl ? String(entry.destinationUrl).trim() : null,
  voteCount: Number(entry?.voteCount || 0),
  isWinner: Boolean(entry?.isWinner),
  position: entry?.position ? Number(entry.position) : null,
  status: String(entry?.status || CREATOR_CHALLENGE_ENTRY_STATUS_ACTIVE),
  author: buildUserPreview(entry?.user),
  createdAt: entry?.createdAt ? new Date(entry.createdAt).toISOString() : null,
  viewerCanVote: String(entry?.userId || '').trim() !== currentUserId,
  viewerHasVoted: viewerVoteEntryId === String(entry?.id || '').trim()
});

const formatChallengeForViewer = (input: {
  challenge: any;
  userId: string;
  voteEntryId: string | null;
  submissionOptions: Record<string, any[]>;
}) => {
  const challenge = input.challenge;
  const viewerEntry = challenge.entries.find((entry: any) => String(entry.userId || '').trim() === input.userId) || null;
  const usedIds = new Set(challenge.entries.map((entry: any) => `${entry.contentType}:${entry.contentId}`));
  const allowedTypes = normalizeContentTypes(challenge.contentTypes);
  const submissionOptions = allowedTypes.flatMap((type) =>
    (Array.isArray(input.submissionOptions[type]) ? input.submissionOptions[type] : []).filter(
      (option) => !usedIds.has(`${option.contentType}:${option.contentId}`)
    )
  );
  const topEntries = challenge.entries.slice(0, 5).map((entry: any) => formatChallengeEntry(entry, input.userId, input.voteEntryId));

  return {
    id: String(challenge.id || '').trim(),
    key: String(challenge.key || '').trim(),
    weekKey: String(challenge.weekKey || '').trim(),
    title: sanitizeText(challenge.title, 'Creator challenge'),
    description: sanitizeText(challenge.description),
    category: sanitizeText(challenge.category, 'creator'),
    contentTypes: allowedTypes,
    status: String(challenge.status || CREATOR_CHALLENGE_STATUS_ACTIVE),
    isActive: Boolean(challenge.isActive),
    entryLimitPerUser: Math.max(1, Number(challenge.entryLimitPerUser || 1)),
    maxWinners: Math.max(1, Number(challenge.maxWinners || 3)),
    startAt: challenge.startAt ? new Date(challenge.startAt).toISOString() : null,
    endAt: challenge.endAt ? new Date(challenge.endAt).toISOString() : null,
    finalizedAt: challenge.finalizedAt ? new Date(challenge.finalizedAt).toISOString() : null,
    reward: challenge.reward || {},
    stats: {
      totalEntries: challenge.entries.length,
      totalVotes: challenge.entries.reduce((sum: number, entry: any) => sum + Number(entry.voteCount || 0), 0)
    },
    viewerVoteEntryId: input.voteEntryId,
    viewerEntry: viewerEntry ? formatChallengeEntry(viewerEntry, input.userId, input.voteEntryId) : null,
    canSubmit:
      Boolean(challenge.isActive) &&
      String(challenge.status || '').toLowerCase() === CREATOR_CHALLENGE_STATUS_ACTIVE &&
      !viewerEntry,
    submissionOptions,
    topEntries,
    winners: challenge.entries.filter((entry: any) => Boolean(entry.isWinner)).slice(0, Number(challenge.maxWinners || 3)).map((entry: any) =>
      formatChallengeEntry(entry, input.userId, input.voteEntryId)
    )
  };
};

export const getCreatorChallengeDashboard = async (userId: string) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return buildEmptyCreatorChallengeDashboard('');
  }

  await ensureDefaultCreatorChallenges();
  await finalizeDueCreatorChallenges();

  const { weekKey } = getCurrentWeekBoundsUtc();
  const challenges = await prisma.creatorChallenge.findMany({
    where: {
      weekKey,
      isActive: true,
      status: {
        in: [CREATOR_CHALLENGE_STATUS_ACTIVE, CREATOR_CHALLENGE_STATUS_FINALIZED]
      }
    },
    include: {
      entries: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true,
              role: true
            }
          }
        },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }]
      }
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }]
  });

  const challengeIds = challenges.map((row) => row.id);
  const [viewerVotes, submissionOptions] = await Promise.all([
    challengeIds.length
      ? prisma.creatorChallengeVote.findMany({
          where: {
            challengeId: { in: challengeIds },
            userId: normalizedUserId
          },
          select: {
            challengeId: true,
            entryId: true
          }
        })
      : Promise.resolve([] as Array<{ challengeId: string; entryId: string }>),
    loadSubmissionOptions(normalizedUserId)
  ]);

  const voteMap = new Map<string, string>();
  viewerVotes.forEach((row) => {
    voteMap.set(String(row.challengeId || '').trim(), String(row.entryId || '').trim());
  });

  const challengeItems = challenges.map((challenge) =>
    formatChallengeForViewer({
      challenge,
      userId: normalizedUserId,
      voteEntryId: voteMap.get(String(challenge.id || '').trim()) || null,
      submissionOptions
    })
  );

  return {
    userId: normalizedUserId,
    weekKey,
    activeCount: challengeItems.filter((item) => item.status === CREATOR_CHALLENGE_STATUS_ACTIVE).length,
    totalWins: challengeItems.reduce((sum, item) => sum + (item.viewerEntry?.isWinner ? 1 : 0), 0),
    challenges: challengeItems
  };
};

export const submitCreatorChallengeEntry = async (input: {
  userId?: string | null;
  challengeId?: string | null;
  contentType?: string | null;
  contentId?: string | null;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const challengeId = String(input.challengeId || '').trim();
  const contentType = normalizeContentType(input.contentType);
  const contentId = String(input.contentId || '').trim();
  if (!userId || !challengeId || !contentType || !contentId) {
    throw new Error('challengeId, contentType, and contentId are required.');
  }

  await ensureDefaultCreatorChallenges();
  await finalizeDueCreatorChallenges(input.app);

  const challenge = await prisma.creatorChallenge.findUnique({
    where: { id: challengeId }
  });
  if (!challenge || challenge.isActive === false) throw new Error('Creator challenge not found.');
  if (String(challenge.status || '').toLowerCase() !== CREATOR_CHALLENGE_STATUS_ACTIVE) {
    throw new Error('This creator challenge is not accepting submissions right now.');
  }
  if (new Date(challenge.endAt).getTime() < Date.now()) {
    await finalizeChallengeInternal(challenge.id, input.app);
    throw new Error('This creator challenge has already ended.');
  }

  const allowedTypes = normalizeContentTypes(challenge.contentTypes);
  if (!allowedTypes.includes(contentType)) {
    throw new Error('This content type is not eligible for the selected creator challenge.');
  }

  const existingEntry = await prisma.creatorChallengeEntry.findFirst({
    where: {
      challengeId,
      userId
    },
    select: { id: true }
  });
  if (existingEntry) {
    throw new Error('You have already submitted an entry for this creator challenge.');
  }

  const snapshot = await ensureChallengeContentSnapshot({
    userId,
    contentType,
    contentId
  });

  await prisma.creatorChallengeEntry.create({
    data: {
      challengeId,
      userId,
      contentType,
      contentId,
      titleSnapshot: snapshot.title || null,
      descriptionSnapshot: snapshot.description || null,
      coverUrl: snapshot.coverUrl || null,
      destinationUrl: snapshot.destinationUrl || null,
      status: CREATOR_CHALLENGE_ENTRY_STATUS_ACTIVE,
      meta: {
        createdFrom: snapshot.contentType,
        submittedAt: new Date().toISOString()
      }
    }
  });

  await grantAchievementByKeyIfMissing({
    userId,
    achievementKey: 'CHALLENGE_CREATOR',
    meta: {
      source: 'creator-challenge',
      challengeId,
      challengeKey: challenge.key,
      contentType,
      contentId
    },
    app: input.app
  });

  emitCreatorChallengeRefresh(input.app, challengeId, 'submitted');
  return getCreatorChallengeDashboard(userId);
};

export const voteCreatorChallengeEntry = async (input: {
  userId?: string | null;
  challengeId?: string | null;
  entryId?: string | null;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const challengeId = String(input.challengeId || '').trim();
  const entryId = String(input.entryId || '').trim();
  if (!userId || !challengeId || !entryId) {
    throw new Error('challengeId and entryId are required.');
  }

  await ensureDefaultCreatorChallenges();
  await finalizeDueCreatorChallenges(input.app);

  const entry = await prisma.creatorChallengeEntry.findFirst({
    where: {
      id: entryId,
      challengeId
    },
    include: {
      challenge: true
    }
  });
  if (!entry || !entry.challenge) throw new Error('Creator challenge entry not found.');
  if (String(entry.userId || '').trim() === userId) {
    throw new Error('You cannot vote for your own creator challenge entry.');
  }
  if (String(entry.challenge.status || '').toLowerCase() !== CREATOR_CHALLENGE_STATUS_ACTIVE || entry.challenge.isActive === false) {
    throw new Error('Voting is closed for this creator challenge.');
  }
  if (new Date(entry.challenge.endAt).getTime() < Date.now()) {
    await finalizeChallengeInternal(entry.challenge.id, input.app);
    throw new Error('Voting is closed for this creator challenge.');
  }

  const updatedEntry = await prisma.$transaction(async (tx) => {
    const existingVote = await tx.creatorChallengeVote.findUnique({
      where: {
        challengeId_userId: {
          challengeId,
          userId
        }
      }
    });

    if (existingVote && String(existingVote.entryId || '').trim() === entryId) {
      return tx.creatorChallengeEntry.findUnique({
        where: { id: entryId }
      });
    }

    if (existingVote) {
      await tx.creatorChallengeEntry.update({
        where: { id: existingVote.entryId },
        data: {
          voteCount: {
            decrement: 1
          }
        }
      });
      await tx.creatorChallengeVote.update({
        where: { id: existingVote.id },
        data: {
          entryId
        }
      });
    } else {
      await tx.creatorChallengeVote.create({
        data: {
          challengeId,
          entryId,
          userId
        }
      });
    }

    return tx.creatorChallengeEntry.update({
      where: { id: entryId },
      data: {
        voteCount: {
          increment: 1
        }
      }
    });
  });

  if (Number(updatedEntry?.voteCount || 0) >= 5) {
    await grantAchievementByKeyIfMissing({
      userId: entry.userId,
      achievementKey: 'CROWD_FAVORITE',
      meta: {
        source: 'creator-challenge',
        challengeId,
        challengeKey: entry.challenge.key,
        entryId
      },
      app: input.app
    });
  }

  emitCreatorChallengeRefresh(input.app, challengeId, 'voted');
  return getCreatorChallengeDashboard(userId);
};

const parseAdminChallengePayload = (input: any) => {
  const contentTypes = normalizeContentTypes(input?.contentTypes);
  const startAt = input?.startAt ? new Date(input.startAt) : null;
  const endAt = input?.endAt ? new Date(input.endAt) : null;
  if (!contentTypes.length) throw new Error('At least one content type is required.');
  if (!startAt || Number.isNaN(startAt.getTime()) || !endAt || Number.isNaN(endAt.getTime())) {
    throw new Error('Valid startAt and endAt values are required.');
  }
  if (endAt <= startAt) throw new Error('endAt must be after startAt.');

  return {
    key: String(input?.key || '').trim().toUpperCase(),
    weekKey: String(input?.weekKey || '').trim() || isoWeekKey(startAt),
    title: sanitizeText(input?.title),
    description: sanitizeText(input?.description),
    category: sanitizeText(input?.category, 'creator'),
    contentTypes,
    rules: input?.rules || {},
    reward: input?.reward || {},
    entryLimitPerUser: Math.max(1, Math.floor(Number(input?.entryLimitPerUser || 1))),
    maxWinners: Math.max(1, Math.floor(Number(input?.maxWinners || 3))),
    startAt,
    endAt,
    status: sanitizeText(input?.status, CREATOR_CHALLENGE_STATUS_ACTIVE).toLowerCase(),
    isActive: input?.isActive !== false
  };
};

const formatChallengeForAdmin = (challenge: any) => ({
  id: String(challenge.id || '').trim(),
  key: String(challenge.key || '').trim(),
  weekKey: String(challenge.weekKey || '').trim(),
  title: sanitizeText(challenge.title),
  description: sanitizeText(challenge.description),
  category: sanitizeText(challenge.category, 'creator'),
  contentTypes: normalizeContentTypes(challenge.contentTypes),
  rules: challenge.rules || {},
  reward: challenge.reward || {},
  entryLimitPerUser: Math.max(1, Number(challenge.entryLimitPerUser || 1)),
  maxWinners: Math.max(1, Number(challenge.maxWinners || 3)),
  status: sanitizeText(challenge.status, CREATOR_CHALLENGE_STATUS_ACTIVE),
  isActive: Boolean(challenge.isActive),
  startAt: challenge.startAt ? new Date(challenge.startAt).toISOString() : null,
  endAt: challenge.endAt ? new Date(challenge.endAt).toISOString() : null,
  finalizedAt: challenge.finalizedAt ? new Date(challenge.finalizedAt).toISOString() : null,
  winningEntryIds: Array.isArray(challenge.winningEntryIds) ? challenge.winningEntryIds : challenge.winningEntryIds || [],
  createdBy: challenge.createdBy ? buildUserPreview(challenge.createdBy) : null,
  updatedBy: challenge.updatedBy ? buildUserPreview(challenge.updatedBy) : null,
  stats: {
    totalEntries: challenge.entries.length,
    totalVotes: challenge.entries.reduce((sum: number, entry: any) => sum + Number(entry.voteCount || 0), 0)
  },
  topEntries: challenge.entries.slice(0, 5).map((entry: any) => ({
    id: String(entry.id || '').trim(),
    title: truncateText(entry.titleSnapshot, 72, 'Challenge entry'),
    contentType: String(entry.contentType || '').trim(),
    voteCount: Number(entry.voteCount || 0),
    isWinner: Boolean(entry.isWinner),
    position: entry.position ? Number(entry.position) : null,
    author: buildUserPreview(entry.user)
  }))
});

export const getAdminCreatorChallenges = async (weekKeyInput?: string | null) => {
  await ensureDefaultCreatorChallenges();
  await finalizeDueCreatorChallenges();

  const weekKey = String(weekKeyInput || '').trim() || getCurrentWeekBoundsUtc().weekKey;
  const rows = await prisma.creatorChallenge.findMany({
    where: {
      weekKey
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          role: true
        }
      },
      updatedBy: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          role: true
        }
      },
      entries: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true,
              role: true
            }
          }
        },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }]
      }
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }]
  });

  return rows.map(formatChallengeForAdmin);
};

export const createAdminCreatorChallenge = async (input: {
  actorUserId?: string | null;
  payload: any;
  app?: Application;
}) => {
  const parsed = parseAdminChallengePayload(input.payload);
  if (!parsed.key || !parsed.title) throw new Error('key and title are required.');

  const row = await prisma.creatorChallenge.create({
    data: {
      ...parsed,
      createdById: input.actorUserId ? String(input.actorUserId).trim() : null,
      updatedById: input.actorUserId ? String(input.actorUserId).trim() : null
    }
  });

  emitCreatorChallengeRefresh(input.app, row.id, 'admin_created');
  return row;
};

export const updateAdminCreatorChallenge = async (input: {
  id?: string | null;
  actorUserId?: string | null;
  payload: any;
  app?: Application;
}) => {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id is required.');
  const existing = await prisma.creatorChallenge.findUnique({ where: { id } });
  if (!existing) throw new Error('Creator challenge not found.');
  const parsed = parseAdminChallengePayload({
    ...existing,
    ...input.payload
  });

  const row = await prisma.creatorChallenge.update({
    where: { id },
    data: {
      ...parsed,
      updatedById: input.actorUserId ? String(input.actorUserId).trim() : null
    }
  });

  emitCreatorChallengeRefresh(input.app, row.id, 'admin_updated');
  return row;
};

export const toggleAdminCreatorChallenge = async (input: {
  id?: string | null;
  actorUserId?: string | null;
  app?: Application;
}) => {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id is required.');
  const row = await prisma.creatorChallenge.findUnique({ where: { id } });
  if (!row) throw new Error('Creator challenge not found.');
  const updated = await prisma.creatorChallenge.update({
    where: { id },
    data: {
      isActive: !row.isActive,
      updatedById: input.actorUserId ? String(input.actorUserId).trim() : null
    }
  });
  emitCreatorChallengeRefresh(input.app, updated.id, 'admin_toggled');
  return updated;
};

export const finalizeAdminCreatorChallenge = async (input: {
  id?: string | null;
  app?: Application;
}) => {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id is required.');
  return finalizeChallengeInternal(id, input.app);
};
