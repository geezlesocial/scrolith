import type { Application } from 'express';
import prisma from '../../../utils/prismaClient';
import { emitInsightsEvent } from '../realtime/insights.realtime';

export const CAREER_DAILY_ACTION_TYPES = ['post', 'reply', 'apply', 'learn'] as const;

export type CareerDailyActionType = (typeof CAREER_DAILY_ACTION_TYPES)[number];

const CAREER_DAILY_ACTION_LABELS: Record<CareerDailyActionType, string> = {
  post: 'Post',
  reply: 'Reply',
  apply: 'Apply',
  learn: 'Learn'
};

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const normalizeCareerDailyActionType = (value: unknown): CareerDailyActionType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  return CAREER_DAILY_ACTION_TYPES.includes(normalized as CareerDailyActionType)
    ? (normalized as CareerDailyActionType)
    : null;
};

export const buildEmptyCareerStreakSummary = (userId: string, actionDate = todayUtc()) => ({
  userId,
  actionDate: actionDate.toISOString(),
  goalCount: CAREER_DAILY_ACTION_TYPES.length,
  completedCount: 0,
  allCompleted: false,
  actions: CAREER_DAILY_ACTION_TYPES.map((type) => ({
    type,
    label: CAREER_DAILY_ACTION_LABELS[type],
    completed: false,
    completedAt: null as string | null,
    sourceType: null as string | null,
    sourceId: null as string | null
  }))
});

export const getCareerStreakSummary = async (userId: string, actionDate = todayUtc()) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return buildEmptyCareerStreakSummary('', actionDate);

  const rows = await prisma.careerDailyAction.findMany({
    where: {
      userId: normalizedUserId,
      actionDate
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  const byType = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    byType.set(String(row.actionType || '').trim().toLowerCase(), row);
  });
  const actions = CAREER_DAILY_ACTION_TYPES.map((type) => {
    const row = byType.get(type);
    return {
      type,
      label: CAREER_DAILY_ACTION_LABELS[type],
      completed: Boolean(row),
      completedAt: row?.createdAt ? row.createdAt.toISOString() : null,
      sourceType: row?.sourceType || null,
      sourceId: row?.sourceId || null
    };
  });

  const completedCount = actions.filter((item) => item.completed).length;

  return {
    userId: normalizedUserId,
    actionDate: actionDate.toISOString(),
    goalCount: CAREER_DAILY_ACTION_TYPES.length,
    completedCount,
    allCompleted: completedCount >= CAREER_DAILY_ACTION_TYPES.length,
    actions
  };
};

export const trackCareerDailyAction = async (input: {
  userId?: string | null;
  actionType: CareerDailyActionType | string;
  sourceType?: string | null;
  sourceId?: string | null;
  meta?: any;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const actionType = normalizeCareerDailyActionType(input.actionType);
  if (!userId || !actionType) return null;

  const actionDate = todayUtc();
  let created = false;

  try {
    await prisma.careerDailyAction.create({
      data: {
        userId,
        actionType,
        actionDate,
        sourceType: input.sourceType ? String(input.sourceType).trim() : null,
        sourceId: input.sourceId ? String(input.sourceId).trim() : null,
        meta: input.meta ?? null
      }
    });
    created = true;
  } catch (error: any) {
    if (String(error?.code || '').toUpperCase() !== 'P2002') {
      throw error;
    }
  }

  const summary = await getCareerStreakSummary(userId, actionDate);
  if (created) {
    emitInsightsEvent(input.app, 'insights:career_daily_updated', {
      userId,
      actionType,
      summary
    });
  }

  return {
    created,
    summary
  };
};
