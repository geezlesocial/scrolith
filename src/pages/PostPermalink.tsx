import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
    interactions,
    userState: post.userState || post.user_state || {}
  };
};

export default function PostPermalink() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const postId = String(params.id || '').trim();

  const { user } = useUser();
  const { showNotification } = useNotification();

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const focusCommentId = String(query.get('comment') || '').trim();
  const focusMentionToken = String(query.get('mention') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<any | null>(null);
  const [commentCount, setCommentCount] = useState<number>(0);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-3 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading post…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-3 py-6">
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
        <div className="mx-auto max-w-3xl px-3 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Post not found.</div>
          <div className="mt-4">
            <Link to="/m/home" className="text-sm font-semibold text-blue-600 hover:underline">
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
      <div className="mx-auto max-w-3xl px-3 py-4">
        <button
          type="button"
          onClick={() => {
            try {
              navigate(-1);
            } catch {
              navigate('/m/home');
            }
          }}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                  showNotification('info', 'Hidden', 'Post hidden from your feed.', '/m/home');
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
                    navigate('/m/home');
                  } catch (e: any) {
                    const message =
                      e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unable to delete post.';
                    showNotification('error', 'Posts', message);
                  }
                }}
              />
            }
          />

          {post.title ? <h3 className="mt-3 font-semibold text-slate-900">{post.title}</h3> : null}
          {focusMentionToken ? (
            <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              You were mentioned in this post.
            </div>
          ) : null}

          <p className="mt-2 text-sm text-slate-700">
            <MentionText
              text={post.content}
              mentionToken={focusMentionToken || undefined}
              viewerId={user?.id}
              viewerUsername={user?.username}
            />
          </p>

          {post.tags?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
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

          {Array.isArray(post.attachments) && post.attachments.length > 0 ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {post.attachments.map((media: any) => {
                const type = inferMediaType(media || {});
                const key = media.id || media.url;
                if (type === 'video') {
                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <video src={media.url} controls className="h-40 w-full object-cover" />
                    </div>
                  );
                }
                if (type === 'image') {
                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img src={media.url} alt={media.name || 'Post media'} className="h-40 w-full object-cover" />
                    </div>
                  );
                }
                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <a href={media.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                      {media.name || String(media.url || '').split('/').pop() || 'View attachment'}
                    </a>
                  </div>
                );
              })}
            </div>
          ) : null}

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
        </div>
      </div>
    </div>
  );
}
