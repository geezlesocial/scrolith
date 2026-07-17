import prisma from '../../utils/prismaClient';
import type { NormalizedFeedbackEvent } from './types';

type FeedbackPrismaClient = {
  recoFeedbackLog: {
    create: (args: any) => Promise<any>;
  };
};

const isUniqueConflict = (error: unknown) =>
  String((error as any)?.code || '').toUpperCase() === 'P2002';

export const storeFeedbackEvent = async (
  event: NormalizedFeedbackEvent,
  client: FeedbackPrismaClient = prisma as unknown as FeedbackPrismaClient
): Promise<{ stored: boolean; duplicate: boolean; id: string | null }> => {
  try {
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
    if (event.idempotencyKey && isUniqueConflict(error)) {
      return { stored: false, duplicate: true, id: event.idempotencyKey };
    }
    throw error;
  }
};
