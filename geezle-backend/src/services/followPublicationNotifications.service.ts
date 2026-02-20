import prisma from '../utils/prismaClient';
import { buildSnippet, createEngagementNotification, filterRecipientsForNotification } from './engagementNotifications.service';

type PublicationType = 'job' | 'gig';

type FollowPublicationNotificationInput = {
  actorUserId: string;
  publicationType: PublicationType;
  publicationId: string;
  publicationTitle?: string | null;
};

const NOTIFICATION_BATCH_SIZE = 50;

const normalizeId = (value: unknown) => String(value || '').trim();

const publicationLabel = (publicationType: PublicationType) =>
  publicationType === 'job' ? 'job' : 'gig';

const publicationRoute = (publicationType: PublicationType, publicationId: string) =>
  publicationType === 'job'
    ? `/jobs/${encodeURIComponent(publicationId)}`
    : `/gigs/${encodeURIComponent(publicationId)}`;

const publicationMetadataKey = (publicationType: PublicationType) =>
  publicationType === 'job' ? 'jobId' : 'gigId';

const loadActorName = async (actorUserId: string) => {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true, username: true }
  });
  return actor?.name || actor?.username || 'Someone';
};

const chunk = <T>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

export const notifyFollowersAboutPublication = async (
  input: FollowPublicationNotificationInput
) => {
  const actorUserId = normalizeId(input.actorUserId);
  const publicationId = normalizeId(input.publicationId);
  if (!actorUserId || !publicationId) return 0;

  const follows = await prisma.userFollow.findMany({
    where: { followeeId: actorUserId },
    select: { followerId: true }
  });
  const followerIds: string[] = Array.from(
    new Set(
      follows
        .map((row) => normalizeId(row.followerId))
        .filter((id): id is string => Boolean(id) && id !== actorUserId)
    )
  );
  if (!followerIds.length) return 0;

  const recipientIds = await filterRecipientsForNotification('followed_new_post', followerIds);
  if (!recipientIds.length) return 0;

  const actorName = await loadActorName(actorUserId);
  const label = publicationLabel(input.publicationType);
  const snippet = buildSnippet(String(input.publicationTitle || ''), 90);
  const message = snippet
    ? `${actorName} published a new ${label}: "${snippet}"`
    : `${actorName} published a new ${label}.`;
  const route = publicationRoute(input.publicationType, publicationId);
  const contentIdKey = publicationMetadataKey(input.publicationType);

  let createdCount = 0;
  const batches = chunk(recipientIds, NOTIFICATION_BATCH_SIZE);
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((recipientId) =>
        createEngagementNotification({
          recipientId,
          actorId: actorUserId,
          type: 'followed_new_post',
          title: `New ${label}`,
          message,
          actionUrl: route,
          metadata: {
            contentType: input.publicationType,
            entityType: input.publicationType,
            entityId: publicationId,
            authorId: actorUserId,
            [contentIdKey]: publicationId,
            snippet
          },
          dedupeWindowMinutes: 60,
          dedupeMetaKeys: ['entityType', 'entityId'],
          skipRecipientChecks: true
        })
      )
    );
    createdCount += results.filter(Boolean).length;
  }

  return createdCount;
};
