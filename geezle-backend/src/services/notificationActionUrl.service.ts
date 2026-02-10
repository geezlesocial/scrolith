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

const normalizeId = (value: unknown) => String(value || '').trim();

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

  if (type === 'followed_you') {
    if (actorUsername) return `/u/${encodeURIComponent(actorUsername)}`;
    if (actorId) return `/profile/${encodeURIComponent(actorId)}`;
    return '/community';
  }

  if (type === 'reaction_on_post' || type === 'repost' || type === 'followed_new_post') {
    if (postId) return `/community/posts/${encodeURIComponent(postId)}`;
    return '/community';
  }

  if (type === 'comment_on_post') {
    if (!postId) return '/community';
    return `/community/posts/${encodeURIComponent(postId)}${toQuery({ comment: commentId })}`;
  }

  if (type === 'mention_post') {
    if (!postId) return '/community';
    return `/community/posts/${encodeURIComponent(postId)}${toQuery({ mention: mentionToken })}`;
  }

  if (type === 'mention_comment') {
    if (!postId) return '/community';
    return `/community/posts/${encodeURIComponent(postId)}${toQuery({
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

  const explicit =
    normalizeId(data.action_url) ||
    normalizeId(data.actionUrl) ||
    normalizeId(data.link) ||
    normalizeId(data.url);
  if (explicit) return explicit;
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
