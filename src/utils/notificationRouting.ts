export type NotificationBucket = 'home' | 'community';
export const LOGIN_APPROVAL_OPEN_EVENT = 'security:login_approval.open';

export {
  getNotificationCategoryLabel,
  getNotificationCategoryMeta,
  resolveNotificationCategory,
  formatNotificationTitleWithCategory,
  resolveAndroidChannelId,
  ANDROID_CHANNEL_IDS,
  listNotificationCategoryMeta
} from './notificationTaxonomy';
export type { NotificationCategoryKey, NotificationCategoryMeta } from './notificationTaxonomy';

const coerceString = (value: unknown) => String(value ?? '').trim();
const isAbsoluteHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const isAppDeepLink = (value: string) => /^scrolith:\/\//i.test(value);

const readNotificationMetadata = (notification: any): Record<string, any> =>
  notification?.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : notification?.meta && typeof notification.meta === 'object'
      ? notification.meta
      : {};

const lowerSignals = (notification: any) => {
  const metadata = readNotificationMetadata(notification);
  return [
    notification?.type,
    notification?.notificationType,
    notification?.notification_type,
    notification?.category,
    notification?.entityType,
    notification?.entity_type,
    metadata?.type,
    metadata?.notificationType,
    metadata?.notification_type,
    metadata?.category,
    metadata?.entityType,
    metadata?.entity_type
  ]
    .map((value) => coerceString(value).toLowerCase())
    .filter(Boolean);
};

export const getLoginApprovalAttemptId = (notification: any): string | undefined => {
  if (!notification) return undefined;
  const metadata = readNotificationMetadata(notification);
  const id = coerceString(
    notification?.attemptId ??
      notification?.attempt_id ??
      notification?.loginApprovalId ??
      notification?.login_approval_id ??
      metadata?.attemptId ??
      metadata?.attempt_id ??
      metadata?.loginApprovalId ??
      metadata?.login_approval_id ??
      notification?.entityId ??
      notification?.entity_id ??
      metadata?.entityId ??
      metadata?.entity_id
  );
  return id || undefined;
};

export const isLoginApprovalNotification = (notification: any): boolean => {
  const attemptId = getLoginApprovalAttemptId(notification);
  if (!attemptId) return false;
  const signals = lowerSignals(notification);
  return signals.some((signal) => {
    const normalized = signal.replace(/[:.-]/g, '_');
    return normalized.includes('login_approval') || normalized === 'loginapproval';
  });
};

export const openLoginApprovalNotification = (notification: any): boolean => {
  const attemptId = getLoginApprovalAttemptId(notification);
  if (!attemptId || typeof window === 'undefined') return false;
  window.dispatchEvent(
    new CustomEvent(LOGIN_APPROVAL_OPEN_EVENT, {
      detail: {
        attemptId,
        eventId: coerceString(notification?.eventId ?? notification?.event_id) || `login-approval:${attemptId}`,
        notificationId: coerceString(notification?.id) || undefined
      }
    })
  );
  return true;
};

const isInternalHost = (hostname: string) => {
  const normalized = coerceString(hostname).toLowerCase();
  if (!normalized) return false;
  const currentHost =
    typeof window !== 'undefined' ? coerceString(window.location.hostname || '').toLowerCase() : '';
  return (
    normalized === currentHost ||
    normalized === 'scrolith.com' ||
    normalized === 'www.scrolith.com' ||
    normalized.endsWith('.scrolith.com')
  );
};

const rewriteLegacyInternalUrl = (urlValue: string) => {
  const raw = coerceString(urlValue);
  if (!raw) return raw;

  let relative = raw;
  if (isAppDeepLink(raw)) {
    const normalized = raw.replace(/^scrolith:\/\//i, '/');
    relative = normalized.startsWith('/') ? normalized : `/${normalized}`;
  } else if (isAbsoluteHttpUrl(raw)) {
    try {
      const parsed = new URL(raw);
      if (!isInternalHost(parsed.hostname)) return raw;
      relative = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    } catch {
      return raw;
    }
  } else if (!raw.startsWith('/')) {
    relative = `/${raw.replace(/^\/+/, '')}`;
  }

  try {
    const parsed = new URL(relative.startsWith('/') ? `http://local${relative}` : relative);
    let nextPath = parsed.pathname || '/';
    const search = new URLSearchParams(parsed.search);

    if (/^\/community\/posts\/[^/]+\/?$/i.test(nextPath)) {
      return rewriteLegacyCommunityPostUrl(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    }

    if (/^\/settings\/profile\/?$/i.test(nextPath)) {
      nextPath = '/profile/edit';
    } else if (/^\/feed\/?$/i.test(nextPath)) {
      nextPath = '/community';
    } else if (/^\/community\/?$/i.test(nextPath) && coerceString(search.get('tab')).toLowerCase() === 'groups') {
      nextPath = '/community/clubs';
      search.delete('tab');
    } else if (/^\/jobs\/?$/i.test(nextPath) && !search.get('tab')) {
      nextPath = '/browse-jobs';
    } else if (/^\/dashboard\/?$/i.test(nextPath) && coerceString(search.get('tab')).toLowerCase() === 'notifications') {
      search.set('tab', 'messages');
    }

    // Phase 25 — notification deep-link aliases → production routes
    const threadMatch = nextPath.match(/^\/messages\/thread\/([^/]+)\/?$/i);
    if (threadMatch) {
      nextPath = `/messages/${threadMatch[1]}`;
    }
    const groupMatch = nextPath.match(/^\/community\/group\/([^/]+)\/?$/i);
    if (groupMatch) {
      nextPath = '/community/clubs';
      search.set('group', groupMatch[1]);
    }
    const storyMatch = nextPath.match(/^\/story\/([^/]+)\/?$/i);
    if (storyMatch) {
      nextPath = '/community';
      search.set('story', storyMatch[1]);
    }
    const jobAppMatch = nextPath.match(/^\/jobs\/application\/([^/]+)\/?$/i);
    if (jobAppMatch) {
      nextPath = `/jobs/${jobAppMatch[1]}`;
      search.set('application', jobAppMatch[1]);
    }
    const gigOrderMatch = nextPath.match(/^\/gigs\/orders\/([^/]+)\/?$/i);
    if (gigOrderMatch) {
      nextPath = `/gigs/${gigOrderMatch[1]}`;
    }

    const nextQuery = search.toString();
    return `${nextPath}${nextQuery ? `?${nextQuery}` : ''}${parsed.hash || ''}` || '/';
  } catch {
    return relative
      .replace(/^\/settings\/profile\/?$/i, '/profile/edit')
      .replace(/^\/feed\/?$/i, '/community')
      .replace(/^\/jobs\/?$/i, '/browse-jobs');
  }
};

export const getRawNotificationActionUrl = (notification: any): string | undefined => {
  if (!notification) return undefined;
  const metadata = (notification?.metadata && typeof notification.metadata === 'object' ? notification.metadata : {}) as Record<
    string,
    any
  >;

  const action =
    notification?.actionUrl ??
    notification?.action_url ??
    notification?.link ??
    notification?.url ??
    metadata?.actionUrl ??
    metadata?.action_url ??
    metadata?.link ??
    metadata?.url;

  const raw = coerceString(action);
  return raw ? raw : undefined;
};

const normalizeInternalUrl = (urlValue: string): string | undefined => {
  const raw = coerceString(urlValue);
  if (!raw) return undefined;

  if (raw.startsWith('/')) return rewriteLegacyInternalUrl(raw);

  if (isAppDeepLink(raw)) {
    const normalized = raw.replace(/^scrolith:\/\//i, '/');
    return rewriteLegacyInternalUrl(normalized.startsWith('/') ? normalized : `/${normalized}`);
  }

  if (isAbsoluteHttpUrl(raw)) {
    try {
      const parsed = new URL(raw);
      if (!isInternalHost(parsed.hostname)) return undefined;
      return rewriteLegacyInternalUrl(`${parsed.pathname}${parsed.search}${parsed.hash}` || '/');
    } catch {
      return undefined;
    }
  }

  // Best-effort: treat as relative path missing leading slash
  return rewriteLegacyInternalUrl(`/${raw.replace(/^\/+/, '')}`);
};

const rewriteLegacyCommunityPostUrl = (urlValue: string): string => {
  const raw = coerceString(urlValue);
  if (!raw) return raw;

  if (isAbsoluteHttpUrl(raw)) {
    try {
      const parsed = new URL(raw);
      if (!isInternalHost(parsed.hostname)) return raw;
    } catch {
      return raw;
    }
  }

  const relative = normalizeInternalUrl(raw) || raw;

  try {
    const parsed = new URL(relative.startsWith('/') ? `http://local${relative}` : relative);
    const match = parsed.pathname.match(/^\/community\/posts\/([^/]+)\/?$/i);
    if (!match) return `${parsed.pathname}${parsed.search}${parsed.hash}`;

    const postId = match[1];
    const nextPath = `/post/${postId}`;
    return `${nextPath}${parsed.search}${parsed.hash}`;
  } catch {
    // Fallback: regex replace on the raw string
    return relative.replace(/^\/community\/posts\/([^/?#]+)(\/)?/i, '/post/$1');
  }
};

export const isExternalNotificationUrl = (urlValue?: string): boolean => {
  const raw = coerceString(urlValue);
  if (!raw || !isAbsoluteHttpUrl(raw)) return false;
  try {
    const parsed = new URL(raw);
    return !isInternalHost(parsed.hostname);
  } catch {
    return false;
  }
};

export const getNotificationBucket = (notification: any): NotificationBucket => {
  if (isLoginApprovalNotification(notification)) return 'home';

  const raw = getRawNotificationActionUrl(notification);
  const normalized = raw ? normalizeInternalUrl(raw) || raw : '';
  const path = coerceString(normalized).split('?')[0].split('#')[0];

  // Legacy post links are considered "Home" notifications (they now deep-link to /post/:id).
  if (/^\/community\/posts\//i.test(path)) return 'home';

  // Community module notifications (forum, gcoin, clubs, etc).
  if (/^\/community(\/|$)/i.test(path)) return 'community';

  return 'home';
};

export const getNotificationActionUrl = (notification: any): string | undefined => {
  if (isLoginApprovalNotification(notification)) return undefined;

  const raw = getRawNotificationActionUrl(notification);
  if (raw) {
    const rewritten = rewriteLegacyCommunityPostUrl(raw);
    const normalized = normalizeInternalUrl(rewritten) || rewritten;
    return normalized || undefined;
  }

  // Fallback: derive from entity metadata when actionUrl is missing.
  const metadata = (notification?.metadata && typeof notification.metadata === 'object' ? notification.metadata : {}) as Record<
    string,
    any
  >;
  const entityType = coerceString(notification?.entityType ?? notification?.entity_type ?? metadata?.entityType ?? metadata?.entity_type).toLowerCase();
  const entityId = coerceString(notification?.entityId ?? notification?.entity_id ?? metadata?.entityId ?? metadata?.entity_id);
  const parentId = coerceString(notification?.parentId ?? notification?.parent_id ?? metadata?.parentId ?? metadata?.parent_id);
  const notificationType = coerceString(notification?.type ?? notification?.notificationType).toLowerCase();

  if (entityType === 'post' && entityId) {
    return `/post/${encodeURIComponent(entityId)}`;
  }

  if (entityType === 'comment' && parentId) {
    const commentId = entityId || coerceString(metadata?.commentId ?? metadata?.comment_id);
    const mentionToken = coerceString(
      metadata?.mentionId ??
        metadata?.mention_id ??
        metadata?.mentionedUserId ??
        metadata?.mentioned_user_id ??
        metadata?.mentionToken
    );
    const search = new URLSearchParams();
    if (commentId) search.set('comment', commentId);
    if (mentionToken) search.set('mention', mentionToken);
    const qs = search.toString();
    return `/post/${encodeURIComponent(parentId)}${qs ? `?${qs}` : ''}`;
  }

  const groupInviteTypes = new Set([
    'community_group_invite_received',
    'community_group_invite_accepted',
    'community_group_invite_declined',
    'community_group_invite_cancelled'
  ]);
  if (groupInviteTypes.has(notificationType)) {
    const groupRef = coerceString(metadata?.groupSlug ?? metadata?.group_slug ?? metadata?.groupId ?? metadata?.group_id ?? parentId);
    const search = new URLSearchParams();
    if (groupRef) search.set('group', groupRef);
    search.set('panel', 'invites');
    if (notificationType === 'community_group_invite_received') {
      search.set('inviteScope', 'received');
      search.set('inviteStatus', 'pending');
    } else if (notificationType === 'community_group_invite_cancelled') {
      search.set('inviteScope', 'received');
      search.set('inviteStatus', 'cancelled');
    } else if (notificationType === 'community_group_invite_accepted') {
      search.set('inviteScope', 'sent');
      search.set('inviteStatus', 'accepted');
    } else if (notificationType === 'community_group_invite_declined') {
      search.set('inviteScope', 'sent');
      search.set('inviteStatus', 'declined');
    }
    return `/community/clubs?${search.toString()}`;
  }

  const groupRequestTypes = new Set(['community_group_request_approved', 'community_group_request_rejected']);
  if (groupRequestTypes.has(notificationType)) {
    const groupRef = coerceString(metadata?.groupSlug ?? metadata?.group_slug ?? metadata?.groupId ?? metadata?.group_id ?? parentId);
    const search = new URLSearchParams();
    if (groupRef) search.set('group', groupRef);
    search.set('panel', 'moderation');
    search.set('moderationFilter', 'history');
    return `/community/clubs?${search.toString()}`;
  }

  const campaignId = coerceString(metadata?.campaignId ?? metadata?.campaign_id);
  if (notificationType === 'app_campaign' && campaignId) {
    if (typeof window !== 'undefined') {
      const currentPath = coerceString(window.location.pathname || '').toLowerCase();
      if (currentPath.startsWith('/admin/')) {
        return `/admin/dashboard?tab=apps&campaignId=${encodeURIComponent(campaignId)}`;
      }
      if (currentPath.startsWith('/m/')) {
        return `/m/notifications?campaignId=${encodeURIComponent(campaignId)}`;
      }
    }
    return `/dashboard?tab=messages&campaignId=${encodeURIComponent(campaignId)}`;
  }

  return undefined;
};
