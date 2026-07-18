/**
 * Phase 20.7.1 — Typed rich response cards for Scrolitha messaging surfaces.
 * Cards are data-only (never raw HTML). Frontend renders trusted components.
 */
import { createHash } from 'crypto';

export type ScrolithaCardType =
  | 'job'
  | 'freelancer'
  | 'employer'
  | 'profile'
  | 'marketplace'
  | 'community'
  | 'company'
  | 'resume'
  | 'notification'
  | 'contract'
  | 'project'
  | 'wallet'
  | 'post_draft'
  | 'navigation'
  | 'confirmation'
  | 'error'
  | 'unknown';

export type ScrolithaCardAction = {
  id: string;
  label: string;
  kind: 'navigate' | 'confirm' | 'dismiss' | 'copy' | 'retry' | 'open_entity';
  href?: string | null;
  toolKey?: string | null;
  actionId?: string | null;
  confirmationToken?: string | null;
  primary?: boolean;
};

export type ScrolithaEntityCard = {
  type: ScrolithaCardType;
  version: 1;
  id: string;
  entityId: string | null;
  title: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  actions: ScrolithaCardAction[];
  deepLink: string | null;
  imageUrl: string | null;
  accessibilityLabel: string;
};

const CARD_VERSION = 1 as const;

const safe = (v: unknown, max = 240) => String(v ?? '').trim().slice(0, max);
const idFrom = (...parts: unknown[]) =>
  createHash('sha1')
    .update(parts.map((p) => String(p ?? '')).join('|'))
    .digest('hex')
    .slice(0, 16);

const baseCard = (input: {
  type: ScrolithaCardType;
  entityId?: string | null;
  title: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  actions?: ScrolithaCardAction[];
  deepLink?: string | null;
  imageUrl?: string | null;
  seed?: string;
}): ScrolithaEntityCard => {
  const entityId = input.entityId ? safe(input.entityId, 80) : null;
  const title = safe(input.title, 120) || 'Scrolitha';
  const summary = safe(input.summary, 400) || '';
  const deepLink = input.deepLink ? safe(input.deepLink, 300) : null;
  const type = input.type;
  return {
    type,
    version: CARD_VERSION,
    id: `card_${type}_${idFrom(type, entityId, title, input.seed || '')}`,
    entityId,
    title,
    summary,
    metadata: input.metadata || {},
    actions: Array.isArray(input.actions) ? input.actions.slice(0, 6) : [],
    deepLink,
    imageUrl: input.imageUrl ? safe(input.imageUrl, 500) : null,
    accessibilityLabel: `${title}. ${summary}`.trim().slice(0, 200)
  };
};

/** Normalize unknown card payloads — drop invalid shapes, never throw. */
export const normalizeScrolithaCard = (raw: unknown): ScrolithaEntityCard | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, any>;
  const typeRaw = safe(o.type, 40).toLowerCase();
  const known: ScrolithaCardType[] = [
    'job',
    'freelancer',
    'employer',
    'profile',
    'marketplace',
    'community',
    'company',
    'resume',
    'notification',
    'contract',
    'project',
    'wallet',
    'post_draft',
    'navigation',
    'confirmation',
    'error',
    'unknown'
  ];
  const type = (known.includes(typeRaw as ScrolithaCardType) ? typeRaw : 'unknown') as ScrolithaCardType;
  const title = safe(o.title, 120);
  if (!title) return null;
  const actions = Array.isArray(o.actions)
    ? o.actions
        .map((a: any, idx: number): ScrolithaCardAction | null => {
          if (!a || typeof a !== 'object') return null;
          const label = safe(a.label, 60);
          if (!label) return null;
          const kindRaw = safe(a.kind, 30);
          const kind = (
            ['navigate', 'confirm', 'dismiss', 'copy', 'retry', 'open_entity'].includes(kindRaw)
              ? kindRaw
              : 'navigate'
          ) as ScrolithaCardAction['kind'];
          return {
            id: safe(a.id, 80) || `action_${idx}`,
            label,
            kind,
            href: a.href ? safe(a.href, 300) : null,
            toolKey: a.toolKey ? safe(a.toolKey, 80) : null,
            actionId: a.actionId ? safe(a.actionId, 80) : null,
            confirmationToken: a.confirmationToken ? safe(a.confirmationToken, 200) : null,
            primary: Boolean(a.primary)
          };
        })
        .filter(Boolean)
        .slice(0, 6) as ScrolithaCardAction[]
    : [];

  const metadata: Record<string, string | number | boolean | null> = {};
  if (o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)) {
    for (const [k, v] of Object.entries(o.metadata).slice(0, 20)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        metadata[safe(k, 40)] = typeof v === 'string' ? safe(v, 200) : v;
      }
    }
  }

  return baseCard({
    type,
    entityId: o.entityId || o.entity_id || null,
    title,
    summary: safe(o.summary, 400),
    metadata,
    actions,
    deepLink: o.deepLink || o.deep_link || null,
    imageUrl: o.imageUrl || o.image_url || null,
    seed: o.id || ''
  });
};

export const normalizeScrolithaCards = (raw: unknown, limit = 8): ScrolithaEntityCard[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeScrolithaCard(item))
    .filter(Boolean)
    .slice(0, limit) as ScrolithaEntityCard[];
};

export const buildNavigationCard = (input: {
  title: string;
  summary: string;
  deepLink: string;
  entityId?: string | null;
}): ScrolithaEntityCard =>
  baseCard({
    type: 'navigation',
    entityId: input.entityId || null,
    title: input.title,
    summary: input.summary,
    deepLink: input.deepLink,
    actions: [
      {
        id: 'open',
        label: 'Open',
        kind: 'navigate',
        href: input.deepLink,
        primary: true
      }
    ]
  });

export const buildConfirmationCard = (input: {
  title: string;
  summary: string;
  actionId: string;
  toolKey: string;
  confirmationToken: string;
  reversible?: boolean;
  deepLink?: string | null;
}): ScrolithaEntityCard =>
  baseCard({
    type: 'confirmation',
    entityId: input.actionId,
    title: input.title,
    summary: input.summary,
    deepLink: input.deepLink || null,
    metadata: {
      toolKey: input.toolKey,
      reversible: input.reversible !== false,
      requiresConfirmation: true
    },
    actions: [
      {
        id: 'confirm',
        label: 'Confirm',
        kind: 'confirm',
        actionId: input.actionId,
        toolKey: input.toolKey,
        confirmationToken: input.confirmationToken,
        primary: true
      },
      {
        id: 'cancel',
        label: 'Cancel',
        kind: 'dismiss'
      }
    ]
  });

export const buildErrorCard = (input: { title?: string; summary: string; retryable?: boolean }): ScrolithaEntityCard =>
  baseCard({
    type: 'error',
    title: input.title || 'Something went wrong',
    summary: input.summary,
    metadata: { retryable: Boolean(input.retryable) },
    actions: input.retryable
      ? [{ id: 'retry', label: 'Retry', kind: 'retry', primary: true }]
      : []
  });

export const buildWalletCard = (input: {
  balance?: number | null;
  currency?: string | null;
  deepLink?: string | null;
  summary?: string;
}): ScrolithaEntityCard => {
  const currency = safe(input.currency || 'USD', 8) || 'USD';
  const balance = typeof input.balance === 'number' ? input.balance : null;
  return baseCard({
    type: 'wallet',
    entityId: 'wallet',
    title: 'Wallet summary',
    summary: input.summary || (balance != null ? `${currency} ${balance.toFixed(2)} available` : 'Wallet overview'),
    deepLink: input.deepLink || '/client/dashboard?tab=wallet',
    metadata: {
      balance,
      currency
    },
    actions: [
      {
        id: 'open_wallet',
        label: 'Open wallet',
        kind: 'navigate',
        href: input.deepLink || '/client/dashboard?tab=wallet',
        primary: true
      }
    ]
  });
};

export const buildProfileCard = (input: {
  userId?: string | null;
  name?: string | null;
  headline?: string | null;
  deepLink?: string | null;
  imageUrl?: string | null;
}): ScrolithaEntityCard =>
  baseCard({
    type: 'profile',
    entityId: input.userId || null,
    title: safe(input.name, 80) || 'Profile',
    summary: safe(input.headline, 200) || 'View profile details',
    deepLink: input.deepLink || (input.userId ? `/profile/${input.userId}` : '/profile/edit'),
    imageUrl: input.imageUrl || null,
    actions: [
      {
        id: 'open_profile',
        label: 'View profile',
        kind: 'open_entity',
        href: input.deepLink || (input.userId ? `/profile/${input.userId}` : '/profile/edit'),
        primary: true
      }
    ]
  });

/**
 * Build entity cards from orchestrator suggested actions + optional tool results.
 */
export const buildCardsFromSuggestedActions = (
  suggestedActions: Array<{
    actionId?: string;
    actionKey?: string;
    toolKey?: string;
    summary?: string;
    requiresConfirmation?: boolean;
    paramsPreview?: Record<string, any>;
    deepLink?: string | null;
  }> = [],
  options?: { confirmationTokens?: Record<string, string> }
): ScrolithaEntityCard[] => {
  const cards: ScrolithaEntityCard[] = [];
  for (const action of suggestedActions.slice(0, 8)) {
    const toolKey = safe(action.toolKey, 80);
    const summary = safe(action.summary, 300) || 'Suggested action';
    const actionId = safe(action.actionId, 80);
    if (action.requiresConfirmation && actionId) {
      cards.push(
        buildConfirmationCard({
          title: safe(action.actionKey || toolKey || 'Confirm action', 80),
          summary,
          actionId,
          toolKey: toolKey || 'UNKNOWN',
          confirmationToken: options?.confirmationTokens?.[actionId] || '',
          reversible: !/delete|block|cancel|pay/i.test(`${toolKey} ${summary}`)
        })
      );
      continue;
    }
    const deepLink =
      action.deepLink ||
      (action.paramsPreview?.deepLink as string | undefined) ||
      (action.paramsPreview?.href as string | undefined) ||
      null;
    if (deepLink) {
      cards.push(
        buildNavigationCard({
          title: safe(action.actionKey || toolKey || 'Open', 80),
          summary,
          deepLink: String(deepLink)
        })
      );
    }
  }
  return cards;
};

export const buildCardsFromToolResult = (
  toolKey: string,
  result: any,
  deepLink?: string | null
): ScrolithaEntityCard[] => {
  const key = safe(toolKey, 80).toUpperCase();
  const cards: ScrolithaEntityCard[] = [];

  if (key === 'GET_MY_WALLET_SUMMARY' && result) {
    cards.push(
      buildWalletCard({
        balance: result?.wallet?.availableBalance ?? result?.availableBalance ?? result?.balance ?? null,
        currency: result?.wallet?.currency ?? result?.currency ?? 'USD',
        deepLink: deepLink || '/client/dashboard?tab=wallet',
        summary: safe(result?.resultSummary, 200) || undefined
      })
    );
  }

  if (key === 'GET_ME_PROFILE' && result) {
    const user = result.user || result;
    const profile = result.profile || {};
    cards.push(
      buildProfileCard({
        userId: user?.id || null,
        name: user?.name || profile?.displayName || null,
        headline: profile?.headline || profile?.title || null,
        deepLink: deepLink || '/profile/edit',
        imageUrl: user?.avatar || profile?.avatar || null
      })
    );
  }

  if (key === 'FETCH_NOTIFICATIONS' && Array.isArray(result?.notifications)) {
    for (const n of result.notifications.slice(0, 3)) {
      cards.push(
        baseCard({
          type: 'notification',
          entityId: n?.id || null,
          title: safe(n?.title || 'Notification', 80),
          summary: safe(n?.body || n?.message || '', 200),
          deepLink: n?.link || '/notifications',
          metadata: {
            isRead: Boolean(n?.isRead),
            type: safe(n?.type, 40) || null
          },
          actions: [
            {
              id: 'open',
              label: 'Open',
              kind: 'navigate',
              href: n?.link || '/notifications',
              primary: true
            }
          ]
        })
      );
    }
  }

  if (key === 'SEARCH_USERS' && Array.isArray(result?.users || result?.results)) {
    const users = result.users || result.results;
    for (const u of users.slice(0, 4)) {
      cards.push(
        buildProfileCard({
          userId: u?.id || null,
          name: u?.name || u?.username || 'User',
          headline: u?.headline || u?.role || null,
          deepLink: u?.id ? `/profile/${u.id}` : null,
          imageUrl: u?.avatar || null
        })
      );
    }
  }

  if (!cards.length && deepLink) {
    cards.push(
      buildNavigationCard({
        title: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        summary: 'Open related page',
        deepLink
      })
    );
  }

  return cards.slice(0, 8);
};
