/**
 * Phase 19.1 — controlled user-safe reason codes for Enterprise Intelligence.
 * Codes must be grounded in existing ranking/recommendation signals.
 * Never expose internal feature weights or private signals.
 */

export type IntelligenceReasonCode =
  | 'FOLLOWING_AUTHOR'
  | 'SHARED_COMMUNITY'
  | 'TOPIC_AFFINITY'
  | 'LOCATION_RELEVANCE'
  | 'HIRING_INTENT'
  | 'SERVICE_INTENT'
  | 'LEARNING_INTENT'
  | 'LOCAL_INTENT'
  | 'TRENDING'
  | 'RECENT_ACTIVITY'
  | 'VERIFIED_ENTITY'
  | 'HIGH_MATCH'
  | 'FEATURED'
  | 'EXPLORATION'
  | 'SPONSORED'
  | 'PINNED'
  | 'HIGHLIGHTED'
  | 'RECOMMENDED';

export type ReasonCodeDefinition = {
  code: IntelligenceReasonCode;
  meaning: string;
  sourceSignal: string;
  safeForClient: true;
  userFacingTemplate: string;
  entityTypes: string[];
  fallbackLabel: string;
};

export const REASON_CODE_CATALOG: Record<IntelligenceReasonCode, ReasonCodeDefinition> = {
  FOLLOWING_AUTHOR: {
    code: 'FOLLOWING_AUTHOR',
    meaning: 'Author is in the viewer follow graph',
    sourceSignal: 'following graph / followed author',
    safeForClient: true,
    userFacingTemplate: 'From someone you follow',
    entityTypes: ['post', 'person', 'community'],
    fallbackLabel: 'From your network'
  },
  SHARED_COMMUNITY: {
    code: 'SHARED_COMMUNITY',
    meaning: 'Shared community membership or affinity',
    sourceSignal: 'shared community / community activity',
    safeForClient: true,
    userFacingTemplate: 'From communities you share',
    entityTypes: ['post', 'community', 'person'],
    fallbackLabel: 'Community activity'
  },
  TOPIC_AFFINITY: {
    code: 'TOPIC_AFFINITY',
    meaning: 'Topic or interest overlap',
    sourceSignal: 'followed/interested topics',
    safeForClient: true,
    userFacingTemplate: 'Matches topics you follow',
    entityTypes: ['post', 'job', 'gig', 'listing', 'page'],
    fallbackLabel: 'Topic match'
  },
  LOCATION_RELEVANCE: {
    code: 'LOCATION_RELEVANCE',
    meaning: 'Geographic relevance to viewer or filter',
    sourceSignal: 'location / region match',
    safeForClient: true,
    userFacingTemplate: 'Relevant to your location',
    entityTypes: ['post', 'job', 'gig', 'listing', 'event'],
    fallbackLabel: 'Near you'
  },
  HIRING_INTENT: {
    code: 'HIRING_INTENT',
    meaning: 'Content matches hire intent mode',
    sourceSignal: 'hire mode keyword scoring',
    safeForClient: true,
    userFacingTemplate: 'Strong hiring intent',
    entityTypes: ['post', 'job'],
    fallbackLabel: 'Hiring'
  },
  SERVICE_INTENT: {
    code: 'SERVICE_INTENT',
    meaning: 'Content matches sell/service intent mode',
    sourceSignal: 'sell mode keyword scoring',
    safeForClient: true,
    userFacingTemplate: 'Strong service or selling intent',
    entityTypes: ['post', 'gig', 'listing'],
    fallbackLabel: 'Service'
  },
  LEARNING_INTENT: {
    code: 'LEARNING_INTENT',
    meaning: 'Content matches learning intent mode',
    sourceSignal: 'learn mode keyword scoring',
    safeForClient: true,
    userFacingTemplate: 'Strong learning value',
    entityTypes: ['post'],
    fallbackLabel: 'Learning'
  },
  LOCAL_INTENT: {
    code: 'LOCAL_INTENT',
    meaning: 'Local context for local intent mode',
    sourceSignal: 'local mode + location field',
    safeForClient: true,
    userFacingTemplate: 'Has local context',
    entityTypes: ['post', 'event', 'listing'],
    fallbackLabel: 'Local'
  },
  TRENDING: {
    code: 'TRENDING',
    meaning: 'Elevated activity or trending marker',
    sourceSignal: 'trending flag / engagement',
    safeForClient: true,
    userFacingTemplate: 'Trending now',
    entityTypes: ['post', 'person', 'page', 'listing'],
    fallbackLabel: 'Trending'
  },
  RECENT_ACTIVITY: {
    code: 'RECENT_ACTIVITY',
    meaning: 'Fresh or recent community activity',
    sourceSignal: 'freshness ranking',
    safeForClient: true,
    userFacingTemplate: 'Recommended from recent community activity',
    entityTypes: ['post', 'story', 'scroll_video'],
    fallbackLabel: 'Recent activity'
  },
  VERIFIED_ENTITY: {
    code: 'VERIFIED_ENTITY',
    meaning: 'Entity carries a verified badge',
    sourceSignal: 'isVerified / verified flags',
    safeForClient: true,
    userFacingTemplate: 'Verified',
    entityTypes: ['person', 'page', 'job', 'gig'],
    fallbackLabel: 'Verified'
  },
  HIGH_MATCH: {
    code: 'HIGH_MATCH',
    meaning: 'Server-provided high-confidence match',
    sourceSignal: 'recommendation match metadata',
    safeForClient: true,
    userFacingTemplate: 'Strong match for you',
    entityTypes: ['person', 'page', 'job', 'gig', 'listing'],
    fallbackLabel: 'Recommended'
  },
  FEATURED: {
    code: 'FEATURED',
    meaning: 'Featured or promoted listing',
    sourceSignal: 'featured / isFeatured flags',
    safeForClient: true,
    userFacingTemplate: 'Featured',
    entityTypes: ['job', 'gig', 'listing'],
    fallbackLabel: 'Featured'
  },
  EXPLORATION: {
    code: 'EXPLORATION',
    meaning: 'Exploration / diversity injection',
    sourceSignal: 'exploration policy tag',
    safeForClient: true,
    userFacingTemplate: 'Something new for you',
    entityTypes: ['post', 'person', 'page'],
    fallbackLabel: 'Explore'
  },
  SPONSORED: {
    code: 'SPONSORED',
    meaning: 'Paid or sponsored placement',
    sourceSignal: 'ad / sponsored marker',
    safeForClient: true,
    userFacingTemplate: 'Sponsored',
    entityTypes: ['ad', 'listing', 'post'],
    fallbackLabel: 'Sponsored'
  },
  PINNED: {
    code: 'PINNED',
    meaning: 'Pinned content',
    sourceSignal: 'isPinned',
    safeForClient: true,
    userFacingTemplate: 'Pinned post',
    entityTypes: ['post'],
    fallbackLabel: 'Pinned'
  },
  HIGHLIGHTED: {
    code: 'HIGHLIGHTED',
    meaning: 'Highlighted content',
    sourceSignal: 'isHighlighted',
    safeForClient: true,
    userFacingTemplate: 'Highlighted post',
    entityTypes: ['post'],
    fallbackLabel: 'Highlighted'
  },
  RECOMMENDED: {
    code: 'RECOMMENDED',
    meaning: 'Generic safe recommendation label',
    sourceSignal: 'isRecommended / default ranking reason',
    safeForClient: true,
    userFacingTemplate: 'Recommended for you',
    entityTypes: ['post', 'person', 'page', 'job', 'gig', 'listing'],
    fallbackLabel: 'Recommended for you'
  }
};

const TEXT_TO_CODE: Array<{ pattern: RegExp; code: IntelligenceReasonCode }> = [
  { pattern: /pinned/i, code: 'PINNED' },
  { pattern: /highlight/i, code: 'HIGHLIGHTED' },
  { pattern: /topic you follow|matches a topic|selected topic/i, code: 'TOPIC_AFFINITY' },
  { pattern: /engaged with recently|similar to topics/i, code: 'TOPIC_AFFINITY' },
  { pattern: /location|local context|near you/i, code: 'LOCATION_RELEVANCE' },
  { pattern: /hiring intent|hiring/i, code: 'HIRING_INTENT' },
  { pattern: /service or selling|selling intent|service/i, code: 'SERVICE_INTENT' },
  { pattern: /learning value|learning/i, code: 'LEARNING_INTENT' },
  { pattern: /sponsored/i, code: 'SPONSORED' },
  { pattern: /verified/i, code: 'VERIFIED_ENTITY' },
  { pattern: /trending/i, code: 'TRENDING' },
  { pattern: /follow/i, code: 'FOLLOWING_AUTHOR' },
  { pattern: /community/i, code: 'SHARED_COMMUNITY' },
  { pattern: /featured/i, code: 'FEATURED' },
  { pattern: /exploration|something new/i, code: 'EXPLORATION' },
  { pattern: /strong match|high match/i, code: 'HIGH_MATCH' },
  { pattern: /recommended|recent community activity|active job|active gig|marketplace|people to follow|pages to follow/i, code: 'RECOMMENDED' },
  { pattern: /recent|fresh|story|scroll/i, code: 'RECENT_ACTIVITY' }
];

export const labelForReasonCode = (code: string | null | undefined): string | null => {
  const key = String(code || '').trim().toUpperCase() as IntelligenceReasonCode;
  if (key && REASON_CODE_CATALOG[key]) return REASON_CODE_CATALOG[key].userFacingTemplate;
  return null;
};

/** Infer a safe code from existing human-readable reason text (best-effort). */
export const inferReasonCodeFromText = (text: unknown): IntelligenceReasonCode | null => {
  const value = String(text || '').trim();
  if (!value) return null;
  for (const entry of TEXT_TO_CODE) {
    if (entry.pattern.test(value)) return entry.code;
  }
  return 'RECOMMENDED';
};

export const mapReasonCodesFromTexts = (texts: unknown[]): IntelligenceReasonCode[] => {
  const out: IntelligenceReasonCode[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const code = inferReasonCodeFromText(text);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
};
