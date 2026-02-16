import prisma from '../../utils/prismaClient';
import { updateConversationSummary } from './scrolitha.memory';
import type { ScrolithaActor } from './scrolitha.types';

const MAX_RECENT_GOALS = 10;
const MAX_RECENT_PAGES = 12;
const MAX_TOPICS = 30;

const normalizeText = (value: unknown) => String(value || '').trim();

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9_#@]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

const TOPIC_MATCHERS: Array<{ topic: string; patterns: RegExp[] }> = [
  { topic: 'jobs', patterns: [/\bjob(s)?\b/i, /\bhir(e|ing)\b/i, /\brecruit(ment|er)?\b/i] },
  { topic: 'gigs', patterns: [/\bgig(s)?\b/i, /\bservice(s)?\b/i, /\bpackage(s)?\b/i] },
  { topic: 'proposals', patterns: [/\bproposal(s)?\b/i, /\bbid(s|ding)?\b/i] },
  { topic: 'projects', patterns: [/\bproject(s)?\b/i, /\bbrief(s)?\b/i, /\bmilestone(s)?\b/i] },
  { topic: 'messages', patterns: [/\bmessage(s|ing)?\b/i, /\binbox\b/i, /\bchat\b/i] },
  { topic: 'community', patterns: [/\bcommunity\b/i, /\bpost(s|ing)?\b/i, /\bcomment(s)?\b/i] },
  { topic: 'notifications', patterns: [/\bnotification(s)?\b/i, /\balert(s)?\b/i] },
  { topic: 'wallet', patterns: [/\bwallet\b/i, /\bgcoin\b/i, /\bbalance\b/i, /\bescrow\b/i] },
  { topic: 'files', patterns: [/\bupload(s|ed|ing)?\b/i, /\bfile(s)?\b/i, /\battachment(s)?\b/i] },
  { topic: 'profile', patterns: [/\bprofile\b/i, /\bportfolio\b/i, /\bsettings\b/i] },
  { topic: 'safety', patterns: [/\bsafety\b/i, /\bmoderation\b/i, /\bpolicy\b/i, /\breport\b/i] },
  { topic: 'ads', patterns: [/\bad(s|vertising)?\b/i, /\bpromot(ed|ion)?\b/i] },
  { topic: 'support', patterns: [/\bsupport\b/i, /\bhelp\b/i, /\bissue(s)?\b/i, /\berror(s)?\b/i] }
];

const extractTopics = (text: string) => {
  const source = normalizeText(text);
  if (!source) return [] as string[];
  const topics = new Set<string>();

  for (const matcher of TOPIC_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(source))) {
      topics.add(matcher.topic);
    }
  }

  // Keep lightweight hashtag-driven topic memory as user interest hints.
  tokenize(source)
    .filter((token) => token.startsWith('#') && token.length > 2)
    .slice(0, 10)
    .forEach((token) => topics.add(`tag:${token.slice(1)}`));

  return Array.from(topics);
};

const pickGoalSnippet = (message: string) => {
  const source = normalizeText(message).replace(/\s+/g, ' ');
  if (!source) return '';
  const clipped = source.slice(0, 180);
  return clipped;
};

const pushUnique = (items: string[], value: string, max: number) => {
  const clean = normalizeText(value);
  if (!clean) return items.slice(0, max);
  const next = [clean, ...items.filter((entry) => normalizeText(entry).toLowerCase() !== clean.toLowerCase())];
  return next.slice(0, max);
};

const sanitizeTopicFrequency = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, number> = {};
  for (const [key, count] of Object.entries(value as Record<string, any>)) {
    const topic = normalizeText(key).toLowerCase();
    const n = Math.floor(Number(count));
    if (!topic || !Number.isFinite(n) || n <= 0) continue;
    output[topic] = Math.max(1, Math.min(50_000, n));
  }
  return output;
};

type LearningProfile = {
  totalInteractions: number;
  lastInteractionAt: string;
  lastConversationId?: string | null;
  topicFrequency: Record<string, number>;
  recentGoals: string[];
  recentPages: string[];
};

const normalizeLearningProfile = (value: unknown): LearningProfile => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
  const totalInteractions = Math.max(0, Math.floor(Number(src.totalInteractions || 0)));
  const lastInteractionAt = normalizeText(src.lastInteractionAt) || new Date().toISOString();
  const lastConversationId = normalizeText(src.lastConversationId) || null;
  const recentGoals = Array.isArray(src.recentGoals)
    ? src.recentGoals.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, MAX_RECENT_GOALS)
    : [];
  const recentPages = Array.isArray(src.recentPages)
    ? src.recentPages.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, MAX_RECENT_PAGES)
    : [];

  return {
    totalInteractions,
    lastInteractionAt,
    lastConversationId,
    topicFrequency: sanitizeTopicFrequency(src.topicFrequency),
    recentGoals,
    recentPages
  };
};

const readLearningPolicy = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { enabled: true };
  }
  const learning = (metadata as Record<string, any>).learning;
  if (!learning || typeof learning !== 'object' || Array.isArray(learning)) {
    return { enabled: true };
  }
  return {
    enabled: learning.enabled !== false
  };
};

const summarizeLearningState = (profile: LearningProfile) => {
  const sortedTopics = Object.entries(profile.topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => `${topic}(${count})`);

  const lastGoal = profile.recentGoals[0] || '';
  const summaryParts = [
    sortedTopics.length ? `Top topics: ${sortedTopics.join(', ')}` : null,
    lastGoal ? `Current goal: ${lastGoal}` : null
  ].filter(Boolean);

  return summaryParts.join(' | ').slice(0, 380);
};

export const persistScrolithaLearningSignal = async (input: {
  actor: ScrolithaActor;
  conversationId: string;
  userMessage: string;
  assistantReply: string;
  pageContext?: string | null;
  scopeMetadata?: unknown;
}) => {
  const actorId = normalizeText(input.actor?.id);
  if (!actorId) return null;

  const policy = readLearningPolicy(input.scopeMetadata);
  if (!policy.enabled) return null;

  const existingPreference = await prisma.scrolithaUserPreference.findUnique({
    where: { userId: actorId }
  });

  const baseMetadata =
    existingPreference?.metadata &&
    typeof existingPreference.metadata === 'object' &&
    !Array.isArray(existingPreference.metadata)
      ? { ...(existingPreference.metadata as Record<string, any>) }
      : {};

  const currentProfile = normalizeLearningProfile((baseMetadata as any).learningProfile);
  const topics = Array.from(
    new Set([...extractTopics(input.userMessage), ...extractTopics(input.assistantReply)])
  );

  const nextTopicFrequency: Record<string, number> = { ...currentProfile.topicFrequency };
  for (const topic of topics) {
    const key = normalizeText(topic).toLowerCase();
    if (!key) continue;
    nextTopicFrequency[key] = Math.min(50_000, (nextTopicFrequency[key] || 0) + 1);
  }

  const trimmedTopicFrequency = Object.fromEntries(
    Object.entries(nextTopicFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOPICS)
  );

  const goalSnippet = pickGoalSnippet(input.userMessage);
  const pageValue = normalizeText(input.pageContext);
  const nextProfile: LearningProfile = {
    totalInteractions: currentProfile.totalInteractions + 1,
    lastInteractionAt: new Date().toISOString(),
    lastConversationId: normalizeText(input.conversationId) || currentProfile.lastConversationId || null,
    topicFrequency: trimmedTopicFrequency,
    recentGoals: goalSnippet
      ? pushUnique(currentProfile.recentGoals, goalSnippet, MAX_RECENT_GOALS)
      : currentProfile.recentGoals,
    recentPages: pageValue
      ? pushUnique(currentProfile.recentPages, pageValue, MAX_RECENT_PAGES)
      : currentProfile.recentPages
  };

  (baseMetadata as any).learningProfile = nextProfile;

  await prisma.scrolithaUserPreference.upsert({
    where: { userId: actorId },
    create: {
      userId: actorId,
      quickActions: [],
      troubleshootingMode: 'standard',
      assistantTone: 'concise',
      metadata: baseMetadata
    },
    update: {
      metadata: baseMetadata
    }
  });

  const summary = summarizeLearningState(nextProfile);
  if (summary) {
    await updateConversationSummary(input.conversationId, summary);
  }

  return {
    totalInteractions: nextProfile.totalInteractions,
    topTopics: Object.entries(nextProfile.topicFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([topic, count]) => ({ topic, count })),
    lastGoal: nextProfile.recentGoals[0] || null,
    updatedAt: nextProfile.lastInteractionAt
  };
};

export const buildScrolithaLearningContext = async (input: {
  actor: ScrolithaActor;
  conversationId?: string | null;
}) => {
  const actorId = normalizeText(input.actor?.id);
  if (!actorId) return '';

  const [preference, recentConversations] = await Promise.all([
    prisma.scrolithaUserPreference.findUnique({
      where: { userId: actorId },
      select: { metadata: true }
    }),
    prisma.scrolithaConversation.findMany({
      where: {
        userId: actorId,
        scope: input.actor.scope
      },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      select: {
        id: true,
        summary: true,
        pageContext: true,
        updatedAt: true
      }
    })
  ]);

  const metadata =
    preference?.metadata && typeof preference.metadata === 'object' && !Array.isArray(preference.metadata)
      ? (preference.metadata as Record<string, any>)
      : {};
  const learningProfile = normalizeLearningProfile((metadata as any).learningProfile);
  const topTopics = Object.entries(learningProfile.topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => `${topic}(${count})`);

  const summaryLines = recentConversations
    .filter((entry) => normalizeText(entry.summary))
    .slice(0, 3)
    .map((entry) => {
      const page = normalizeText(entry.pageContext);
      return `- ${entry.summary}${page ? ` [page=${page}]` : ''}`;
    });

  const lines = [
    `Known user learning profile:`,
    `- Interactions recorded: ${learningProfile.totalInteractions}`,
    topTopics.length ? `- Frequent topics: ${topTopics.join(', ')}` : '- Frequent topics: none yet',
    learningProfile.recentGoals.length
      ? `- Recent user goals: ${learningProfile.recentGoals.slice(0, 3).join(' | ')}`
      : '- Recent user goals: none captured',
    learningProfile.recentPages.length
      ? `- Recent page contexts: ${learningProfile.recentPages.slice(0, 4).join(', ')}`
      : '- Recent page contexts: none captured',
    summaryLines.length ? `- Recent conversation summaries:\n${summaryLines.join('\n')}` : '- Recent summaries: none'
  ];

  const context = lines.join('\n').trim();
  if (context.length <= 3200) return context;
  return `${context.slice(0, 3200)}...`;
};

export const getScrolithaLearningInsightsForAdmin = async (input?: {
  limitUsers?: unknown;
}) => {
  const take = Math.max(1, Math.min(1000, Math.floor(Number(input?.limitUsers || 400))));
  const rows = await prisma.scrolithaUserPreference.findMany({
    take,
    orderBy: { updatedAt: 'desc' },
    select: {
      userId: true,
      updatedAt: true,
      metadata: true
    }
  });

  let trackedUsers = 0;
  let totalInteractions = 0;
  const topicRollup: Record<string, number> = {};

  const users = rows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, any>)
        : {};
    const profile = normalizeLearningProfile((metadata as any).learningProfile);
    const hasLearningData =
      profile.totalInteractions > 0 ||
      Object.keys(profile.topicFrequency).length > 0 ||
      profile.recentGoals.length > 0;
    if (hasLearningData) trackedUsers += 1;
    totalInteractions += profile.totalInteractions;

    for (const [topic, count] of Object.entries(profile.topicFrequency)) {
      topicRollup[topic] = (topicRollup[topic] || 0) + count;
    }

    return {
      userId: row.userId,
      updatedAt: row.updatedAt,
      totalInteractions: profile.totalInteractions,
      topTopics: Object.entries(profile.topicFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),
      recentGoals: profile.recentGoals.slice(0, 3),
      recentPages: profile.recentPages.slice(0, 4)
    };
  });

  return {
    totals: {
      usersScanned: rows.length,
      usersWithLearningProfile: trackedUsers,
      totalInteractions
    },
    topTopics: Object.entries(topicRollup)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([topic, count]) => ({ topic, count })),
    users
  };
};

