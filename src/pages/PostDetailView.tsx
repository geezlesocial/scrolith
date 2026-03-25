import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Download, Loader2, Sparkles, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import { CommunityService } from '../services/community';
import { jobsApi, type Job } from '../services/jobs';
import { gigsApi, type Gig } from '../services/gigs';
import { RecoService } from '../services/reco';
import { INLINE_VIDEO_PREVIEW_AUTOPLAY } from '../utils/inlineMedia';
import { resolvePostAttachmentMediaUrl, resolvePostAttachmentPosterUrl } from '../utils/postAttachmentMedia';
import { downloadToDevice } from '../utils/deviceDownload';

import PostHeader from '../community/components/PostHeader';
import MentionText from '../community/components/MentionText';
import PostEngagementBar from '../community/components/PostEngagementBar';
import PostOptionsButton from '../community/components/post-options/PostOptionsButton';
import GraphicWarningGate from '../components/media/GraphicWarningGate';
import InlineAutoplayVideo from '../components/media/InlineAutoplayVideo';
import PostVideoActionBar from '../components/media/PostVideoActionBar';
import FeedAdCard from '../mobile/home/components/FeedAdCard';
import RecommendedListingCard from '../mobile/home/components/RecommendedListingCard';
import SuggestedCard from '../mobile/home/components/SuggestedCard';

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

const formatCompactCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.trunc(numeric));
};

const formatDetailDate = (value: unknown) => {
  const timestamp = value instanceof Date ? value.getTime() : new Date(String(value || '')).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  return new Date(timestamp).toLocaleString();
};

const GRAPHIC_WARNING_LABEL = 'Graphic warning';
const FEED_SINGLE_MEDIA_HEIGHT_CLASS = 'h-[62svh] min-h-[20rem] max-h-[46rem] sm:h-[66svh] lg:h-[70svh]';
const FEED_MULTI_MEDIA_HEIGHT_CLASS = 'h-[46svh] min-h-[16rem] max-h-[32rem] sm:h-[50svh] lg:h-[54svh]';
const DETAIL_MEDIA_HEIGHT_CLASS = 'h-[64svh] min-h-[22rem] max-h-[54rem] md:h-[74svh]';
const STREAM_SECTION_MIN_HEIGHT_CLASS = 'min-h-[calc(100svh-7rem)]';

type SuggestedPage = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  targetType: 'page';
};

type StreamSupplement =
  | { type: 'ad'; key: string; ad: any }
  | { type: 'jobs'; key: string; items: Job[] }
  | { type: 'gigs'; key: string; items: Gig[] }
  | { type: 'pages'; key: string; items: SuggestedPage[] };

type StreamSection = {
  post: any;
  supplement: StreamSupplement | null;
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
  if (interactions.dashGcoinTotal === undefined) interactions.dashGcoinTotal = post.dashGcoinTotal ?? post.dash_gcoin_total ?? 0;

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
      id: item.id || item.fileId || item.file_id || resolvePostAttachmentMediaUrl(item),
      fileId: item.fileId || item.file_id || item.file?.id || item.asset?.id || item.id || null,
      url: resolvePostAttachmentMediaUrl(item),
      name: item.name || item.originalName || item.filename,
      mimeType: item.mimeType || item.mime_type,
      type: item.type || inferMediaType(item),
      thumbnailUrl: resolvePostAttachmentPosterUrl(item),
      duration: item.duration,
      width: item.width,
      height: item.height
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
    graphicWarning: Boolean(post.graphicWarning ?? post.graphic_warning ?? false),
    isAIEnhanced: Boolean(post.isAIEnhanced ?? post.is_ai_enhanced ?? false),
    dashGcoinTotal: Number(post.dashGcoinTotal ?? post.dash_gcoin_total ?? interactions.dashGcoinTotal ?? 0),
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

const dedupeById = <T extends { id?: string | null }>(items: T[]) => {
  const seen = new Set<string>();
  const out: T[] = [];
  items.forEach((item) => {
    const id = String(item?.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(item);
  });
  return out;
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const pickSlotIndexes = (count: number, slots: number, seed: string) => {
  if (count <= 0 || slots <= 0) return [] as number[];
  const maxSlots = Math.min(count, slots);
  const base = hashString(seed) || 1;
  const scored = Array.from({ length: count }, (_, idx) => ({
    idx,
    score: hashString(`${base}:${idx}:${count}`)
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored
    .slice(0, maxSlots)
    .map((row) => row.idx)
    .sort((a, b) => a - b);
};

const extractJobsFromPayload = (payload: any): Job[] => {
  if (Array.isArray(payload?.jobs)) return payload.jobs as Job[];
  if (Array.isArray(payload)) return payload as Job[];
  return [];
};

const extractGigsFromPayload = (payload: any): Gig[] => {
  if (Array.isArray(payload?.gigs)) return payload.gigs as Gig[];
  if (Array.isArray(payload)) return payload as Gig[];
  return [];
};

const normalizeSuggestedPage = (page: any): SuggestedPage | null => {
  const account = page?.account || page || {};
  const id = String(account?.id || page?.entityId || page?.id || page?.pageId || '').trim();
  const name = String(account?.name || page?.name || 'Business page').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    username: String(
      account?.pageSlug ||
        account?.slug ||
        account?.handle ||
        account?.username ||
        page?.slug ||
        page?.handle ||
        ''
    ).trim() || null,
    avatarUrl: account?.avatar || page?.avatar || page?.logo?.url || page?.logoUrl || null,
    targetType: 'page'
  };
};

const mergePostList = (current: any[], incoming: any[], excludedId?: string) => {
  const map = new Map<string, any>();
  const excluded = String(excludedId || '').trim();

  [...current, ...incoming].forEach((rawItem) => {
    if (!rawItem) return;
    const normalized = rawItem?.author && rawItem?.interactions ? rawItem : normalizePost(rawItem);
    const id = String(normalized?.id || '').trim();
    if (!id || (excluded && id === excluded)) return;
    const existing = map.get(id);
    map.set(id, existing ? mergePostData(existing, normalized) : normalized);
  });

  return Array.from(map.values());
};

const applyMetricsUpdate = (target: any, detail: any) => {
  if (!target) return target;
  const interactionPatch =
    detail?.interactions && typeof detail.interactions === 'object' && !Array.isArray(detail.interactions)
      ? detail.interactions
      : {};
  const nextInteractions = {
    ...(target.interactions || {}),
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

  return {
    ...target,
    interactions: nextInteractions,
    sharesCount: toCount(nextInteractions.shares, toCount(target.sharesCount, 0)),
    repostsCount: toCount(nextInteractions.reposts, toCount(target.repostsCount, 0)),
    viewsCount: toCount(nextInteractions.views, toCount(target.viewsCount, 0))
  };
};

const applyReactionUpdate = (target: any, reactions: any) => {
  if (!target || !reactions || typeof reactions !== 'object' || Array.isArray(reactions)) return target;
  return {
    ...target,
    interactions: {
      ...(target.interactions || {}),
      reactions
    }
  };
};

const applyAiInsightUpdate = (target: any, detail: any) => {
  if (!target) return target;
  const insightRaw = detail?.aiInsightText ?? detail?.ai_insight_text;
  if (insightRaw === null || insightRaw === undefined) return target;
  const insightText = String(insightRaw).trim();
  return {
    ...target,
    aiInsightGenerated: Boolean(insightText),
    aiInsightText: insightText || null
  };
};

const PostMetricCard: React.FC<{ label: string; value: unknown; emphasis?: boolean }> = ({ label, value, emphasis = false }) => (
  <div
    className={`rounded-2xl border px-4 py-3 ${
      emphasis
        ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-900'
        : 'border-slate-200 bg-white/90 text-slate-700'
    }`}
  >
    <div className={`text-lg font-semibold ${emphasis ? 'text-blue-950' : 'text-slate-900'}`}>{formatCompactCount(value)}</div>
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
  </div>
);

type FeedPostCardProps = {
  post: any;
  currentUserId?: string | null;
  autoplayEnabled: boolean;
  onOpenPost: (postId: string) => void;
  onRequireLogin: () => void;
  onCommentCountChange: (postId: string, count: number) => void;
  onHideFromFeed: (postId: string) => void;
  onEditPost: (post: any) => void;
  onDeletePost: (post: any) => void;
};

const FeedPostCard: React.FC<FeedPostCardProps> = ({
  post,
  currentUserId,
  autoplayEnabled,
  onOpenPost,
  onRequireLogin,
  onCommentCountChange,
  onHideFromFeed,
  onEditPost,
  onDeletePost
}) => {
  const attachments = Array.isArray(post.attachments) ? post.attachments : [];
  const contentText = String(post?.content || '');
  const aiInsightText = String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim();
  const hasAiInsight = Boolean((post?.aiInsightGenerated ?? post?.ai_insight_generated ?? false) && aiInsightText);
  const isAIEnhanced = Boolean(post?.isAIEnhanced ?? post?.is_ai_enhanced ?? false);
  const feedCommentCount = toCount(post?.interactions?.comments ?? post?.commentsCount ?? 0, 0);
  const [graphicRevealed, setGraphicRevealed] = useState(false);

  useEffect(() => {
    setGraphicRevealed(false);
  }, [post?.id]);

  return (
    <article className="overflow-hidden rounded-[30px] border border-slate-200/85 bg-gradient-to-b from-white via-white to-slate-50/80 p-5 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.38)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_28px_58px_-30px_rgba(15,23,42,0.44)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          In this feed
        </span>
        <button
          type="button"
          onClick={() => onOpenPost(post.id)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Open post
        </button>
      </div>

      <PostHeader
        author={post.author}
        createdAt={post.createdAt}
        currentUserId={currentUserId}
        initialIsFollowing={post.viewer?.isFollowingAuthor}
        onRequireLogin={onRequireLogin}
        metaBadges={
          <>
            {post.isPinned ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Pinned</span>
            ) : null}
                {post.isHighlighted ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Highlighted</span>
                ) : null}
                {post.isAIEnhanced ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <Sparkles className="h-3 w-3" />
                    AI-enhanced
                  </span>
                ) : null}
                {post.graphicWarning ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    {GRAPHIC_WARNING_LABEL}
                  </span>
                ) : null}
              </>
            }
        rightSlot={
          <PostOptionsButton
            post={post}
            buttonClassName="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            onHideFromFeed={onHideFromFeed}
            onEditPost={() => onEditPost(post)}
            onDeletePost={() => onDeletePost(post)}
          />
        }
      />

      {post.title ? (
        <button
          type="button"
          onClick={() => onOpenPost(post.id)}
          className="mt-4 text-left text-xl font-semibold leading-tight tracking-tight text-slate-950 transition hover:text-slate-700 [overflow-wrap:anywhere]"
        >
          {post.title}
        </button>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenPost(post.id)}
        className="mt-3 block w-full text-left text-[15px] leading-[1.78] text-slate-700 [overflow-wrap:anywhere]"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenPost(post.id);
          }
        }}
      >
        <MentionText text={contentText} viewerId={currentUserId || undefined} />
      </div>

      {post.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.tags.map((tag: string) => (
            <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      {attachments.length ? (
        <GraphicWarningGate
          active={Boolean(post.graphicWarning)}
          revealed={graphicRevealed}
          onReveal={() => setGraphicRevealed(true)}
          label={GRAPHIC_WARNING_LABEL}
          className="mt-4"
        >
          <div className={`grid gap-3 ${attachments.length === 1 ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
            {attachments.map((media: any) => {
              const type = inferMediaType(media || {});
              const mediaHeightClass =
                attachments.length === 1 ? FEED_SINGLE_MEDIA_HEIGHT_CLASS : FEED_MULTI_MEDIA_HEIGHT_CLASS;

              if (type === 'video') {
                return (
                  <div
                    key={media.id || media.url}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      if ((event.target as HTMLElement | null)?.closest('[data-inline-video-control=\"true\"]')) return;
                      onOpenPost(post.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpenPost(post.id);
                      }
                    }}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
                  >
                    <InlineAutoplayVideo
                      src={media.url}
                      poster={media.thumbnailUrl || undefined}
                      className={`${mediaHeightClass} w-full object-cover`}
                      controls={false}
                      autoplayEnabled={autoplayEnabled}
                      preload="metadata"
                      loadingLabel="Video loading"
                      overlay={(videoElement) => (
                        <PostVideoActionBar
                          postId={post.id}
                          postTitle={post.title}
                          postContent={post.content}
                          postLocation={post.location}
                          media={media}
                          videoElement={videoElement}
                        />
                      )}
                    />
                  </div>
                );
              }

              if (type === 'image') {
                return (
                  <button
                    key={media.id || media.url}
                    type="button"
                    onClick={() => onOpenPost(post.id)}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left shadow-sm"
                  >
                    <img src={media.url} alt={media.name || 'Post media'} className={`${mediaHeightClass} w-full object-cover`} />
                  </button>
                );
              }

              return (
                <button
                  key={media.id || media.url}
                  type="button"
                  onClick={() => onOpenPost(post.id)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm text-slate-600 shadow-sm"
                >
                  <div className="font-semibold text-slate-900">{media.name || 'Attachment'}</div>
                  <span className="mt-2 inline-flex text-xs font-semibold text-blue-600 underline">Open post</span>
                </button>
              );
            })}
          </div>
        </GraphicWarningGate>
      ) : null}

      {hasAiInsight ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            AI Insight
          </div>
          <p className="mt-2 line-clamp-3">{aiInsightText}</p>
        </div>
      ) : null}

      <PostEngagementBar
        postId={post.id}
        authorId={post.authorUserId || post.authorId}
        dashGcoinTotal={Number(post.dashGcoinTotal ?? post.interactions?.dashGcoinTotal ?? 0)}
        commentPolicy={post.commentPolicy}
        postRepostsEnabled={post.repostsEnabled}
        commentCount={feedCommentCount}
        repostCount={post.repostsCount ?? post.interactions?.reposts ?? 0}
        shareCount={post.sharesCount ?? post.interactions?.shares ?? 0}
        viewCount={post.interactions?.views ?? post.viewsCount ?? 0}
        initialReactionCounts={post.interactions?.reactions}
        initialUserReaction={post.userState?.reaction}
        onCommentCountChange={onCommentCountChange}
      />
    </article>
  );
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
  const [detailGraphicRevealed, setDetailGraphicRevealed] = useState(false);
  const [insightCollapsed, setInsightCollapsed] = useState(true);
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedLoadedOnce, setFeedLoadedOnce] = useState(false);
  const [streamAds, setStreamAds] = useState<any[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<Job[]>([]);
  const [recommendedGigs, setRecommendedGigs] = useState<Gig[]>([]);
  const [suggestedPages, setSuggestedPages] = useState<SuggestedPage[]>([]);
  const [streamActiveIndex, setStreamActiveIndex] = useState(0);

  const loadMoreRef = useRef(false);
  const feedSentinelRef = useRef<HTMLDivElement | null>(null);
  const streamItemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const streamObserverRef = useRef<IntersectionObserver | null>(null);

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
    setDetailGraphicRevealed(false);
  }, [post?.id]);

  const loadFeed = useCallback(
    async (cursor?: string | null, replace = false) => {
      if (loadMoreRef.current) return;
      loadMoreRef.current = true;
      setFeedLoading(true);
      if (replace) setFeedError(null);

      try {
        const response = await CommunityService.getFeed({
          limit: replace ? 6 : 5,
          cursor: cursor || undefined
        });
        const items = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : Array.isArray(response?.posts)
              ? response.posts
              : [];
        const normalizedItems = items.map(normalizePost).filter((item: any) => item?.id && String(item.id) !== postId);
        setFeedPosts((prev) => (replace ? mergePostList([], normalizedItems, postId) : mergePostList(prev, normalizedItems, postId)));
        setFeedCursor(response?.nextCursor ? String(response.nextCursor) : null);
        setFeedLoadedOnce(true);
      } catch (e: any) {
        const message = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unable to load more posts.';
        if (replace) {
          setFeedError(message);
        } else {
          showNotification('warning', 'Post feed', message);
        }
      } finally {
        loadMoreRef.current = false;
        setFeedLoading(false);
      }
    },
    [postId, showNotification]
  );

  const openPostDetail = useCallback(
    (id: string) => {
      const nextId = String(id || '').trim();
      if (!nextId) return;
      navigate(`/post/${encodeURIComponent(nextId)}`);
    },
    [navigate]
  );

  const patchFeedPost = useCallback((targetId: string, updater: (item: any) => any | null) => {
    setFeedPosts((prev) =>
      prev
        .map((item) => {
          if (String(item?.id || '') !== targetId) return item;
          return updater(item);
        })
        .filter(Boolean)
    );
  }, []);

  const handleDeletePost = useCallback(
    async (targetPost: any, options?: { redirectAfterDelete?: boolean }) => {
      const nextId = String(targetPost?.id || '').trim();
      if (!nextId) return;
      if (!confirm('Delete this post?')) return;
      try {
        await CommunityService.deletePost(nextId);
        showNotification('success', 'Posts', 'Post deleted.');
        if (options?.redirectAfterDelete) {
          navigate('/community');
          return;
        }
        patchFeedPost(nextId, () => null);
      } catch (e: any) {
        const message = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unable to delete post.';
        showNotification('error', 'Posts', message);
      }
    },
    [navigate, patchFeedPost, showNotification]
  );

  const loadStreamSupplements = useCallback(async () => {
    const [adsResult, featuredJobsResult, recommendedJobsResult, randomJobsResult, featuredGigsResult, recommendedGigsResult, randomGigsResult, pagesResult] =
      await Promise.allSettled([
        CommunityService.getPublicAds({ limit: 10 }),
        jobsApi.getJobs({ status: 'active', limit: 4, featuredOnly: true }),
        jobsApi.getJobs({ status: 'active', limit: 4, recommended: true }),
        jobsApi.getJobs({ status: 'active', limit: 4, random: true }),
        gigsApi.getGigs({ status: 'active', limit: 4, featuredOnly: true }),
        gigsApi.getGigs({ status: 'active', limit: 4, recommended: true }),
        gigsApi.getGigs({ status: 'active', limit: 4, random: true }),
        RecoService.getAccounts({ surface: 'member_home', type: 'page', limit: 6 }).catch(() =>
          CommunityService.getRecommendedBusinessPages(6)
        )
      ]);

    const nextAds = adsResult.status === 'fulfilled' && Array.isArray(adsResult.value) ? adsResult.value : [];
    const nextJobs = dedupeById(
      [
        featuredJobsResult,
        recommendedJobsResult,
        randomJobsResult
      ].flatMap((result) => (result.status === 'fulfilled' ? extractJobsFromPayload(result.value) : []))
    ).slice(0, 6);
    const nextGigs = dedupeById(
      [
        featuredGigsResult,
        recommendedGigsResult,
        randomGigsResult
      ].flatMap((result) => (result.status === 'fulfilled' ? extractGigsFromPayload(result.value) : []))
    ).slice(0, 6);
    const nextPages =
      pagesResult.status === 'fulfilled'
        ? dedupeById((Array.isArray(pagesResult.value) ? pagesResult.value : []).map(normalizeSuggestedPage).filter(Boolean) as SuggestedPage[]).slice(0, 6)
        : [];

    setStreamAds(nextAds);
    setRecommendedJobs(nextJobs);
    setRecommendedGigs(nextGigs);
    setSuggestedPages(nextPages);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!postId) return;
    setFeedPosts([]);
    setFeedCursor(null);
    setFeedError(null);
    setFeedLoadedOnce(false);
    loadMoreRef.current = false;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    void loadFeed(null, true);
  }, [loadFeed, postId]);

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
    if (!feedCursor || feedLoading || !feedSentinelRef.current) return undefined;
    const node = feedSentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loadMoreRef.current) return;
        void loadFeed(feedCursor, false);
      },
      {
        rootMargin: '0px 0px 320px 0px',
        threshold: 0.05
      }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feedCursor, feedLoading, loadFeed]);

  useEffect(() => {
    if (!post?.id) return;
    const currentPostId = String(post.id);

    const onPostUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const updatedPostId = String(detail?.post?.id || detail?.id || detail?.postId || detail?.post_id || '').trim();
      if (!updatedPostId) return;

      if (updatedPostId === currentPostId) {
        if (detail?.post) {
          const normalized = normalizePost(detail.post);
          setPost((prev: any) => mergePostData(prev, normalized));
          if (normalized?.interactions?.comments !== undefined) {
            setCommentCount(toCount(normalized.interactions.comments, 0));
          }
        } else {
          void load();
        }
        return;
      }

      if (detail?.post) {
        const normalized = normalizePost(detail.post);
        patchFeedPost(updatedPostId, (item) => mergePostData(item, normalized));
      }
    };

    const onPostDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const deletedPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!deletedPostId) return;
      if (deletedPostId === currentPostId) {
        setPost(null);
        showNotification('info', 'Post removed', 'This post is no longer available.');
        navigate('/community');
        return;
      }
      patchFeedPost(deletedPostId, () => null);
    };

    const onPostMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const metricsPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!metricsPostId) return;

      if (metricsPostId === currentPostId) {
        setPost((prev: any) => applyMetricsUpdate(prev, detail));
        setCommentCount((prev) => toCount(detail?.commentCount ?? detail?.comments, prev));
        return;
      }

      patchFeedPost(metricsPostId, (item) => applyMetricsUpdate(item, detail));
    };

    const onPostReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const reactionPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!reactionPostId) return;
      const reactions = detail?.reactions;

      if (reactionPostId === currentPostId) {
        setPost((prev: any) => applyReactionUpdate(prev, reactions));
        return;
      }

      patchFeedPost(reactionPostId, (item) => applyReactionUpdate(item, reactions));
    };

    const onPostAiInsightReady = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const insightPostId = String(detail?.postId || detail?.id || detail?.post_id || '').trim();
      if (!insightPostId) return;

      if (insightPostId === currentPostId) {
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
        return;
      }

      patchFeedPost(insightPostId, (item) => applyAiInsightUpdate(item, detail));
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
  }, [load, navigate, patchFeedPost, post?.id, showNotification]);

  useEffect(() => {
    setStreamActiveIndex(0);
    streamItemRefs.current = {};
  }, [postId]);

  useEffect(() => {
    if (loading || error) return;
    void loadStreamSupplements().catch(() => {
      setStreamAds([]);
      setRecommendedJobs([]);
      setRecommendedGigs([]);
      setSuggestedPages([]);
    });
  }, [error, loadStreamSupplements, loading, postId]);

  const streamPosts = useMemo(() => {
    if (!post) return feedPosts;
    return mergePostList([post], feedPosts, undefined);
  }, [feedPosts, post]);

  const streamSections = useMemo<StreamSection[]>(() => {
    const sections = streamPosts.map((entry) => ({ post: entry, supplement: null as StreamSupplement | null }));
    if (sections.length <= 1) return sections;

    const adCount = Math.min(streamAds.length, Math.max(1, Math.min(3, Math.floor(sections.length / 4))));
    const supplementPool: StreamSupplement[] = [];
    if (recommendedJobs.length) {
      supplementPool.push({
        type: 'jobs',
        key: `jobs:${recommendedJobs.slice(0, 2).map((item) => item.id).join(':')}`,
        items: recommendedJobs.slice(0, 2)
      });
    }
    if (recommendedGigs.length) {
      supplementPool.push({
        type: 'gigs',
        key: `gigs:${recommendedGigs.slice(0, 2).map((item) => item.id).join(':')}`,
        items: recommendedGigs.slice(0, 2)
      });
    }
    if (suggestedPages.length) {
      supplementPool.push({
        type: 'pages',
        key: `pages:${suggestedPages.slice(0, 4).map((item) => item.id).join(':')}`,
        items: suggestedPages.slice(0, 4)
      });
    }
    streamAds.slice(0, adCount).forEach((ad) => {
      const adId = String(ad?.id || '').trim();
      if (!adId) return;
      supplementPool.push({
        type: 'ad',
        key: `ad:${adId}`,
        ad
      });
    });

    if (!supplementPool.length) return sections;

    const seed = `${postId}:${sections.length}:${streamPosts.map((entry) => entry?.id).join(':')}`;
    const orderedSupplements = [...supplementPool].sort(
      (a, b) => hashString(`${seed}:${a.key}`) - hashString(`${seed}:${b.key}`)
    );
    const slotIndexes = pickSlotIndexes(sections.length - 1, orderedSupplements.length, seed).map((value) => value + 1);
    slotIndexes.forEach((sectionIndex, idx) => {
      const target = sections[sectionIndex];
      if (!target) return;
      target.supplement = orderedSupplements[idx] || null;
    });

    return sections;
  }, [postId, recommendedGigs, recommendedJobs, streamAds, streamPosts, suggestedPages]);

  const scrollToStreamIndex = useCallback(
    (nextIndex: number, behavior: ScrollBehavior = 'smooth') => {
      const clamped = Math.max(0, Math.min(nextIndex, streamSections.length - 1));
      const node = streamItemRefs.current[clamped];
      if (!node) return;
      node.scrollIntoView({ behavior, block: 'start' });
      setStreamActiveIndex(clamped);
    },
    [streamSections.length]
  );

  useEffect(() => {
    streamObserverRef.current?.disconnect();
    const sections = streamSections;
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; ratio: number } | null = null;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.index || -1);
          if (idx < 0) return;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { idx, ratio: entry.intersectionRatio };
          }
        });
        if (best) setStreamActiveIndex(best.idx);
      },
      {
        threshold: [0.35, 0.55, 0.72],
        rootMargin: '-6% 0px -18% 0px'
      }
    );

    streamObserverRef.current = observer;
    sections.forEach((_section, idx) => {
      const node = streamItemRefs.current[idx];
      if (!node) return;
      node.dataset.index = String(idx);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, [streamSections]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const target = event.target as HTMLElement | null;
      const tagName = String(target?.tagName || '').toLowerCase();
      if (target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      scrollToStreamIndex(streamActiveIndex + delta);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scrollToStreamIndex, streamActiveIndex]);

  useEffect(() => {
    if (!feedCursor || feedLoading || loadMoreRef.current) return;
    if (streamActiveIndex < Math.max(0, streamSections.length - 3)) return;
    void loadFeed(feedCursor, false);
  }, [feedCursor, feedLoading, loadFeed, streamActiveIndex, streamSections.length]);

  const activeStreamPost = streamSections[streamActiveIndex]?.post || post;

  const mediaItems = useMemo(() => (Array.isArray(post?.attachments) ? post.attachments : []), [post?.attachments]);
  const selectedMedia = mediaItems[activeMediaIndex] || null;
  const selectedMediaType = inferMediaType(selectedMedia || {});
  const canDownloadSelectedMedia = selectedMediaType === 'image' || selectedMediaType === 'document';
  const handleDownloadMedia = useCallback(
    async (media: any) => {
      const mediaType = inferMediaType(media || {});
      if (mediaType === 'video') {
        showNotification('warning', 'Download', 'Video downloads are disabled to protect creator content.');
        return;
      }
      const url = String(media?.url || '').trim();
      if (!url) {
        showNotification('warning', 'Download', 'Media URL is not available.');
        return;
      }
      try {
        const result = await downloadToDevice({
          url,
          fileName: media?.name,
          mimeType: media?.mimeType
        });
        showNotification(
          'success',
          'Download',
          result.native ? `Saved to ${result.path || 'your device'}.` : 'Download started.'
        );
      } catch (error: any) {
        showNotification('error', 'Download', error?.message || 'Unable to download media.');
      }
    },
    [showNotification]
  );

  const aiInsightText = String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim();
  const hasAiInsight = Boolean((post?.aiInsightGenerated ?? post?.ai_insight_generated ?? false) && aiInsightText);
  const isAIEnhanced = Boolean(post?.isAIEnhanced ?? post?.is_ai_enhanced ?? false);

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

  const renderStreamSupplement = useCallback((supplement: StreamSupplement | null) => {
    if (!supplement) return null;

    if (supplement.type === 'ad') {
      return <FeedAdCard ad={supplement.ad} />;
    }

    if (supplement.type === 'jobs') {
      return (
        <RecommendedListingCard
          kind="jobs"
          title="Recommended jobs"
          items={supplement.items}
          seeAllHref="/jobs"
        />
      );
    }

    if (supplement.type === 'gigs') {
      return (
        <RecommendedListingCard
          kind="gigs"
          title="Recommended gigs"
          items={supplement.items}
          seeAllHref="/gigs"
        />
      );
    }

    return <SuggestedCard data={{ kind: 'pages', title: 'Pages to follow', items: supplement.items }} />;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-3 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading post...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-3 py-6">
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
        <div className="mx-auto max-w-7xl px-3 py-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Post not found.</div>
          <div className="mt-4">
            <Link to="/community" className="text-sm font-semibold text-blue-600 hover:underline">
              Go to Community
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(user?.id && post.authorUserId && String(user.id) === String(post.authorUserId));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.14),_transparent_35%),linear-gradient(180deg,_#f1f5f9_0%,_#eef2ff_40%,_#e2e8f0_100%)]">
      <div className="mx-auto max-w-[92rem] px-3 py-4 md:px-5 lg:px-6">
        <div className="sticky top-3 z-30 mb-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.4)] backdrop-blur md:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  try {
                    navigate(-1);
                  } catch {
                    navigate('/community');
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Post view
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Post {Math.min(streamActiveIndex + 1, Math.max(streamSections.length, 1))} of {Math.max(streamSections.length, 1)}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {activeStreamPost?.author?.displayName || activeStreamPost?.authorName || 'Community member'}
                  {activeStreamPost?.title ? ` · ${activeStreamPost.title}` : ''}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => scrollToStreamIndex(streamActiveIndex - 1)}
                disabled={streamActiveIndex <= 0}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowUp className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => scrollToStreamIndex(streamActiveIndex + 1)}
                disabled={streamActiveIndex >= streamSections.length - 1}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadFeed(null, true);
                  void loadStreamSupplements();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <Loader2 className={`h-4 w-4 ${feedLoading ? 'animate-spin' : ''}`} />
                Refresh posts
              </button>
            </div>
          </div>
        </div>

        {feedError && !feedPosts.length ? (
          <div className="mb-4 rounded-[28px] border border-red-200 bg-red-50/90 px-4 py-4 text-sm text-red-700 shadow-sm">
            <div className="font-semibold">Unable to load more posts right now.</div>
            <div className="mt-1">{feedError}</div>
          </div>
        ) : null}

        <div className="space-y-5 snap-y snap-mandatory">
          <section
            ref={(node) => {
              streamItemRefs.current[0] = node;
            }}
            className={`${STREAM_SECTION_MIN_HEIGHT_CLASS} snap-start scroll-mt-24 rounded-[34px] border border-slate-200/70 bg-white/65 p-3 shadow-[0_20px_55px_-36px_rgba(15,23,42,0.42)] backdrop-blur md:p-5`}
          >
            <article className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/70 p-4 shadow-[0_24px_55px_-35px_rgba(15,23,42,0.4)] md:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
                    {post.visibility || 'public'}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-500">
                    Updated {formatDetailDate(post.updatedAt || post.createdAt)}
                  </span>
                </div>
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
                {isAIEnhanced ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <Sparkles className="h-3 w-3" />
                    AI-enhanced
                  </span>
                ) : null}
                {post.graphicWarning ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    {GRAPHIC_WARNING_LABEL}
                  </span>
                ) : null}
              </>
            }
            rightSlot={
              <PostOptionsButton
                post={post}
                onHideFromFeed={() => {
                  setPost(null);
                  showNotification('info', 'Hidden', 'Post hidden from your feed.');
                  navigate('/community');
                }}
                onEditPost={() => {
                  navigate(`/community/posts/${encodeURIComponent(post.id)}?edit=1`);
                }}
                onDeletePost={async () => {
                  if (!isOwner) return;
                  await handleDeletePost(post, { redirectAfterDelete: true });
                }}
              />
            }
          />

          {post.title ? <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 md:text-[2rem]">{post.title}</h1> : null}
          {focusMentionToken ? (
            <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-700">
              You were mentioned in this post.
            </div>
          ) : null}

          <div className="mt-4 text-[15px] leading-[1.82] text-slate-700 [overflow-wrap:anywhere] md:text-base">
            <MentionText
              text={post.content}
              mentionToken={focusMentionToken || undefined}
              viewerId={user?.id}
              viewerUsername={user?.username}
            />
          </div>

          {post.tags?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          {mediaItems.length ? (
            <div className="mt-5 rounded-[26px] border border-slate-200/90 bg-slate-50/90 p-2.5 shadow-inner">
              <GraphicWarningGate
                active={Boolean(post.graphicWarning)}
                revealed={detailGraphicRevealed}
                onReveal={() => setDetailGraphicRevealed(true)}
                label={GRAPHIC_WARNING_LABEL}
              >
                <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-black">
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
                            className={`${DETAIL_MEDIA_HEIGHT_CLASS} w-full object-contain`}
                          />
                        </button>
                      ) : null}

                      {selectedMediaType === 'video' ? (
                        <InlineAutoplayVideo
                          src={selectedMedia.url}
                          poster={selectedMedia.thumbnailUrl || undefined}
                          controls
                          autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY && streamActiveIndex === 0 && !lightboxOpen}
                          active={streamActiveIndex === 0 && !lightboxOpen}
                          preload="metadata"
                          className={`${DETAIL_MEDIA_HEIGHT_CLASS} w-full object-contain`}
                          loadingLabel="Video loading"
                          overlay={(videoElement) => (
                            <PostVideoActionBar
                              postId={post.id}
                              postTitle={post.title}
                              postContent={post.content}
                              postLocation={post.location}
                              media={selectedMedia}
                              videoElement={videoElement}
                            />
                          )}
                        />
                      ) : null}

                      {selectedMediaType === 'document' ? (
                        <div className="flex h-[42svh] min-h-[16rem] w-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-200">
                          <p className="font-semibold">{selectedMedia.name || 'Attachment'}</p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <a
                              href={selectedMedia.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-900"
                            >
                              Open document
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleDownloadMedia(selectedMedia)}
                              className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {canDownloadSelectedMedia ? (
                        <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDownloadMedia(selectedMedia)}
                            className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {mediaItems.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => changeMedia(-1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                        aria-label="Previous media"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => changeMedia(1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                        aria-label="Next media"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </GraphicWarningGate>

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
            <div className="mt-5 rounded-[24px] border border-emerald-100 bg-emerald-50/80 px-4 py-3">
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

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <PostMetricCard label="Reactions" value={analytics.reactions} emphasis />
            <PostMetricCard label="Comments" value={analytics.comments} />
            <PostMetricCard label="Reposts" value={analytics.reposts} />
            <PostMetricCard label="Shares" value={analytics.shares} />
            <PostMetricCard label="Views" value={analytics.views} />
          </div>

          {post.topic || post.location ? (
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {post.topic ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm">
                  Topic: {post.topic}
                </span>
              ) : null}
              {post.location ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm">
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

          <div className="mt-4">
            <PostEngagementBar
              postId={post.id}
              authorId={post.authorUserId || post.authorId}
              dashGcoinTotal={Number(post.dashGcoinTotal ?? post.interactions?.dashGcoinTotal ?? 0)}
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
            </article>
          </section>

          <section className="space-y-5">
            {streamSections.slice(1).map((section, offset) => {
              const index = offset + 1;
              const isActiveSection = index === streamActiveIndex;
              return (
                <section
                  key={section.post.id}
                  ref={(node) => {
                    streamItemRefs.current[index] = node;
                  }}
                  className={`${STREAM_SECTION_MIN_HEIGHT_CLASS} snap-start scroll-mt-24 rounded-[34px] border border-slate-200/70 bg-white/70 p-3 shadow-[0_20px_55px_-36px_rgba(15,23,42,0.42)] backdrop-blur md:p-5`}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{isActiveSection ? 'Viewing now' : 'More posts'}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600">
                      Post {index + 1} of {streamSections.length}
                    </span>
                  </div>

                  <FeedPostCard
                    post={section.post}
                    currentUserId={user?.id}
                    autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY && isActiveSection && !lightboxOpen}
                    onOpenPost={openPostDetail}
                    onRequireLogin={() => {
                      if (confirm('Log in to follow users?')) window.location.href = '/auth/login';
                    }}
                    onCommentCountChange={(id, count) =>
                      patchFeedPost(String(id || ''), (item) => ({
                        ...item,
                        interactions: {
                          ...(item.interactions || {}),
                          comments: count
                        }
                      }))
                    }
                    onHideFromFeed={(id) => patchFeedPost(String(id || ''), () => null)}
                    onEditPost={(targetPost) => navigate(`/community/posts/${encodeURIComponent(targetPost.id)}?edit=1`)}
                    onDeletePost={(targetPost) => {
                      void handleDeletePost(targetPost);
                    }}
                  />

                    {section.supplement ? (
                      <div className="mt-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.25)] md:p-4">
                      <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Related picks
                      </div>
                      {renderStreamSupplement(section.supplement)}
                    </div>
                  ) : null}
                </section>
              );
            })}

            {feedLoading ? (
              <div className="rounded-[28px] border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-600 shadow-sm">
                Loading more posts.
              </div>
            ) : null}

            {!feedLoading && feedLoadedOnce && streamSections.length <= 1 && !feedError ? (
              <div className="rounded-[28px] border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-600 shadow-sm">
                No more posts are available right now.
              </div>
            ) : null}

            {!feedLoading && !feedCursor && streamSections.length > 1 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-600 shadow-sm">
                You're caught up.
              </div>
            ) : null}

            <div ref={feedSentinelRef} className="h-6" />
          </section>
        </div>
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
              <div className="flex items-center gap-2">
                {canDownloadSelectedMedia ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadMedia(selectedMedia)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="rounded-full border border-white/30 p-2 text-white hover:bg-white/10"
                  aria-label="Close media viewer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
              {selectedMediaType === 'image' ? (
                <img src={selectedMedia.url} alt={selectedMedia.name || 'Post media'} className="max-h-full max-w-full object-contain" />
              ) : null}

              {selectedMediaType === 'video' ? (
                <video
                  src={selectedMedia.url}
                  controls
                  controlsList="nodownload"
                  autoPlay
                  className="max-h-full max-w-full"
                  onContextMenu={(event) => event.preventDefault()}
                />
              ) : null}

              {selectedMediaType === 'document' ? (
                <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-200">
                  <p>{selectedMedia.name || 'Attachment'}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <a
                      href={selectedMedia.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-900"
                    >
                      Open document
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleDownloadMedia(selectedMedia)}
                      className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                    >
                      Download
                    </button>
                  </div>
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

