/**
 * Phase 29.5 — Messaging Groups analytics + health score (surface metrics only).
 */

import prisma from '../../utils/prismaClient';

export type GroupHealthScore = {
  conversationId: string;
  score: number; // 0-100
  bands: {
    activity: number;
    engagement: number;
    retention: number;
    spamRisk: number; // inverted into score
    moderationBurden: number;
    participationBalance: number;
  };
  flags: string[];
};

export const computeGroupHealthScore = async (conversationId: string): Promise<GroupHealthScore> => {
  const flags: string[] = [];
  const now = Date.now();
  const dayAgo = new Date(now - 86400000);
  const weekAgo = new Date(now - 7 * 86400000);

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== 'GROUP') {
    return {
      conversationId,
      score: 0,
      bands: {
        activity: 0,
        engagement: 0,
        retention: 0,
        spamRisk: 0,
        moderationBurden: 0,
        participationBalance: 0
      },
      flags: ['not_group']
    };
  }

  const [msgToday, msgWeek, members, uniqueSendersWeek, auditWeek] = await Promise.all([
    prisma.directMessage.count({
      where: { conversationId, createdAt: { gte: dayAgo }, deletedAt: null }
    }),
    prisma.directMessage.count({
      where: { conversationId, createdAt: { gte: weekAgo }, deletedAt: null }
    }),
    prisma.conversationParticipant.count({
      where: { conversationId, deletedAt: null } as any
    }),
    prisma.directMessage
      .groupBy({
        by: ['senderId'],
        where: { conversationId, createdAt: { gte: weekAgo }, deletedAt: null },
        _count: true
      })
      .then((rows) => rows.length)
      .catch(() => 0),
    (prisma as any).groupModerationAction
      ?.count?.({
        where: {
          conversationId,
          createdAt: { gte: weekAgo },
          action: { contains: 'restrict' }
        }
      })
      .catch?.(() => 0) ?? Promise.resolve(0)
  ]);

  const activity = Math.min(100, msgToday * 8 + (msgWeek > 0 ? 20 : 0));
  const engagement = Math.min(100, uniqueSendersWeek * 15 + (msgWeek > 10 ? 20 : 0));
  const retention =
    members > 1
      ? Math.min(100, Math.round((uniqueSendersWeek / Math.max(members, 1)) * 100) + 10)
      : 30;
  const spamRisk = Math.min(100, msgToday > 200 ? 80 : msgToday > 80 ? 40 : 10);
  if (spamRisk >= 40) flags.push('high_message_velocity');
  const moderationBurden = Math.min(100, Number(auditWeek) * 20);
  if (moderationBurden >= 40) flags.push('moderation_load');
  const participationBalance =
    members > 0 ? Math.min(100, Math.round((uniqueSendersWeek / members) * 120)) : 0;
  if (participationBalance < 20 && members > 5) flags.push('low_participation_balance');

  if (String((conversation as any).messagingMode || '') === 'LOCKED') flags.push('locked');
  const lastAt = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
  if (lastAt && now - lastAt > 14 * 86400000) flags.push('inactive_14d');

  // Higher spam/moderation reduce score
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        activity * 0.25 +
          engagement * 0.25 +
          retention * 0.2 +
          participationBalance * 0.15 +
          (100 - spamRisk) * 0.1 +
          (100 - moderationBurden) * 0.05
      )
    )
  );

  return {
    conversationId,
    score,
    bands: {
      activity,
      engagement,
      retention,
      spamRisk,
      moderationBurden,
      participationBalance
    },
    flags
  };
};

export const buildPlatformGroupAnalytics = async (days = 14) => {
  const since = new Date(Date.now() - Math.max(1, Math.min(90, days)) * 86400000);
  const groupWhere = { type: 'GROUP' as const };

  const [
    groupsCreated,
    totalGroups,
    messages,
    voiceNotes,
    locked,
    announcement
  ] = await Promise.all([
    prisma.conversation.count({ where: { ...groupWhere, createdAt: { gte: since } } }),
    prisma.conversation.count({ where: groupWhere }),
    prisma.directMessage.count({
      where: { createdAt: { gte: since }, conversation: { type: 'GROUP' } }
    }),
    prisma.directMessage.count({
      where: {
        createdAt: { gte: since },
        conversation: { type: 'GROUP' },
        messageType: 'VOICE_NOTE' as any
      }
    }).catch(() => 0),
    prisma.conversation.count({ where: { type: 'GROUP', messagingMode: 'LOCKED' as any } }).catch(() => 0),
    prisma.conversation
      .count({ where: { type: 'GROUP', messagingMode: 'ANNOUNCEMENT' as any } })
      .catch(() => 0)
  ]);

  // Daily series
  const recent = await prisma.directMessage.findMany({
    where: { createdAt: { gte: since }, conversation: { type: 'GROUP' } },
    select: { createdAt: true, attachments: true },
    take: 8000
  });
  const byDay: Record<string, { messages: number; attachments: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    byDay[d] = { messages: 0, attachments: 0 };
  }
  let attachmentRefs = 0;
  recent.forEach((m) => {
    const k = m.createdAt.toISOString().slice(0, 10);
    if (!byDay[k]) byDay[k] = { messages: 0, attachments: 0 };
    byDay[k].messages += 1;
    const n = (m.attachments || []).length;
    byDay[k].attachments += n;
    attachmentRefs += n;
  });

  let avgMembers = 0;
  try {
    const agg = await prisma.conversation.aggregate({
      where: groupWhere,
      _avg: { memberCount: true } as any
    });
    avgMembers = Math.round(Number((agg as any)?._avg?.memberCount || 0));
  } catch {
    avgMembers = 0;
  }

  return {
    windowDays: days,
    totals: {
      totalGroups,
      groupsCreated,
      messages,
      voiceNotes,
      lockedGroups: locked,
      announcementGroups: announcement,
      averageMembers: avgMembers,
      attachmentReferences: attachmentRefs
    },
    series: Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))
  };
};

export const GROUP_ANALYTICS_VERSION = '29.5';
