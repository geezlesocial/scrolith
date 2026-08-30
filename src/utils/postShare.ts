import { getBackendOrigin } from './apiBase';
import { buildPublicAppUrl } from './siteUrl';

export const normalizeShareText = (value: unknown, maxLength: number) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

export const buildPostMessageId = (input: {
  postId?: string | null;
  conversationId: string;
  permalinkUrl: string;
  shareAttemptId: string;
}) => {
  const postKey = String(input.postId || input.permalinkUrl || 'post').trim();
  const conversationKey = String(input.conversationId || '').trim();
  const attemptKey = String(input.shareAttemptId || '').trim();
  return `post-share:${postKey}:${conversationKey}:${attemptKey}`;
};

export const buildPostPermalink = (postId?: string | null) => {
  const encodedId = encodeURIComponent(String(postId || '').trim());
  if (!encodedId) return buildPublicAppUrl('/');
  return buildPublicAppUrl(`/post/${encodedId}`);
};

export const buildPostSharePreviewUrl = (postId?: string | null) => {
  const encodedId = encodeURIComponent(String(postId || '').trim());
  if (!encodedId) return buildPublicAppUrl('/');
  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) return buildPostPermalink(postId);
  return `${backendOrigin}/share/posts/${encodedId}`;
};

export const buildPostSocialShareTargets = (input: {
  postId?: string | null;
  permalinkUrl: string;
  shareHeading?: string | null;
  shareSummary?: string | null;
}) => {
  const permalinkUrl = String(input.permalinkUrl || '').trim() || buildPostPermalink(input.postId);
  const shareHeading = normalizeShareText(input.shareHeading, 180) || 'Check this post on Scrolith';
  const shareSummary = normalizeShareText(input.shareSummary, 240);
  const summaryOrHeading = shareSummary || shareHeading;
  const socialShareText = [shareHeading, shareSummary, permalinkUrl].filter(Boolean).join('\n\n');

  const encodedPermalinkUrl = encodeURIComponent(permalinkUrl);
  const encodedHeading = encodeURIComponent(shareHeading);
  const encodedSummary = encodeURIComponent(summaryOrHeading);
  const encodedSocialText = encodeURIComponent(socialShareText);

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedPermalinkUrl}&quote=${encodedHeading}`,
    x: `https://twitter.com/intent/tweet?url=${encodedPermalinkUrl}&text=${encodedSocialText}`,
    linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${encodedPermalinkUrl}&title=${encodedHeading}&summary=${encodedSummary}`,
    whatsapp: `https://wa.me/?text=${encodedSocialText}`
  } as const;
};
