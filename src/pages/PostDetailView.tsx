import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Sparkles, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import { CommunityService } from '../services/community';
import { resolveAssetUrl } from '../utils/assetUrl';

import PostHeader from '../community/components/PostHeader';
import MentionText from '../community/components/MentionText';
import PostEngagementBar from '../community/components/PostEngagementBar';
import PostOptionsButton from '../community/components/post-options/PostOptionsButton';

const inferMediaType = (media: { url?: string; mimeType?: string; type?: string }) => {
  const explicit = String(media.type || '').toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const url = String(media.url || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg)$/.test(url)) return 'video';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url)) return 'image';
  return 'document';
};

const toCount = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
};

const mergePostData = (current: any, incoming: any) => {
  if (!current) return incoming;
  if (!incoming) return current;
  return {
    ...current,
    ...incoming,
    author: { ...(current.author || {}), ...(incoming.author || {}) },
    viewer: { ...(current.viewer || {}), ...(incoming.viewer || {}) },
    interactions: { ...(current.interactions || {}), ...(incoming.interactions || {}) },
    userState: { ...(current.userState || {}), ...(incoming.userState || {}) }
  };
};

const normalizePost = (post: any) => {
  const interactions = { ...(post.interactions || {}) };
  if (interactions.likes === undefined) interactions.likes = post.likesCount ?? post.likes_count ?? 0;
  if (interactions.comments === undefined) interactions.comments = post.commentsCount ?? post.comments_count ?? 0;
  if (interactions.reposts === undefined) interactions.reposts = post.repostsCount ?? post.reposts_count ?? 0;
  if (interactions.shares === undefined) interactions.shares = post.sharesCount ?? post.shares_count ?? 0;
  if (interactions.views === undefined) interactions.views = post.viewsCount ?? post.views_count ?? 0;
  if (interactions.reactions === undefined) interactions.reactions = post.reactions || {};

  const authorId =
    post.authorId ||
    post.userId ||
    post.user_id ||
    post.author?.id ||
    post.author?.userId ||
    post.author?.user_id;
  const authorName = post.authorName || post.userName || post.user_name || post.author?.displayName || post.author?.name || 'Member';
  const authorUsername =
    post.authorUsername || post.userUsername || post.user_username || post.author?.username || post.author?.userName || post.author?.user_name || null;
  const authorAvatar = post.authorAvatar || post.userAvatar || post.user_avatar || post.author?.avatarUrl || post.author?.avatar || '';
  const authorType = post.author?.type || (post.businessPage ? 'business' : 'user');
  const authorUserId =
    post.authorUserId ||
    post.author_user_id ||
    post.author?.userId ||
    post.author?.user_id ||
    (authorType === 'user' ? authorId : null);

  const aiInsightTextRaw = post.aiInsightText ?? post.ai_insight_text ?? null;
  const aiInsightText =
    aiInsightTextRaw === null || aiInsightTextRaw === undefined
      ? null
      : String(aiInsightTextRaw).trim() || null;

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    attachments: (post.attachments || []).map((item: any) => ({
      id: item.id || item.fileId,
      url: resolveAssetUrl(item.url || item),
      name: item.name || item.originalName || item.filename,
      mimeType: item.mimeType || item.mime_type,
      type: item.type || inferMediaType(item)
    })),
    author: {
      id: post.author?.id || (authorType === 'business' ? post.businessPage?.id : authorId),
      username: post.author?.username ?? authorUsername,
      displayName: post.author?.displayName || authorName,
      avatarUrl: post.author?.avatarUrl || authorAvatar,
      type: authorType,
      businessSlug: post.author?.businessSlug || post.businessPage?.slug || null,
      isVerified: Boolean(post.author?.isVerified),
      isPro: Boolean(post.author?.isPro)
    },
    viewer: {
      isFollowingAuthor: post.viewer?.isFollowingAuthor
    },
    authorId,
    authorUserId,
    authorName,
    authorUsername,
    authorAvatar,
    createdAt: post.createdAt || post.created_at,
    updatedAt: post.updatedAt || post.updated_at,
    tags: post.tags || [],
    mentions: post.mentions || [],
    topic: post.topic || null,
    location: post.location || null,
    visibility: post.visibility,
    commentPolicy: post.commentPolicy || post.comment_policy || 'everyone',
    repostsEnabled: post.repostsEnabled ?? post.reposts_enabled,
    isPinned: post.isPinned ?? post.is_pinned ?? false,
    isHighlighted: post.isHighlighted ?? post.is_highlighted ?? false,
    likesCount: post.likesCount ?? post.likes_count ?? interactions.likes,
    sharesCount: post.sharesCount ?? post.shares_count ?? interactions.shares,
    repostsCount: post.repostsCount ?? post.reposts_count ?? interactions.reposts,
    viewsCount: post.viewsCount ?? post.views_count ?? interactions.views ?? 0,
    aiInsightEnabled: Boolean(post.aiInsightEnabled ?? post.ai_insight_enabled ?? false),
    aiInsightGenerated: Boolean(post.aiInsightGenerated ?? post.ai_insight_generated ?? (aiInsightText ? true : false)),
    aiInsightText,
    aiScore: post.aiScore ?? post.ai_score ?? null,
    interactions,
    userState: post.userState || post.user_state || {}
  };
};

export default function PostDetailView() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ postId?: string; id?: string }>();
  const postId = String(params.postId || params.id || '').trim();

  const { user } = useUser();
  const { showNotification } = useNotification();

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const focusCommentId = String(query.get('comment') || '').trim();
  const focusMentionToken = String(query.get('mention') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<any | null>(null);
  const [commentCount, setCommentCount] = useState<number>(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(true);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await CommunityService.getPostById(postId);
      const normalized = raw ? normalizePost(raw) : null;
      setPost(normalized);
      setCommentCount(normalized?.interactions?.comments ?? 0);
    } catch (e: any) {
      const message = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Failed to load post.';
      setError(message);
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id || !post?.id) return;
    CommunityService.postView(post.id).catch(() => {});
  }, [post?.id, user?.id]);

  useEffect(() => {
    setActiveMediaIndex(0);
    setLightboxOpen(false);
    setInsightCollapsed(true);
  }, [post?.id]);

  useEffect(() => {
    if (!post?.id) return;
    const currentPostId = String(post.id);

    const onPostUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const updatedPostId = String(detail?.post?.id || detail?.id || detail?.postId || detail?.post_id || '').trim();
      if (!updatedPostId || updatedPostId !== currentPostId) return;
      if (detail?.post) {
        const normalized = normalizePost(detail.post);
        setPost((prev: any) => mergePostData(prev, normalized));
        if (normalized?.interactions?.comments !== undefined) {
          setCommentCount(toCount(normalized.interactions.comments, 0));
        }
      } else {
        void load();
      }
    };

    const onPostDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const deletedPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!deletedPostId || deletedPostId !== currentPostId) return;
      setPost(null);
      showNotification('info', 'Post removed', 'This post is no longer available.');
      navigate('/community');
    };

    const onPostMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const metricsPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!metricsPostId || metricsPostId !== currentPostId) return;

      setPost((prev: any) => {
        if (!prev) return prev;
        const interactionPatch =
          detail?.interactions && typeof detail.interactions === 'object' && !Array.isArray(detail.interactions)
            ? detail.interactions
            : {};
        const nextInteractions = {
          ...(prev.interactions || {}),
          ...interactionPatch
        };

        if (detail?.comments !== undefined || detail?.commentCount !== undefined) {
          nextInteractions.comments = toCount(detail.commentCount ?? detail.comments, toCount(nextInteractions.comments, 0));
        }
        if (detail?.shares !== undefined || detail?.shareCount !== undefined) {
          nextInteractions.shares = toCount(detail.shareCount ?? detail.shares, toCount(nextInteractions.shares, 0));
        }
        if (detail?.reposts !== undefined || detail?.repostCount !== undefined) {
          nextInteractions.reposts = toCount(detail.repostCount ?? detail.reposts, toCount(nextInteractions.reposts, 0));
        }
        if (detail?.views !== undefined || detail?.viewCount !== undefined) {
          nextInteractions.views = toCount(detail.viewCount ?? detail.views, toCount(nextInteractions.views, 0));
        }

        setCommentCount(toCount(nextInteractions.comments, 0));

        return {
          ...prev,
          interactions: nextInteractions,
          sharesCount: toCount(nextInteractions.shares, toCount(prev.sharesCount, 0)),
          repostsCount: toCount(nextInteractions.reposts, toCount(prev.repostsCount, 0)),
          viewsCount: toCount(nextInteractions.views, toCount(prev.viewsCount, 0))
        };
      });
    };

    const onPostReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const reactionPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!reactionPostId || reactionPostId !== currentPostId) return;
      const reactions = detail?.reactions;
      if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) return;
      setPost((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          interactions: {
            ...(prev.interactions || {}),
            reactions
          }
        };
      });
    };

    const onPostAiInsightReady = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const insightPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!insightPostId || insightPostId !== currentPostId) return;
      const insightRaw = detail?.aiInsightText ?? detail?.ai_insight_text;
      if (insightRaw === null || insightRaw === undefined) {
        void load();
        return;
      }
      const insightText = String(insightRaw).trim();
      setPost((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          aiInsightGenerated: Boolean(insightText),
          aiInsightText: insightText || null
        };
      });
      if (insightText) {
        setInsightCollapsed(false);
      }
    };

    window.addEventListener('community:post_updated', onPostUpdated as EventListener);
    window.addEventListener('community:post_deleted', onPostDeleted as EventListener);
    window.addEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
    window.addEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
    window.addEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
    window.addEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);

    return () => {
      window.removeEventListener('community:post_updated', onPostUpdated as EventListener);
      window.removeEventListener('community:post_deleted', onPostDeleted as EventListener);
      window.removeEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
      window.removeEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
      window.removeEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
      window.removeEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    };
  }, [load, navigate, post?.id, showNotification]);

  const mediaItems = useMemo(() => (Array.isArray(post?.attachments) ? post.attachments : []), [post?.attachments]);
  const selectedMedia = mediaItems[activeMediaIndex] || null;
  const selectedMediaType = inferMediaType(selectedMedia || {});

  const aiInsightText = String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim();
  const hasAiInsight = Boolean((post?.aiInsightGenerated ?? post?.ai_insight_generated ?? false) && aiInsightText);

  const analytics = useMemo(
    () => ({
      reactions: Object.values(post?.interactions?.reactions || {}).reduce((sum, count) => sum + toCount(count, 0), 0),
      comments: toCount(commentCount, 0),
      reposts: toCount(post?.repostsCount ?? post?.interactions?.reposts ?? 0, 0),
      shares: toCount(post?.sharesCount ?? post?.interactions?.shares ?? 0, 0),
      views: toCount(post?.viewsCount ?? post?.interactions?.views ?? 0, 0)
    }),
    [commentCount, post?.interactions?.reactions, post?.interactions?.reposts, post?.interactions?.shares, post?.interactions?.views, post?.repostsCount, post?.sharesCount, post?.viewsCount]
  );

  const openMediaLightbox = useCallback((index: number) => {
    if (!mediaItems.length) return;
    const nextIndex = Math.min(Math.max(index, 0), mediaItems.length - 1);
    setActiveMediaIndex(nextIndex);
    setLightboxOpen(true);
  }, [mediaItems.length]);

  const changeMedia = useCallback(
    (direction: -1 | 1) => {
      if (!mediaItems.length) return;
      setActiveMediaIndex((prev) => (prev + direction + mediaItems.length) % mediaItems.length);
    },
    [mediaItems.length]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-3 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading post...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-3 py-6">
          <div className="rounded-2xl border border-red-200 bg-white p-5">
            <div className="text-sm font-semibold text-red-700">Post error</div>
            <div className="mt-1 text-sm text-slate-700">{error}</div>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-3 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Post not found.</div>
          <div className="mt-4">
            <Link to="/" className="text-sm font-semibold text-blue-600 hover:underline">
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(user?.id && post.authorUserId && String(user.id) === String(post.authorUserId));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-3 py-4">
        <button
          type="button"
          onClick={() => {
            try {
              navigate(-1);
            } catch {
              navigate('/');
            }
          }}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Post Detail View
          </div>
          <PostHeader
            author={post.author}
            createdAt={post.createdAt}
            currentUserId={user?.id}
            initialIsFollowing={post.viewer?.isFollowingAuthor}
            onRequireLogin={() => {
              if (confirm('Log in to follow users?')) window.location.href = '/auth/login';
            }}
            metaBadges={
              <>
                {post.isPinned ? (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                    Pinned
                  </span>
                ) : null}
                {post.isHighlighted ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Highlighted
                  </span>
                ) : null}
              </>
            }
            rightSlot={
              <PostOptionsButton
                post={post}
                onHideFromFeed={() => {
                  setPost(null);
                  showNotification('info', 'Hidden', 'Post hidden from your feed.', '/');
                }}
                onEditPost={() => {
                  // CommunityHome currently owns the inline edit UX; we deep-link into it.
                  navigate(`/community/posts/${encodeURIComponent(post.id)}?edit=1`);
                }}
                onDeletePost={async () => {
                  if (!isOwner) return;
                  if (!confirm('Delete this post?')) return;
                  try {
                    await CommunityService.deletePost(post.id);
                    showNotification('success', 'Posts', 'Post deleted.');
                    navigate('/');
                  } catch (e: any) {
                    const message =
                      e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unable to delete post.';
                    showNotification('error', 'Posts', message);
                  }
                }}
              />
            }
          />

          {post.title ? <h1 className="mt-3 text-xl font-semibold text-slate-900">{post.title}</h1> : null}
          {focusMentionToken ? (
            <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              You were mentioned in this post.
            </div>
          ) : null}

          <div className="mt-3 text-sm leading-relaxed text-slate-700">
            <MentionText
              text={post.content}
              mentionToken={focusMentionToken || undefined}
              viewerId={user?.id}
              viewerUsername={user?.username}
            />
          </div>

          {post.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          {mediaItems.length ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-black">
                {selectedMedia ? (
                  <>
                    {selectedMediaType === 'image' ? (
                      <button
                        type="button"
                        onClick={() => openMediaLightbox(activeMediaIndex)}
                        className="block w-full"
                      >
                        <img
                          src={selectedMedia.url}
                          alt={selectedMedia.name || 'Post media'}
                          className="h-[360px] w-full object-contain md:h-[460px]"
                        />
                      </button>
                    ) : null}

                    {selectedMediaType === 'video' ? (
                      <video
                        src={selectedMedia.url}
                        controls
                        className="h-[360px] w-full object-contain md:h-[460px]"
                      />
                    ) : null}

                    {selectedMediaType === 'document' ? (
                      <div className="flex h-[260px] w-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-200">
                        <p className="font-semibold">{selectedMedia.name || 'Attachment'}</p>
                        <a
                          href={selectedMedia.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-900"
                        >
                          Open document
                        </a>
                      </div>
                    ) : null}

                    {(selectedMediaType === 'image' || selectedMediaType === 'video' || selectedMediaType === 'document') ? (
                      <button
                        type="button"
                        onClick={() => openMediaLightbox(activeMediaIndex)}
                        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        <Expand className="h-3.5 w-3.5" />
                        Expand
                      </button>
                    ) : null}
                  </>
                ) : null}

                {mediaItems.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => changeMedia(-1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                      aria-label="Previous media"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => changeMedia(1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                      aria-label="Next media"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>

              {mediaItems.length > 1 ? (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {mediaItems.map((media: any, index: number) => {
                    const type = inferMediaType(media || {});
                    return (
                      <button
                        key={media.id || media.url || index}
                        type="button"
                        onClick={() => setActiveMediaIndex(index)}
                        className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${
                          index === activeMediaIndex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
                        }`}
                        aria-label={`Open media ${index + 1}`}
                      >
                        {type === 'image' ? (
                          <img src={media.url} alt={media.name || `Media ${index + 1}`} className="h-full w-full object-cover" />
                        ) : type === 'video' ? (
                          <div className="flex h-full w-full items-center justify-center bg-slate-800 text-xs font-semibold text-white">
                            VIDEO
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-200 text-[10px] font-semibold text-slate-700">
                            FILE
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {hasAiInsight ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Insight
                </span>
                <button
                  type="button"
                  onClick={() => setInsightCollapsed((prev) => !prev)}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  {insightCollapsed ? 'Show' : 'Hide'}
                </button>
              </div>
              {!insightCollapsed ? (
                <p className="mt-2 text-sm text-emerald-900">{aiInsightText}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
              <p className="font-semibold text-slate-800">{analytics.reactions}</p>
              <p>Total reactions</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
              <p className="font-semibold text-slate-800">{analytics.comments}</p>
              <p>Comments</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
              <p className="font-semibold text-slate-800">{analytics.reposts}</p>
              <p>Reposts</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
              <p className="font-semibold text-slate-800">{analytics.shares}</p>
              <p>Shares</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
              <p className="font-semibold text-slate-800">{analytics.views}</p>
              <p>Views</p>
            </div>
          </div>

          {post.topic || post.location ? (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {post.topic ? (
                <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">
                  Topic: {post.topic}
                </span>
              ) : null}
              {post.location ? (
                <span className="rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600">
                  Location: {post.location}
                </span>
              ) : null}
              {post.aiScore !== null && post.aiScore !== undefined ? (
                <span className="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-700">
                  AI score: {toCount(post.aiScore, 0)}
                </span>
              ) : null}
            </div>
          ) : null}

          <PostEngagementBar
            postId={post.id}
            authorId={post.authorUserId || post.authorId}
            commentPolicy={post.commentPolicy}
            postRepostsEnabled={post.repostsEnabled}
            commentCount={commentCount}
            repostCount={post.repostsCount ?? post.interactions?.reposts ?? 0}
            shareCount={post.sharesCount ?? post.interactions?.shares ?? 0}
            viewCount={post.interactions?.views ?? post.viewsCount ?? 0}
            initialReactionCounts={post.interactions?.reactions}
            initialUserReaction={post.userState?.reaction}
            focusCommentId={focusCommentId || undefined}
            focusMentionToken={focusMentionToken || undefined}
            onCommentCountChange={(_id, count) => setCommentCount(count)}
          />
        </article>
      </div>

      {lightboxOpen && selectedMedia ? (
        <div className="fixed inset-0 z-[110] bg-black/90 p-3">
          <div className="mx-auto flex h-full max-w-6xl flex-col">
            <div className="flex items-center justify-between gap-3 py-2 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedMedia.name || 'Post media'}</p>
                <p className="text-xs text-slate-300">
                  {activeMediaIndex + 1} / {mediaItems.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="rounded-full border border-white/30 p-2 text-white hover:bg-white/10"
                aria-label="Close media viewer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
              {selectedMediaType === 'image' ? (
                <img src={selectedMedia.url} alt={selectedMedia.name || 'Post media'} className="max-h-full max-w-full object-contain" />
              ) : null}

              {selectedMediaType === 'video' ? (
                <video src={selectedMedia.url} controls autoPlay className="max-h-full max-w-full" />
              ) : null}

              {selectedMediaType === 'document' ? (
                <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-200">
                  <p>{selectedMedia.name || 'Attachment'}</p>
                  <a
                    href={selectedMedia.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-900"
                  >
                    Open document
                  </a>
                </div>
              ) : null}

              {mediaItems.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => changeMedia(-1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                    aria-label="Previous media"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMedia(1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                    aria-label="Next media"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

