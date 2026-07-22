/**
 * Phase 32.0 — Canonical notification taxonomy.
 * Aligns with FE notificationTaxonomy + NI preference categories without replacing them.
 */

export const NOTIFICATION_SCHEMA_VERSION = '32.0';

export type NotificationCenterCategory =
  | 'personal'
  | 'messaging'
  | 'messaging_groups'
  | 'jobs'
  | 'marketplace'
  | 'communities'
  | 'business'
  | 'wallet'
  | 'security'
  | 'support'
  | 'system'
  | 'admin';

export type NotificationPriorityLevel =
  | 'critical'
  | 'high'
  | 'normal'
  | 'low'
  | 'silent';

export const ALL_NOTIFICATION_CATEGORIES: NotificationCenterCategory[] = [
  'personal',
  'messaging',
  'messaging_groups',
  'jobs',
  'marketplace',
  'communities',
  'business',
  'wallet',
  'security',
  'support',
  'system',
  'admin'
];

export const ALL_PRIORITY_LEVELS: NotificationPriorityLevel[] = [
  'critical',
  'high',
  'normal',
  'low',
  'silent'
];

/** Map legacy / engagement / messaging types → Phase 32 category */
const TYPE_CATEGORY_RULES: Array<{ test: RegExp; category: NotificationCenterCategory }> = [
  { test: /support|ticket/i, category: 'support' },
  { test: /security|login|password|2fa|device|kyc|verification/i, category: 'security' },
  { test: /wallet|payment|transfer|withdraw|deposit|gcoin|payout/i, category: 'wallet' },
  { test: /^(dm|message|chat|direct_message)/i, category: 'messaging' },
  { test: /group|conversation_invite|join_request|group_pin/i, category: 'messaging_groups' },
  { test: /job|proposal|interview|application|gig/i, category: 'jobs' },
  { test: /order|marketplace|listing|delivery|offer|review_marketplace/i, category: 'marketplace' },
  { test: /community|club|forum|event|story|scroll/i, category: 'communities' },
  { test: /business|lead|company_page/i, category: 'business' },
  { test: /admin|moderation|staff/i, category: 'admin' },
  { test: /mention|like|reaction|comment|reply|follow|repost|profile_view/i, category: 'personal' },
  { test: /system|maintenance|release|announcement|journey/i, category: 'system' }
];

export function resolveNotificationCategory(
  type: string,
  explicit?: string | null
): NotificationCenterCategory {
  const raw = String(explicit || '').trim().toLowerCase().replace(/-/g, '_');
  if ((ALL_NOTIFICATION_CATEGORIES as string[]).includes(raw)) {
    return raw as NotificationCenterCategory;
  }
  // Map NI preference categories
  const niMap: Record<string, NotificationCenterCategory> = {
    messages: 'messaging',
    mentions: 'personal',
    comments: 'personal',
    likes: 'personal',
    replies: 'personal',
    followers: 'personal',
    jobs: 'jobs',
    marketplace: 'marketplace',
    communities: 'communities',
    companies: 'business',
    system: 'system',
    social: 'personal',
    messaging: 'messaging',
    security: 'security',
    commerce: 'marketplace',
    journey: 'system',
    moderation: 'admin',
    unknown: 'system'
  };
  if (niMap[raw]) return niMap[raw];

  const t = String(type || '');
  for (const rule of TYPE_CATEGORY_RULES) {
    if (rule.test.test(t)) return rule.category;
  }
  return 'system';
}

export function resolvePriorityLevel(
  explicit?: string | null,
  category?: NotificationCenterCategory
): NotificationPriorityLevel {
  const raw = String(explicit || '').trim().toLowerCase();
  if ((ALL_PRIORITY_LEVELS as string[]).includes(raw)) {
    return raw as NotificationPriorityLevel;
  }
  // background → silent (NI band compat)
  if (raw === 'background') return 'silent';
  if (category === 'security' || category === 'admin') return 'high';
  if (category === 'messaging' || category === 'messaging_groups') return 'high';
  if (category === 'wallet') return 'high';
  return 'normal';
}

export function defaultDeepLink(input: {
  type?: string | null;
  deepLink?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
}): string | null {
  const explicit = String(input.deepLink || input.meta?.actionUrl || input.meta?.action_url || input.meta?.link || '').trim();
  if (explicit) return explicit.startsWith('/') || explicit.startsWith('http') ? explicit : `/${explicit}`;

  const entityType = String(input.entityType || input.meta?.entityType || '').toLowerCase();
  const entityId = String(input.entityId || input.meta?.entityId || '').trim();
  if (entityType && entityId) {
    if (entityType.includes('conversation') || entityType.includes('message')) {
      return `/messages?conversation=${encodeURIComponent(entityId)}`;
    }
    if (entityType.includes('job')) return `/jobs/${encodeURIComponent(entityId)}`;
    if (entityType.includes('gig')) return `/gigs/${encodeURIComponent(entityId)}`;
    if (entityType.includes('order')) return `/orders/${encodeURIComponent(entityId)}`;
    if (entityType.includes('ticket') || entityType.includes('support')) {
      return `/support?ticket=${encodeURIComponent(entityId)}`;
    }
    if (entityType.includes('post')) return `/posts/${encodeURIComponent(entityId)}`;
  }
  return '/notifications';
}
