import React, { Suspense, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2Icon as Loader2,
  MoreVerticalIcon as MoreVertical,
  ShieldCheckIcon as ShieldCheck
} from '../../../components/icons/ShellIcons';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, Megaphone, MessageCircle, Newspaper, Sparkles, Users as UsersIcon, Video } from 'lucide-react';

import { useSocket } from '../../../context/SocketContext';
import { useNetworkStatus } from '../../../context/NetworkStatusContext';
import { useUser } from '../../../context/UserContext';
import { CommunityService, type BroadcastChannelSummary } from '../../../services/community';
import { fetchPublicCommunityPostsBaseline } from '../../../services/communityFeedFallback';
import { ReactionsService } from '../../../services/reactions';
import { jobsApi, Job } from '../../../services/jobs';
import { gigsApi, Gig } from '../../../services/gigs';
import { RecoService } from '../../../services/reco';
import { MessagingService } from '../../../services/messaging';
import { ScrollService, type ScrollSeriesDiscovery } from '../../../services/scroll';
import MentionText from '../../../community/components/MentionText';
import FollowButton from '../../../community/components/FollowButton';
import PostEngagementBar from '../../../community/components/PostEngagementBar';
import PostOptionsButton from '../../../community/components/post-options/PostOptionsButton';
import ExpandablePreviewText from '../../../components/common/ExpandablePreviewText';
import VerifiedBadge from '../../../components/common/VerifiedBadge';
import InlineAutoplayVideo from '../../../components/media/InlineAutoplayVideo';
import OptimizedImage from '../../../components/media/OptimizedImage';
import EnterpriseAvatar from '../../../components/common/EnterpriseAvatar';
import type { PreviewMedia } from '../../../components/media/MediaPreviewModal';
import PostVideoActionBar from '../../../components/media/PostVideoActionBar';
import VideoCaptionOverlay from '../../../components/media/VideoCaptionOverlay';
import TranslatablePostText from '../../../components/translation/TranslatablePostText';
import PostTextBackgroundBody from '../../../components/post/PostTextBackgroundBody';
import {
  resolvePostPresentation,
  shouldRenderTextBackground
} from '../../../utils/postTextBackgrounds';
import { INLINE_VIDEO_PREVIEW_AUTOPLAY } from '../../../utils/inlineMedia';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import { normalizeContentOfferTags } from '../../../utils/contentOffers';
import {
  resolvePostAttachmentMediaPair,
  resolvePostAttachmentMediaUrl,
  resolvePostAttachmentPosterUrl
} from '../../../utils/postAttachmentMedia';
import {
  buildPostVideoScrollViewerPath,
  stashPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollViewerSource
} from '../../../utils/postVideoScrollBridge';
import { resolveVerificationLevel } from '../../../utils/verification';
import { resolveVideoCaption } from '../../../utils/videoCaption';
import FeedAdCard from './FeedAdCard';
import RecommendedListingCard from './RecommendedListingCard';
import SuggestedCard from './SuggestedCard';
import FeedIntelligenceSignals from '../../../components/feed/FeedIntelligenceSignals';
import PostAiCoachCard from '../../../components/enterprise/PostAiCoachCard';
import {
  enterprisePostCard,
  enterprisePostCardPadding
} from '../../../components/enterprise/enterpriseClasses';
import { postCardSectionStackClass, postCardType } from '../../../components/enterprise/postCardDesign';
import { usePerformanceProfile } from '../../../hooks/usePerformanceProfile';
import type { MemberHomeHighlightItem, MemberHomeHighlightPill } from '../../../components/member-home/MemberHomeHighlightsBoard';
import { getHighlightedCommunityEvents, type HighlightCommunityEvent } from '../../../utils/communityEventHighlights';
import { MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';
import { pickInterestSurveyCandidateIds } from '../../../components/recommendation/ContentInterestSurvey';
import { buildScrolithaPath } from '../../../utils/scrolithaLaunch';
import {
  resolveFeedRankingPresentation,
  resolveListingFitReasons,
  resolvePageRecoPresentation,
  resolvePersonRecoPresentation
} from '../../../utils/feedIntelligence';
import { MemberFeedService } from '../../../services/memberFeed';
import {
  buildNormalizedViewerFeedPreference,
  normalizeMemberFeedIntent
} from '../../../utils/viewerFeedPreference';
import {
  buildObserverRootMargin,
  classifyFeedNetwork,
  resolveAdaptivePageSize,
  resolvePrefetchPolicy,
  shouldPrefetchNextPage,
  trimFeedForMemory
} from '../../../utils/enterpriseFeedEngine';
import { emitFeedAnalytics, measureFeedRequest, startScrollFpsSample } from '../../../utils/feedAnalytics';
import { observeFeedViewDuration } from '../../../utils/feedInterestSignals';
import FeedLoadSkeleton from '../../../components/feed/FeedLoadSkeleton';
import FeedCaughtUpPanel from '../../../components/feed/FeedCaughtUpPanel';
import FeedMixedCard from '../../../components/feed/FeedMixedCard';
import PullToRefresh from '../../../components/feed/PullToRefresh';
import {
  buildStreamFromMemberFeedPage,
  buildStreamFromPosts,
  mergeStreamEntries,
  type FeedStreamEntry
} from '../../../utils/feedStream';
import { prefetchStreamMedia, prefetchVisibleStreamMedia } from '../../../utils/feedMediaPrefetch';
import { useSurfaceFeedLifecycle } from '../../../hooks/useSurfaceFeedLifecycle';
import { extractFeedItemList, extractNextCursor } from '../../../utils/feedPagination';

/** Phase 21.0.2 — mobile continuous stream owns shared lifecycle (no forked cursor/terminal). */
const USE_SHARED_FEED_LIFECYCLE = true;

const MediaPreviewModal = React.lazy(() => import('../../../components/media/MediaPreviewModal'));
const PostExpandModal = React.lazy(() => import('../../../components/post/PostExpandModal'));
const MemberHomeHighlightsBoard = React.lazy(() => import('../../../components/member-home/MemberHomeHighlightsBoard'));

type MobileHomeLayoutSettings = {
  feed?: {
    showPromoted?: boolean;
    promotedFrequency?: number;
    listingCardEveryPosts?: number;
    maxListingCardsPerFeed?: number;
    showSuggestedPeople?: boolean;
    showSuggestedPages?: boolean;
    showTrendingTags?: boolean;
    showRecommendedGigsJobs?: boolean;
  };
  stories?: {
    enabled?: boolean;
    maxItems?: number;
  };
  postComposer?: {
    visibilityEnabled?: boolean;
    allowedVisibilities?: string[];
    defaultVisibility?: string;
    graphicWarningEnabled?: boolean;
    graphicWarningLabel?: string;
    graphicWarningBlurMedia?: boolean;
  };
  post_composer?: any;
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

const isVideo = (value?: any) => {
  const mimeOrKind = String(
    typeof value === 'string'
      ? value
      : value?.mimeType ||
          value?.mime_type ||
          value?.mediaType ||
          value?.media_type ||
          value?.contentType ||
          value?.content_type ||
          value?.type ||
          value?.kind ||
          ''
  ).trim().toLowerCase();
  if (mimeOrKind === 'video' || mimeOrKind.startsWith('video/')) return true;
  const url = String(
    typeof value === 'string'
      ? value
      : value?.url || value?.path || value?.downloadUrl || value?.download_url || value?.videoUrl || value?.video_url || ''
  ).trim().toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg|avi|mkv)(\?|$)/.test(url) || url.includes('/video/');
};
const isImage = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('image/');
const BRAND_LOGO_URL = '/logo.png';
const buildPostScrolithaPrompt = (title: string, content: string) => {
  const safeTitle = String(title || '').trim();
  const safeContent = String(content || '').replace(/\s+/g, ' ').trim();
  const excerpt = safeContent.slice(0, 280);
  if (safeTitle && excerpt) {
    return `Improve this Scrolith post for clarity, engagement, and relevance.\nTitle: ${safeTitle}\nBody: ${excerpt}`;
  }
  if (safeTitle) return `Improve this Scrolith post title and suggest stronger supporting copy:\n${safeTitle}`;
  if (excerpt) return `Improve this Scrolith post and suggest better engagement hooks:\n${excerpt}`;
  return 'Help me draft a high-performing Scrolith post for mobile audience.';
};

const toPreviewMedia = (media: any): PreviewMedia | null => {
  const url = String(media?.url || '').trim();
  if (!url) return null;
  return {
    id: media?.id,
    url,
    name: media?.name,
    mimeType: media?.mimeType || media?.mime_type,
    type: media?.type,
    thumbnailUrl: media?.thumbnailUrl || media?.thumbnail_url || null,
    duration: media?.duration
  };
};
type NavigatorConnection = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};
const getNavigatorConnection = (): NavigatorConnection | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as any;
  return (nav.connection || nav.mozConnection || nav.webkitConnection || null) as NavigatorConnection | null;
};
const isConstrainedNetwork = () => {
  const connection = getNavigatorConnection();
  if (!connection) return false;
  if (connection.saveData) return true;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return true;
  const downlink = Number(connection.downlink || 0);
  if (Number.isFinite(downlink) && downlink > 0 && downlink < 1.2) return true;
  return false;
};

const shuffle = <T,>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
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

const FEED_CACHE_VERSION = 'v3';
const withFastFail = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackMessage: string): Promise<T> => {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
};

const extractJobsFromPayload = (payload: any): Job[] => {
  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs as Job[];
  if (Array.isArray(payload?.data?.items)) return payload.data.items as Job[];
  if (Array.isArray(payload?.items)) return payload.items as Job[];
  if (Array.isArray(payload?.jobs)) return payload.jobs as Job[];
  if (Array.isArray(payload?.data)) return payload.data as Job[];
  if (Array.isArray(payload)) return payload as Job[];
  return [];
};

const extractGigsFromPayload = (payload: any): Gig[] => {
  if (Array.isArray(payload?.data?.gigs)) return payload.data.gigs as Gig[];
  if (Array.isArray(payload?.data?.items)) return payload.data.items as Gig[];
  if (Array.isArray(payload?.items)) return payload.items as Gig[];
  if (Array.isArray(payload?.gigs)) return payload.gigs as Gig[];
  if (Array.isArray(payload?.data)) return payload.data as Gig[];
  if (Array.isArray(payload)) return payload as Gig[];
  return [];
};

const extractFeedItemsFromPayload = (payload: any): any[] => {
  if (Array.isArray(payload?.data?.data?.items)) return payload.data.data.items;
  if (Array.isArray(payload?.data?.data?.posts)) return payload.data.data.posts;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.posts)) return payload.posts;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.posts)) return payload.data.posts;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result?.posts)) return payload.result.posts;
  if (Array.isArray(payload)) return payload;
  return [];
};

const formatHighlightMoney = (value: any) => {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value?.amount === 'number'
        ? value.amount
        : typeof value?.minAmount === 'number'
          ? value.minAmount
          : typeof value?.maxAmount === 'number'
            ? value.maxAmount
            : null;
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return String(amount);
  }
};

const pickFirstMediaEntry = (values: unknown) => {
  if (!Array.isArray(values)) return null;
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'object') return value;
  }
  return null;
};

const isRawApiUploadUrl = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized.startsWith('https://api.scrolith.com/uploads/') ||
    normalized.startsWith('http://api.scrolith.com/uploads/') ||
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/')
  );
};

const listingHasUsableImageFileId = (row: any) => {
  const directCandidates = [
    row?.imageFileId,
    row?.image_file_id,
    row?.thumbnailFileId,
    row?.thumbnail_file_id,
    row?.mediaId,
    row?.media_id,
    row?.attachmentId,
    row?.attachment_id,
    row?.creativeFileId,
    row?.creative_file_id,
    row?.fileId,
    row?.file_id
  ];
  if (directCandidates.some((value) => String(value || '').trim())) return true;

  const mediaEntries = [pickFirstMediaEntry(row?.images), pickFirstMediaEntry(row?.media)];
  return mediaEntries.some((entry: any) => {
    if (!entry || typeof entry !== 'object') return false;
    return [
      entry?.fileId,
      entry?.file_id,
      entry?.thumbnailFileId,
      entry?.thumbnail_file_id,
      entry?.mediaId,
      entry?.media_id,
      entry?.attachmentId,
      entry?.attachment_id,
      entry?.asset?.id,
      entry?.file?.id,
      entry?.id
    ].some((value) => String(value || '').trim());
  });
};

const resolveHighlightListingImage = (row: any) => {
  const mediaCandidate =
    pickFirstMediaEntry(row?.images) ||
    pickFirstMediaEntry(row?.media) ||
    row?.image ||
    row?.coverImage ||
    row?.cover ||
    row?.thumbnailUrl ||
    row?.thumbnail_url ||
    row?.previewImage ||
    row?.preview_image ||
    row?.clientAvatar ||
    row?.freelancerAvatar ||
    null;
  if (isRawApiUploadUrl(mediaCandidate) && !listingHasUsableImageFileId(row)) return '';
  return mediaCandidate ? resolvePostAttachmentMediaUrl(mediaCandidate) : '';
};

const resolveHighlightAvatar = (value: unknown) => {
  const normalized = resolvePostAttachmentMediaUrl(value);
  return String(normalized || '').trim();
};

const resolveHighlightPostMedia = (post: any) => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const posterUrl = String(resolvePostAttachmentPosterUrl(attachment) || '').trim();
    if (posterUrl) return posterUrl;
    if (isVideo(attachment)) {
      const mediaUrl = String(resolvePostAttachmentMediaUrl(attachment) || '').trim();
      if (mediaUrl) return mediaUrl;
    }
    const mime = String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase();
    const type = String(attachment?.type || '').trim().toLowerCase();
    if (isImage(mime) || type === 'image') {
      const mediaUrl = String(resolvePostAttachmentMediaUrl(attachment) || '').trim();
      if (mediaUrl) return mediaUrl;
    }
  }
  return '';
};

const resolveHighlightPostVideo = (post: any) => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    if (!isVideo(attachment)) continue;
    const mediaUrl = String(resolvePostAttachmentMediaUrl(attachment) || '').trim();
    if (mediaUrl) return mediaUrl;
  }
  return '';
};

const resolveHighlightPostPoster = (post: any) => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const posterUrl = String(resolvePostAttachmentPosterUrl(attachment) || '').trim();
    if (posterUrl) return posterUrl;
  }
  return '';
};

const resolveHighlightPostFallback = (post: any) => {
  const authorAvatar = resolveHighlightAvatar(post?.author?.avatarUrl || post?.authorAvatar || null);
  return authorAvatar || BRAND_LOGO_URL;
};

const resolveSyntheticVideoAttachment = (post: any) => {
  const videoUrl = String(
    post?.videoUrl ||
      post?.video_url ||
      post?.mediaUrl ||
      post?.media_url ||
      post?.sourceVideoUrl ||
      post?.source_video_url ||
      ''
  ).trim();
  if (!videoUrl) return null;
  return {
    id: String(post?.videoAttachmentId || post?.video_attachment_id || videoUrl).trim() || videoUrl,
    url: videoUrl,
    name: String(post?.title || post?.videoTitle || post?.video_title || 'Video post').trim() || 'Video post',
    type: 'video',
    kind: 'video',
    mimeType: 'video/mp4',
    thumbnailUrl:
      String(
        post?.thumbnailUrl ||
          post?.thumbnail_url ||
          post?.posterUrl ||
          post?.poster_url ||
          post?.previewUrl ||
          post?.preview_url ||
          ''
      ).trim() || null
  };
};

const isIgnoredSurfaceTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return Boolean(
    element.closest(
      'a, button, input, textarea, select, label, video, audio, [data-inline-video-control="true"], [data-post-media-root="true"]'
    )
  );
};

const resolveProfileUrl = (
  author: { id?: string | null; username?: string | null; type?: string | null; businessSlug?: string | null },
  fallbackAuthorId?: string | null,
  currentUserId?: string | null
) => {
  const type = String(author.type || 'user').toLowerCase();
  const businessSlug = String(author.businessSlug || '').trim();
  if (type === 'business' && businessSlug) return `/company/${encodeURIComponent(businessSlug)}`;

  const handle = String(author.username || '').trim().replace(/^@+/, '');
  if (handle) return `/u/${encodeURIComponent(handle)}`;

  const id = String(author.id || fallbackAuthorId || '').trim();
  if (id) return `/profile/${encodeURIComponent(id)}`;

  if (currentUserId) return `/profile/${encodeURIComponent(currentUserId)}`;
  return '/profile/edit';
};

export default function MobileFeed({
  settings,
  onOpenPostVideoScroll,
  onOpenScrollSeries
}: {
  settings?: MobileHomeLayoutSettings | null;
  onOpenPostVideoScroll?: (source: PendingPostVideoScrollViewerSource) => void;
  onOpenScrollSeries?: (seriesId: string, scrollId?: string | null) => void;
}) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isConnected } = useSocket();
  const { isOnline, recoveryTick, shouldAttemptLiveConnections } = useNetworkStatus();
  const { profile } = usePerformanceProfile();
  const currentUserId = String(user?.id || 'guest').trim() || 'guest';
  const feedCacheKey = useMemo(() => `mobile_feed_cache:${FEED_CACHE_VERSION}:${currentUserId}`, [currentUserId]);

  const feedSettings = settings?.feed ?? {};
  const postCardSettings = settings?.postCard ?? {};
  const composerSettings = ((settings as any)?.postComposer || (settings as any)?.post_composer || {}) as Record<string, any>;
  const graphicWarningEnabled = composerSettings.graphicWarningEnabled !== false;
  const graphicWarningLabel = String(composerSettings.graphicWarningLabel || composerSettings.graphic_warning_label || 'Graphic warning').trim() || 'Graphic warning';
  const graphicWarningBlurMedia = composerSettings.graphicWarningBlurMedia !== false;
  const showRecommendedGigsJobs = feedSettings.showRecommendedGigsJobs !== false;
  const [isConstrainedConnection, setIsConstrainedConnection] = useState<boolean>(() => isConstrainedNetwork());
  const constrainedForFeed = isConstrainedConnection || profile.lowBandwidth || profile.dataSaver;

  const sharedFeedMode = useMemo(() => {
    const roleLike =
      (user as any)?.role || (user as any)?.userType || (user as any)?.accountType || (user as any)?.type;
    return (
      buildNormalizedViewerFeedPreference({
        feedIntent: normalizeMemberFeedIntent(
          (user as any)?.feedIntent || (user as any)?.preferredFeedMode,
          'for_you'
        ),
        roleLike,
        source: 'member_home'
      }).feedIntent || 'for_you'
    );
  }, [user]);

  const sharedFeed = useSurfaceFeedLifecycle({
    surface: 'member_home',
    feedMode: sharedFeedMode,
    enabled: USE_SHARED_FEED_LIFECYCLE,
    isMobile: true,
    dataSaver: constrainedForFeed,
    basePageSize: Number(profile.feedPageSize || (constrainedForFeed ? 8 : 12)),
    isAuthenticated: Boolean(user?.id),
    viewerKey: currentUserId,
    compactCards: true,
    legacyFetch: async ({ cursor, limit }) => {
      try {
        const resp = await CommunityService.getFeed({
          cursor: cursor || undefined,
          limit,
          scope: 'discover'
        });
        const posts = extractFeedItemList(resp);
        const nextCursor = extractNextCursor(resp);
        return { posts, nextCursor, hasMore: Boolean(nextCursor) };
      } catch {
        return null;
      }
    }
  });
  const initialRenderCount = constrainedForFeed ? 4 : 6;
  const renderStep = constrainedForFeed ? 3 : 5;
  // Phase 21.1.7c — avoid content-visibility on WebKit for the progressive head window.
  // Safari has historically recycled/skipped layout for content-visibility:auto in ways that
  // interact poorly with identity probes + IntersectionObserver (Chromium remains fine).
  const isWebKitEngine = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = String(navigator.userAgent || '');
    return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg|Android/i.test(ua);
  }, []);
  const feedItemPerformanceStyle = useMemo(
    () =>
      ({
        ...(isWebKitEngine
          ? {}
          : {
              contentVisibility: 'auto' as const,
              containIntrinsicSize: constrainedForFeed ? '680px' : '760px'
            }),
        transform: 'translateZ(0)'
      }) as React.CSSProperties,
    [constrainedForFeed, isWebKitEngine]
  );
  const priorityMediaPostLimit = constrainedForFeed ? 1 : 2;
  const listingCardEveryPosts = clamp(Number((feedSettings as any).listingCardEveryPosts ?? 2) || 2, 1, 6);
  const maxListingCardsPerFeed = clamp(Number((feedSettings as any).maxListingCardsPerFeed ?? 8) || 8, 1, 16);
  const listingPoolLimit = Math.max(
    constrainedForFeed ? 4 : 8,
    maxListingCardsPerFeed * (constrainedForFeed ? 2 : 3)
  );

  const promotedFrequency = clamp(Number(feedSettings.promotedFrequency ?? 6) || 6, 2, 20);

  const [posts, setPosts] = useState<any[]>([]);
  /** Phase 21.0.1 ordered mixed stream (orchestrator). */
  const [feedStream, setFeedStream] = useState<FeedStreamEntry[]>([]);
  const feedStreamRef = useRef<FeedStreamEntry[]>([]);
  const [renderedPostCount, setRenderedPostCount] = useState(initialRenderCount);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [insightCollapsedByPost, setInsightCollapsedByPost] = useState<Record<string, boolean>>({});
  const [revealedGraphic, setRevealedGraphic] = useState<Record<string, boolean>>({});
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [expandedPost, setExpandedPost] = useState<any | null>(null);

  const [ads, setAds] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState<Array<{ slug: string; label: string; count?: number }>>([]);
  const [suggestedPeople, setSuggestedPeople] = useState<any[]>([]);
  const [suggestedPages, setSuggestedPages] = useState<any[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<Job[]>([]);
  const [recommendedGigs, setRecommendedGigs] = useState<Gig[]>([]);
  const [featuredSeries, setFeaturedSeries] = useState<ScrollSeriesDiscovery[]>([]);
  const [broadcastChannels, setBroadcastChannels] = useState<BroadcastChannelSummary[]>([]);
  const [officeHours, setOfficeHours] = useState<HighlightCommunityEvent[]>([]);
  const [secondaryFeedReady, setSecondaryFeedReady] = useState(false);
  const promotedAdsTimerRef = useRef<number | null>(null);
  const promotedAdsRequestIdRef = useRef(0);
  const deferredPosts = useDeferredValue(posts);
  const visiblePosts = useMemo(
    () => deferredPosts.slice(0, Math.min(renderedPostCount, deferredPosts.length)),
    [deferredPosts, renderedPostCount]
  );
  const visibleStream = useMemo(() => {
    const source =
      feedStream.length > 0 ? feedStream : buildStreamFromPosts(posts);
    return source.slice(0, Math.min(renderedPostCount, source.length));
  }, [feedStream, posts, renderedPostCount]);

  useEffect(() => {
    feedStreamRef.current = feedStream;
  }, [feedStream]);

  useEffect(() => {
    if (!visibleStream.length) return;
    prefetchStreamMedia(visibleStream, Math.max(0, visibleStream.length - 2), 4);
  }, [visibleStream]);
  const interestSurveyPostIds = useMemo(
    () =>
      new Set(
        pickInterestSurveyCandidateIds(
          visiblePosts.map((post: any) => ({
            id: post?.id,
            authorId: post?.authorUserId || post?.authorId,
            initialSignal: post?.userState?.interestSignal
          })),
          user?.id,
          'post',
          5
        )
      ),
    [visiblePosts, user?.id]
  );
  const listingSlots = useMemo(() => {
    if (!showRecommendedGigsJobs || !posts.length) return 0;
    const baseSlots = Math.floor(posts.length / listingCardEveryPosts);
    const sparseSlots = posts.length > 0 ? 1 : 0;
    return Math.min(maxListingCardsPerFeed, Math.max(baseSlots, sparseSlots));
  }, [showRecommendedGigsJobs, posts.length, listingCardEveryPosts, maxListingCardsPerFeed]);

  const listingCardEntries = useMemo(() => {
    if (!showRecommendedGigsJobs || !posts.length || listingSlots <= 0) {
      return [] as Array<{ kind: 'job' | 'gig'; item: any }>;
    }

    const jobPool = shuffle(dedupeById((recommendedJobs || []) as Array<Job & { id: string }>)).slice(0, listingSlots * 3);
    const gigPool = shuffle(dedupeById((recommendedGigs || []) as Array<Gig & { id: string }>)).slice(0, listingSlots * 3);
    const entries: Array<{ kind: 'job' | 'gig'; item: any }> = [];
    let preferJob = ((String(user?.id || 'guest').length + posts.length) % 2) === 0;

    while (entries.length < listingSlots && (jobPool.length || gigPool.length)) {
      if (preferJob && jobPool.length) {
        entries.push({ kind: 'job', item: jobPool.shift() });
      } else if (!preferJob && gigPool.length) {
        entries.push({ kind: 'gig', item: gigPool.shift() });
      } else if (jobPool.length) {
        entries.push({ kind: 'job', item: jobPool.shift() });
      } else if (gigPool.length) {
        entries.push({ kind: 'gig', item: gigPool.shift() });
      }
      preferJob = !preferJob;
    }

    return entries.filter((entry) => Boolean(entry.item?.id));
  }, [
    showRecommendedGigsJobs,
    user?.id,
    posts.length,
    listingSlots,
    recommendedJobs,
    recommendedGigs,
    listingCardEveryPosts,
    maxListingCardsPerFeed
  ]);

  const listingSlotIndexes = useMemo(() => {
    if (!listingCardEntries.length || !posts.length) return [] as number[];
    const seed = `${String(user?.id || '')}:${posts.length}:${String(posts?.[0]?.id || '')}:${String(posts?.[posts.length - 1]?.id || '')}`;
    return pickSlotIndexes(posts.length, listingCardEntries.length, seed);
  }, [listingCardEntries.length, posts, user?.id]);

  const listingByPostIndex = useMemo(() => {
    if (!listingCardEntries.length || !listingSlotIndexes.length) return new Map<number, { kind: 'job' | 'gig'; item: any }>();
    const map = new Map<number, { kind: 'job' | 'gig'; item: any }>();
    listingSlotIndexes.forEach((postIndex, idx) => {
      const entry = listingCardEntries[idx];
      if (entry && !map.has(postIndex)) map.set(postIndex, entry);
    });
    return map;
  }, [listingCardEntries, listingSlotIndexes]);

  const adSlotIndexes = useMemo(() => {
    if (feedSettings.showPromoted === false || !ads.length || !posts.length || promotedFrequency <= 0) return [] as number[];
    const approxSlots = Math.max(1, Math.floor(posts.length / promotedFrequency));
    const seed = `${String(user?.id || '')}:${posts.length}:${promotedFrequency}:${String(ads[0]?.id || '')}`;
    const availablePostIndexes = Array.from({ length: posts.length }, (_, idx) => idx).filter(
      (idx) => !listingByPostIndex.has(idx)
    );
    if (!availablePostIndexes.length) {
      return pickSlotIndexes(posts.length, approxSlots, seed);
    }
    const availablePicks = pickSlotIndexes(availablePostIndexes.length, approxSlots, seed);
    return availablePicks.map((pick) => availablePostIndexes[pick]).sort((a, b) => a - b);
  }, [feedSettings.showPromoted, ads, posts.length, promotedFrequency, user?.id, listingByPostIndex]);

  const adByPostIndex = useMemo(() => {
    const map = new Map<number, any>();
    if (!adSlotIndexes.length || !ads.length) return map;
    adSlotIndexes.forEach((postIndex, idx) => {
      const ad = ads[idx % ads.length];
      if (ad && !map.has(postIndex)) map.set(postIndex, ad);
    });
    return map;
  }, [adSlotIndexes, ads]);

  const scrollToFeedSection = useCallback((sectionId: string) => {
    if (typeof document === 'undefined') return;
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        try {
          el.setAttribute('tabindex', '-1');
          el.focus({ preventScroll: true });
        } catch {
          /* ignore focus failures */
        }
        return;
      }
      if (attempt < 8) {
        window.setTimeout(() => tryScroll(attempt + 1), 60 + attempt * 40);
      }
    };
    tryScroll(0);
  }, []);

  const openInsightsSection = useCallback((sectionId: string, group?: 'growth' | 'opportunity') => {
    if (typeof window !== 'undefined' && group) {
      window.dispatchEvent(
        new CustomEvent('insights:open_section', {
          detail: { group, section: sectionId }
        })
      );
    }
  }, []);

  const buildSeriesUrl = useCallback((seriesId?: string | null) => {
    const id = String(seriesId || '').trim();
    if (!id) return '/scroll';
    return `/scroll?series=${encodeURIComponent(id)}`;
  }, []);

  const resolveBroadcastHref = useCallback((channel?: BroadcastChannelSummary | null) => {
    return String(channel?.source?.href || '').trim() || '/community';
  }, []);

  const handleHighlightedAdOpen = useCallback((ad: any) => {
    const destination = String(ad?.destinationUrl || ad?.destination_url || '').trim();
    if (!destination) return;
    void CommunityService.recordAdClick(String(ad?.id || '')).catch(() => {});
    window.open(destination, '_blank', 'noopener,noreferrer');
  }, []);

  const normalizePost = useCallback((post: any) => {
    const interactions = { ...(post?.interactions || {}) };
    if (interactions.likes === undefined) interactions.likes = post?.likesCount ?? post?.likes_count ?? 0;
    if (interactions.comments === undefined) interactions.comments = post?.commentsCount ?? post?.comments_count ?? 0;
    if (interactions.reposts === undefined) interactions.reposts = post?.repostsCount ?? post?.reposts_count ?? 0;
    if (interactions.shares === undefined) interactions.shares = post?.sharesCount ?? post?.shares_count ?? 0;
    if (interactions.views === undefined) interactions.views = post?.viewsCount ?? post?.views_count ?? 0;
    if (interactions.reactions === undefined) interactions.reactions = post?.reactions || {};
    if (interactions.dashGcoinTotal === undefined) {
      interactions.dashGcoinTotal = post?.dashGcoinTotal ?? post?.dash_gcoin_total ?? 0;
    }

    const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
    const authorId =
      post?.authorId ||
      post?.userId ||
      post?.user_id ||
      post?.author?.id ||
      post?.author?.userId ||
      post?.author?.user_id ||
      null;
    const authorName =
      post?.authorName ||
      post?.userName ||
      post?.user_name ||
      post?.author?.displayName ||
      post?.author?.name ||
      'Community member';
    const authorUsername =
      post?.authorUsername ||
      post?.userUsername ||
      post?.user_username ||
      post?.author?.username ||
      post?.author?.userName ||
      post?.author?.user_name ||
      null;
    const authorAvatar =
      post?.authorAvatar ||
      post?.userAvatar ||
      post?.user_avatar ||
      post?.author?.avatarUrl ||
      post?.author?.avatar ||
      '';
    const authorType = post?.author?.type || (post?.businessPage ? 'business' : 'user');
    const authorUserId =
      post?.authorUserId ||
      post?.author_user_id ||
      post?.author?.userId ||
      post?.author?.user_id ||
      (authorType === 'user' ? authorId : null);

    return {
      ...post,
      id: post?.id || `${authorId || 'post'}-${post?.createdAt || post?.created_at || Date.now()}`,
      title: post?.title || '',
      content: post?.content || '',
      attachments: attachments.map((item: any) => ({
        ...item,
        id: item?.id || item?.fileId || item?.file_id || resolvePostAttachmentMediaUrl(item),
        fileId: item?.fileId || item?.file_id || item?.file?.id || item?.asset?.id || item?.id || null,
        url: resolvePostAttachmentMediaUrl(item),
        name: item?.name || item?.originalName || item?.filename || '',
        mimeType: item?.mimeType || item?.mime_type || '',
      type: item?.type || (isVideo(item) ? 'video' : isImage(item?.mimeType || item?.mime_type) ? 'image' : 'document'),
        thumbnailUrl: resolvePostAttachmentPosterUrl(item),
        duration: item?.duration,
        width: item?.width,
        height: item?.height
      })),
      author: {
        ...(post?.author || {}),
        id: post?.author?.id || (authorType === 'business' ? post?.businessPage?.id : authorId),
        username: post?.author?.username ?? authorUsername,
        displayName: post?.author?.displayName || authorName,
        avatarUrl: post?.author?.avatarUrl || authorAvatar,
        type: authorType,
        businessSlug: post?.author?.businessSlug || post?.businessPage?.slug || null,
        isVerified: Boolean(post?.author?.isVerified ?? post?.authorIsVerified ?? post?.author_verified),
        isPro: Boolean(post?.author?.isPro ?? post?.authorIsPro ?? post?.author_pro)
      },
      viewer: {
        ...(post?.viewer || {}),
        isFollowingAuthor:
          typeof post?.viewer?.isFollowingAuthor === 'boolean'
            ? post.viewer.isFollowingAuthor
            : typeof post?.viewer?.is_following_author === 'boolean'
              ? post.viewer.is_following_author
              : undefined
      },
      authorId,
      authorUserId,
      authorName,
      authorUsername,
      authorAvatar,
      createdAt: post?.createdAt || post?.created_at || null,
      updatedAt: post?.updatedAt || post?.updated_at || null,
      tags: Array.isArray(post?.tags) ? post.tags : [],
      mentions: Array.isArray(post?.mentions) ? post.mentions : [],
      topic: post?.topic || null,
      location: post?.location || null,
      visibility: post?.visibility || 'public',
      presentation: (() => {
        const resolved = resolvePostPresentation(post);
        return resolved
          ? {
              type: resolved.type,
              themeId: resolved.themeId,
              background: resolved.background,
              textColor: resolved.textColor
            }
          : post?.presentation || null;
      })(),
      textBackground:
        post?.textBackground ||
        post?.text_background ||
        resolvePostPresentation(post)?.background ||
        null,
      textColor: post?.textColor || post?.text_color || resolvePostPresentation(post)?.textColor || null,
      textBackgroundId:
        post?.textBackgroundId ||
        post?.text_background_id ||
        resolvePostPresentation(post)?.themeId ||
        null,
      commentPolicy: post?.commentPolicy || post?.comment_policy || 'everyone',
      repostsEnabled: post?.repostsEnabled ?? post?.reposts_enabled ?? true,
      isPinned: post?.isPinned ?? post?.is_pinned ?? false,
      isHighlighted: post?.isHighlighted ?? post?.is_highlighted ?? false,
      graphicWarning: Boolean(post?.graphicWarning ?? post?.graphic_warning ?? false),
      isAIEnhanced: Boolean(post?.isAIEnhanced ?? post?.is_ai_enhanced ?? false),
      offerTags: normalizeContentOfferTags(post?.offerTags ?? post?.offer_tags),
      originalPost:
        post?.originalPost && typeof post.originalPost === 'object'
          ? {
              ...post.originalPost,
              id: post.originalPost.id,
              authorName: post.originalPost.authorName ?? post.originalPost.author_name ?? null,
              authorUsername: post.originalPost.authorUsername ?? post.originalPost.author_username ?? null,
              title: post.originalPost.title ?? null,
              content: post.originalPost.content ?? null
            }
          : null,
      dashGcoinTotal: Number(post?.dashGcoinTotal ?? post?.dash_gcoin_total ?? interactions.dashGcoinTotal ?? 0),
      aiInsightEnabled: Boolean(post?.aiInsightEnabled ?? post?.ai_insight_enabled ?? false),
      aiInsightGenerated: Boolean(
        post?.aiInsightGenerated ??
          post?.ai_insight_generated ??
          (String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim() ? true : false)
      ),
      aiInsightText: String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim() || null,
      aiScore:
        post?.aiScore !== undefined && post?.aiScore !== null
          ? Number(post.aiScore)
          : post?.ai_score !== undefined && post?.ai_score !== null
            ? Number(post.ai_score)
            : null,
      likesCount: post?.likesCount ?? post?.likes_count ?? interactions.likes,
      sharesCount: post?.sharesCount ?? post?.shares_count ?? interactions.shares,
      repostsCount: post?.repostsCount ?? post?.reposts_count ?? interactions.reposts,
      sourceLanguage: post?.sourceLanguage ?? post?.source_language ?? null,
      translationVersion: post?.translationVersion ?? post?.translation_version ?? null,
      interactions,
      ranking: (() => {
        const raw = post?.ranking;
        const presentation = resolveFeedRankingPresentation(post);
        if (!raw && !presentation.primaryReason && presentation.reasons.length === 0 && !presentation.scoreLabel) {
          return post?.ranking;
        }
        return {
          mode: raw?.mode || raw?.recipeKey || undefined,
          score:
            raw?.score != null
              ? Number(raw.score)
              : post?.score != null || post?.rankingScore != null
                ? Number(post.score ?? post.rankingScore)
                : undefined,
          primaryReason: presentation.primaryReason || raw?.primaryReason || raw?.primary_reason || null,
          reasons:
            presentation.reasons.length > 0
              ? presentation.reasons
              : Array.isArray(raw?.reasons)
                ? raw.reasons
                : presentation.primaryReason
                  ? [presentation.primaryReason]
                  : []
        };
      })(),
      userState: post?.userState || post?.user_state || {}
    };
  }, []);

  const sortPosts = useCallback((items: any[]) => {
    return [...items].sort((a, b) => {
      if (Boolean(a?.isPinned) !== Boolean(b?.isPinned)) {
        return a?.isPinned ? -1 : 1;
      }
      const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, []);

  // Phase 21.0.2 — bind UI state to shared lifecycle (single cursor/terminal owner).
  // Phase 21.1.7 — NEVER re-sort session posts/stream here. sortPosts was reordering
  // visible cards on every soft_refresh/status tick (WebKit identity regression).
  // Session order is owned by useContinuousFeed isolation; preserve it exactly.
  // Phase 21.1.7c — lock session head post id once painted; reject destructive swaps
  // (defense-in-depth if shared stream ever hard-replaces under WebKit remount races).
  const mobileSessionHeadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!USE_SHARED_FEED_LIFECYCLE) return;
    const normalizedPosts = (sharedFeed.posts || [])
      .map((post) => {
        try {
          return normalizePost(post);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];
    const nextStream = (sharedFeed.stream || []).map((entry) => {
      if (entry.kind !== 'post' || !entry.post) return entry;
      try {
        const post = normalizePost(entry.post);
        return { ...entry, post, data: post };
      } catch {
        return entry;
      }
    });
    const nextHead =
      nextStream.find((e) => e.kind === 'post' && e.post?.id)?.post?.id ||
      normalizedPosts[0]?.id ||
      null;
    const nextHeadId = nextHead ? String(nextHead) : null;
    if (
      mobileSessionHeadIdRef.current &&
      nextHeadId &&
      mobileSessionHeadIdRef.current !== nextHeadId &&
      feedStreamRef.current.length > 0
    ) {
      // Keep existing reading session; still absorb cursor/loading chrome.
      try {
        const w = window as any;
        if (!Array.isArray(w.__scrolithFeedLifecycleLog)) w.__scrolithFeedLifecycleLog = [];
        w.__scrolithFeedLifecycleLog.push({
          t: Date.now(),
          type: 'reject_head_swap',
          surface: 'mobile_member_home',
          headPostId: mobileSessionHeadIdRef.current,
          reason: `${mobileSessionHeadIdRef.current}->${nextHeadId}`,
          streamLen: feedStreamRef.current.length,
          detail: { rejectedHead: nextHeadId, incomingLen: nextStream.length }
        });
      } catch {
        /* ignore */
      }
      cursorRef.current = sharedFeed.cursor;
      setCursor(sharedFeed.cursor);
      feedTerminalRef.current = sharedFeed.terminal;
      setFeedTerminal(sharedFeed.terminal);
      setLoading(sharedFeed.loading);
      setLoadingMore(sharedFeed.loadingMore);
      setError(sharedFeed.error);
      if (sharedFeed.statusMessage) setStatusMessage(sharedFeed.statusMessage);
      return;
    }
    if (!mobileSessionHeadIdRef.current && nextHeadId) {
      mobileSessionHeadIdRef.current = nextHeadId;
    }
    postsRef.current = normalizedPosts;
    setPosts(normalizedPosts);
    // Re-normalize post entries in stream for rich mobile cards — keep entry order.
    feedStreamRef.current = nextStream;
    setFeedStream(nextStream);
    cursorRef.current = sharedFeed.cursor;
    setCursor(sharedFeed.cursor);
    feedTerminalRef.current = sharedFeed.terminal;
    setFeedTerminal(sharedFeed.terminal);
    setLoading(sharedFeed.loading);
    setLoadingMore(sharedFeed.loadingMore);
    setError(sharedFeed.error);
    if (sharedFeed.statusMessage) setStatusMessage(sharedFeed.statusMessage);
    setRenderedPostCount(sharedFeed.renderedCount);
    if (nextStream.length) {
      prefetchVisibleStreamMedia(nextStream.slice(0, Math.min(6, sharedFeed.renderedCount || 6)));
    }
  }, [
    sharedFeed.stream,
    sharedFeed.posts,
    sharedFeed.cursor,
    sharedFeed.terminal,
    sharedFeed.loading,
    sharedFeed.loadingMore,
    sharedFeed.error,
    sharedFeed.statusMessage,
    sharedFeed.renderedCount,
    normalizePost
  ]);

  const highlightPills = useMemo<MemberHomeHighlightPill[]>(() => {
    const pills: MemberHomeHighlightPill[] = [{ label: 'Posts', value: String(posts.length) }];
    if (recommendedJobs.length) pills.push({ label: 'Jobs', value: String(recommendedJobs.length) });
    if (recommendedGigs.length) pills.push({ label: 'Gigs', value: String(recommendedGigs.length) });
    if (officeHours.length) pills.push({ label: 'Live', value: String(officeHours.length) });
    if (featuredSeries.length) pills.push({ label: 'Series', value: String(featuredSeries.length) });
    if (broadcastChannels.length) pills.push({ label: 'Channels', value: String(broadcastChannels.length) });
    if (suggestedPeople.length || suggestedPages.length) {
      pills.push({ label: 'Network', value: String(suggestedPeople.length + suggestedPages.length) });
    }
    if (ads.length) pills.push({ label: 'Sponsored', value: String(ads.length) });
    return pills;
  }, [
    ads.length,
    broadcastChannels.length,
    featuredSeries.length,
    officeHours.length,
    posts.length,
    recommendedGigs.length,
    recommendedJobs.length,
    suggestedPages.length,
    suggestedPeople.length
  ]);

  const highlightItems = useMemo<MemberHomeHighlightItem[]>(() => {
    const items: MemberHomeHighlightItem[] = [];
    const topJob = recommendedJobs[0];
    const topGig = recommendedGigs[0];
    const topOfficeHour = officeHours[0];
    const topSeries = featuredSeries[0];
    const topBroadcastChannel = broadcastChannels[0];
    const topPerson = suggestedPeople[0];
    const topPage = suggestedPages[0];
    const topAd = ads[0];
    const topPost = posts[0];
    const resolveHighlightAdMedia = (ad: any) => {
      const primary = Array.isArray(ad?.media) ? ad.media[0] : null;
      const fileId = String(primary?.id || '').trim();
      if (fileId) {
        return resolveAssetUrl(`/api/files/content/${encodeURIComponent(fileId)}`);
      }
      return resolveAssetUrl(String(primary?.url || '').trim());
    };

    items.push({
      id: 'mobile-scrolitha-coach',
      eyebrow: 'Scrolitha coach',
      title: 'Improve posts, gigs, and briefs faster',
      // Compact coach copy — board uses a small brand mark, not a hero image.
      description: 'Polish drafts before you publish, package, or match.',
      meta: 'Posts · Gigs · Briefs',
      badge: 'AI',
      ctaLabel: 'Open coach',
      onClick: () => openInsightsSection('scrolitha-coach', 'growth'),
      mediaUrl: '/logo.png',
      icon: <Sparkles className="h-3 w-3" />,
      tone: 'violet'
    });

    if (topJob) {
      const budgetLabel = formatHighlightMoney((topJob as any)?.budget);
      const jobFit = resolveListingFitReasons(topJob, 'job');
      items.push({
        id: `mobile-job:${topJob.id}`,
        eyebrow: 'Hiring intelligence',
        title: topJob.title || 'Recommended job',
        description: [topJob.clientName || 'Employer', topJob.category || topJob.subcategory || 'Professional opportunity']
          .filter(Boolean)
          .join(' · '),
        meta: budgetLabel ? `Budget $${budgetLabel}` : 'Flexible budget',
        badge: 'Live',
        reason: jobFit[0] ? `Why: ${jobFit.slice(0, 2).join(' · ')}` : 'Matched to your professional graph',
        ctaLabel: 'Browse jobs',
        href: '/browse-jobs',
        mediaUrl: resolveHighlightListingImage(topJob as any),
        icon: <Briefcase className="h-4 w-4" />,
        tone: 'blue'
      });
    }

    if (topGig) {
      const priceLabel = formatHighlightMoney((topGig as any)?.price);
      const gigFit = resolveListingFitReasons(topGig, 'gig');
      items.push({
        id: `mobile-gig:${topGig.id}`,
        eyebrow: 'Marketplace intelligence',
        title: topGig.title || 'Recommended gig',
        description: [topGig.freelancerName || 'Freelancer', topGig.category || topGig.subcategory || 'Service listing']
          .filter(Boolean)
          .join(' · '),
        meta: priceLabel ? `From $${priceLabel}` : 'Pricing available',
        badge: 'Recommended',
        reason: gigFit[0] ? `Why: ${gigFit.slice(0, 2).join(' · ')}` : 'Matched marketplace demand',
        ctaLabel: 'Browse gigs',
        href: '/browse',
        mediaUrl: resolveHighlightListingImage(topGig as any),
        icon: <Sparkles className="h-4 w-4" />,
        tone: 'violet'
      });
    }

    if (topOfficeHour) {
      items.push({
        id: `mobile-office-hours:${topOfficeHour.id}`,
        eyebrow: 'Live AMAs / office hours',
        title: topOfficeHour.title || 'Upcoming office hours',
        description: topOfficeHour.description,
        meta: topOfficeHour.metaLabel,
        badge: topOfficeHour.badge,
        ctaLabel: topOfficeHour.isRegistered ? 'View session' : 'Open office hours',
        onClick: () => openInsightsSection('live-office-hours', 'opportunity'),
        mediaUrl: topOfficeHour.image || '',
        fallbackMediaUrl: '/logo.png',
        icon: <CalendarDays className="h-4 w-4" />,
        tone: 'amber'
      });
    }

    if (topSeries) {
      const featuredScroll = topSeries.featuredScroll || topSeries.previewItems?.[0] || topSeries.items?.[0]?.scroll || null;
      items.push({
        id: `mobile-series:${topSeries.id}`,
        eyebrow: 'Series / playlists',
        title: topSeries.title || 'Bingeable Scroll series',
        description:
          topSeries.description ||
          featuredScroll?.description ||
          featuredScroll?.title ||
          'Creator-curated Scroll playlists keep the strongest work in sequence.',
        meta: `${topSeries.creator.name} · ${topSeries.itemCount} items`,
        badge: 'Series',
        ctaLabel: 'Open series',
        ...(onOpenScrollSeries
          ? {
              onClick: () => onOpenScrollSeries(topSeries.id, featuredScroll?.id || null)
            }
          : {
              href: buildSeriesUrl(topSeries.id)
            }),
        mediaUrl: featuredScroll?.media?.thumbnailUrl || featuredScroll?.media?.url || '',
        icon: <Video className="h-4 w-4" />,
        tone: 'rose'
      });
    }

    if (topBroadcastChannel) {
      items.push({
        id: `mobile-broadcast:${topBroadcastChannel.id}`,
        eyebrow: 'Broadcast updates',
        title: topBroadcastChannel.name || topBroadcastChannel.source?.name || 'Creator updates',
        description:
          topBroadcastChannel.latestUpdate?.content ||
          topBroadcastChannel.description ||
          'Follow creator and company updates without digging through the full community feed.',
        meta: `${topBroadcastChannel.memberCount} followers · ${topBroadcastChannel.updateCount} updates`,
        badge: topBroadcastChannel.isFollowing ? 'Following' : 'Live',
        ctaLabel: 'Open source',
        href: resolveBroadcastHref(topBroadcastChannel),
        mediaUrl: topBroadcastChannel.source?.avatar || '',
        icon: <MessageCircle className="h-4 w-4" />,
        tone: 'emerald'
      });
    }

    if (topPerson || topPage) {
      const networkLead = topPerson?.name || topPage?.name || 'Suggested connections';
      const followPool = [topPerson?.name, topPage?.name].filter(Boolean).join(' · ');
      const networkWhy =
        (topPerson as any)?.whyRecommended ||
        (topPage as any)?.whyRecommended ||
        'Strengthen your professional graph';
      items.push({
        id: 'mobile-network-highlights',
        eyebrow: 'Relationship intelligence',
        title: networkLead,
        description:
          followPool || 'Suggested people and pages are already integrated into your home feed for faster growth.',
        meta: `${suggestedPeople.length} people · ${suggestedPages.length} pages`,
        badge: 'Grow',
        reason: networkWhy,
        ctaLabel: 'Open recommendations',
        // Prefer always-mounted anchors so CTA works even with short feeds.
        onClick: () => {
          const targetId = suggestedPeople.length
            ? 'mobile-member-home-people-suggestions'
            : suggestedPages.length
              ? 'mobile-member-home-page-suggestions'
              : 'mobile-member-home-network-recommendations';
          scrollToFeedSection(targetId);
        },
        mediaUrl: resolveHighlightAvatar(topPerson?.avatarUrl || topPage?.avatarUrl || null),
        icon: <UsersIcon className="h-4 w-4" />,
        tone: 'emerald'
      });
    }

    if (topAd) {
      items.push({
        id: `mobile-ad:${topAd.id}`,
        eyebrow: 'Sponsored',
        title: topAd.title || 'Featured promotion',
        description: String(topAd.body || 'Approved campaigns appear directly in the member home experience.').trim(),
        meta: 'Live campaign',
        badge: 'Sponsored',
        ctaLabel: topAd.ctaText || 'Open campaign',
        onClick: () => handleHighlightedAdOpen(topAd),
        mediaUrl: resolveHighlightAdMedia(topAd),
        icon: <Megaphone className="h-4 w-4" />,
        tone: 'amber'
      });
    } else if (topPost) {
      items.push({
        id: `mobile-post:${topPost.id}`,
        eyebrow: 'Feed intelligence',
        title: topPost.title || topPost.author?.displayName || topPost.authorName || 'Fresh from your network',
        reason: topPost?.ranking?.primaryReason || 'Ranked for your current professional graph',
        description: String(
          topPost.content || 'Stay on top of the newest posts, updates, and conversations in your home feed.'
        ).trim(),
        meta: `${posts.length} live posts`,
        badge: 'Fresh',
        ctaLabel: 'Open post',
        onClick: () => openPostCard(topPost),
        mediaUrl: resolveHighlightPostMedia(topPost),
        videoUrl: resolveHighlightPostVideo(topPost),
        posterUrl: resolveHighlightPostPoster(topPost),
        fallbackMediaUrl: resolveHighlightPostFallback(topPost),
        icon: <Newspaper className="h-4 w-4" />,
        tone: 'slate'
      });
    }

    return items.slice(0, 6);
  }, [
    ads,
    broadcastChannels,
    buildSeriesUrl,
    featuredSeries,
    handleHighlightedAdOpen,
    officeHours,
    openInsightsSection,
    onOpenScrollSeries,
    posts,
    recommendedGigs,
    recommendedJobs,
    resolveBroadcastHref,
    scrollToFeedSection,
    suggestedPages,
    suggestedPeople
  ]);

  const showHighlightsBoard = highlightItems.length > 0;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreArmedRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const loadInFlightRef = useRef(false);
  const postsRef = useRef<any[]>([]);
  const rateLimitUntilRef = useRef<number>(0);
  const feedAbortRef = useRef<AbortController | null>(null);
  const feedLoadRequestIdRef = useRef(0);
  const mobileFeedTransportRef = useRef<'orchestrated' | 'legacy'>('legacy');
  /** Phase 20.10 — stop infinite "Loading more..." on zero-unique pages / stuck cursors. */
  const emptyPageStreakRef = useRef(0);
  const lastCompletedCursorRef = useRef<string | null>(null);
  const lastCompletedAddedRef = useRef(0);
  const loadMoreErrorStreakRef = useRef(0);
  const feedTerminalRef = useRef(false);
  const [feedTerminal, setFeedTerminal] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  // Phase 21.0 — predictive infinite feed policy (network-aware).
  const feedNetworkClass = useMemo(
    () =>
      classifyFeedNetwork({
        effectiveType: (typeof navigator !== 'undefined' && (navigator as any).connection?.effectiveType) || null,
        downlink: (typeof navigator !== 'undefined' && (navigator as any).connection?.downlink) || null,
        saveData: Boolean(profile.dataSaver || (typeof navigator !== 'undefined' && (navigator as any).connection?.saveData)),
        onLine: typeof navigator !== 'undefined' ? navigator.onLine : true
      }),
    [profile.dataSaver, isConstrainedConnection]
  );
  const feedPrefetchPolicy = useMemo(
    () =>
      resolvePrefetchPolicy(feedNetworkClass, {
        dataSaver: Boolean(profile.dataSaver),
        isMobile: true
      }),
    [feedNetworkClass, profile.dataSaver]
  );
  const adaptiveFeedLimit = useMemo(
    () =>
      resolveAdaptivePageSize({
        basePageSize: Number(profile.feedPageSize || (constrainedForFeed ? 8 : 12)),
        networkClass: feedNetworkClass,
        dataSaver: Boolean(profile.dataSaver),
        viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
        isMobile: true
      }),
    [profile.feedPageSize, profile.dataSaver, feedNetworkClass, constrainedForFeed]
  );
  const observerRootMargin = useMemo(
    () => buildObserverRootMargin(feedPrefetchPolicy.observerRootMarginPx),
    [feedPrefetchPolicy.observerRootMarginPx]
  );
  const viewTrackedRef = useRef<Set<string>>(new Set());
  const postMediaTapTimersRef = useRef<Record<string, number>>({});
  const postMediaLastTapAtRef = useRef<Record<string, number>>({});
  const commitVisiblePosts = useCallback((items: any[], nextCursorValue: string | null, mode: 'initial' | 'more' | 'soft_refresh') => {
    const beforeIds = new Set(
      (postsRef.current || []).map((item) => String(item?.id || '').trim()).filter(Boolean)
    );
    // Phase 21.1.4 — never re-sort an existing session on soft_refresh/more; only sort brand-new batches.
    const deduped = dedupeById(
      (Array.isArray(items) ? items : [])
        .map((item) => normalizePost(item))
        .filter((item) => Boolean(item?.id))
    );
    const normalizedItems =
      mode === 'initial' && postsRef.current.length === 0 ? sortPosts(deduped) : deduped;
    const uniqueAdded =
      mode === 'more' || mode === 'soft_refresh'
        ? normalizedItems.filter((item) => !beforeIds.has(String(item?.id || '').trim())).length
        : normalizedItems.length;
    let resolvedCursor = nextCursorValue ? String(nextCursorValue).trim() || null : null;
    if (mode === 'more') {
      if (uniqueAdded > 0) {
        emptyPageStreakRef.current = 0;
        loadMoreErrorStreakRef.current = 0;
      } else {
        emptyPageStreakRef.current += 1;
      }
      const sameCursor =
        Boolean(lastCompletedCursorRef.current) &&
        String(lastCompletedCursorRef.current) === String(cursorRef.current || '');
      const haltEmpty = emptyPageStreakRef.current >= 2;
      const haltUnchanged = uniqueAdded <= 0 && sameCursor;
      if (!resolvedCursor || haltEmpty || haltUnchanged || uniqueAdded <= 0 && !resolvedCursor) {
        if (haltEmpty || haltUnchanged || !resolvedCursor) {
          resolvedCursor = null;
          feedTerminalRef.current = true;
          setFeedTerminal(true);
        }
      } else {
        feedTerminalRef.current = false;
        setFeedTerminal(false);
      }
      // Zero unique growth with a still-truthy API cursor → clear cursor after empty streak.
      if (uniqueAdded <= 0 && (haltEmpty || haltUnchanged)) {
        resolvedCursor = null;
        feedTerminalRef.current = true;
        setFeedTerminal(true);
      }
      lastCompletedCursorRef.current = String(cursorRef.current || '') || null;
      lastCompletedAddedRef.current = uniqueAdded;
    } else {
      emptyPageStreakRef.current = 0;
      loadMoreErrorStreakRef.current = 0;
      feedTerminalRef.current = !resolvedCursor;
      setFeedTerminal(!resolvedCursor);
    }
    const retained = trimFeedForMemory(normalizedItems, feedPrefetchPolicy.maxRetainedItems);
    postsRef.current = retained;
    cursorRef.current = resolvedCursor;
    setCursor(resolvedCursor);
    startTransition(() => {
      setPosts(retained);
    });
    if (mode === 'initial') {
      setRenderedPostCount(
        Math.min(
          Math.max(initialRenderCount, feedPrefetchPolicy.progressiveInitialWindow),
          retained.length || initialRenderCount
        )
      );
    } else if (uniqueAdded > 0) {
      // Reveal a few more cards as new data arrives so prefetch feels seamless.
      setRenderedPostCount((prev) =>
        Math.min(retained.length, Math.max(prev, prev + Math.min(feedPrefetchPolicy.progressiveRevealStep, uniqueAdded)))
      );
    }
    return { uniqueAdded, resolvedCursor };
  }, [feedPrefetchPolicy.maxRetainedItems, feedPrefetchPolicy.progressiveInitialWindow, feedPrefetchPolicy.progressiveRevealStep, initialRenderCount, normalizePost, sortPosts]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    // Phase 21.1.7 — when shared continuous feed owns the session, do not hydrate
    // from localStorage. Cache races caused session-head identity swaps on slower
    // WebKit (iPhone) when cache order differed from the orchestrator page.
    if (USE_SHARED_FEED_LIFECYCLE) return;
    if (!feedCacheKey) return;
    try {
      const raw = localStorage.getItem(feedCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ts?: number; items?: any[]; cursor?: string | null };
      const cachedPosts = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!cachedPosts.length) return;
      // Never replace a live non-empty session with cache.
      if (postsRef.current.length > 0) return;
      const cachedCursor = parsed?.cursor ? String(parsed.cursor) : null;
      cursorRef.current = cachedCursor;
      commitVisiblePosts(cachedPosts, cachedCursor, 'initial');
      setLoading(false);
      setError(null);
    } catch {
      // Ignore cache parse errors and continue network-first.
    }
  }, [commitVisiblePosts, feedCacheKey]);

  useEffect(() => {
    setRenderedPostCount((prev) => {
      if (!posts.length) return initialRenderCount;
      const minimum = Math.min(initialRenderCount, posts.length);
      if (prev < minimum) return minimum;
      if (prev > posts.length) return posts.length;
      return prev;
    });
  }, [initialRenderCount, posts.length]);

  useEffect(() => {
    const connection = getNavigatorConnection();
    if (!connection?.addEventListener || !connection?.removeEventListener) return;
    const syncState = () => setIsConstrainedConnection(isConstrainedNetwork());
    syncState();
    connection.addEventListener('change', syncState);
    return () => {
      connection.removeEventListener?.('change', syncState);
    };
  }, []);

  useEffect(() => {
    setSecondaryFeedReady(false);
    setFeaturedSeries([]);
    setBroadcastChannels([]);
  }, [currentUserId]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleHandle: number | null = null;
    const readyDelay = posts.length > 0 ? (constrainedForFeed ? 2600 : 1200) : 600;
    const markReady = () => {
      if (cancelled) return;
      setSecondaryFeedReady(true);
    };

    if (!constrainedForFeed && typeof (window as any).requestIdleCallback === 'function') {
      idleHandle = (window as any).requestIdleCallback(markReady, { timeout: readyDelay });
    } else {
      timeoutId = window.setTimeout(markReady, readyDelay);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleHandle !== null && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [constrainedForFeed, loading, posts.length]);

  const handleListingContact = useCallback(
    async (payload: { kind: 'jobs' | 'gigs'; item: any }) => {
      if (!user?.id) return;
      const item = payload.item || {};
      const targetId =
        payload.kind === 'jobs'
          ? String(item?.clientId || '').trim()
          : String(item?.freelancerId || '').trim();
      if (!targetId) return;
      const targetName =
        payload.kind === 'jobs'
          ? String(item?.clientName || 'Employer').trim() || 'Employer'
          : String(item?.freelancerName || 'Freelancer').trim() || 'Freelancer';
      const targetAvatarRaw = payload.kind === 'jobs' ? item?.clientAvatar : item?.freelancerAvatar;
      const targetAvatar = resolvePostAttachmentMediaUrl(targetAvatarRaw);

      try {
        const conversationId = await MessagingService.createConversation([
          { id: user.id, name: user.name || 'You', avatar: user.avatar, role: user.role },
          { id: targetId, name: targetName, avatar: targetAvatar || undefined }
        ]);
        navigate(`/messages/${encodeURIComponent(conversationId)}`);
      } catch (error) {
        console.error('Unable to start listing conversation', error);
      }
    },
    [navigate, user]
  );

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

  const findPrimaryVideoAttachment = useCallback((post: any) => {
    const baseAttachments = Array.isArray(post?.attachments) ? post.attachments : Array.isArray(post?.media) ? post.media : [];
    const syntheticVideoAttachment = resolveSyntheticVideoAttachment(post);
    const attachments =
      syntheticVideoAttachment && !baseAttachments.some((entry: any) => isVideo(entry))
        ? [syntheticVideoAttachment, ...baseAttachments]
        : baseAttachments;
    return (
      attachments.find(
        (entry: any) =>
          Boolean(entry) &&
          isVideo(entry)
      ) || null
    );
  }, []);

  const openVideoPostInScroll = useCallback(
    (post: any, media: any) => {
      const postId = String(post?.id || '').trim();
      const mediaUrl = String(media?.url || resolvePostAttachmentMediaUrl(media) || '').trim();
      if (!postId || !mediaUrl) return;
      const sourcePayload: PendingPostVideoScrollViewerSource = {
        sourcePostId: postId,
        fileId: String(media?.fileId || media?.file_id || media?.file?.id || media?.asset?.id || media?.id || '').trim() || null,
        mediaUrl,
        thumbnailUrl: String(media?.thumbnailUrl || resolvePostAttachmentPosterUrl(media) || '').trim() || null,
        title: String(post?.title || '').trim() || null,
        description: resolveVideoCaption(post, media) || null,
        location: String(post?.location || '').trim() || null,
        authorName: String(post?.author?.displayName || post?.authorName || '').trim() || null,
        authorAvatar: String(post?.author?.avatarUrl || post?.authorAvatar || '').trim() || null,
        authorUsername: String(post?.author?.username || post?.authorUsername || '').trim() || null,
        isFollowingAuthor:
          typeof post?.viewer?.isFollowingAuthor === 'boolean' ? Boolean(post.viewer.isFollowingAuthor) : null,
        createdAt: String(post?.createdAt || '').trim() || null
      };
      if (onOpenPostVideoScroll) {
        onOpenPostVideoScroll(sourcePayload);
        return;
      }
      stashPendingPostVideoScrollViewerSource(sourcePayload);
      navigate(buildPostVideoScrollViewerPath(sourcePayload), {
        state: {
          pendingViewerSource: sourcePayload
        }
      });
    },
    [navigate, onOpenPostVideoScroll]
  );

  const openPostCard = useCallback(
    (post: any) => {
      if (!post?.id) return;
      const primaryVideo = findPrimaryVideoAttachment(post);
      if (primaryVideo) {
        openVideoPostInScroll(post, primaryVideo);
        return;
      }
      setExpandedPost(post);
    },
    [findPrimaryVideoAttachment, openVideoPostInScroll]
  );

  const openPostFromText = useCallback(
    (event: React.MouseEvent<HTMLElement>, post: any) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, input, textarea, select, label, video, audio')) return;
      openPostCard(post);
    },
    [openPostCard]
  );

  const openScrolithaFromMobile = useCallback(
    (prompt: string) => {
      let base = '/m/home';
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        ['post', 'postId', 'story', 'storyId', 'scroll', 'edit', 'modal', 'focus'].forEach((key) => {
          params.delete(key);
        });
        const query = params.toString();
        base = `${window.location.pathname}${query ? `?${query}` : ''}`;
      }
      navigate(buildScrolithaPath(base, prompt));
    },
    [navigate]
  );

  const triggerPostDoubleTapLike = useCallback(
    async (post: any) => {
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      if (!user?.id) {
        if (confirm('Log in to like posts?')) navigate('/auth/login');
        return;
      }
      try {
        const summary = await ReactionsService.react('POST', postId, 'like');
        window.dispatchEvent(
          new CustomEvent('community:post_reaction_updated', {
            detail: {
              postId,
              reactions: summary?.counts || {},
              actorId: user.id,
              userReaction: summary?.userReaction || null
            }
          })
        );
      } catch (error) {
        console.error('Failed to apply double-tap like', error);
      }
    },
    [user?.id]
  );

  const handlePostMediaPrimaryAction = useCallback(
    (post: any, media: any) => {
      if (isVideo(media)) {
        openVideoPostInScroll(post, media);
        return;
      }
      const preview = toPreviewMedia({
        ...media,
        url: media?.url || resolvePostAttachmentMediaUrl(media),
        thumbnailUrl: media?.thumbnailUrl || resolvePostAttachmentPosterUrl(media)
      });
      if (preview) {
        setPreviewMedia(preview);
        return;
      }
      setExpandedPost(post);
    },
    [openVideoPostInScroll]
  );

  const queueOpenPostFromMediaTap = useCallback(
    (post: any, media: any, mediaKey: string) => {
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      const timerKey = `${postId}:${mediaKey}`;
      const existing = postMediaTapTimersRef.current[timerKey];
      if (existing) window.clearTimeout(existing);
      postMediaTapTimersRef.current[timerKey] = window.setTimeout(() => {
        delete postMediaTapTimersRef.current[timerKey];
        handlePostMediaPrimaryAction(post, media);
      }, 220);
    },
    [handlePostMediaPrimaryAction]
  );

  const onPostMediaDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, post: any, mediaKey: string) => {
      event.preventDefault();
      event.stopPropagation();
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      const timerKey = `${postId}:${mediaKey}`;
      const existing = postMediaTapTimersRef.current[timerKey];
      if (existing) {
        window.clearTimeout(existing);
        delete postMediaTapTimersRef.current[timerKey];
      }
      void triggerPostDoubleTapLike(post);
    },
    [triggerPostDoubleTapLike]
  );

  const onPostMediaTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLElement>, post: any, mediaKey: string) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, label')) return;
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      const tapKey = `${postId}:${mediaKey}`;
      const now = Date.now();
      const previousTap = postMediaLastTapAtRef.current[tapKey] || 0;
      postMediaLastTapAtRef.current[tapKey] = now;
      if (previousTap && now - previousTap <= 320) {
        event.preventDefault();
        event.stopPropagation();
        const existing = postMediaTapTimersRef.current[tapKey];
        if (existing) {
          window.clearTimeout(existing);
          delete postMediaTapTimersRef.current[tapKey];
        }
        postMediaLastTapAtRef.current[tapKey] = 0;
        void triggerPostDoubleTapLike(post);
      }
    },
    [triggerPostDoubleTapLike]
  );

  const load = useCallback(async (mode: 'initial' | 'more' | 'soft_refresh') => {
    // Phase 21.0.2 — delegate continuous stream to shared lifecycle.
    if (USE_SHARED_FEED_LIFECYCLE) {
      if (mode === 'soft_refresh') {
        await sharedFeed.softRefresh();
        return;
      }
      if (mode === 'more') {
        await sharedFeed.loadMore();
        return;
      }
      await sharedFeed.load('initial');
      return;
    }
    const now = Date.now();
    if (rateLimitUntilRef.current && now < rateLimitUntilRef.current) {
      return;
    }
    if (loadInFlightRef.current) return;
    if (mode === 'more' && (feedTerminalRef.current || !String(cursorRef.current || '').trim())) {
      feedTerminalRef.current = true;
      setFeedTerminal(true);
      return;
    }
    if (
      mode === 'more' &&
      lastCompletedCursorRef.current &&
      String(lastCompletedCursorRef.current) === String(cursorRef.current || '') &&
      lastCompletedAddedRef.current <= 0
    ) {
      cursorRef.current = null;
      setCursor(null);
      feedTerminalRef.current = true;
      setFeedTerminal(true);
      return;
    }
    loadInFlightRef.current = true;
    const feedLimit = Math.max(6, Math.min(24, adaptiveFeedLimit));
    const requestId = ++feedLoadRequestIdRef.current;
    const requestedCursor = mode === 'more' ? String(cursorRef.current || '').trim() || null : null;
    const requestStartedAt = Date.now();
    emitFeedAnalytics(mode === 'more' ? 'feed_prefetch' : 'feed_request_start', 'mobile_member_home', {
      mode,
      limit: feedLimit,
      networkClass: feedNetworkClass
    });

    try {
      if (mode === 'initial') {
        setLoading(postsRef.current.length === 0);
        setError(null);
        setStatusMessage(null);
        feedTerminalRef.current = false;
        setFeedTerminal(false);
        emptyPageStreakRef.current = 0;
        loadMoreErrorStreakRef.current = 0;
      } else if (mode === 'soft_refresh') {
        // Soft refresh: keep content visible; no spinner takeover.
        setError(null);
      } else {
        // Silent prefetch chrome — skeleton instead of blocking "Loading more..."
        setLoadingMore(true);
      }

      let nextPosts: any[] = [];
      let nextCursor: string | null = null;
      let usedPostsFallback = false;

      // Phase 19.1: try member-feed orchestrator first (desktop Member Home parity).
      // Soft-fail → existing community/legacy path. Auth 401/403 rethrow for session handling.
      const isAuthenticated = Boolean(user?.id);
      if (isAuthenticated) {
        try {
          feedAbortRef.current?.abort();
          const controller = new AbortController();
          feedAbortRef.current = controller;
          const roleLike =
            (user as any)?.role ||
            (user as any)?.userType ||
            (user as any)?.accountType ||
            (user as any)?.type;
          const pref = buildNormalizedViewerFeedPreference({
            feedIntent: normalizeMemberFeedIntent((user as any)?.feedIntent || (user as any)?.preferredFeedMode, 'for_you'),
            roleLike,
            source: 'member_home'
          });
          // Prefer explicit stored insights mapping when available later; default for_you is safe.
          const orchestratedMode = pref.feedIntent || 'for_you';
          const orchestrated = await MemberFeedService.tryFetchPage({
            surface: 'member_home',
            mode: orchestratedMode,
            limit: feedLimit,
            cursor: mode === 'more' ? cursorRef.current || undefined : undefined,
            signal: controller.signal,
            timeoutMs: constrainedForFeed ? 12000 : 18000,
            hardFailAuth: true
          });
          if (requestId !== feedLoadRequestIdRef.current) return;
          if (
            orchestrated &&
            (Array.isArray(orchestrated.posts) || Array.isArray(orchestrated.items)) &&
            ((orchestrated.posts?.length || 0) > 0 ||
              (orchestrated.items?.length || 0) > 0 ||
              orchestrated.hasMore)
          ) {
            mobileFeedTransportRef.current = 'orchestrated';
            nextPosts = orchestrated.posts || [];
            nextCursor = orchestrated.nextCursor;
            usedPostsFallback = false;
            // Skip legacy collectors when orchestrator produced a usable page.
            const shouldPreserveExistingFeed =
              (mode === 'initial' || mode === 'soft_refresh') &&
              nextPosts.length === 0 &&
              postsRef.current.length > 0;
            rateLimitUntilRef.current = 0;
            setRateLimitUntil(null);
            setError(null);
            setStatusMessage(null);
            // Phase 21.1.4 — soft_refresh keeps session order; new IDs only via controlled prepend path.
            const mergedPosts = shouldPreserveExistingFeed
              ? postsRef.current
              : mode === 'more'
                ? [...postsRef.current, ...nextPosts]
                : mode === 'soft_refresh'
                  ? postsRef.current
                  : nextPosts;
            const softFresh =
              mode === 'soft_refresh' && !shouldPreserveExistingFeed
                ? (() => {
                    const existingIds = new Set(
                      postsRef.current.map((p) => String(p?.id || '')).filter(Boolean)
                    );
                    return nextPosts.filter((p) => !existingIds.has(String(p?.id || '')));
                  })()
                : [];
            if (mode === 'soft_refresh') {
              if (softFresh.length === 0) {
                setStatusMessage('You are up to date.');
              } else {
                // Controlled prepend only when user is not mid-list: still do not replace existing order.
                // Apply new IDs at top only after explicit soft buffer apply — for mobile use status + keep session.
                setStatusMessage(`${softFresh.length} new posts available — pull to refresh to show them.`);
              }
            }
            const commit = commitVisiblePosts(
              mode === 'soft_refresh' && softFresh.length
                ? (() => {
                    // Do not auto-prepend (causes scroll identity jump). Session stays put.
                    return postsRef.current;
                  })()
                : mergedPosts,
              mode === 'soft_refresh' ? cursorRef.current : nextCursor,
              mode === 'soft_refresh' ? 'soft_refresh' : mode === 'more' ? 'more' : 'initial'
            );
            // Phase 21.0.1 — maintain ordered mixed stream from orchestrator items.
            const streamIncoming = buildStreamFromMemberFeedPage(orchestrated);
            if (mode === 'initial') {
              feedStreamRef.current = streamIncoming;
              setFeedStream(streamIncoming);
            } else if (mode === 'soft_refresh') {
              // Isolate: leave session stream unchanged (pending messaging only).
              if (softFresh.length === 0) setStatusMessage('You are up to date.');
            } else if (mode === 'more') {
              const mergedStream = mergeStreamEntries(feedStreamRef.current, streamIncoming, {
                maxRetained: feedPrefetchPolicy.maxRetainedItems
              });
              feedStreamRef.current = mergedStream.merged;
              setFeedStream(mergedStream.merged);
            }
            // Stuck cursor with zero unique adds — end pagination even if API re-issues hasMore.
            if (
              mode === 'more' &&
              commit.uniqueAdded <= 0 &&
              (commit.resolvedCursor === requestedCursor || !commit.resolvedCursor)
            ) {
              cursorRef.current = null;
              setCursor(null);
              feedTerminalRef.current = true;
              setFeedTerminal(true);
            }
            if (postsRef.current.length > 0) {
              try {
                localStorage.setItem(
                  feedCacheKey,
                  JSON.stringify({
                    ts: Date.now(),
                    cursor: cursorRef.current,
                    items: postsRef.current.slice(0, feedPrefetchPolicy.maxRetainedItems)
                  })
                );
              } catch {
                // Ignore cache write errors.
              }
            }
            measureFeedRequest('mobile_member_home', requestStartedAt, mode === 'more' ? 'prefetch_success' : 'success', {
              transport: 'orchestrated',
              added: commit.uniqueAdded,
              total: postsRef.current.length
            });
            return;
          }
          mobileFeedTransportRef.current = 'legacy';
        } catch (orchError: any) {
          if (requestId !== feedLoadRequestIdRef.current) return;
          const status = Number(orchError?.response?.status || 0);
          if (status === 401 || status === 403) {
            throw orchError;
          }
          // Timeout / soft failure → legacy path below.
          mobileFeedTransportRef.current = 'legacy';
        }
      }

      if (mode === 'initial') {
        const feedRequest = withFastFail(
          CommunityService.getFeed({
            limit: feedLimit,
            scope: 'discover'
          }),
          constrainedForFeed ? 15000 : 18000,
          'Feed request timed out. Please retry.'
        );
        const serviceBaselineRequest = withFastFail(
          CommunityService.getPosts({ limit: feedLimit }),
          constrainedForFeed ? 10000 : 12000,
          [] as any[]
        );
        const publicBaselineRequest = withFastFail(
          fetchPublicCommunityPostsBaseline(feedLimit),
          constrainedForFeed ? 7000 : 9000,
          [] as any[]
        );
        void publicBaselineRequest
          .then((value) => {
            const fallbackItems = extractFeedItemsFromPayload(value);
            if (fallbackItems.length > 0 && postsRef.current.length === 0) {
              commitVisiblePosts(fallbackItems, cursorRef.current, 'initial');
            }
          })
          .catch(() => {
            // Ignore seeding failures and continue with the merged load below.
          });
        const [feedResult, serviceBaselineResult, publicBaselineResult] = await Promise.allSettled([
          feedRequest,
          serviceBaselineRequest,
          publicBaselineRequest
        ]);
        const feedResponse = feedResult.status === 'fulfilled' ? feedResult.value : null;
        const discoveredPosts = extractFeedItemsFromPayload(feedResponse);
        const serviceBaselinePosts =
          serviceBaselineResult.status === 'fulfilled'
            ? extractFeedItemsFromPayload(serviceBaselineResult.value)
            : [];
        const publicBaselinePosts =
          publicBaselineResult.status === 'fulfilled'
            ? extractFeedItemsFromPayload(publicBaselineResult.value)
            : [];
        const fallbackPosts = dedupeById([
          ...(publicBaselinePosts as Array<any & { id?: string | null }>),
          ...(serviceBaselinePosts as Array<any & { id?: string | null }>)
        ]);
        nextPosts = fallbackPosts.length > 0
          ? dedupeById([...(fallbackPosts as Array<any & { id?: string | null }>), ...(discoveredPosts as Array<any & { id?: string | null }>)])
          : discoveredPosts;
        nextCursor = discoveredPosts.length > 0 && feedResponse?.nextCursor ? String(feedResponse.nextCursor) : null;
        usedPostsFallback = fallbackPosts.length > 0 && discoveredPosts.length === 0;
        if (nextPosts.length === 0) {
          try {
            const emergencyBaseline = extractFeedItemsFromPayload(
              await withFastFail(
                fetchPublicCommunityPostsBaseline(feedLimit),
                constrainedForFeed ? 7000 : 9000,
                [] as any[]
              )
            );
            if (emergencyBaseline.length > 0) {
              nextPosts = emergencyBaseline;
              usedPostsFallback = true;
            }
          } catch {
            // Ignore and try the authenticated posts endpoint next.
          }
        }
        if (nextPosts.length === 0) {
          try {
            const emergencyPosts = extractFeedItemsFromPayload(
              await withFastFail(
                CommunityService.getPosts({ limit: feedLimit }),
                constrainedForFeed ? 10000 : 12000,
                [] as any[]
              )
            );
            if (emergencyPosts.length > 0) {
              nextPosts = emergencyPosts;
              usedPostsFallback = true;
            }
          } catch {
            // Ignore and allow the preserved-feed path below to win.
          }
        }
        if (nextPosts.length === 0) {
          try {
            const authoritativePosts = extractFeedItemsFromPayload(
              await CommunityService.getPosts({ limit: feedLimit })
            );
            if (authoritativePosts.length > 0) {
              nextPosts = authoritativePosts;
              usedPostsFallback = true;
            }
          } catch {
            // Ignore and continue to the remaining authoritative fallbacks.
          }
        }
        if (nextPosts.length === 0) {
          try {
            const authoritativePublicBaseline = extractFeedItemsFromPayload(
              await fetchPublicCommunityPostsBaseline(feedLimit)
            );
            if (authoritativePublicBaseline.length > 0) {
              nextPosts = authoritativePublicBaseline;
              usedPostsFallback = true;
            }
          } catch {
            // Ignore and continue to the direct feed fallback.
          }
        }
        if (nextPosts.length === 0) {
          try {
            const authoritativeFeed = extractFeedItemsFromPayload(
              await CommunityService.getFeed({
                limit: feedLimit,
                scope: 'discover'
              })
            );
            if (authoritativeFeed.length > 0) {
              nextPosts = authoritativeFeed;
            }
          } catch {
            // Ignore and allow the preserved-feed path below to win.
          }
        }
      } else {
        const resp = await withFastFail(
          CommunityService.getFeed({
            cursor: cursorRef.current || undefined,
            limit: feedLimit,
            scope: 'discover'
          }),
          constrainedForFeed ? 15000 : 18000,
          'Feed request timed out. Please retry.'
        );
        nextPosts = extractFeedItemsFromPayload(resp);
        nextCursor = resp?.nextCursor ? String(resp.nextCursor) : null;
      }
      const shouldPreserveExistingFeed = mode === 'initial' && nextPosts.length === 0 && postsRef.current.length > 0;

      rateLimitUntilRef.current = 0;
      setRateLimitUntil(null);
      setError(null);
      setStatusMessage(usedPostsFallback ? 'Showing community posts while your home feed reconnects.' : null);
      const mergedPosts = shouldPreserveExistingFeed
        ? postsRef.current
        : mode === 'more'
          ? [...postsRef.current, ...nextPosts]
          : nextPosts;
      const commit = commitVisiblePosts(mergedPosts, nextCursor, mode);
      if (
        mode === 'more' &&
        commit.uniqueAdded <= 0 &&
        (commit.resolvedCursor === requestedCursor || emptyPageStreakRef.current >= 2 || !commit.resolvedCursor)
      ) {
        cursorRef.current = null;
        setCursor(null);
        feedTerminalRef.current = true;
        setFeedTerminal(true);
      }
      if (shouldPreserveExistingFeed) {
        setStatusMessage('Showing your saved feed while we reconnect.');
      }
        if (postsRef.current.length > 0) {
          try {
            localStorage.setItem(
              feedCacheKey,
              JSON.stringify({
                ts: Date.now(),
                cursor: cursorRef.current,
                items: postsRef.current.slice(0, feedPrefetchPolicy.maxRetainedItems)
              })
            );
          } catch {
            // Ignore cache write errors.
          }
        }
      measureFeedRequest('mobile_member_home', requestStartedAt, mode === 'more' ? 'prefetch_success' : 'success', {
        transport: mobileFeedTransportRef.current,
        total: postsRef.current.length
      });
    } catch (e: any) {
      measureFeedRequest('mobile_member_home', requestStartedAt, 'error', {
        status: Number(e?.response?.status || 0)
      });
      const status = Number(e?.response?.status || 0);
      const backendError = e?.response?.data?.error ?? e?.message ?? 'Failed to load feed.';
      if (mode === 'more') {
        loadMoreErrorStreakRef.current += 1;
        if (loadMoreErrorStreakRef.current >= 2) {
          cursorRef.current = null;
          setCursor(null);
          feedTerminalRef.current = true;
          setFeedTerminal(true);
          setStatusMessage('Could not load more posts. Pull to refresh or try again later.');
        }
      }

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
        if (postsRef.current.length > 0) {
          setError(null);
          setStatusMessage('Feed is busy right now. Showing your saved posts while we reconnect.');
        } else {
          setStatusMessage(null);
          setError(String(backendError || 'Too many requests. Please try again later.'));
        }
      } else {
        if (postsRef.current.length > 0) {
          setError(null);
          setStatusMessage('Showing your saved feed while we reconnect.');
        } else {
          setStatusMessage(null);
          setError(String(backendError));
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadInFlightRef.current = false;
    }
  }, [
    adaptiveFeedLimit,
    commitVisiblePosts,
    constrainedForFeed,
    feedNetworkClass,
    feedPrefetchPolicy.maxRetainedItems,
    feedCacheKey,
    initialRenderCount,
    user,
    sharedFeed
  ]);

  // Phase 21.0 — predictive prefetch (disabled when shared lifecycle owns prefetch).
  useEffect(() => {
    if (USE_SHARED_FEED_LIFECYCLE) return;
    if (
      !shouldPrefetchNextPage({
        loadedCount: posts.length,
        renderedCount: renderedPostCount,
        remainingItemThreshold: feedPrefetchPolicy.remainingItemThreshold,
        hasCursor: Boolean(cursor),
        isTerminal: feedTerminal || feedTerminalRef.current,
        loadMoreInFlight: loadingMore || loadInFlightRef.current,
        initialLoading: loading,
        rateLimited: Boolean(rateLimitUntil && Date.now() < rateLimitUntil)
      })
    ) {
      return;
    }
    if (loadMoreArmedRef.current) return;
    loadMoreArmedRef.current = true;
    void load('more').finally(() => {
      loadMoreArmedRef.current = false;
    });
  }, [
    posts.length,
    renderedPostCount,
    feedPrefetchPolicy.remainingItemThreshold,
    cursor,
    feedTerminal,
    loadingMore,
    loading,
    rateLimitUntil,
    load
  ]);

  // Phase 21.0 — soft personalization signals from dwell time on visible posts.
  useEffect(() => {
    if (!user?.id || !visiblePosts.length || constrainedForFeed) return;
    const startedAt = Date.now();
    const ids = visiblePosts
      .slice(0, 4)
      .map((p, index) => ({ id: String(p?.id || '').trim(), index }))
      .filter((entry) => entry.id);
    return () => {
      const elapsed = Date.now() - startedAt;
      ids.forEach((entry) => {
        observeFeedViewDuration({
          entityId: entry.id,
          surface: 'mobile_member_home',
          viewDurationMs: elapsed,
          feedPosition: entry.index
        });
      });
    };
  }, [visiblePosts, user?.id, constrainedForFeed]);

  // Lightweight scroll FPS sampling (DEV analytics path; no UI impact).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stop: (() => void) | null = null;
    const onScroll = () => {
      if (stop) return;
      stop = startScrollFpsSample('mobile_member_home', 900);
      window.setTimeout(() => {
        stop = null;
      }, 1200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      stop?.();
    };
  }, []);

  useEffect(() => {
    // Shared lifecycle mounts its own initial load.
    if (USE_SHARED_FEED_LIFECYCLE) return;
    void load('initial');
  }, [load]);

  const loadPromotedAds = useCallback(() => {
    if (promotedAdsTimerRef.current !== null) {
      window.clearTimeout(promotedAdsTimerRef.current);
      promotedAdsTimerRef.current = null;
    }
    if (feedSettings.showPromoted === false) return;
    if (!secondaryFeedReady) return;
    const requestId = promotedAdsRequestIdRef.current + 1;
    promotedAdsRequestIdRef.current = requestId;
    const delayMs = constrainedForFeed ? 1800 : 900;
    promotedAdsTimerRef.current = window.setTimeout(() => {
      Promise.allSettled([
        CommunityService.getPublicAds({ placement: 'homepage_feed', limit: constrainedForFeed ? 4 : 8 }),
        CommunityService.getPublicAds({ placement: 'community_feed', limit: constrainedForFeed ? 4 : 8 }),
        CommunityService.getPublicAds({ placement: 'scroll_feed', limit: constrainedForFeed ? 4 : 8 }),
        CommunityService.getPublicAds({ placement: 'scroll_preroll', limit: constrainedForFeed ? 2 : 4 })
      ])
        .then((results) => {
          if (promotedAdsRequestIdRef.current !== requestId) return;
          const merged = results.flatMap((result) =>
            result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []
          );
          const byId = new Map<string, any>();
          merged.forEach((item) => {
            const id = String(item?.id || '').trim();
            if (id && !byId.has(id)) byId.set(id, item);
          });
          setAds(shuffle(Array.from(byId.values())));
        })
        .catch(() => {
          if (promotedAdsRequestIdRef.current !== requestId) return;
          setAds([]);
        });
    }, delayMs);
  }, [constrainedForFeed, feedSettings.showPromoted, secondaryFeedReady]);

  useEffect(() => {
    loadPromotedAds();
    return () => {
      promotedAdsRequestIdRef.current += 1;
      if (promotedAdsTimerRef.current !== null) {
        window.clearTimeout(promotedAdsTimerRef.current);
        promotedAdsTimerRef.current = null;
      }
    };
  }, [loadPromotedAds]);

  useEffect(() => {
    if (feedSettings.showPromoted === false) return;
    const onAdEvent = () => loadPromotedAds();
    const events = ['community:ad_created', 'community:ad_status_updated', 'community:ads_config_updated'];
    events.forEach((eventName) => window.addEventListener(eventName, onAdEvent as EventListener));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onAdEvent as EventListener));
    };
  }, [feedSettings.showPromoted, loadPromotedAds]);

  useEffect(() => {
    if (!showRecommendedGigsJobs) {
      setRecommendedJobs([]);
      setRecommendedGigs([]);
      return;
    }
    if (!secondaryFeedReady) return;
    if (loading) return;
    let cancelled = false;
    const requestLimit = constrainedForFeed ? Math.max(3, Math.min(8, listingPoolLimit)) : Math.max(4, Math.min(14, listingPoolLimit));
    const timer = window.setTimeout(() => {
      const jobRequests: Array<Promise<any>> = constrainedForFeed
        ? [
            jobsApi.getJobs({ status: 'active', limit: requestLimit, recommended: true }),
            jobsApi.getJobs({ status: 'active', limit: requestLimit, random: true })
          ]
        : [
            jobsApi.getJobs({ status: 'active', limit: requestLimit, featuredOnly: true }),
            jobsApi.getJobs({ status: 'active', limit: requestLimit, recommended: true }),
            jobsApi.getJobs({ status: 'active', limit: requestLimit, random: true })
          ];
      const gigRequests: Array<Promise<any>> = constrainedForFeed
        ? [
            gigsApi.getGigs({ status: 'active', limit: requestLimit, recommended: true }),
            gigsApi.getGigs({ status: 'active', limit: requestLimit, random: true })
          ]
        : [
            gigsApi.getGigs({ status: 'active', limit: requestLimit, featuredOnly: true }),
            gigsApi.getGigs({ status: 'active', limit: requestLimit, recommended: true }),
            gigsApi.getGigs({ status: 'active', limit: requestLimit, random: true })
          ];

      Promise.all([
        Promise.allSettled(jobRequests),
        Promise.allSettled(gigRequests)
      ])
        .then(([jobsResults, gigsResults]) => {
          if (cancelled) return;
          let jobsList = dedupeById(
            shuffle(
              jobsResults.flatMap((result) =>
                result.status === 'fulfilled' ? extractJobsFromPayload(result.value) : []
              )
            ) as Array<Job & { id: string }>
          ).slice(0, requestLimit);
          let gigsList = dedupeById(
            shuffle(
              gigsResults.flatMap((result) =>
                result.status === 'fulfilled' ? extractGigsFromPayload(result.value) : []
              )
            ) as Array<Gig & { id: string }>
          ).slice(0, requestLimit);

          if (jobsList.length === 0 || gigsList.length === 0) {
            Promise.allSettled([
              jobsList.length === 0 ? jobsApi.getJobs({ status: 'active', limit: requestLimit }) : Promise.resolve(null),
              gigsList.length === 0 ? gigsApi.getGigs({ status: 'active', limit: requestLimit }) : Promise.resolve(null)
            ]).then(([jobsFallback, gigsFallback]) => {
              if (cancelled) return;
              if (jobsList.length === 0 && jobsFallback.status === 'fulfilled' && jobsFallback.value) {
                jobsList = dedupeById(extractJobsFromPayload(jobsFallback.value) as Array<Job & { id: string }>).slice(0, requestLimit);
              }
              if (gigsList.length === 0 && gigsFallback.status === 'fulfilled' && gigsFallback.value) {
                gigsList = dedupeById(extractGigsFromPayload(gigsFallback.value) as Array<Gig & { id: string }>).slice(0, requestLimit);
              }
              setRecommendedJobs((prev) => (jobsList.length === 0 && prev.length ? prev : jobsList));
              setRecommendedGigs((prev) => (gigsList.length === 0 && prev.length ? prev : gigsList));
            });
            return;
          }

          setRecommendedJobs((prev) => (jobsList.length === 0 && prev.length ? prev : jobsList));
          setRecommendedGigs((prev) => (gigsList.length === 0 && prev.length ? prev : gigsList));
        })
        .catch(() => {
          if (cancelled) return;
          setRecommendedJobs((prev) => prev);
          setRecommendedGigs((prev) => prev);
        });
    }, 1100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showRecommendedGigsJobs, secondaryFeedReady, loading, listingPoolLimit, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showTrendingTags === false) return;
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const delayMs = constrainedForFeed ? 2200 : 1400;
    const timer = window.setTimeout(() => {
      CommunityService.getTrendingTags(10, 7)
        .then((items) => {
          if (cancelled) return;
          const mapped = (Array.isArray(items) ? items : []).map((row: any) => ({
            slug: String(row?.slug || row?.id || row?.label || '').trim() || String(row?.label || '').trim(),
            label: String(row?.label || row?.slug || row?.name || '').trim() || 'tag',
            count: typeof row?.count === 'number' ? row.count : undefined
          }));
          setTrendingTags(mapped.filter((t) => t.slug && t.label));
        })
        .catch(() => {
          if (cancelled) return;
          setTrendingTags([]);
        });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedSettings.showTrendingTags, secondaryFeedReady, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showSuggestedPeople === false) return;
    if (!user?.id) return;
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const requestLimit = constrainedForFeed ? 2 : 4;
    const timer = window.setTimeout(() => {
      Promise.allSettled([
        RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: requestLimit }),
        RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: requestLimit })
      ])
        .then((results) => {
          if (cancelled) return;
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
              const avatarUrl = resolvePostAttachmentMediaUrl(account?.avatar || p?.avatar || null);
              if (!id || !name) return null;
              const intel = resolvePersonRecoPresentation(p);
              return {
                id,
                name,
                username,
                avatarUrl,
                targetType: 'user' as const,
                reasons: intel.reasons,
                whyRecommended: intel.whyRecommended,
                badge: intel.badge
              };
            })
            .filter(Boolean);
          setSuggestedPeople(mapped.slice(0, requestLimit * 2));
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestedPeople([]);
        });
    }, constrainedForFeed ? 2200 : 1600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedSettings.showSuggestedPeople, user?.id, secondaryFeedReady, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showSuggestedPages === false) return;
    if (!user?.id) return;
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const requestLimit = constrainedForFeed ? 2 : 4;
    const timer = window.setTimeout(() => {
      RecoService.getAccounts({ surface: 'member_home', type: 'page', limit: requestLimit })
        .then((items) => {
          if (cancelled) return;
          const mapped = (Array.isArray(items) ? items : [])
            .map((p: any) => {
              const account = p?.account || p;
              const id = String(account?.id || p?.entityId || p?.id || p?.pageId || '').trim();
              const name = String(account?.name || p?.name || 'Business page').trim();
              const username = String(account?.slug || account?.handle || account?.username || p?.slug || '').trim();
              const avatarUrl = resolvePostAttachmentMediaUrl(account?.avatar || p?.avatar || null);
              if (!id || !name) return null;
              const intel = resolvePageRecoPresentation(p);
              return {
                id,
                name,
                username,
                avatarUrl,
                targetType: 'page' as const,
                reasons: intel.reasons,
                whyRecommended: intel.whyRecommended,
                badge: intel.badge
              };
            })
            .filter(Boolean);
          setSuggestedPages(mapped.slice(0, requestLimit));
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestedPages([]);
        });
    }, constrainedForFeed ? 2400 : 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedSettings.showSuggestedPages, user?.id, secondaryFeedReady, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (!secondaryFeedReady || loading || error || !user?.id) return;
    let cancelled = false;
    (async () => {
      const limit = constrainedForFeed ? 2 : 3;
      const [seriesResult, broadcastResult, eventsResult] = await Promise.allSettled([
        withFastFail(ScrollService.getDiscoverableSeries(limit), 15000, 'Series request timed out.'),
        withFastFail(CommunityService.getBroadcastChannels(limit), 15000, 'Broadcast request timed out.'),
        withFastFail(CommunityService.getEvents(), 15000, 'Office hours request timed out.')
      ]);
      if (cancelled) return;
      if (seriesResult.status === 'fulfilled') {
        setFeaturedSeries(Array.isArray(seriesResult.value) ? seriesResult.value.slice(0, limit) : []);
      }
      if (broadcastResult.status === 'fulfilled') {
        setBroadcastChannels(Array.isArray(broadcastResult.value) ? broadcastResult.value.slice(0, limit) : []);
      }
      if (eventsResult.status === 'fulfilled') {
        setOfficeHours(getHighlightedCommunityEvents(Array.isArray(eventsResult.value) ? eventsResult.value : [], limit));
      } else {
        setOfficeHours([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [constrainedForFeed, error, loading, secondaryFeedReady, user?.id]);

  useEffect(() => {
    if (isConnected || !shouldAttemptLiveConnections) return;
    const id = window.setInterval(() => {
      // Soft refresh when sockets are down — never wipe the feed.
      void load(USE_SHARED_FEED_LIFECYCLE ? 'soft_refresh' : 'initial');
    }, 60000);
    return () => window.clearInterval(id);
  }, [isConnected, load, shouldAttemptLiveConnections]);

  useEffect(() => {
    if (!isOnline || recoveryTick <= 0) return;
    void load(USE_SHARED_FEED_LIFECYCLE ? 'soft_refresh' : 'initial');
  }, [isOnline, recoveryTick, load]);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const post = payload?.post;
      if (!post?.id) return;
      const normalized = normalizePost(post);
      // Phase 21.1.7 — do NOT auto-prepend into the live reading window.
      // Soft-pending only: keep session head stable (parity with desktop soft isolation).
      // User pull-to-refresh / explicit apply surfaces new posts.
      setPosts((prev) => {
        if (prev.some((p) => String(p?.id) === String(normalized.id))) return prev;
        return prev;
      });
      setStatusMessage((prev) => prev || 'New posts available — pull to refresh.');
    };
    const onUpdated = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const post = payload?.post;
      if (!post?.id) return;
      const normalized = normalizePost(post);
      // Phase 21.1.7 — in-place update only; never re-sort (preserves visible head).
      setPosts((prev) =>
        prev.map((p) =>
          String(p?.id) === String(normalized.id)
            ? {
                ...p,
                ...normalized,
                interactions: normalized.interactions
                  ? { ...(p?.interactions || {}), ...normalized.interactions }
                  : p?.interactions,
                userState: normalized.userState
                  ? { ...(p?.userState || {}), ...normalized.userState }
                  : p?.userState
              }
            : p
        )
      );
      setFeedStream((prev) =>
        prev.map((entry) => {
          if (entry.kind !== 'post' || String(entry.post?.id || '') !== String(normalized.id)) {
            return entry;
          }
          const nextPost = {
            ...entry.post,
            ...normalized,
            interactions: normalized.interactions
              ? { ...(entry.post?.interactions || {}), ...normalized.interactions }
              : entry.post?.interactions,
            userState: normalized.userState
              ? { ...(entry.post?.userState || {}), ...normalized.userState }
              : entry.post?.userState
          };
          return { ...entry, post: nextPost, data: nextPost };
        })
      );
    };
    const onDeleted = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      const postId = payload?.postId || payload?.id;
      if (!postId) return;
      setPosts((prev) => prev.filter((p) => String(p?.id) !== String(postId)));
    };

    const onPostMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      if (!postId) return;

      const metricsSource = detail?.interactions || detail?.counts || {};
      const likes = metricsSource?.likes ?? detail?.likesCount ?? detail?.likes;
      const comments = metricsSource?.comments ?? detail?.commentsCount ?? detail?.comments;
      const shares = metricsSource?.shares ?? detail?.sharesCount ?? detail?.shares;
      const reposts = metricsSource?.reposts ?? detail?.repostsCount ?? detail?.reposts;
      const views = metricsSource?.views ?? detail?.viewsCount ?? detail?.views;

      setPosts((prev) =>
        prev.map((p) => {
          if (String(p?.id) !== postId) return p;
          const interactions = { ...(p?.interactions || {}) };
          if (likes !== undefined) interactions.likes = Number(likes) || 0;
          if (comments !== undefined) interactions.comments = Number(comments) || 0;
          if (shares !== undefined) interactions.shares = Number(shares) || 0;
          if (reposts !== undefined) interactions.reposts = Number(reposts) || 0;
          if (views !== undefined) interactions.views = Number(views) || 0;
          return { ...p, interactions, viewsCount: interactions.views ?? p?.viewsCount };
        })
      );
    };

    const onPostReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      const reactions = detail?.reactions;
      if (!postId || !reactions || typeof reactions !== 'object') return;
      setPosts((prev) =>
        prev.map((p) => {
          if (String(p?.id) !== postId) return p;
          const interactions = { ...(p?.interactions || {}) };
          interactions.reactions = reactions as Record<string, number>;
          return { ...p, interactions };
        })
      );
    };

    const onPostAiInsightReady = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const postId = String(detail?.postId || detail?.id || '').trim();
      if (!postId) return;
      const insightTextRaw = detail?.aiInsightText ?? detail?.ai_insight_text ?? null;
      const insightText =
        insightTextRaw === null || insightTextRaw === undefined
          ? null
          : String(insightTextRaw).trim() || null;
      setPosts((prev) =>
        prev.map((p) => {
          if (String(p?.id) !== postId) return p;
          return {
            ...p,
            aiInsightEnabled: Boolean(detail?.aiInsightEnabled ?? detail?.ai_insight_enabled ?? true),
            aiInsightGenerated: Boolean(
              detail?.aiInsightGenerated ?? detail?.ai_insight_generated ?? (insightText ? true : false)
            ),
            aiInsightText: insightText
          };
        })
      );
    };

    window.addEventListener('community:post_created', onCreated as EventListener);
    window.addEventListener('community:post_updated', onUpdated as EventListener);
    window.addEventListener('community:post_deleted', onDeleted as EventListener);
    window.addEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
    window.addEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
    window.addEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
    window.addEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    return () => {
      window.removeEventListener('community:post_created', onCreated as EventListener);
      window.removeEventListener('community:post_updated', onUpdated as EventListener);
      window.removeEventListener('community:post_deleted', onDeleted as EventListener);
      window.removeEventListener('community:post_metrics_updated', onPostMetricsUpdated as EventListener);
      window.removeEventListener('community:post_reaction_updated', onPostReactionUpdated as EventListener);
      window.removeEventListener('community:post_ai_insight_ready', onPostAiInsightReady as EventListener);
      window.removeEventListener('post:aiInsightReady', onPostAiInsightReady as EventListener);
    };
  }, [normalizePost]);

  useEffect(() => {
    viewTrackedRef.current.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !visiblePosts.length) return;
    if (constrainedForFeed) return;
    if (loading || error) return;

    const pending = visiblePosts
      .map((p) => String(p?.id || '').trim())
      .filter(Boolean)
      .filter((id) => !viewTrackedRef.current.has(id))
      .slice(0, constrainedForFeed ? 2 : 4);

    if (!pending.length) return;

    let cancelled = false;
    const timers: number[] = [];
    const baseDelay = 1500;
    const spacing = 900;
    pending.forEach((postId, idx) => {
      viewTrackedRef.current.add(postId);
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        CommunityService.postView(postId).catch(() => {});
      }, baseDelay + idx * spacing);
      timers.push(timer);
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [visiblePosts, user?.id, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        const loadedCap = Math.max(posts.length, feedStreamRef.current.length);
        if (renderedPostCount < loadedCap) {
          setRenderedPostCount((prev) =>
            Math.min(loadedCap, prev + Math.max(renderStep, feedPrefetchPolicy.progressiveRevealStep))
          );
          return;
        }
        if (feedTerminalRef.current || feedTerminal) return;
        if (!cursor) return;
        if (loadingMore || loading) return;
        if (loadMoreArmedRef.current) return;
        loadMoreArmedRef.current = true;
        void load('more').finally(() => {
          loadMoreArmedRef.current = false;
        });
      },
      // Phase 21.0 — network-aware rootMargin for predictive infinite scroll
      { rootMargin: observerRootMargin, threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [
    cursor,
    feedTerminal,
    feedPrefetchPolicy.progressiveRevealStep,
    loading,
    loadingMore,
    load,
    observerRootMargin,
    posts.length,
    renderStep,
    renderedPostCount
  ]);

  const showTagsCard = feedSettings.showTrendingTags !== false && trendingTags.length > 0;
  const showPeopleCard = feedSettings.showSuggestedPeople !== false && suggestedPeople.length > 0;
  const showPagesCard = feedSettings.showSuggestedPages !== false && suggestedPages.length > 0;

  if (loading && posts.length === 0 && feedStream.length === 0) {
    return (
      <div className={MOBILE_PAGE_SECTION_CLASS}>
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-slate-600">Loading feed...</span>
        </div>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className={MOBILE_PAGE_SECTION_CLASS}>
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

  if (!posts.length && !showHighlightsBoard && !recommendedJobs.length && !recommendedGigs.length) {
    return (
      <div className={MOBILE_PAGE_SECTION_CLASS}>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No posts yet. Be the first to share an update.
        </div>
      </div>
    );
  }

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS} data-feed-scroll-root="true">
      <PullToRefresh
        onRefresh={async () => {
          await load('soft_refresh');
        }}
        disabled={loading && posts.length === 0}
        reducedMotion={Boolean(profile.dataSaver)}
      >
      {statusMessage ? (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800">{statusMessage}</div>
          {rateLimitUntil && Date.now() < rateLimitUntil ? (
            <div className="mt-1 text-[11px] font-medium text-amber-900/80">
              Rate limit protection is active. Try again in a moment.
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void load('soft_refresh')}
            className="mt-2 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Retry feed
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Updating feed...
        </div>
      ) : null}
      <div id="mobile-member-home-feed-stream" className="space-y-3">
        {showHighlightsBoard ? (
          <Suspense
            fallback={
              <div className="rounded-[30px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
                Loading highlights...
              </div>
            }
          >
            <MemberHomeHighlightsBoard
              title="Professional Discovery Board"
              subtitle="Coach, live sessions, opportunities, network, and campaigns — ranked for your mobile workspace."
              pills={highlightPills}
              items={highlightItems}
              compact
            />
          </Suspense>
        ) : null}
        {showRecommendedGigsJobs && (recommendedJobs.length || recommendedGigs.length) ? (
          <section className="space-y-3 rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]" aria-label="Recommended jobs and gigs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-500">Opportunity intelligence</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Featured jobs and gigs</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Live listings with fit signals from your professional graph.
                </p>
              </div>
            </div>
            {recommendedJobs.length ? (
              <RecommendedListingCard
                kind="jobs"
                title="Featured jobs"
                items={recommendedJobs.slice(0, 2) as any}
                seeAllHref="/browse-jobs"
                onContact={({ kind, item }) => void handleListingContact({ kind, item })}
              />
            ) : null}
            {recommendedGigs.length ? (
              <RecommendedListingCard
                kind="gigs"
                title="Featured gigs"
                items={recommendedGigs.slice(0, 2) as any}
                seeAllHref="/browse"
                onContact={({ kind, item }) => void handleListingContact({ kind, item })}
              />
            ) : null}
          </section>
        ) : null}
        {visibleStream.map((streamEntry, idx) => {
          if (streamEntry.kind !== 'post' || !streamEntry.post) {
            return <FeedMixedCard key={streamEntry.key || `mixed-${idx}`} entry={streamEntry} compact />;
          }
          const post = streamEntry.post;
          const postId = String(post?.id || '');
          const author = post?.author || {};
          const authorName = author.displayName || post?.authorName || post?.authorUsername || 'Member';
          const authorAvatar = resolvePostAttachmentMediaUrl(author.avatarUrl || post?.authorAvatar || null);
          const authorId = post?.authorUserId || post?.authorId;
          const createdAt = post?.createdAt;
          const isVerified = Boolean((author as any)?.isVerified || (post as any)?.authorIsVerified || (post as any)?.authorVerified);
          const isPro = Boolean((author as any)?.isPro || (post as any)?.authorIsPro || (post as any)?.authorPro);
          const verificationLevel = resolveVerificationLevel({
            verificationLevel:
              (author as any)?.verificationLevel ||
              (author as any)?.verification_level ||
              (post as any)?.authorVerificationLevel ||
              (post as any)?.author_verification_level ||
              (post as any)?.authorBadgeType ||
              (post as any)?.author_badge_type,
            isVerified,
            isPro,
            type: author.type || post?.authorType || (post?.businessPage ? 'business' : 'user')
          });

          const profileUrl = resolveProfileUrl(
            {
              id: author.id || authorId || null,
              username: author.username || post?.authorUsername || null,
              type: author.type || post?.authorType || null,
              businessSlug: author.businessSlug || post?.businessPage?.slug || post?.businessPage?.businessSlug || null
            },
            authorId || null,
            user?.id || null
          );

          const content = String(post?.content || '');

          const commentCount = post?.interactions?.comments ?? 0;
          const reactionCounts = post?.interactions?.reactions ?? {};

          const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
          const showMedia = postCardSettings.mediaPreviewEnabled !== false || attachments.some((attachment: any) => isVideo(attachment));

          const hasGraphicWarning = Boolean(post?.graphicWarning) && graphicWarningEnabled;
          const shouldBlurMedia = hasGraphicWarning && graphicWarningBlurMedia && !revealedGraphic[postId];

          const showHashtags = postCardSettings.hashtagsEnabled !== false;
          const tags = Array.isArray(post?.tags) ? post.tags : [];
          const isAIEnhanced = Boolean(post?.isAIEnhanced ?? post?.is_ai_enhanced ?? false);
          const aiInsightText = String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim();
          const hasAiInsight = Boolean(
            (post?.aiInsightGenerated ?? post?.ai_insight_generated ?? false) && aiInsightText
          );

          return (
            <React.Fragment key={postId || `post_${idx}`}>
              <article
                className={`${enterprisePostCard} ${enterprisePostCardPadding} cursor-pointer`}
                data-testid="enterprise-post-card"
                data-post-card-design="21.1.5"
                data-feed-post-id={postId || undefined}
                style={feedItemPerformanceStyle}
                onClick={(event) => {
                  if (isIgnoredSurfaceTarget(event.target)) return;
                  openPostCard(post);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      to={profileUrl}
                      className="h-12 w-12 shrink-0 rounded-full border border-slate-200 shadow-sm ring-1 ring-white"
                      aria-label={`View ${authorName} profile`}
                    >
                      <EnterpriseAvatar
                        src={authorAvatar}
                        name={authorName}
                        user={author}
                        size="lg"
                        className="!h-12 !w-12"
                        alt={authorName}
                      />
                    </Link>
                    <div className="min-w-0 pt-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          to={profileUrl}
                          className={`min-w-0 max-w-full truncate hover:text-slate-700 ${postCardType.name}`}
                          title={authorName}
                        >
                          {authorName}
                        </Link>
                        {verificationLevel ? (
                          <VerifiedBadge
                            size={16}
                            level={verificationLevel}
                            className="ml-1"
                            subjectRole={author.type === 'business' || post?.businessPage ? 'business' : 'user'}
                            subjectType={author.type || post?.authorType || (post?.businessPage ? 'business' : 'user')}
                          />
                        ) : null}
                        {isPro ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                            title="Professional account"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Pro
                          </span>
                        ) : null}
                      </div>
                      {author?.username ? (
                        <p
                          className={`mt-0.5 max-w-full truncate ${postCardType.username}`}
                          title={`@${String(author.username).replace(/^@+/, '')}`}
                        >
                          @{String(author.username).replace(/^@+/, '')}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className={`font-medium ${postCardType.date}`}>{relativeTime(createdAt) || 'now'}</span>
                        {post?.visibility ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                            {String(post.visibility).toUpperCase()}
                          </span>
                        ) : null}
                        {hasGraphicWarning ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                            {graphicWarningLabel}
                          </span>
                        ) : null}
                        {isAIEnhanced ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                            <Sparkles className="h-3 w-3" />
                            AI-enhanced
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-fit items-center gap-2 whitespace-nowrap self-start">
                    {(() => {
                      const authorId = String(author?.id || post?.authorId || '').trim();
                      const isBusiness =
                        String(author?.type || '').toLowerCase() === 'business' || Boolean(post?.businessPage);
                      const pageId = String(post?.businessPage?.id || author?.id || '').trim();
                      const selfId = String(user?.id || '').trim();
                      if (!authorId || (authorId === selfId && !isBusiness)) return null;
                      return (
                        <FollowButton
                          targetUserId={isBusiness ? pageId : authorId}
                          targetType={isBusiness ? 'page' : 'user'}
                          currentUserId={user?.id}
                          initialIsFollowing={Boolean(
                            post?.viewer?.isFollowingAuthor ?? post?.viewer?.isFollowingPage
                          )}
                          onRequireLogin={() => {
                            if (confirm('Log in to follow?')) window.location.href = '/auth/login';
                          }}
                          className="h-9 min-h-9 border-slate-200 bg-white px-3.5 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                        />
                      );
                    })()}
                    <PostOptionsButton
                      post={post}
                      icon={<MoreVertical className="h-4 w-4" />}
                      buttonClassName="rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      onHideFromFeed={(hiddenPostId) => {
                        setPosts((prev) => prev.filter((p) => String(p?.id) !== String(hiddenPostId)));
                      }}
                      onEditPost={(targetPost) => {
                        const id = String(targetPost?.id || '').trim();
                        if (!id) return;
                        navigate(`/m/post?edit=${encodeURIComponent(id)}`, { state: { post: targetPost } });
                      }}
                      onDeletePost={(targetPost) => {
                        const id = String(targetPost?.id || '').trim();
                        if (!id) return;
                        if (!confirm('Delete this post?')) return;
                        void CommunityService.deletePost(id)
                          .then(() => setPosts((prev) => prev.filter((p) => String(p?.id) !== id)))
                          .catch(() => {});
                      }}
                    />
                  </div>
                </div>

                <div className={postCardSectionStackClass}>
                  {shouldRenderTextBackground(post) ? (
                    <div>
                      {post?.title ? (
                        <button
                          type="button"
                          onClick={() => openPostCard(post)}
                          className={`mb-2 block w-full text-left break-words [overflow-wrap:anywhere] hover:text-slate-700 ${postCardType.title}`}
                        >
                          {post.title}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => openPostFromText(event as any, post)}
                        className="block w-full text-left"
                      >
                        <PostTextBackgroundBody
                          post={post}
                          content={String(post?.content || post?.body || '')}
                        />
                      </button>
                    </div>
                  ) : (
                    <TranslatablePostText
                      post={post}
                      viewerId={user?.id}
                      viewerUsername={user?.username}
                      expandable
                      titleClassName={`text-left break-words [overflow-wrap:anywhere] hover:text-slate-700 ${postCardType.title}`}
                      contentWrapperClassName={`cursor-pointer break-words [overflow-wrap:anywhere] ${postCardType.body}`}
                      buttonClassName="text-slate-900"
                      translationRowClassName="text-slate-500"
                      onTitleClick={post?.title ? () => openPostCard(post) : undefined}
                      onContentClick={(event) => openPostFromText(event, post)}
                      onContentKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openPostCard(post);
                        }
                      }}
                    />
                  )}

                  {showHashtags && tags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {tags.slice(0, 8).map((tag: string) => (
                        <Link
                          key={`${postId}_tag_${tag}`}
                          to={`/community/tags/${encodeURIComponent(tag)}`}
                          className="inline-flex min-h-8 max-w-full items-center break-all rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm sm:text-xs"
                        >
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  <PostAiCoachCard
                    description="Use AI suggestions to improve clarity and engagement before publishing."
                    onEnhance={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openScrolithaFromMobile(
                        buildPostScrolithaPrompt(
                          String(post?.title || ''),
                          String(post?.content || post?.body || '')
                        )
                      );
                    }}
                  />

                  {hasAiInsight ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          AI Insight
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setInsightCollapsedByPost((prev) => ({
                              ...prev,
                              [postId]: !(prev[postId] ?? true)
                            }))
                          }
                          className="text-[11px] font-semibold text-emerald-700 hover:underline"
                        >
                          {(insightCollapsedByPost[postId] ?? true) ? 'Show' : 'Hide'}
                        </button>
                      </div>
                      {!(insightCollapsedByPost[postId] ?? true) ? (
                        <p className="mt-2 text-sm text-emerald-900">{aiInsightText}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {(post?.topic || post?.location) ? (
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      {post?.topic ? (
                        <span className="max-w-full break-words rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm [overflow-wrap:anywhere]">
                          Topic: {String(post.topic)}
                        </span>
                      ) : null}
                      {post?.location ? (
                        <span className="max-w-full break-words rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm [overflow-wrap:anywhere]">
                          Location: {String(post.location)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <FeedIntelligenceSignals
                    ranking={post?.ranking}
                    interactions={post?.interactions}
                    showWhy
                    showEngagement
                    compact
                  />

                  {showMedia && attachments.length ? (
                    <div className="relative grid gap-2">
                      <div className={shouldBlurMedia ? 'pointer-events-none blur-sm' : ''}>
                        {attachments.slice(0, 3).map((file: any) => {
                          const mediaKey = String(file.id || file.url || '');
                          const mediaPair = resolvePostAttachmentMediaPair(file);
                          const mediaUrl = mediaPair.url || resolvePostAttachmentMediaUrl(file);
                          const fallbackUrl = mediaPair.fallbackUrl || '';
                          const posterUrl = resolvePostAttachmentPosterUrl(file);
                          const caption = resolveVideoCaption(post, file);
                          return (
                            <div
                              key={`${postId}_att_${file.id || file.url}`}
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
                            >
                              {isVideo(file) ? (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  data-post-media-root="true"
                                  onClick={(event) => {
                                    if ((event.target as HTMLElement | null)?.closest('[data-inline-video-control=\"true\"]')) return;
                                    queueOpenPostFromMediaTap(post, file, mediaKey);
                                  }}
                                  onDoubleClick={(event) => {
                                    if ((event.target as HTMLElement | null)?.closest('[data-inline-video-control=\"true\"]')) return;
                                    onPostMediaDoubleClick(event, post, mediaKey);
                                  }}
                                  onTouchEnd={(event) => onPostMediaTouchEnd(event, post, mediaKey)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      handlePostMediaPrimaryAction(post, file);
                                    }
                                  }}
                                >
                                  <InlineAutoplayVideo
                                    src={mediaUrl}
                                    fallbackSrc={fallbackUrl}
                                    poster={posterUrl}
                                    className="h-[22rem] w-full object-cover sm:h-[26rem] md:h-[30rem]"
                                    controls={false}
                                    autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                                    preload="metadata"
                                    preloadRootMargin={constrainedForFeed ? '80px 0px 80px 0px' : '260px 0px 260px 0px'}
                                    loadingLabel="Video loading"
                                    overlay={(videoElement) => (
                                      <div className="w-full space-y-2 px-2">
                                        <VideoCaptionOverlay text={caption} compact />
                                        <PostVideoActionBar
                                          postId={postId}
                                          postTitle={post?.title}
                                          postContent={caption || post?.content}
                                          postLocation={post?.location}
                                          media={{
                                            id: file?.id,
                                            fileId: file?.fileId || file?.file_id || file?.file?.id || file?.asset?.id || file?.id || null,
                                            url: mediaUrl,
                                            thumbnailUrl: posterUrl,
                                            name: file?.name || file?.originalName || file?.filename,
                                            mimeType: file?.mimeType || file?.mime_type
                                          }}
                                          videoElement={videoElement}
                                        />
                                      </div>
                                    )}
                                  />
                                </div>
                              ) : isImage(file.mimeType) ? (
                                <button
                                  type="button"
                                  onClick={() => handlePostMediaPrimaryAction(post, file)}
                                  onDoubleClick={(event) => onPostMediaDoubleClick(event, post, mediaKey)}
                                  onTouchEnd={(event) => onPostMediaTouchEnd(event, post, mediaKey)}
                                  className="relative block h-[22rem] w-full text-left sm:h-[26rem] md:h-[30rem]"
                                >
                                  <OptimizedImage
                                    src={resolvePostAttachmentMediaUrl(file)}
                                    fallbackSrc={resolvePostAttachmentPosterUrl(file)}
                                    alt={file.name || 'Attachment'}
                                    width={640}
                                    height={400}
                                    sizes="(max-width: 768px) 100vw, 640px"
                                    className="h-[22rem] w-full object-cover sm:h-[26rem] md:h-[30rem]"
                                    loading={idx < priorityMediaPostLimit ? 'eager' : 'lazy'}
                                    decoding="async"
                                    fetchPriority={idx < priorityMediaPostLimit ? 'high' : 'auto'}
                                  />
                                  {caption ? (
                                    <div className="absolute inset-x-0 bottom-0 z-10 px-2 pb-2">
                                      <VideoCaptionOverlay text={caption} compact />
                                    </div>
                                  ) : null}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handlePostMediaPrimaryAction(post, file)}
                                  className="block p-4 text-left text-sm font-semibold text-slate-700 hover:underline"
                                >
                                  {file.name || file.url}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {shouldBlurMedia ? (
                        <button
                          type="button"
                          onClick={() => setRevealedGraphic((prev) => ({ ...prev, [postId]: true }))}
                          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/45 p-4 text-center"
                          aria-label="Reveal media"
                        >
                          <div className="rounded-2xl bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-xl">
                            {graphicWarningLabel}. Tap to view.
                          </div>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <PostEngagementBar
                  postId={postId}
                  postTitle={post?.title}
                  postContent={post?.content}
                  authorId={authorId}
                  dashGcoinTotal={Number(post?.dashGcoinTotal ?? post?.interactions?.dashGcoinTotal ?? 0)}
                  commentPolicy={post?.commentPolicy}
                  postRepostsEnabled={post?.repostsEnabled}
                  commentCount={commentCount}
                  repostCount={post?.repostsCount ?? post?.interactions?.reposts ?? 0}
                  shareCount={post?.sharesCount ?? post?.interactions?.shares ?? 0}
                  viewCount={post?.interactions?.views ?? post?.viewsCount ?? 0}
                  initialReactionCounts={reactionCounts}
                  initialUserReaction={post?.userState?.reaction}
                  interestSurveyEnabled={interestSurveyPostIds.has(postId)}
                  initialInterestSignal={post?.userState?.interestSignal}
                  onCommentCountChange={syncCommentCount}
                  features={{
                    reactions: postCardSettings.reactionsEnabled !== false,
                    comments: postCardSettings.commentsEnabled !== false,
                    reposts: postCardSettings.repostsEnabled !== false,
                    send: postCardSettings.sendEnabled !== false
                  }}
                />
              </article>

              {showRecommendedGigsJobs && user?.id ? (
                (() => {
                  const entry = listingByPostIndex.get(idx);
                  if (!entry) return null;
                  return (
                    <RecommendedListingCard
                      kind={entry.kind === 'job' ? 'jobs' : 'gigs'}
                      title={entry.kind === 'job' ? 'Recommended job' : 'Recommended gig'}
                      items={[entry.item] as any}
                      seeAllHref={entry.kind === 'job' ? '/browse-jobs' : '/browse'}
                      onContact={({ kind, item }) =>
                        void handleListingContact({ kind, item })
                      }
                    />
                  );
                })()
              ) : null}

              {feedSettings.showPromoted !== false ? (
                (() => {
                  const ad = adByPostIndex.get(idx);
                  return ad ? <FeedAdCard ad={ad} /> : null;
                })()
              ) : null}

              {idx === 1 && showTagsCard ? (
                <SuggestedCard data={{ kind: 'tags', title: 'Trending tags', items: trendingTags }} />
              ) : null}

              {idx === 3 && showPeopleCard ? (
                <div id="mobile-member-home-people-suggestions" data-network-reco="people">
                  <SuggestedCard
                    data={{
                      kind: 'people',
                      title: 'Suggested people',
                      items: suggestedPeople.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        username: p.username,
                        avatarUrl: p.avatarUrl,
                        targetType: 'user' as const,
                        reasons: p.reasons,
                        whyRecommended: p.whyRecommended,
                        badge: p.badge
                      }))
                    }}
                  />
                </div>
              ) : null}

              {idx === 5 && showPagesCard ? (
                <div id="mobile-member-home-page-suggestions" data-network-reco="pages">
                  <SuggestedCard
                    data={{
                      kind: 'pages',
                      title: 'Suggested pages',
                      items: suggestedPages.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        username: p.username,
                        avatarUrl: p.avatarUrl,
                        targetType: 'page' as const,
                        reasons: p.reasons,
                        whyRecommended: p.whyRecommended,
                        badge: p.badge
                      }))
                    }}
                  />
                </div>
              ) : null}
            </React.Fragment>
          );
        })}

        {/* Always-mounted anchors so Relationship Intelligence CTA can scroll even on short feeds. */}
        <div id="mobile-member-home-network-recommendations" className="space-y-3">
          {showPeopleCard && posts.length < 4 ? (
            <div id="mobile-member-home-people-suggestions" data-network-reco="people-fallback">
              <SuggestedCard
                data={{
                  kind: 'people',
                  title: 'Suggested people',
                  items: suggestedPeople.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    username: p.username,
                    avatarUrl: p.avatarUrl,
                    targetType: 'user' as const,
                    reasons: p.reasons,
                    whyRecommended: p.whyRecommended,
                    badge: p.badge
                  }))
                }}
              />
            </div>
          ) : null}
          {showPagesCard && posts.length < 6 ? (
            <div id="mobile-member-home-page-suggestions" data-network-reco="pages-fallback">
              <SuggestedCard
                data={{
                  kind: 'pages',
                  title: 'Suggested pages',
                  items: suggestedPages.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    username: p.username,
                    avatarUrl: p.avatarUrl,
                    targetType: 'page' as const,
                    reasons: p.reasons,
                    whyRecommended: p.whyRecommended,
                    badge: p.badge
                  }))
                }}
              />
            </div>
          ) : null}
        </div>

        {loadingMore ? (
          <FeedLoadSkeleton count={constrainedForFeed ? 1 : 2} compact={constrainedForFeed} label="Loading more content" />
        ) : null}

        <div ref={sentinelRef} className="h-6" aria-hidden="true" />

        {renderedPostCount < Math.max(posts.length, feedStream.length) ? (
          <div className="py-3 text-center text-xs font-medium text-slate-500">
            {/* Progressive reveal — no explicit Load More control */}
            Preparing more for you…
          </div>
        ) : feedTerminal || !cursor ? (
          <div className="py-4">
            {posts.length || feedStream.length ? (
              <FeedCaughtUpPanel
                surface="member_home"
                hasPeople={showPeopleCard}
                hasJobs={recommendedJobs.length > 0}
                hasMarketplace={recommendedGigs.length > 0}
              />
            ) : (
              <div className="py-2 text-center text-xs text-slate-500">No more posts.</div>
            )}
          </div>
        ) : null}
      </div>
      </PullToRefresh>

      {(expandedPost || previewMedia) ? (
        <Suspense fallback={null}>
          <PostExpandModal
            open={Boolean(expandedPost)}
            post={expandedPost}
            viewerId={user?.id}
            viewerUsername={user?.username}
            onClose={() => setExpandedPost(null)}
          />

          <MediaPreviewModal
            open={Boolean(previewMedia)}
            media={previewMedia}
            onClose={() => setPreviewMedia(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
