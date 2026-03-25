import prisma from '../utils/prismaClient';

export const FEED_SURFACE_MODES = ['for_you', 'following', 'hire', 'sell', 'learn', 'local'] as const;
export type FeedSurfaceMode = (typeof FEED_SURFACE_MODES)[number];

type IntentSignalInput = {
  userId: string;
  entityType: string;
  entityId: string;
  signal: string;
  surface?: string;
  weight?: number;
  meta?: Record<string, any> | null;
};

type ViewerFeedContext = {
  followedTopics: Set<string>;
  interestedTopics: Set<string>;
  hiddenEntityIds: Set<string>;
};

const HIRE_KEYWORDS = ['hire', 'hiring', 'recruit', 'job', 'apply', 'looking for', 'talent', 'contract', 'freelancer needed'];
const SELL_KEYWORDS = ['service', 'offer', 'available', 'package', 'quote', 'book', 'for hire', 'portfolio', 'client work'];
const LEARN_KEYWORDS = ['guide', 'tutorial', 'tips', 'how to', 'lesson', 'case study', 'breakdown', 'insight', 'explained'];

const normalizeText = (value: unknown) => String(value || '').trim();

export const normalizeTopicLabel = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/^#+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 64);

export const slugifyTopicLabel = (value: unknown) =>
  normalizeTopicLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

export const dedupeTopicLabels = (values: Array<unknown>) => {
  const seen = new Set<string>();
  const list: string[] = [];
  values.forEach((value) => {
    const label = normalizeTopicLabel(value);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    list.push(label);
  });
  return list;
};

export const extractTopicCandidates = (...values: Array<unknown>) =>
  dedupeTopicLabels(
    values.flatMap((value) => {
      if (Array.isArray(value)) return value;
      return [value];
    })
  );

export const normalizeFeedSurfaceMode = (value: unknown, fallback: FeedSurfaceMode = 'for_you'): FeedSurfaceMode => {
  const raw = String(value || '').trim().toLowerCase();
  if ((FEED_SURFACE_MODES as readonly string[]).includes(raw)) {
    return raw as FeedSurfaceMode;
  }
  return fallback;
};

export const ensureTopics = async (labels: Array<unknown>, kind = 'general') => {
  const normalized = dedupeTopicLabels(labels);
  if (!normalized.length) return [];

  return Promise.all(
    normalized.map(async (label) => {
      const slug = slugifyTopicLabel(label);
      if (!slug) return null;
      const topic = await prisma.topic.upsert({
        where: { slug },
        update: {
          label,
          kind,
          usageCount: { increment: 1 }
        },
        create: {
          slug,
          label,
          kind,
          usageCount: 1
        }
      });

      await prisma.topicAlias.upsert({
        where: {
          topicId_alias: {
            topicId: topic.id,
            alias: label.toLowerCase()
          }
        },
        update: {},
        create: {
          topicId: topic.id,
          alias: label.toLowerCase()
        }
      });

      return topic;
    })
  ).then((rows) => rows.filter(Boolean));
};

export const resolveTopicByParam = async (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return null;

  const direct = await prisma.topic.findFirst({
    where: {
      OR: [
        { id: raw },
        { slug: slugifyTopicLabel(raw) },
        { label: { equals: raw, mode: 'insensitive' } }
      ]
    }
  });
  if (direct) return direct;

  const alias = await prisma.topicAlias.findFirst({
    where: { alias: raw.toLowerCase() },
    include: { topic: true }
  });
  return alias?.topic || null;
};

export const recordFeedIntentSignal = async (input: IntentSignalInput) => {
  const userId = normalizeText(input.userId);
  const entityId = normalizeText(input.entityId);
  const entityType = normalizeText(input.entityType).toUpperCase();
  const signal = normalizeText(input.signal).toUpperCase();
  if (!userId || !entityId || !entityType || !signal) return null;

  return prisma.feedIntentSignal.create({
    data: {
      userId,
      entityId,
      entityType,
      signal,
      surface: normalizeText(input.surface) || 'community_feed',
      weight: Number.isFinite(Number(input.weight)) ? Number(input.weight) : 1,
      meta: input.meta || undefined
    }
  });
};

export const getViewerFeedContext = async (userId?: string | null): Promise<ViewerFeedContext> => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return {
      followedTopics: new Set<string>(),
      interestedTopics: new Set<string>(),
      hiddenEntityIds: new Set<string>()
    };
  }

  const [topicRows, signalRows, hiddenRows] = await Promise.all([
    prisma.topicFollow.findMany({
      where: { userId: normalizedUserId },
      select: {
        topic: {
          select: {
            label: true,
            slug: true
          }
        }
      }
    }),
    prisma.feedIntentSignal.findMany({
      where: {
        userId: normalizedUserId,
        createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45) }
      },
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: {
        entityId: true,
        signal: true,
        meta: true
      }
    }),
    prisma.savedPipelineItem.findMany({
      where: { userId: normalizedUserId, entityType: 'POST' },
      select: { entityId: true }
    })
  ]);

  const followedTopics = new Set<string>();
  topicRows.forEach((row) => {
    const topic = normalizeTopicLabel(row.topic?.label || row.topic?.slug);
    if (topic) followedTopics.add(topic.toLowerCase());
  });

  const interestedTopics = new Set<string>();
  signalRows.forEach((row) => {
    const topics = Array.isArray((row.meta as any)?.topics) ? (row.meta as any).topics : [];
    topics.forEach((topic: unknown) => {
      const normalized = normalizeTopicLabel(topic);
      if (normalized) interestedTopics.add(normalized.toLowerCase());
    });
  });

  return {
    followedTopics,
    interestedTopics,
    hiddenEntityIds: new Set(hiddenRows.map((row) => String(row.entityId)))
  };
};

const buildKeywordCorpus = (post: {
  title?: string | null;
  content?: string | null;
  topic?: string | null;
  tags?: string[] | null;
}) =>
  `${normalizeText(post.title)} ${normalizeText(post.content)} ${normalizeText(post.topic)} ${Array.isArray(post.tags) ? post.tags.join(' ') : ''}`.toLowerCase();

const matchesKeywordSet = (corpus: string, keywords: string[]) => keywords.some((keyword) => corpus.includes(keyword));

export const scoreCommunityPostForMode = (input: {
  post: {
    id: string;
    authorId?: string | null;
    businessPageId?: string | null;
    title?: string | null;
    content?: string | null;
    topic?: string | null;
    tags?: string[] | null;
    location?: string | null;
    isPinned?: boolean;
    isHighlighted?: boolean;
    viewsCount?: number;
    likesCount?: number;
    sharesCount?: number;
    repostsCount?: number;
    createdAt?: string | Date | null;
  };
  mode: FeedSurfaceMode;
  context: ViewerFeedContext;
  requestedTopic?: string | null;
  requestedRegion?: string | null;
  viewerRegion?: string | null;
}) => {
  const { post, mode, context } = input;
  const topicLabels = dedupeTopicLabels([post.topic, ...(Array.isArray(post.tags) ? post.tags : [])]).map((entry) => entry.toLowerCase());
  const topicSet = new Set(topicLabels);
  const requestedTopic = normalizeTopicLabel(input.requestedTopic).toLowerCase();
  const requestedRegion = normalizeText(input.requestedRegion).toLowerCase();
  const viewerRegion = normalizeText(input.viewerRegion).toLowerCase();
  const corpus = buildKeywordCorpus(post);

  const ageMs = Date.now() - new Date(post.createdAt || Date.now()).getTime();
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));
  const engagementScore =
    Number(post.likesCount || 0) +
    Number(post.sharesCount || 0) * 2 +
    Number(post.repostsCount || 0) * 2 +
    Number(post.viewsCount || 0) * 0.08;

  let score = Math.max(0, 42 - ageHours) + engagementScore;
  const reasons: string[] = [];

  if (post.isPinned) {
    score += 1000;
    reasons.push('Pinned post');
  }
  if (post.isHighlighted) {
    score += 18;
    reasons.push('Highlighted post');
  }

  const followedTopicMatch = topicLabels.find((topic) => context.followedTopics.has(topic));
  if (followedTopicMatch) {
    score += 28;
    reasons.push(`Matches a topic you follow: ${followedTopicMatch}`);
  }

  const interestedTopicMatch = topicLabels.find((topic) => context.interestedTopics.has(topic));
  if (interestedTopicMatch) {
    score += 18;
    reasons.push(`Similar to topics you engaged with recently: ${interestedTopicMatch}`);
  }

  if (requestedTopic && topicSet.has(requestedTopic)) {
    score += 24;
    reasons.push(`Matches the selected topic: ${requestedTopic}`);
  }

  const location = normalizeText(post.location).toLowerCase();
  if ((requestedRegion && location.includes(requestedRegion)) || (viewerRegion && location.includes(viewerRegion))) {
    score += 26;
    reasons.push('Relevant to your location');
  }

  if (mode === 'hire' && matchesKeywordSet(corpus, HIRE_KEYWORDS)) {
    score += 34;
    reasons.push('Strong hiring intent');
  }
  if (mode === 'sell' && (matchesKeywordSet(corpus, SELL_KEYWORDS) || Boolean(post.businessPageId))) {
    score += 34;
    reasons.push('Strong service or selling intent');
  }
  if (mode === 'learn' && matchesKeywordSet(corpus, LEARN_KEYWORDS)) {
    score += 34;
    reasons.push('Strong learning value');
  }
  if (mode === 'local' && location) {
    score += 12;
    reasons.push('Has local context');
  }

  if (mode === 'for_you' && !reasons.length) {
    reasons.push('Recommended from recent community activity');
  }

  return {
    score,
    reasons,
    topicSummary: topicLabels
  };
};
