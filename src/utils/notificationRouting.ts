export type NotificationBucket = 'home' | 'community';

const coerceString = (value: unknown) => String(value ?? '').trim();

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

const normalizeToRelativeUrl = (urlValue: string): string | undefined => {
  const raw = coerceString(urlValue);
  if (!raw) return undefined;

  if (raw.startsWith('/')) return raw;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    } catch {
      return undefined;
    }
  }

  // Best-effort: treat as relative path missing leading slash
  return `/${raw.replace(/^\/+/, '')}`;
};

const rewriteLegacyCommunityPostUrl = (urlValue: string): string => {
  const raw = coerceString(urlValue);
  if (!raw) return raw;

  const relative = normalizeToRelativeUrl(raw) || raw;

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

export const getNotificationBucket = (notification: any): NotificationBucket => {
  const raw = getRawNotificationActionUrl(notification);
  const normalized = raw ? normalizeToRelativeUrl(raw) || raw : '';
  const path = coerceString(normalized).split('?')[0].split('#')[0];

  // Legacy post links are considered "Home" notifications (they now deep-link to /post/:id).
  if (/^\/community\/posts\//i.test(path)) return 'home';

  // Community module notifications (forum, gcoin, clubs, etc).
  if (/^\/community(\/|$)/i.test(path)) return 'community';

  return 'home';
};

export const getNotificationActionUrl = (notification: any): string | undefined => {
  const raw = getRawNotificationActionUrl(notification);
  if (raw) {
    const rewritten = rewriteLegacyCommunityPostUrl(raw);
    const normalized = normalizeToRelativeUrl(rewritten) || rewritten;
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

  const campaignId = coerceString(metadata?.campaignId ?? metadata?.campaign_id);
  const notificationType = coerceString(notification?.type ?? notification?.notificationType).toLowerCase();
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
    return `/dashboard?tab=notifications&campaignId=${encodeURIComponent(campaignId)}`;
  }

  return undefined;
};
