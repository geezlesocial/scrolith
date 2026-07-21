/**
 * Phase 29.5 — Abuse protection heuristics for messaging groups.
 * Configurable thresholds. Recommendations only unless autoRestrict enabled.
 */

export type AbuseSignal =
  | 'flood_messages'
  | 'rapid_joins'
  | 'invite_abuse'
  | 'reaction_spam'
  | 'typing_spam'
  | 'recording_spam'
  | 'mass_mentions'
  | 'duplicate_send'
  | 'attachment_burst';

export type AbuseAssessment = {
  signals: AbuseSignal[];
  score: number; // 0-100 risk
  recommendations: string[];
  autoRestrictSuggested: boolean;
};

type WindowCounter = { timestamps: number[] };

const buckets = new Map<string, WindowCounter>();

const touch = (key: string, windowMs: number, now = Date.now()) => {
  const row = buckets.get(key) || { timestamps: [] };
  row.timestamps = row.timestamps.filter((t) => now - t < windowMs);
  row.timestamps.push(now);
  buckets.set(key, row);
  return row.timestamps.length;
};

export type AbuseConfig = {
  messageFloodPerMinute: number;
  typingPer10s: number;
  reactionPerMinute: number;
  joinPerHour: number;
  inviteCreatePerHour: number;
  maxMentions: number;
  autoRestrict: boolean;
};

export const DEFAULT_ABUSE_CONFIG: AbuseConfig = {
  messageFloodPerMinute: Math.max(10, Number(process.env.MSG_GROUP_FLOOD_PER_MIN || 40)),
  typingPer10s: Math.max(5, Number(process.env.MSG_GROUP_TYPING_PER_10S || 25)),
  reactionPerMinute: Math.max(10, Number(process.env.MSG_GROUP_REACTION_PER_MIN || 60)),
  joinPerHour: Math.max(5, Number(process.env.MSG_GROUP_JOIN_PER_HOUR || 30)),
  inviteCreatePerHour: Math.max(5, Number(process.env.MSG_GROUP_INVITE_PER_HOUR || 30)),
  maxMentions: Math.max(5, Number(process.env.MSG_GROUP_MAX_MENTIONS || 20)),
  autoRestrict: process.env.MSG_GROUP_ABUSE_AUTO_RESTRICT === '1'
};

export const assessMessageSendAbuse = (
  input: {
    userId: string;
    conversationId: string;
    text?: string;
    attachmentCount?: number;
    isDuplicate?: boolean;
  },
  config: AbuseConfig = DEFAULT_ABUSE_CONFIG
): AbuseAssessment => {
  const signals: AbuseSignal[] = [];
  const recommendations: string[] = [];
  const now = Date.now();

  const msgCount = touch(`msg:${input.conversationId}:${input.userId}`, 60_000, now);
  if (msgCount > config.messageFloodPerMinute) {
    signals.push('flood_messages');
    recommendations.push('Enable slow mode or temporary mute for this member.');
  }

  const mentions = (String(input.text || '').match(/@([a-zA-Z0-9._-]{2,40})/g) || []).length;
  if (mentions > config.maxMentions) {
    signals.push('mass_mentions');
    recommendations.push('Cap mentions or restrict canMentionEveryone.');
  }

  if (input.isDuplicate) {
    signals.push('duplicate_send');
    recommendations.push('Client should honor sendAck.duplicate and stop retry storms.');
  }

  if ((input.attachmentCount || 0) >= 8) {
    const burst = touch(`att:${input.conversationId}:${input.userId}`, 60_000, now);
    if (burst > 3) {
      signals.push('attachment_burst');
      recommendations.push('Review attachment limits for this group.');
    }
  }

  const score = Math.min(100, signals.length * 25);
  return {
    signals,
    score,
    recommendations,
    autoRestrictSuggested: config.autoRestrict && score >= 50
  };
};

export const assessTypingAbuse = (userId: string, conversationId: string, config = DEFAULT_ABUSE_CONFIG) => {
  const n = touch(`typ:${conversationId}:${userId}`, 10_000);
  if (n > config.typingPer10s) {
    return {
      signals: ['typing_spam'] as AbuseSignal[],
      score: 40,
      recommendations: ['Rate-limit typing events (already applied server-side).'],
      autoRestrictSuggested: false
    };
  }
  return { signals: [] as AbuseSignal[], score: 0, recommendations: [], autoRestrictSuggested: false };
};

export const assessInviteAbuse = (userId: string, config = DEFAULT_ABUSE_CONFIG) => {
  const n = touch(`inv:${userId}`, 3_600_000);
  if (n > config.inviteCreatePerHour) {
    return {
      signals: ['invite_abuse'] as AbuseSignal[],
      score: 60,
      recommendations: ['Temporarily block invite creation for this user.'],
      autoRestrictSuggested: config.autoRestrict
    };
  }
  return { signals: [] as AbuseSignal[], score: 0, recommendations: [], autoRestrictSuggested: false };
};

export const clearAbuseBucketsForTests = () => buckets.clear();

export const GROUP_ABUSE_VERSION = '29.5';
