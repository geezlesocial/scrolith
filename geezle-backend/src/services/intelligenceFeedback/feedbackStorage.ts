import prisma from '../../utils/prismaClient';
import { recordDbDuplicateMetric } from '../../utils/observability/metricsRegistry';
import type { NormalizedFeedbackEvent } from './types';

type FeedbackPrismaClient = {
  recoFeedbackLog: {
    create: (args: any) => Promise<any>;
    createMany: (args: any) => Promise<{ count: number }>;
  };
};

export const storeFeedbackEvent = async (
  event: NormalizedFeedbackEvent,
  client: FeedbackPrismaClient = prisma as unknown as FeedbackPrismaClient
): Promise<{ stored: boolean; duplicate: boolean; id: string | null }> => {
  try {
    if (event.idempotencyKey) {
      const result = await client.recoFeedbackLog.createMany({
        data: {
          id: event.idempotencyKey,
          viewerId: event.viewerId,
          entityType: event.entityType,
          entityId: event.entityId,
          surface: event.surface,
          action: event.storageAction,
          metadata: {
            ...event.metadata,
            occurredAt: event.occurredAt
          }
        },
        skipDuplicates: true
      });
      if (result.count === 0) {
        recordDbDuplicateMetric({ model: 'reco_feedback_log', constraint: 'id' });
        return { stored: false, duplicate: true, id: event.idempotencyKey };
      }
      return { stored: true, duplicate: false, id: event.idempotencyKey };
    }

    const row = await client.recoFeedbackLog.create({
      data: {
        ...(event.idempotencyKey ? { id: event.idempotencyKey } : {}),
        viewerId: event.viewerId,
        entityType: event.entityType,
        entityId: event.entityId,
        surface: event.surface,
        action: event.storageAction,
        metadata: {
          ...event.metadata,
          occurredAt: event.occurredAt
        }
      }
    });
    return { stored: true, duplicate: false, id: String(row?.id || event.idempotencyKey || '') || null };
  } catch (error) {
    throw error;
  }
};
