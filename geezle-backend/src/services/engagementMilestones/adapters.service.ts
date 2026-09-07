import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import {
  ENGAGEMENT_EVENT_TYPES,
  EngagementSignalInput
} from './contracts';
import { evaluatePersistedEngagementSignal, recordEngagementSignal } from './evaluator.service';

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export const recordProfileSearchAppearance = (input: {
  profileId: string;
  searchRequestId: string;
  viewerId?: string | null;
  aggregateCount: number;
  metadata?: Record<string, unknown>;
}) => recordEngagementSignal({
  sourceEventId: `profile-search-appearance:${input.profileId}:${input.searchRequestId}`,
  eventType: ENGAGEMENT_EVENT_TYPES.PROFILE_SEARCH_APPEARANCE,
  entityType: 'profile',
  entityId: input.profileId,
  ownerId: input.profileId,
  actorId: input.viewerId || null,
  aggregateCount: input.aggregateCount,
  metadata: input.metadata
});

export const recordQualifiedOpportunity = (input: Omit<EngagementSignalInput, 'eventType'> & { eventType?: string }) =>
  recordEngagementSignal({
    ...input,
    eventType: input.eventType || ENGAGEMENT_EVENT_TYPES.QUALIFIED_OPPORTUNITY
  });

export const recordContentReach = (input: Omit<EngagementSignalInput, 'eventType'> & { eventType?: string }) =>
  recordEngagementSignal({
    ...input,
    eventType: input.eventType || ENGAGEMENT_EVENT_TYPES.CONTENT_REACH
  });

/**
 * Records one marketplace listing view per viewer/day, atomically with the
 * legacy counter. Anonymous requests are intentionally not attributed.
 */
export const recordMarketplaceListingView = async (input: {
  listingId: string;
  viewerId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const listingId = String(input.listingId || '').trim();
  const viewerId = String(input.viewerId || '').trim();
  if (!listingId || !viewerId) return { accepted: false, reason: 'anonymous_or_invalid' };
  const sourceEventId = `marketplace-listing-view:${listingId}:${viewerId}:${dayKey()}`;
  let signal: any;
  try {
    signal = await (prisma as any).$transaction(async (tx: any) => {
      const marker = await tx.engagementSignal.create({
        data: {
          id: randomUUID(),
          sourceEventId,
          eventType: ENGAGEMENT_EVENT_TYPES.MARKETPLACE_LISTING_IMPRESSION,
          entityType: 'marketplace_listing',
          entityId: listingId,
          ownerId: '',
          actorId: viewerId,
          aggregateCount: 0,
          occurredAt: new Date(),
          metadata: input.metadata || null
        }
      });
      const listing = await tx.marketplaceListing.update({
        where: { id: listingId },
        data: { viewCount: { increment: 1 } },
        select: { sellerId: true, viewCount: true }
      });
      return tx.engagementSignal.update({
        where: { id: marker.id },
        data: { ownerId: listing.sellerId, aggregateCount: listing.viewCount }
      });
    });
  } catch (error: any) {
    if (String(error?.code || '') === 'P2002') return { accepted: false, duplicate: true };
    throw error;
  }
  const result = await evaluatePersistedEngagementSignal({
    sourceEventId: signal.sourceEventId,
    eventType: signal.eventType,
    entityType: signal.entityType,
    entityId: signal.entityId,
    ownerId: signal.ownerId,
    actorId: signal.actorId,
    aggregateCount: signal.aggregateCount,
    occurredAt: signal.occurredAt,
    metadata: signal.metadata || undefined
  });
  return { accepted: true, duplicate: false, ...result };
};
