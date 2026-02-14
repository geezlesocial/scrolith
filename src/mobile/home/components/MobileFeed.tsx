import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MoreVertical, UserPlus } from 'lucide-react';

import { useSocket } from '../../../context/SocketContext';
import { useUser } from '../../../context/UserContext';
import { CommunityService } from '../../../services/community';
import { RecoService } from '../../../services/reco';
import MentionText from '../../../community/components/MentionText';
import PostEngagementBar from '../../../community/components/PostEngagementBar';
import FeedAdCard from './FeedAdCard';
import SuggestedCard from './SuggestedCard';

type MobileHomeLayoutSettings = {
  feed?: {
    showPromoted?: boolean;
    promotedFrequency?: number;
    showSuggestedPeople?: boolean;
    showSuggestedPages?: boolean;
    showTrendingTags?: boolean;
    showRecommendedGigsJobs?: boolean;
  };
  postCard?: {
    reactionsEnabled?: boolean;
    commentsEnabled?: boolean;
    repostsEnabled?: boolean;
    sendEnabled?: boolean;
    linkPreviewEnabled?: boolean;
    mediaPreviewEnabled?: boolean;
    mentionsEnabled?: boolean;
    hashtagsEnabled?: boolean;
  };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const relativeTime = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const isVideo = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('video/');
const isImage = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('image/');

export default function MobileFeed({ settings }: { settings?: MobileHomeLayoutSettings | null }) {
  const { user } = useUser();
  const { isConnected } = useSocket();

  const feedSettings = settings?.feed ?? {};
  const postCardSettings = settings?.postCard ?? {};

  const promotedFrequency = clamp(Number(feedSettings.promotedFrequency ?? 6) || 6, 2, 20);

  const [posts, setPosts] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [ads, setAds] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState<Array<{ slug: string; label: string; count?: number }>>([]);
  const [suggestedPeople, setSuggestedPeople] = useState<any[]>([]);
  const [suggestedPages, setSuggestedPages] = useState<any[]>([]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreArmedRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const loadInFlightRef = useRef(false);
  const rateLimitUntilRef = useRef<number>(0);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);

  const syncCommentCount = useCallback((postId: string, count: number) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (String(p?.id) !== String(postId)) return p;
        const interactions = { ...(p?.interactions || {}) };
        interactions.comments = count;
        return { ...p, interactions };
      })
    );
  }, []);

  const load = useCallback(async (mode: 'initial' | 'more') => {
    const now = Date.now();
    if (rateLimitUntilRef.current && now < rateLimitUntilRef.current) {
      return;
    }
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    try {
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const resp = await CommunityService.getFeed({
        cursor: mode === 'more' ? cursorRef.current || undefined : undefined,
        limit: 12,
        scope: 'discover'
      });
      const nextPosts = Array.isArray(resp?.items) ? resp.items : [];
      const nextCursor = resp?.nextCursor ? String(resp.nextCursor) : null;

      rateLimitUntilRef.current = 0;
      setRateLimitUntil(null);
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      setPosts((prev) => (mode === 'more' ? [...prev, ...nextPosts] : nextPosts));
    } catch (e: any) {
      const status = Number(e?.response?.status || 0);
      const backendError = e?.response?.data?.error ?? e?.message ?? 'Failed to load feed.';

      if (status === 429) {
        const headers = (e?.response?.headers || {}) as Record<string, any>;
        const retryAfterRaw = headers['retry-after'];
        const resetRaw = headers['x-ratelimit-reset'];

        let waitMs = 2 * 60 * 1000;
        const retryAfterSeconds = Number.parseInt(String(retryAfterRaw || ''), 10);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          waitMs = retryAfterSeconds * 1000;
        } else {
          const resetEpochSeconds = Number.parseInt(String(resetRaw || ''), 10);
          if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds > 0) {
            const computed = resetEpochSeconds * 1000 - Date.now();
            if (Number.isFinite(computed) && computed > 0) waitMs = computed;
          }
        }

        // Clamp to a sane range to avoid giant or negative waits.
        waitMs = clamp(waitMs, 10_000, 10 * 60 * 1000);
        rateLimitUntilRef.current = Date.now() + waitMs;
        setRateLimitUntil(rateLimitUntilRef.current);

        setError(String(backendError || 'Too many requests. Please try again later.'));
      } else {
        setError(String(backendError));
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (!feedSettings.showPromoted) return;
    CommunityService.getPublicAds({ placement: 'feed', limit: 8 })
      .then((items) => setAds(Array.isArray(items) ? items : []))
      .catch(() => setAds([]));
  }, [feedSettings.showPromoted]);

  useEffect(() => {
    if (feedSettings.showTrendingTags === false) return;
    CommunityService.getTrendingTags(10, 7)
      .then((items) => {
        const mapped = (Array.isArray(items) ? items : []).map((row: any) => ({
          slug: String(row?.slug || row?.id || row?.label || '').trim() || String(row?.label || '').trim(),
          label: String(row?.label || row?.slug || row?.name || '').trim() || 'tag',
          count: typeof row?.count === 'number' ? row.count : undefined
        }));
        setTrendingTags(mapped.filter((t) => t.slug && t.label));
      })
      .catch(() => setTrendingTags([]));
  }, [feedSettings.showTrendingTags]);

  useEffect(() => {
    if (feedSettings.showSuggestedPeople === false) return;
    if (!user?.id) return;
    Promise.allSettled([
      RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: 4 }),
      RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: 4 })
    ])
      .then((results) => {
        const merged: any[] = [];
        results.forEach((r) => {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) merged.push(...r.value);
        });
        const mapped = merged
          .map((p: any) => {
            const account = p?.account || p;
            const id = String(account?.id || p?.entityId || p?.id || p?.userId || '').trim();
            const name = String(account?.name || p?.name || 'Community member').trim();
            const username = String(account?.username || p?.username || '').trim();
            const avatarUrl = account?.avatar || p?.avatar || null;
            if (!id || !name) return null;
            return { id, name, username, avatarUrl, targetType: 'user' as const };
          })
          .filter(Boolean);
        setSuggestedPeople(mapped.slice(0, 4));
      })
      .catch(() => setSuggestedPeople([]));
  }, [feedSettings.showSuggestedPeople, user?.id]);

  useEffect(() => {
    if (feedSettings.showSuggestedPages === false) return;
    if (!user?.id) return;
    RecoService.getAccounts({ surface: 'member_home', type: 'page', limit: 4 })
      .then((items) => {
        const mapped = (Array.isArray(items) ? items : [])
          .map((p: any) => {
            const account = p?.account || p;
            const id = String(account?.id || p?.entityId || p?.id || p?.pageId || '').trim();
            const name = String(account?.name || p?.name || 'Business page').trim();
            const username = String(account?.slug || account?.handle || account?.username || p?.slug || '').trim();
            const avatarUrl = account?.avatar || p?.avatar || null;
            if (!id || !name) return null;
            return { id, name, username, avatarUrl, targetType: 'page' as const };
          })
          .filter(Boolean);
        setSuggestedPages(mapped.slice(0, 4));
      })
      .catch(() => setSuggestedPages([]));
  }, [feedSettings.showSuggestedPages, user?.id]);

  useEffect(() => {
    if (isConnected) return;
    const id = window.setInterval(() => {
      void load('initial');
    }, 60000);
    return () => window.clearInterval(id);
  }, [isConnected, load]);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const post = payload?.post;
      if (!post?.id) return;
      setPosts((prev) => {
        if (prev.some((p) => String(p?.id) === String(post.id))) return prev;
        return [post, ...prev];
      });
    };
    const onUpdated = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const post = payload?.post;
      if (!post?.id) return;
      setPosts((prev) => prev.map((p) => (String(p?.id) === String(post.id) ? { ...p, ...post } : p)));
    };
    const onDeleted = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const postId = payload?.postId || payload?.id;
      if (!postId) return;
      setPosts((prev) => prev.filter((p) => String(p?.id) !== String(postId)));
    };

    window.addEventListener('community:post_created', onCreated as EventListener);
    window.addEventListener('community:post_updated', onUpdated as EventListener);
    window.addEventListener('community:post_deleted', onDeleted as EventListener);
    return () => {
      window.removeEventListener('community:post_created', onCreated as EventListener);
      window.removeEventListener('community:post_updated', onUpdated as EventListener);
      window.removeEventListener('community:post_deleted', onDeleted as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!cursor) return;
        if (loadingMore || loading) return;
        if (loadMoreArmedRef.current) return;
        loadMoreArmedRef.current = true;
        void load('more').finally(() => {
          loadMoreArmedRef.current = false;
        });
      },
      { rootMargin: '600px 0px', threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [cursor, loading, loadingMore, load]);

  const adForIndex = useCallback(
    (index: number) => {
      if (!ads.length) return null;
      const idx = index % ads.length;
      return ads[idx];
    },
    [ads]
  );

  const showTagsCard = feedSettings.showTrendingTags !== false && trendingTags.length > 0;
  const showPeopleCard = feedSettings.showSuggestedPeople !== false && suggestedPeople.length > 0;
  const showPagesCard = feedSettings.showSuggestedPages !== false && suggestedPages.length > 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-3 py-4">
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-slate-600">Loading feed...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-3 py-4">
        <div className="rounded-2xl border border-red-200 bg-white p-4">
          <div className="text-sm font-semibold text-red-700">Feed error</div>
          <div className="mt-1 text-sm text-slate-700">{error}</div>
          {rateLimitUntil && Date.now() < rateLimitUntil ? (
            <div className="mt-2 text-xs font-semibold text-slate-500">
              Rate limited. Please wait a moment, then retry.
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void load('initial')}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="mx-auto max-w-md px-3 py-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No posts yet. Be the first to share an update.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="space-y-3">
        {posts.map((post, idx) => {
          const postId = String(post?.id || '');
          const author = post?.author || {};
          const authorName = author.displayName || post?.authorName || post?.authorUsername || 'Member';
          const authorAvatar = author.avatarUrl || post?.authorAvatar || null;
          const authorId = post?.authorUserId || post?.authorId;
          const createdAt = post?.createdAt;

          const content = String(post?.content || '');
          const isLong = content.length > 240;
          const isExpanded = Boolean(expanded[postId]);
          const visibleText = isLong && !isExpanded ? `${content.slice(0, 240).trim()}...` : content;

          const commentCount = post?.interactions?.comments ?? 0;
          const reactionCounts = post?.interactions?.reactions ?? {};

          const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
          const showMedia = postCardSettings.mediaPreviewEnabled !== false;

          const showHashtags = postCardSettings.hashtagsEnabled !== false;
          const tags = Array.isArray(post?.tags) ? post.tags : [];

          return (
            <React.Fragment key={postId || `post_${idx}`}>
              <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      {authorAvatar ? <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{authorName}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span>{relativeTime(createdAt) || 'now'}</span>
                        {post?.visibility ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {String(post.visibility).toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {user?.id && authorId && String(authorId) !== String(user.id) ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        onClick={() => void CommunityService.followTarget({ targetType: 'user', targetId: String(authorId) }).catch(() => {})}
                        aria-label="Follow"
                      >
                        <UserPlus className="h-4 w-4" />
                        Follow
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                      aria-label="More"
                      onClick={() => {}}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {post?.title ? <h3 className="text-base font-semibold text-slate-900">{post.title}</h3> : null}
                  <div className="text-sm text-slate-700">
                    <MentionText text={visibleText} viewerId={user?.id} viewerUsername={user?.username} />
                    {isLong ? (
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [postId]: !prev[postId] }))}
                        className="ml-2 text-sm font-semibold text-slate-900 hover:underline"
                      >
                        {isExpanded ? 'less' : 'more'}
                      </button>
                    ) : null}
                  </div>

                  {showHashtags && tags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {tags.slice(0, 8).map((tag: string) => (
                        <a
                          key={`${postId}_tag_${tag}`}
                          href={`/community/tags/${encodeURIComponent(tag)}`}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                        >
                          #{tag}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {showMedia && attachments.length ? (
                    <div className="grid gap-2">
                      {attachments.slice(0, 3).map((file: any) => (
                        <div key={`${postId}_att_${file.id || file.url}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          {isVideo(file.mimeType) ? (
                            <video src={file.url} className="h-56 w-full object-cover" controls preload="metadata" />
                          ) : isImage(file.mimeType) ? (
                            <img src={file.url} alt={file.name || 'Attachment'} className="h-56 w-full object-cover" />
                          ) : (
                            <a href={file.url} className="block p-4 text-sm font-semibold text-slate-700 hover:underline">
                              {file.name || file.url}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <PostEngagementBar
                  postId={postId}
                  authorId={authorId}
                  commentPolicy={post?.commentPolicy}
                  commentCount={commentCount}
                  repostCount={post?.repostsCount ?? post?.interactions?.reposts ?? 0}
                  shareCount={post?.sharesCount ?? post?.interactions?.shares ?? 0}
                  viewCount={post?.interactions?.views ?? post?.viewsCount ?? 0}
                  initialReactionCounts={reactionCounts}
                  initialUserReaction={post?.userState?.reaction}
                  onCommentCountChange={syncCommentCount}
                  features={{
                    reactions: postCardSettings.reactionsEnabled !== false,
                    comments: postCardSettings.commentsEnabled !== false,
                    reposts: postCardSettings.repostsEnabled !== false,
                    send: postCardSettings.sendEnabled !== false
                  }}
                />
              </article>

              {feedSettings.showPromoted !== false && promotedFrequency > 0 && (idx + 1) % promotedFrequency === 0 ? (
                (() => {
                  const ad = adForIndex(idx + 1);
                  return ad ? <FeedAdCard ad={ad} /> : null;
                })()
              ) : null}

              {idx === 1 && showTagsCard ? (
                <SuggestedCard data={{ kind: 'tags', title: 'Trending tags', items: trendingTags }} />
              ) : null}

              {idx === 3 && showPeopleCard ? (
                <SuggestedCard data={{ kind: 'people', title: 'Suggested people', items: suggestedPeople.map((p) => ({ ...p, name: p.name, username: p.username, avatarUrl: p.avatarUrl, targetType: 'user' })) }} />
              ) : null}

              {idx === 5 && showPagesCard ? (
                <SuggestedCard data={{ kind: 'pages', title: 'Suggested pages', items: suggestedPages.map((p) => ({ ...p, name: p.name, username: p.username, avatarUrl: p.avatarUrl, targetType: 'page' })) }} />
              ) : null}
            </React.Fragment>
          );
        })}

        {loadingMore ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more...
          </div>
        ) : null}

        <div ref={sentinelRef} className="h-6" />

        {!cursor ? <div className="py-6 text-center text-xs text-slate-500">You're all caught up.</div> : null}
      </div>
    </div>
  );
}
