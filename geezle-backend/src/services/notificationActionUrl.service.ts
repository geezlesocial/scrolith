type NotificationType =
  | 'mention_post'
  | 'mention_comment'
  | 'followed_new_post'
  | 'followed_you'
  | 'comment_on_post'
  | 'reaction_on_post'
  | 'repost'
  | 'job_application_created'
  | 'proposal_opened'
  | 'proposal_reply'
  | 'proposal_top_applicant'
  | 'proposal_interview_scheduled'
  | string;

type NotificationPayload = Record<string, any> | undefined;
const DEFAULT_FRONTEND_ORIGIN = 'https://scrolith.com';

const normalizeId = (value: unknown) => String(value || '').trim();

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const isAppDeepLink = (value: string) => /^scrolith:\/\//i.test(value);
const hasCustomScheme = (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value);

const getFrontendOrigin = () => {
  const raw =
    normalizeId(process.env.FRONTEND_URL) ||
    normalizeId(process.env.PLATFORM_URL) ||
    normalizeId(process.env.PUBLIC_APP_URL) ||
    DEFAULT_FRONTEND_ORIGIN;

  const withScheme = hasCustomScheme(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_FRONTEND_ORIGIN;
    return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
  } catch {
    return DEFAULT_FRONTEND_ORIGIN;
  }
};

const isInternalFrontendHost = (hostname: string) => {
  const normalizedHost = normalizeId(hostname).toLowerCase();
  if (!normalizedHost) return false;
  const configuredHost = (() => {
    try {
      return new URL(getFrontendOrigin()).hostname.toLowerCase();
    } catch {
      return 'scrolith.com';
    }
  })();
  return (
    normalizedHost === configuredHost ||
    normalizedHost === 'scrolith.com' ||
    normalizedHost === 'www.scrolith.com' ||
    normalizedHost.endsWith('.scrolith.com')
  );
};

const rewriteLegacyCommunityPostUrl = (value: string) => {
  const raw = normalizeId(value);
  if (!raw) return raw;

  try {
    const parsed = new URL(raw.startsWith('/') ? `https://local${raw}` : raw);
    const match = parsed.pathname.match(/^\/community\/posts\/([^/]+)\/?$/i);
    if (!match) return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    return `/post/${match[1]}${parsed.search}${parsed.hash}`;
  } catch {
    return raw.replace(/^\/community\/posts\/([^/?#]+)(\/)?/i, '/post/$1');
  }
};

const toQuery = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const normalized = normalizeId(value);
    if (!normalized) return;
    search.set(key, normalized);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const normalizeNotificationActionUrl = (value: unknown): string | undefined => {
  const raw = normalizeId(value);
  if (!raw) return undefined;

  if (isAppDeepLink(raw)) {
    const path = raw.replace(/^scrolith:\/\//i, '/');
    return rewriteLegacyCommunityPostUrl(path.startsWith('/') ? path : `/${path}`);
  }

  if (isHttpUrl(raw)) {
    try {
      const parsed = new URL(raw);
      if (!isInternalFrontendHost(parsed.hostname)) return raw;
      return rewriteLegacyCommunityPostUrl(`${parsed.pathname}${parsed.search}${parsed.hash}` || '/');
    } catch {
      return undefined;
    }
  }

  if (hasCustomScheme(raw)) {
    return raw;
  }

  const relative = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
  return rewriteLegacyCommunityPostUrl(relative);
};

export const toAbsoluteFrontendUrl = (value: unknown): string | undefined => {
  const raw = normalizeId(value);
  if (!raw) return undefined;

  if (isHttpUrl(raw)) return raw;
  if (hasCustomScheme(raw) && !isAppDeepLink(raw)) return raw;

  const normalized = normalizeNotificationActionUrl(raw);
  if (!normalized) return undefined;
  if (isHttpUrl(normalized) || hasCustomScheme(normalized)) return normalized;
  return `${getFrontendOrigin()}${normalized}`;
};

export const absolutizeContextUrls = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => absolutizeContextUrls(entry)) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, any> = {};
  Object.entries(value as Record<string, any>).forEach(([key, entry]) => {
    if (entry && typeof entry === 'object') {
      output[key] = absolutizeContextUrls(entry);
      return;
    }

    const lowerKey = key.toLowerCase();
    if (typeof entry === 'string' && ['link', 'url', 'actionurl', 'action_url'].includes(lowerKey)) {
      output[key] = toAbsoluteFrontendUrl(entry) || entry;
      return;
    }

    output[key] = entry;
  });
  return output as T;
};

export const extractActionUrlCandidate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const normalized = normalizeId(value);
    return normalized || undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractActionUrlCandidate(entry);
      if (nested) return nested;
    }
    return undefined;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, any>;
    const directKeys = ['actionUrl', 'action_url', 'link', 'url'];
    for (const key of directKeys) {
      const candidate = normalizeId(record[key]);
      if (candidate) return candidate;
    }
    for (const entry of Object.values(record)) {
      const nested = extractActionUrlCandidate(entry);
      if (nested) return nested;
    }
  }
  return undefined;
};

export const buildNotificationActionUrl = (
  type: NotificationType,
  payload?: NotificationPayload
): string => {
  const data = payload || {};
  const postId = normalizeId(data.postId || data.entityId);
  const commentId = normalizeId(data.commentId);
  const actorId = normalizeId(data.actorId);
  const actorUsername = normalizeId(data.actorUsername || data.username);
  const mentionToken = normalizeId(data.mentionId || data.mentionedUserId || data.mentioned_user_id);
  const proposalId = normalizeId(data.proposalId || data.entityId);
  const jobId = normalizeId(data.jobId || data.parentId);
  const conversationId = normalizeId(data.conversationId || data.conversation_id);
  const orderId = normalizeId(data.orderId || data.order_id);
  const contractId = normalizeId(data.contractId || data.contract_id);
  const withdrawalId = normalizeId(data.withdrawalId || data.withdrawal_id);
  const ticketId = normalizeId(data.ticketId || data.ticket_id);
  const appId = normalizeId(data.appId || data.app_id);
  const adId = normalizeId(data.adId || data.ad_id);
  const campaignId = normalizeId(data.campaignId || data.campaign_id);
  const entityType = normalizeId(data.entityType || data.entity_type).toLowerCase();
  const normalizedType = normalizeId(type).toLowerCase();

  const explicit =
    normalizeNotificationActionUrl(data.action_url) ||
    normalizeNotificationActionUrl(data.actionUrl) ||
    normalizeNotificationActionUrl(data.link) ||
    normalizeNotificationActionUrl(data.url);
  if (explicit) return explicit;

  if (type === 'followed_you') {
    if (actorUsername) return `/u/${encodeURIComponent(actorUsername)}`;
    if (actorId) return `/profile/${encodeURIComponent(actorId)}`;
    return '/community';
  }

  if (type === 'reaction_on_post' || type === 'repost' || type === 'followed_new_post') {
    if (postId) return `/post/${encodeURIComponent(postId)}`;
    return '/community';
  }

  if (type === 'comment_on_post') {
    if (!postId) return '/community';
    return `/post/${encodeURIComponent(postId)}${toQuery({ comment: commentId })}`;
  }

  if (type === 'mention_post') {
    if (!postId) return '/community';
    return `/post/${encodeURIComponent(postId)}${toQuery({ mention: mentionToken })}`;
  }

  if (type === 'mention_comment') {
    if (!postId) return '/community';
    return `/post/${encodeURIComponent(postId)}${toQuery({
      comment: commentId,
      mention: mentionToken
    })}`;
  }

  if (type === 'job_application_created') {
    return `/client/dashboard${toQuery({ tab: 'proposals', job: jobId, proposal: proposalId })}`;
  }

  if (type === 'proposal_opened') {
    return `/freelancer/dashboard${toQuery({ tab: 'proposals', proposal: proposalId })}`;
  }

  if (type === 'proposal_reply') {
    return `/messages${toQuery({ proposal: proposalId })}`;
  }

  if (type === 'proposal_top_applicant') {
    return `/freelancer/dashboard${toQuery({ tab: 'proposals', proposal: proposalId })}`;
  }

  if (type === 'proposal_interview_scheduled') {
    return `/freelancer/dashboard${toQuery({ tab: 'proposals', proposal: proposalId, interview: proposalId })}`;
  }

  if (conversationId || normalizedType === 'message' || normalizedType === 'new_message') {
    if (conversationId) return `/messages/${encodeURIComponent(conversationId)}`;
    return '/messages';
  }

  if (orderId || entityType === 'order' || normalizedType === 'order') {
    return `/dashboard${toQuery({ tab: 'orders', order_id: orderId })}`;
  }

  if (contractId || entityType === 'contract' || normalizedType === 'contract') {
    return `/dashboard${toQuery({ tab: 'contracts', contract: contractId, contract_id: contractId })}`;
  }

  if (
    withdrawalId ||
    entityType === 'withdrawal' ||
    normalizedType.includes('withdrawal') ||
    normalizedType.includes('wallet') ||
    normalizedType.includes('stripe_payout')
  ) {
    return `/dashboard${toQuery({ tab: 'wallet', withdrawal: withdrawalId })}`;
  }

  if (ticketId || entityType === 'support_ticket' || normalizedType.includes('support')) {
    return '/support';
  }

  if (
    entityType === 'monetization_application' ||
    entityType === 'monetization_profile' ||
    normalizedType.includes('monetization')
  ) {
    return '/dashboard?tab=community&section=earnings';
  }

  if (adId || normalizedType.includes('community_ad') || normalizedType === 'my_ads') {
    return `/my-ads${toQuery({ adId: adId || undefined })}`;
  }

  if (normalizedType === 'app_campaign' && campaignId) {
    return `/dashboard${toQuery({ tab: 'notifications', campaignId })}`;
  }

  if (appId || entityType === 'developer_app' || normalizedType.includes('developer') || normalizedType.startsWith('app_')) {
    return `/developer${toQuery({ section: 'apps', appId })}`;
  }

  if (normalizedType.includes('kyc') || entityType === 'kyc') {
    return '/dashboard?tab=kyc';
  }

  return '/community';
};

export const resolveNotificationEntity = (type: NotificationType, payload?: NotificationPayload) => {
  const data = payload || {};
  const postId = normalizeId(data.postId || data.entityId);
  const commentId = normalizeId(data.commentId);
  const proposalId = normalizeId(data.proposalId || data.entityId);
  const jobId = normalizeId(data.jobId || data.parentId);

  if (type === 'followed_you') {
    return {
      entityType: 'follow',
      entityId: normalizeId(data.followingId || data.targetUserId || data.userId),
      parentId: null
    };
  }

  if (type === 'mention_comment' || type === 'comment_on_post') {
    return {
      entityType: 'comment',
      entityId: commentId,
      parentId: postId || null
    };
  }

  if (
    type === 'mention_post' ||
    type === 'reaction_on_post' ||
    type === 'repost' ||
    type === 'followed_new_post'
  ) {
    return {
      entityType: 'post',
      entityId: postId,
      parentId: null
    };
  }

  if (
    type === 'job_application_created' ||
    type === 'proposal_opened' ||
    type === 'proposal_reply' ||
    type === 'proposal_top_applicant' ||
    type === 'proposal_interview_scheduled'
  ) {
    return {
      entityType: 'proposal',
      entityId: proposalId || null,
      parentId: jobId || null
    };
  }

  return {
    entityType: normalizeId(data.entityType || data.entity_type) || null,
    entityId: normalizeId(data.entityId || data.entity_id) || null,
    parentId: normalizeId(data.parentId || data.parent_id) || null
  };
};
