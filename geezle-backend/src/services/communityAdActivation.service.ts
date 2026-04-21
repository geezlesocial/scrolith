import prisma from '../utils/prismaClient';

const AD_PLACEMENT_ALIASES: Record<string, string> = {
  feed: 'community_feed',
  community_feed: 'community_feed',
  homepage: 'homepage',
  homepage_feed: 'homepage_feed',
  forum_listing: 'forum_listing',
  forum_top: 'forum_listing',
  thread_detail: 'thread_detail',
  chat: 'chat_sidebar',
  chat_sidebar: 'chat_sidebar',
  sidebar: 'homepage',
  scroll: 'scroll_preroll',
  scroll_feed: 'scroll_feed',
  scroll_preroll: 'scroll_preroll',
  scroll_video: 'scroll_preroll',
  scroll_overlay: 'scroll_preroll'
};

const DEFAULT_ALLOWED_PLACEMENTS = [
  'homepage',
  'homepage_feed',
  'community_feed',
  'scroll_preroll',
  'scroll_feed',
  'forum_listing',
  'thread_detail',
  'chat_sidebar'
];

const AD_PAYMENT_COMPLETED_STATUSES = ['completed', 'paid', 'succeeded'] as const;

const normalizePlacement = (value: any, fallback = 'community_feed') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  return AD_PLACEMENT_ALIASES[raw] || raw;
};

const parseTargeting = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
};

const isVideoMedia = (value: any) => {
  const mimeType = String(value?.mimeType || value?.mime_type || value?.type || '').toLowerCase();
  const url = String(value?.url || value?.downloadUrl || value?.download_url || '').toLowerCase();
  return mimeType === 'video' || mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};

const hasSettledPaymentSnapshot = (ad: any) => {
  if (String(ad?.paymentTransactionId || '').trim()) return true;
  const payments = Array.isArray(ad?.payments) ? ad.payments : [];
  return payments.some((payment) =>
    AD_PAYMENT_COMPLETED_STATUSES.includes(String(payment?.status || '').trim().toLowerCase() as any)
  );
};

const resolvePlacements = (ad: any) => {
  const targeting = parseTargeting(ad?.targeting);
  const candidates = [
    ...(Array.isArray(targeting.placements) ? targeting.placements : []),
    ...(Array.isArray(ad?.placements) ? ad.placements : []),
    ad?.placement
  ];
  return Array.from(
    new Set(
      candidates
        .map((entry) => normalizePlacement(entry))
        .filter((entry) => DEFAULT_ALLOWED_PLACEMENTS.includes(entry))
    )
  );
};

const loadMediaFacts = async (ad: any) => {
  const directMedia = Array.isArray(ad?.media) ? ad.media : [];
  if (directMedia.length > 0) {
    const assetCount = directMedia.length;
    const hasVideoCreative = directMedia.some((entry) => isVideoMedia(entry));
    return { assetCount, hasVideoCreative };
  }

  const mediaFileIds = Array.isArray(ad?.mediaFileIds)
    ? ad.mediaFileIds.map((id: any) => String(id || '').trim()).filter(Boolean)
    : [];
  if (mediaFileIds.length === 0) {
    return { assetCount: 0, hasVideoCreative: false };
  }

  const files = await prisma.file.findMany({
    where: { id: { in: mediaFileIds } },
    select: { id: true, mimeType: true, url: true, originalName: true }
  });
  return {
    assetCount: files.length,
    hasVideoCreative: files.some((file) => isVideoMedia(file))
  };
};

export type CommunityAdActivationReadiness = {
  canActivate: boolean;
  blockers: string[];
  placements: string[];
  assetCount: number;
  hasVideoCreative: boolean;
  hasSettledPayment: boolean;
};

export const buildCommunityAdActivationReadiness = async (ad: any): Promise<CommunityAdActivationReadiness> => {
  const blockers: string[] = [];
  const placements = resolvePlacements(ad);
  const hasSettledPayment =
    hasSettledPaymentSnapshot(ad) ||
    Boolean(
      ad?.id &&
        (await prisma.adPayment.findFirst({
          where: {
            adId: String(ad.id),
            status: { in: [...AD_PAYMENT_COMPLETED_STATUSES] }
          },
          select: { id: true }
        }))
    );

  const now = Date.now();
  const remainingBudget = Number(ad?.remainingBudget ?? ad?.budget ?? 0);
  const startTime = ad?.startAt ? new Date(ad.startAt).getTime() : null;
  const endTime = ad?.endAt ? new Date(ad.endAt).getTime() : null;
  const { assetCount, hasVideoCreative } = await loadMediaFacts(ad);
  const objective = String(ad?.objective || 'traffic').trim().toLowerCase();
  const destinationType = String(ad?.destinationType || 'url').trim().toLowerCase();
  const destinationUrl = String(ad?.destinationUrl || '').trim();

  if (!hasSettledPayment) blockers.push('Campaign has no settled payment record.');
  if (remainingBudget <= 0) blockers.push('Campaign has no remaining budget.');
  if (!placements.length) blockers.push('Campaign has no valid delivery placements.');
  if (startTime && startTime > now) blockers.push('Campaign flight has not started yet.');
  if (endTime && endTime < now) blockers.push('Campaign flight has ended.');
  if (objective === 'traffic' && destinationType !== 'messages' && !destinationUrl) {
    blockers.push('Traffic campaigns require a destination URL.');
  }
  if (placements.includes('scroll_feed') && assetCount <= 0) {
    blockers.push('Scroll feed delivery requires at least one creative asset.');
  }
  if (placements.includes('scroll_preroll') && !hasVideoCreative) {
    blockers.push('Scroll pre-roll delivery requires at least one video creative.');
  }

  return {
    canActivate: blockers.length === 0,
    blockers,
    placements,
    assetCount,
    hasVideoCreative,
    hasSettledPayment
  };
};
