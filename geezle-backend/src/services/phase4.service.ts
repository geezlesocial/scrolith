import { randomBytes } from 'crypto';
import prisma from '../utils/prismaClient';
import {
  DEV_APP_STATUS,
  getOrCreateDeveloperPlatformConfig,
  getOrCreateDeveloperUserFromAuth,
  hashSensitiveValue,
  normalizeScopes,
  sanitizePlatformUrls,
  sanitizeUrlOrNull,
  toDeveloperAppResponse,
  type AuthActor
} from './developerPlatform.service';
import { getDiscoveryV2 } from './phase2.service';

const WEBHOOK_SCOPE_PREFIX = 'developer_webhooks:';
const WIDGET_SCOPE_PREFIX = 'developer_widgets:';
const DEFAULT_PUBLIC_LIMIT = 20;

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};
const toIso = (value: unknown) => {
  if (!value) return null;
  try {
    return new Date(value as any).toISOString();
  } catch {
    return null;
  }
};
const nowIso = () => new Date().toISOString();
const containsFilter = (query: string) => ({ contains: query, mode: 'insensitive' as const });

const EVENT_CATALOG = [
  { key: 'post.created', category: 'community', description: 'A public community post was created.' },
  { key: 'post.updated', category: 'community', description: 'A community post was updated.' },
  { key: 'comment.created', category: 'community', description: 'A comment or reply was created.' },
  { key: 'reaction.created', category: 'engagement', description: 'A reaction was added.' },
  { key: 'repost.created', category: 'engagement', description: 'A repost was created.' },
  { key: 'job.created', category: 'marketplace', description: 'A job listing was published.' },
  { key: 'gig.created', category: 'marketplace', description: 'A gig listing was published.' },
  { key: 'order.paid', category: 'commerce', description: 'An order payment completed.' },
  { key: 'payout.updated', category: 'commerce', description: 'A payout or withdrawal status changed.' },
  { key: 'workspace.updated', category: 'workspaces', description: 'A project workspace changed.' },
  { key: 'translation.ready', category: 'localization', description: 'A content translation became available.' }
];

const WIDGET_CATALOG = [
  {
    key: 'profile-card',
    label: 'Profile Card',
    description: 'Embed a verified Scrolith profile, trust badge, and follow CTA on external sites.',
    scriptPath: '/widgets/profile-card.js'
  },
  {
    key: 'job-board',
    label: 'Job Board',
    description: 'Embed selected Scrolith jobs with search and application links.',
    scriptPath: '/widgets/job-board.js'
  },
  {
    key: 'creator-feed',
    label: 'Creator Feed',
    description: 'Embed posts, campaigns, and creator-commerce cards.',
    scriptPath: '/widgets/creator-feed.js'
  },
  {
    key: 'scrolitha-assistant',
    label: 'Scrolitha Assistant',
    description: 'Embed the Scrolitha support or discovery assistant with governed prompts.',
    scriptPath: '/widgets/scrolitha-assistant.js'
  }
];

const PUBLIC_ENDPOINTS = [
  { method: 'GET', path: '/api/public/v1/catalog', auth: 'none', description: 'Public API catalog and capability metadata.' },
  { method: 'GET', path: '/api/public/v1/search', auth: 'none', description: 'Unified public search over posts, jobs, gigs, pages, and people.' },
  { method: 'GET', path: '/api/public/v1/posts', auth: 'none', description: 'Public community posts.' },
  { method: 'GET', path: '/api/public/v1/jobs', auth: 'none', description: 'Public job listings.' },
  { method: 'GET', path: '/api/public/v1/gigs', auth: 'none', description: 'Public gig listings.' },
  { method: 'GET', path: '/api/public/v1/pages', auth: 'none', description: 'Public business pages.' },
  { method: 'POST', path: '/api/oauth/token', auth: 'oauth-client', description: 'OAuth token exchange for approved developer apps.' },
  { method: 'GET', path: '/api/oauth/userinfo', auth: 'oauth-bearer', description: 'OAuth user profile information.' }
];

type StoredWebhookSubscription = {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'paused';
  secretHash: string;
  secretPreview: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string | null;
};

type StoredWidgetConfig = {
  id: string;
  widgetKey: string;
  name: string;
  status: 'active' | 'draft' | 'paused';
  allowedOrigins: string[];
  theme: Record<string, any>;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

const getBaseUrl = () =>
  clean(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://scrolith.com').replace(/\/+$/, '');

const buildApiBaseUrl = () =>
  clean(process.env.PUBLIC_API_URL || process.env.BACKEND_PUBLIC_URL || process.env.API_URL || 'https://api.scrolith.com').replace(/\/+$/, '');

const eventKeys = () => new Set(EVENT_CATALOG.map((event) => event.key));

const sanitizeWebhookUrl = (value: unknown) => {
  const url = sanitizeUrlOrNull(value);
  if (!url) throw new Error('A valid webhook HTTPS URL is required.');
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && isLocal)) {
    throw new Error('Webhook URL must use HTTPS.');
  }
  return url;
};

const sanitizeWebhookEvents = (value: unknown) => {
  const requested = normalizeScopes(value);
  const allowed = eventKeys();
  const events = requested.filter((event) => allowed.has(event));
  if (!events.length) throw new Error('At least one supported webhook event is required.');
  return events.slice(0, 30);
};

const generateWebhookSecret = () => `whsec_${randomBytes(32).toString('hex')}`;
const previewSecret = (secret: string) => `${secret.slice(0, 8)}...${secret.slice(-6)}`;

const webhookScope = (developerUserId: string) => `${WEBHOOK_SCOPE_PREFIX}${developerUserId}`;
const widgetScope = (developerUserId: string) => `${WIDGET_SCOPE_PREFIX}${developerUserId}`;

const loadWebhookStore = async (developerUserId: string): Promise<{ subscriptions: StoredWebhookSubscription[] }> => {
  const record = await prisma.appSetting.findUnique({ where: { scope: webhookScope(developerUserId) } }).catch(() => null);
  const raw = (record?.data || {}) as any;
  return {
    subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : []
  };
};

const saveWebhookStore = async (developerUserId: string, data: { subscriptions: StoredWebhookSubscription[] }) =>
  prisma.appSetting.upsert({
    where: { scope: webhookScope(developerUserId) },
    create: { scope: webhookScope(developerUserId), data },
    update: { data }
  });

const loadWidgetStore = async (developerUserId: string): Promise<{ widgets: StoredWidgetConfig[] }> => {
  const record = await prisma.appSetting.findUnique({ where: { scope: widgetScope(developerUserId) } }).catch(() => null);
  const raw = (record?.data || {}) as any;
  return {
    widgets: Array.isArray(raw.widgets) ? raw.widgets : []
  };
};

const saveWidgetStore = async (developerUserId: string, data: { widgets: StoredWidgetConfig[] }) =>
  prisma.appSetting.upsert({
    where: { scope: widgetScope(developerUserId) },
    create: { scope: widgetScope(developerUserId), data },
    update: { data }
  });

const normalizeWidgetKey = (value: unknown) => {
  const key = lower(value);
  return WIDGET_CATALOG.some((widget) => widget.key === key) ? key : 'profile-card';
};

const sanitizeWidgetPayload = (developerUserId: string, payload: any, existing?: StoredWidgetConfig): StoredWidgetConfig => {
  const at = nowIso();
  const widgetKey = normalizeWidgetKey(payload?.widgetKey || existing?.widgetKey);
  const name = clean(payload?.name || existing?.name || WIDGET_CATALOG.find((widget) => widget.key === widgetKey)?.label || 'Scrolith Widget');
  const statusRaw = lower(payload?.status || existing?.status || 'draft');
  const status = statusRaw === 'active' || statusRaw === 'paused' ? statusRaw : 'draft';
  const allowedOrigins = sanitizePlatformUrls(payload?.allowedOrigins || existing?.allowedOrigins || []);
  return {
    id: existing?.id || `widget_${randomBytes(10).toString('hex')}`,
    widgetKey,
    name: name.slice(0, 120),
    status,
    allowedOrigins,
    theme: payload?.theme && typeof payload.theme === 'object' ? payload.theme : existing?.theme || {},
    settings: payload?.settings && typeof payload.settings === 'object' ? payload.settings : existing?.settings || {},
    createdAt: existing?.createdAt || at,
    updatedAt: at
  };
};

const buildWidgetEmbed = (widget: StoredWidgetConfig) => {
  const origin = getBaseUrl();
  const scriptUrl = `${origin}${WIDGET_CATALOG.find((entry) => entry.key === widget.widgetKey)?.scriptPath || '/widgets/scrolith.js'}`;
  return {
    scriptUrl,
    html: `<div data-scrolith-widget="${widget.widgetKey}" data-widget-id="${widget.id}"></div>\n<script async src="${scriptUrl}" data-widget-id="${widget.id}"></script>`,
    react: `<ScrolithWidget widgetId="${widget.id}" widgetKey="${widget.widgetKey}" />`
  };
};

const mapPublicPost = (post: any) => ({
  id: post.id,
  type: 'post',
  title: clean(post.title) || clean(post.content).slice(0, 100) || 'Community post',
  content: clean(post.content).slice(0, 500),
  tags: Array.isArray(post.tags) ? post.tags : [],
  topic: post.topic || null,
  author: post.author || null,
  businessPage: post.businessPage || null,
  metrics: {
    views: post.viewsCount || 0,
    likes: post.likesCount || 0,
    comments: post.commentsCount || 0,
    shares: post.sharesCount || 0,
    reposts: post.repostsCount || 0
  },
  url: `${getBaseUrl()}/post/${post.id}`,
  createdAt: toIso(post.createdAt),
  updatedAt: toIso(post.updatedAt)
});

export const getPublicEcosystemManifest = async () => {
  const config = await getOrCreateDeveloperPlatformConfig().catch(() => null);
  return {
    generatedAt: nowIso(),
    version: '2026-04',
    ecosystem: 'scrolith',
    apiBaseUrl: buildApiBaseUrl(),
    developerBaseUrl: config?.developerBaseUrl || `${getBaseUrl()}/developer`,
    capabilities: {
      publicApis: true,
      oauthApps: true,
      webhooks: true,
      embeddableWidgets: true,
      developerDashboard: true
    },
    authentication: {
      publicRead: 'No token required for approved public read APIs.',
      oauth: {
        authorize: '/api/oauth/authorize',
        token: '/api/oauth/token',
        userinfo: '/api/oauth/userinfo',
        revoke: '/api/oauth/revoke'
      },
      developer: 'Use Scrolith account auth to manage apps, webhooks, and widgets.'
    },
    endpoints: PUBLIC_ENDPOINTS,
    scopes: [
      'openid',
      'profile:read',
      'email:read',
      'posts.read',
      'jobs.read',
      'gigs.read',
      'followers.read',
      'notifications.read',
      'webhooks.manage',
      'widgets.manage'
    ],
    webhooks: EVENT_CATALOG,
    widgets: WIDGET_CATALOG
  };
};

export const getPublicApiCatalog = getPublicEcosystemManifest;

export const runPublicApiSearch = async (params: { q?: unknown; type?: unknown; limit?: unknown }) => {
  const query = clean(params.q);
  const limit = clampInt(params.limit, DEFAULT_PUBLIC_LIMIT, 1, 60);
  const response = await getDiscoveryV2({ query, mode: 'for_you', limit });
  const type = lower(params.type);
  return {
    ...response,
    apiVersion: 'v1',
    items: type ? response.items.filter((item: any) => lower(item.type) === type) : response.items
  };
};

export const listPublicPosts = async (params: { q?: unknown; limit?: unknown }) => {
  const query = clean(params.q);
  const limit = clampInt(params.limit, DEFAULT_PUBLIC_LIMIT, 1, 60);
  const queryFilter = query.length >= 2 ? containsFilter(query) : null;
  const posts = await prisma.communityPost.findMany({
    where: {
      status: 'active',
      visibility: 'public',
      ...(queryFilter ? { OR: [{ title: queryFilter }, { content: queryFilter }, { topic: queryFilter }] } : {})
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      tags: true,
      topic: true,
      viewsCount: true,
      likesCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true, username: true, avatar: true, isVerified: true } },
      businessPage: { select: { id: true, name: true, slug: true, handle: true, tagline: true } }
    }
  });
  return { generatedAt: nowIso(), items: posts.map(mapPublicPost), nextCursor: null };
};

export const listPublicJobs = async (params: { q?: unknown; limit?: unknown }) => {
  const query = clean(params.q);
  const limit = clampInt(params.limit, DEFAULT_PUBLIC_LIMIT, 1, 60);
  const queryFilter = query.length >= 2 ? containsFilter(query) : null;
  const jobs = await prisma.job.findMany({
    where: {
      isActive: true,
      isVisible: true,
      ...(queryFilter ? { OR: [{ title: queryFilter }, { description: queryFilter }, { budget: queryFilter }] } : {})
    },
    orderBy: [{ isRecommended: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      budget: true,
      tags: true,
      isFeatured: true,
      isRecommended: true,
      proposalsCount: true,
      createdAt: true,
      client: { select: { id: true, name: true, username: true, avatar: true, isVerified: true } }
    }
  });
  return {
    generatedAt: nowIso(),
    items: jobs.map((job) => ({
      id: job.id,
      type: 'job',
      title: job.title,
      description: clean(job.description).slice(0, 500),
      budget: job.budget,
      tags: Array.isArray(job.tags) ? job.tags : [],
      featured: job.isFeatured,
      recommended: job.isRecommended,
      proposalsCount: job.proposalsCount,
      client: job.client,
      url: `${getBaseUrl()}/jobs/${job.id}`,
      createdAt: toIso(job.createdAt)
    }))
  };
};

export const listPublicGigs = async (params: { q?: unknown; limit?: unknown }) => {
  const query = clean(params.q);
  const limit = clampInt(params.limit, DEFAULT_PUBLIC_LIMIT, 1, 60);
  const queryFilter = query.length >= 2 ? containsFilter(query) : null;
  const gigs = await prisma.gig.findMany({
    where: {
      isActive: true,
      ...(queryFilter ? { OR: [{ title: queryFilter }, { description: queryFilter }, { subcategory: queryFilter }] } : {})
    },
    orderBy: [{ isRecommended: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      price: true,
      tags: true,
      subcategory: true,
      rating: true,
      reviewCount: true,
      isFeatured: true,
      isRecommended: true,
      createdAt: true,
      user: { select: { id: true, name: true, username: true, avatar: true, isVerified: true } }
    }
  });
  return {
    generatedAt: nowIso(),
    items: gigs.map((gig) => ({
      id: gig.id,
      type: 'gig',
      title: gig.title,
      description: clean(gig.description).slice(0, 500),
      price: gig.price,
      tags: Array.isArray(gig.tags) ? gig.tags : [],
      subcategory: gig.subcategory,
      rating: gig.rating,
      reviewCount: gig.reviewCount,
      featured: gig.isFeatured,
      recommended: gig.isRecommended,
      seller: gig.user,
      url: `${getBaseUrl()}/gigs/${encodeURIComponent(gig.slug || gig.id)}`,
      createdAt: toIso(gig.createdAt)
    }))
  };
};

export const listPublicPages = async (params: { q?: unknown; limit?: unknown }) => {
  const query = clean(params.q);
  const limit = clampInt(params.limit, DEFAULT_PUBLIC_LIMIT, 1, 60);
  const queryFilter = query.length >= 2 ? containsFilter(query) : null;
  const pages = await prisma.communityBusinessPage.findMany({
    where: {
      status: 'active',
      ...(queryFilter ? { OR: [{ name: queryFilter }, { handle: queryFilter }, { slug: queryFilter }, { tagline: queryFilter }] } : {})
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      handle: true,
      slug: true,
      tagline: true,
      category: true,
      industry: true,
      city: true,
      country: true,
      updatedAt: true
    }
  });
  return {
    generatedAt: nowIso(),
    items: pages.map((page) => ({
      id: page.id,
      type: 'page',
      name: page.name,
      handle: page.handle,
      slug: page.slug,
      tagline: page.tagline,
      category: page.category,
      industry: page.industry,
      location: [page.city, page.country].filter(Boolean).join(', ') || null,
      url: `${getBaseUrl()}/company/${encodeURIComponent(page.slug || page.handle || page.id)}`,
      updatedAt: toIso(page.updatedAt)
    }))
  };
};

export const getDeveloperEcosystemDashboard = async (actor: AuthActor) => {
  const developerUser = await getOrCreateDeveloperUserFromAuth(actor);
  const linkedOwnerId = developerUser.linkStatus === 'LINKED' && developerUser.userId ? developerUser.userId : actor.id;

  const [config, apps, audits, webhookStore, widgetStore] = await Promise.all([
    getOrCreateDeveloperPlatformConfig(),
    prisma.developerApp.findMany({
      where: { ownerUserId: linkedOwnerId },
      orderBy: [{ updatedAt: 'desc' }],
      take: 20,
      include: {
        redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        _count: { select: { tokens: true, consents: true, authCodes: true, auditLogs: true } }
      }
    }).catch(() => []),
    prisma.developerAuditLog.findMany({
      where: { developerUserId: developerUser.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 25
    }).catch(() => []),
    loadWebhookStore(developerUser.id),
    loadWidgetStore(developerUser.id)
  ]);

  const appCounts = (apps as Array<any>).reduce((acc: Record<string, number>, app: any) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: nowIso(),
    profile: {
      id: developerUser.id,
      developerEmail: developerUser.developerEmail,
      developerUsername: developerUser.developerUsername,
      linkStatus: developerUser.linkStatus,
      linkedAt: toIso(developerUser.linkedAt),
      lastSyncedAt: toIso(developerUser.lastSyncedAt),
      syncSnapshot: developerUser.syncSnapshot || null
    },
    config: {
      developerBaseUrl: config.developerBaseUrl,
      autoApproveEnabled: config.autoApproveEnabled,
      rateLimitPerMinute: config.rateLimitPerMinute,
      accessTokenTtlSeconds: config.accessTokenTtlSeconds,
      sensitiveScopes: config.sensitiveScopes || []
    },
    apps: {
      counts: appCounts,
      items: apps.map((app: any) => ({
        ...toDeveloperAppResponse(app),
        usage: {
          tokens: app._count?.tokens || 0,
          consents: app._count?.consents || 0,
          authCodes: app._count?.authCodes || 0,
          auditLogs: app._count?.auditLogs || 0
        }
      }))
    },
    webhooks: {
      events: EVENT_CATALOG,
      subscriptions: webhookStore.subscriptions.map(({ secretHash, ...subscription }) => subscription)
    },
    widgets: {
      catalog: WIDGET_CATALOG,
      items: widgetStore.widgets.map((widget) => ({ ...widget, embed: buildWidgetEmbed(widget) }))
    },
    recentActivity: audits.map((audit: any) => ({
      id: audit.id,
      action: audit.action,
      status: audit.status,
      metadata: audit.metadata || null,
      createdAt: toIso(audit.createdAt)
    })),
    publicApis: PUBLIC_ENDPOINTS
  };
};

export const listDeveloperWebhooks = async (developerUserId: string) => {
  const store = await loadWebhookStore(developerUserId);
  return {
    generatedAt: nowIso(),
    events: EVENT_CATALOG,
    items: store.subscriptions.map(({ secretHash, ...subscription }) => subscription)
  };
};

export const createDeveloperWebhook = async (
  actor: AuthActor,
  developerUserId: string,
  payload: any
) => {
  const name = clean(payload?.name || 'Scrolith webhook').slice(0, 120);
  const url = sanitizeWebhookUrl(payload?.url);
  const events = sanitizeWebhookEvents(payload?.events);
  const status = lower(payload?.status) === 'paused' ? 'paused' : 'active';
  const secret = generateWebhookSecret();
  const subscription: StoredWebhookSubscription = {
    id: `wh_${randomBytes(10).toString('hex')}`,
    name,
    url,
    events,
    status,
    secretHash: hashSensitiveValue(secret),
    secretPreview: previewSecret(secret),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastTestedAt: null
  };
  const store = await loadWebhookStore(developerUserId);
  store.subscriptions = [subscription, ...store.subscriptions].slice(0, 50);
  await saveWebhookStore(developerUserId, store);
  await prisma.developerAuditLog.create({
    data: {
      developerUserId,
      actorUserId: actor.id,
      action: 'WEBHOOK_CREATED',
      status: 'SUCCESS',
      metadata: { webhookId: subscription.id, url: subscription.url, events: subscription.events }
    }
  }).catch(() => null);
  const { secretHash, ...safe } = subscription;
  return {
    ...safe,
    signingSecret: secret,
    note: 'Store this signing secret now. It is only returned once.'
  };
};

export const deleteDeveloperWebhook = async (actor: AuthActor, developerUserId: string, webhookId: string) => {
  const store = await loadWebhookStore(developerUserId);
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((subscription) => subscription.id !== webhookId);
  if (store.subscriptions.length === before) throw new Error('Webhook subscription not found.');
  await saveWebhookStore(developerUserId, store);
  await prisma.developerAuditLog.create({
    data: {
      developerUserId,
      actorUserId: actor.id,
      action: 'WEBHOOK_DELETED',
      status: 'SUCCESS',
      metadata: { webhookId }
    }
  }).catch(() => null);
  return { id: webhookId, deleted: true };
};

export const testDeveloperWebhook = async (actor: AuthActor, developerUserId: string, webhookId: string) => {
  const store = await loadWebhookStore(developerUserId);
  const index = store.subscriptions.findIndex((subscription) => subscription.id === webhookId);
  if (index < 0) throw new Error('Webhook subscription not found.');
  const subscription = store.subscriptions[index];
  const event = subscription.events[0] || 'post.created';
  const sampleDelivery = {
    id: `evt_${randomBytes(10).toString('hex')}`,
    type: event,
    createdAt: nowIso(),
    data: {
      object: 'sample',
      message: 'This is a Scrolith webhook test payload.'
    }
  };
  store.subscriptions[index] = { ...subscription, lastTestedAt: nowIso(), updatedAt: nowIso() };
  await saveWebhookStore(developerUserId, store);
  await prisma.developerAuditLog.create({
    data: {
      developerUserId,
      actorUserId: actor.id,
      action: 'WEBHOOK_TESTED',
      status: 'QUEUED',
      metadata: { webhookId, event, url: subscription.url, sampleDelivery }
    }
  }).catch(() => null);
  return {
    webhookId,
    status: 'queued',
    deliveryMode: 'audit_only',
    event: sampleDelivery,
    note: 'Phase 4 foundation records the test delivery contract; external dispatch worker can consume this audit event.'
  };
};

export const listDeveloperWidgets = async (developerUserId: string) => {
  const store = await loadWidgetStore(developerUserId);
  return {
    generatedAt: nowIso(),
    catalog: WIDGET_CATALOG,
    items: store.widgets.map((widget) => ({ ...widget, embed: buildWidgetEmbed(widget) }))
  };
};

export const upsertDeveloperWidget = async (
  actor: AuthActor,
  developerUserId: string,
  payload: any
) => {
  const store = await loadWidgetStore(developerUserId);
  const widgetId = clean(payload?.id);
  const existing = widgetId ? store.widgets.find((widget) => widget.id === widgetId) : undefined;
  const next = sanitizeWidgetPayload(developerUserId, payload, existing);
  store.widgets = existing
    ? store.widgets.map((widget) => (widget.id === existing.id ? next : widget))
    : [next, ...store.widgets].slice(0, 50);
  await saveWidgetStore(developerUserId, store);
  await prisma.developerAuditLog.create({
    data: {
      developerUserId,
      actorUserId: actor.id,
      action: existing ? 'WIDGET_UPDATED' : 'WIDGET_CREATED',
      status: 'SUCCESS',
      metadata: { widgetId: next.id, widgetKey: next.widgetKey, status: next.status }
    }
  }).catch(() => null);
  return { ...next, embed: buildWidgetEmbed(next) };
};

export const getAdminEcosystemOverview = async () => {
  const [config, developerCounts, appCounts, tokenCount, consentCount, auditCount, webhookSettings, widgetSettings] =
    await Promise.all([
      getOrCreateDeveloperPlatformConfig(),
      prisma.developerUser.groupBy({ by: ['linkStatus'], _count: { _all: true } }).catch(() => []),
      prisma.developerApp.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
      prisma.oAuthToken.count({ where: { revokedAt: null } }).catch(() => 0),
      prisma.oAuthConsent.count({ where: { revokedAt: null } }).catch(() => 0),
      prisma.developerAuditLog.count().catch(() => 0),
      prisma.appSetting.findMany({ where: { scope: { startsWith: WEBHOOK_SCOPE_PREFIX } }, select: { data: true } }).catch(() => []),
      prisma.appSetting.findMany({ where: { scope: { startsWith: WIDGET_SCOPE_PREFIX } }, select: { data: true } }).catch(() => [])
    ]);

  const webhooks = webhookSettings.reduce((total: number, row: any) => {
    const subscriptions = Array.isArray(row?.data?.subscriptions) ? row.data.subscriptions : [];
    return total + subscriptions.length;
  }, 0);
  const widgets = widgetSettings.reduce((total: number, row: any) => {
    const items = Array.isArray(row?.data?.widgets) ? row.data.widgets : [];
    return total + items.length;
  }, 0);

  return {
    generatedAt: nowIso(),
    config: {
      developerBaseUrl: config.developerBaseUrl,
      autoApproveEnabled: config.autoApproveEnabled,
      rateLimitPerMinute: config.rateLimitPerMinute,
      sensitiveScopes: config.sensitiveScopes || []
    },
    counts: {
      developersByStatus: (developerCounts as Array<any>).reduce((acc: Record<string, number>, row: any) => {
        acc[row.linkStatus] = row._count._all;
        return acc;
      }, {}),
      appsByStatus: (appCounts as Array<any>).reduce((acc: Record<string, number>, row: any) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {}),
      activeOAuthTokens: tokenCount,
      activeConsents: consentCount,
      auditEvents: auditCount,
      webhookSubscriptions: webhooks,
      widgetConfigs: widgets
    },
    governance: {
      appReviewRequired: !config.autoApproveEnabled,
      sensitiveScopeManualReview: config.requireManualApprovalForSensitiveScope,
      publicApiEndpoints: PUBLIC_ENDPOINTS.length,
      webhookEventTypes: EVENT_CATALOG.length,
      widgetTypes: WIDGET_CATALOG.length
    }
  };
};

export const getPhase4Briefing = async (actor?: AuthActor | null) => {
  const [manifest, adminOverview] = await Promise.all([
    getPublicEcosystemManifest(),
    actor ? getAdminEcosystemOverview().catch(() => null) : Promise.resolve(null)
  ]);
  return {
    generatedAt: nowIso(),
    phase: 4,
    capabilities: manifest.capabilities,
    publicApis: manifest.endpoints,
    oauth: manifest.authentication.oauth,
    webhooks: manifest.webhooks,
    widgets: manifest.widgets,
    adminOverview,
    operatingPriorities: [
      'Expose stable public read APIs with versioned contracts and rate-limit governance.',
      'Use OAuth apps for delegated user access instead of shared credentials.',
      'Manage webhook subscriptions with signed payload contracts and auditable test deliveries.',
      'Ship embeddable Scrolith widgets that can be restricted by origin and governed from developer dashboards.'
    ]
  };
};
