import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, PlusCircle, Radio, Volume2, VolumeX, X } from 'lucide-react';
import FeedLoadSkeleton from '../../components/feed/FeedLoadSkeleton';
import type { AdCampaign, ScrollAdsRuntimePolicy } from '../../types';
import ScrollCard from './ScrollCard';
import ScrollAdOverlay from './ScrollAdOverlay';
import ScrollCreateModal from './ScrollCreateModal';
import ScrollCommentsSheet from './ScrollCommentsSheet';
import ScrollSeriesModal from './ScrollSeriesModal';
import {
  ScrollService,
  type ScrollConfig,
  type ScrollSeriesDetail,
  type ScrollVideo,
  type ScrollEngagementType
} from '../../services/scroll';
import { useNotification } from '../../context/NotificationContext';
import { useLiveFeature } from '../../context/LiveFeatureContext';
import { CommunityService } from '../../services/community';
import { applyFollowUpdatePayload, setFollowStatuses, useFollowStateMap } from '../../community/followState';
import { usePerformanceProfile } from '../../hooks/usePerformanceProfile';
import { useUser } from '../../context/UserContext';
import RepostModal from '../../community/components/RepostModal';
import PostShareModal from '../../community/components/PostShareModal';
import SendGcoinModal from '../../components/SendGcoinModal';
import PostComments from '../../components/PostComments';
import { LiveService, type LiveSession } from '../../services/live';
import { AdService } from '../../services/ads';
import { INLINE_VIDEO_PREVIEW_AUTOPLAY } from '../../utils/inlineMedia';
import {
  clearPendingPostVideoScrollSource,
  clearPendingPostVideoScrollViewerSource,
  readPendingPostVideoScrollSource,
  readPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollSource,
  type PendingPostVideoScrollViewerSource
} from '../../utils/postVideoScrollBridge';
import { resolvePostAttachmentMediaUrl, resolvePostAttachmentPosterUrl } from '../../utils/postAttachmentMedia';
import { buildPublicAppUrl } from '../../utils/siteUrl';
import { pickInterestSurveyCandidateIds } from '../../components/recommendation/ContentInterestSurvey';
import { postOptionsApi } from '../../services/postOptions';
import {
  buildScrollVideoUrl,
  parseScrollVideoIdFromSearch
} from '../../utils/scrollVideoRoutes';
import {
  trackScrollDeepLinkFailure,
  trackScrollDeepLinkSuccess
} from '../../utils/scrollRecommendationAnalytics';
import {
  computeScrollVirtualWindow,
  detectNetworkClass,
  isIndexInVirtualWindow,
  prefetchScrollMediaUrls
} from '../../utils/scrollPlayerEngine';
import {
  applyOptimisticMetricDelta,
  mapEngageTypeToMetricField
} from '../../utils/scrollEngagementOptimistic';
import {
  canSubmitScrollReportNow,
  markScrollReportSubmitted,
  validateScrollReportReason,
  buildScrollAbuseSignal
} from '../../utils/scrollModerationClient';
import {
  drainScrollLearningQueue,
  enqueueScrollLearningEvent,
  createLearningEvent
} from '../../utils/scrollLearningEngine';
import { resolveInlineMedia } from '../../utils/inlineMedia';

const LAST_SCROLL_INDEX_KEY = 'scroll:lastIndex';
const GLOBAL_SCROLL_MUTED_KEY = 'scroll:muted';
const SCROLL_AD_CAP_STATE_KEY = 'scroll:ads:frequencyCaps';
const SCROLL_VIDEO_ROUTE_PATTERN = /^\/scroll(?:\/|$)/i;
const POST_VIDEO_MORE_CURSOR = '__post_video_more__';
const DEFAULT_SCROLL_AD_POLICY: ScrollAdsRuntimePolicy = {
  enabled: true,
  fallbackToCommunityFeed: true,
  videoSkipDelaySeconds: 10,
  staticSkipDelaySeconds: 3,
  firstAdAfterScrolls: 1,
  repeatEveryScrolls: 5,
  minSecondsBetweenAds: 90,
  maxAdsPerSession: 6,
  maxAdsPerViewerDay: 20,
  perAdCooldownMinutes: 30,
  placementPacing: {
    scroll_preroll: 2,
    scroll_feed: 1
  }
};

const readStoredIndex = () => {
  const value = Number(localStorage.getItem(LAST_SCROLL_INDEX_KEY) || 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const readMutedPreference = () => {
  const raw = String(localStorage.getItem(GLOBAL_SCROLL_MUTED_KEY) || 'true').toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
};

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeScrollAdPolicy = (raw?: Partial<ScrollAdsRuntimePolicy> | null): ScrollAdsRuntimePolicy => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const placementPacing = source.placementPacing && typeof source.placementPacing === 'object' ? source.placementPacing : {};
  return {
    enabled: source.enabled !== false,
    fallbackToCommunityFeed: source.fallbackToCommunityFeed !== false,
    videoSkipDelaySeconds: clampInteger(source.videoSkipDelaySeconds, DEFAULT_SCROLL_AD_POLICY.videoSkipDelaySeconds, 0, 60),
    staticSkipDelaySeconds: clampInteger(source.staticSkipDelaySeconds, DEFAULT_SCROLL_AD_POLICY.staticSkipDelaySeconds, 0, 30),
    firstAdAfterScrolls: clampInteger(source.firstAdAfterScrolls, DEFAULT_SCROLL_AD_POLICY.firstAdAfterScrolls, 1, 50),
    repeatEveryScrolls: clampInteger(source.repeatEveryScrolls, DEFAULT_SCROLL_AD_POLICY.repeatEveryScrolls, 1, 100),
    minSecondsBetweenAds: clampInteger(source.minSecondsBetweenAds, DEFAULT_SCROLL_AD_POLICY.minSecondsBetweenAds, 0, 3600),
    maxAdsPerSession: clampInteger(source.maxAdsPerSession, DEFAULT_SCROLL_AD_POLICY.maxAdsPerSession, 0, 100),
    maxAdsPerViewerDay: clampInteger(source.maxAdsPerViewerDay, DEFAULT_SCROLL_AD_POLICY.maxAdsPerViewerDay, 0, 500),
    perAdCooldownMinutes: clampInteger(source.perAdCooldownMinutes, DEFAULT_SCROLL_AD_POLICY.perAdCooldownMinutes, 0, 1440),
    placementPacing: {
      scroll_preroll: clampInteger(
        placementPacing.scroll_preroll,
        DEFAULT_SCROLL_AD_POLICY.placementPacing.scroll_preroll,
        0,
        10
      ),
      scroll_feed: clampInteger(
        placementPacing.scroll_feed,
        DEFAULT_SCROLL_AD_POLICY.placementPacing.scroll_feed,
        0,
        10
      )
    }
  };
};

const todayAdCapKey = () => new Date().toISOString().slice(0, 10);

const readScrollAdCapState = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCROLL_AD_CAP_STATE_KEY) || '{}');
    const today = todayAdCapKey();
    if (!parsed || parsed.day !== today) return { day: today, total: 0, byAd: {} as Record<string, { count: number; lastAt: number }> };
    return {
      day: today,
      total: Math.max(0, Number(parsed.total || 0)),
      byAd: parsed.byAd && typeof parsed.byAd === 'object' ? parsed.byAd : {}
    };
  } catch {
    return { day: todayAdCapKey(), total: 0, byAd: {} as Record<string, { count: number; lastAt: number }> };
  }
};

const writeScrollAdCapState = (state: ReturnType<typeof readScrollAdCapState>) => {
  try {
    localStorage.setItem(SCROLL_AD_CAP_STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
};

const getAdPlacements = (ad: AdCampaign) => {
  const targeting = ad.targeting && typeof ad.targeting === 'object' ? ad.targeting : {};
  const source = Array.isArray((targeting as any).placements) && (targeting as any).placements.length
    ? (targeting as any).placements
    : [ad.placement];
  return Array.from(new Set(source.map((entry: any) => String(entry || '').trim()).filter(Boolean)));
};

const getAdPrimaryMedia = (ad: AdCampaign | null | undefined) => {
  if (!ad) return null;
  const media = Array.isArray(ad.media) && ad.media.length > 0 ? ad.media[0] : null;
  if (media?.url) return media;
  const creativeUrl = String((ad as any).creativeUrl || (ad as any).creative_url || '').trim();
  if (creativeUrl) return { url: creativeUrl, mimeType: 'image/*' };
  return null;
};

const isVideoAdCreative = (ad: AdCampaign | null | undefined) => {
  const media = getAdPrimaryMedia(ad);
  const mimeType = String((media as any)?.mimeType || (media as any)?.type || '').toLowerCase();
  const url = String((media as any)?.url || '').toLowerCase();
  return mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};

const buildPacedScrollAdPool = (
  preRollAds: AdCampaign[],
  feedAds: AdCampaign[],
  policy: ScrollAdsRuntimePolicy
) => {
  const preRollWeight = Math.max(0, Number(policy.placementPacing.scroll_preroll || 0));
  const feedWeight = Math.max(0, Number(policy.placementPacing.scroll_feed || 0));
  const uniqueById = new Map<string, AdCampaign>();
  const sequence: AdCampaign[] = [];
  const maxLength = Math.max(preRollAds.length + feedAds.length, 1) * Math.max(preRollWeight + feedWeight, 1);
  let preIndex = 0;
  let feedIndex = 0;

  const pushNext = (source: AdCampaign[], index: number) => {
    if (!source.length) return index;
    const ad = source[index % source.length];
    const id = String(ad?.id || '').trim();
    if (id && !uniqueById.has(id)) {
      uniqueById.set(id, ad);
      sequence.push(ad);
    } else if (id) {
      sequence.push(ad);
    }
    return index + 1;
  };

  while (sequence.length < maxLength && (preRollAds.length || feedAds.length)) {
    for (let i = 0; i < preRollWeight && preRollAds.length; i += 1) preIndex = pushNext(preRollAds, preIndex);
    for (let i = 0; i < feedWeight && feedAds.length; i += 1) feedIndex = pushNext(feedAds, feedIndex);
    if (preRollWeight === 0 && feedWeight === 0) break;
    if (sequence.length >= preRollAds.length + feedAds.length && uniqueById.size >= preRollAds.length + feedAds.length) break;
  }

  return (sequence.length ? sequence : [...preRollAds, ...feedAds]).filter((ad) =>
    Boolean(String(ad?.id || '').trim())
  );
};

const isInteractiveScrollControlTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="dialog"], [data-scroll-skip-swipe="true"]'
    )
  );
};

const isLikelyMediaFileName = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^[\w\s().-]+\.(mp4|mov|m4v|webm|ogg|avi|mkv)$/i.test(text);
};

const cleanPostVideoTitle = (value: unknown) => {
  const title = String(value || '').trim();
  if (!title || isLikelyMediaFileName(title)) return null;
  return title;
};

const getPostBridgeSource = (scroll?: ScrollVideo | null) => {
  const bridgeType = String(scroll?.bridgeSource?.type || '').trim().toLowerCase();
  const directPostId = String(scroll?.bridgeSource?.postId || '').trim();
  const directMediaFileId = String(scroll?.bridgeSource?.mediaFileId || '').trim();
  if (bridgeType === 'post' && directPostId) {
    return {
      postId: directPostId,
      mediaFileId: directMediaFileId || String(scroll?.media?.id || '').trim() || null
    };
  }

  const rawId = String(scroll?.id || '').trim();
  if (!rawId.toLowerCase().startsWith('post-video:')) return null;
  const remainder = rawId.slice('post-video:'.length);
  const separatorIndex = remainder.indexOf(':');
  const postId = separatorIndex >= 0 ? remainder.slice(0, separatorIndex).trim() : '';
  const mediaFileId = separatorIndex >= 0 ? remainder.slice(separatorIndex + 1).trim() : '';
  if (!postId) return null;
  return {
    postId,
    mediaFileId: mediaFileId || String(scroll?.media?.id || '').trim() || null
  };
};

const buildViewerSeedScroll = (source: PendingPostVideoScrollViewerSource): ScrollVideo => ({
  id: `post-video:${String(source.sourcePostId || '').trim()}:${String(source.fileId || source.mediaUrl || '').trim()}`,
  authorId: String(source.sourcePostId || '').trim() || 'post-video',
  bridgeSource: {
    type: 'post',
    postId: String(source.sourcePostId || '').trim(),
    mediaFileId: String(source.fileId || '').trim() || null
  },
  author: {
    id: String(source.sourcePostId || '').trim() || 'post-video',
    name: String(source.authorName || 'Scrolith creator').trim() || 'Scrolith creator',
    avatar: String(source.authorAvatar || '').trim() || null,
    username: String(source.authorUsername || '').trim() || null,
    isVerified: false
  },
  title: cleanPostVideoTitle(source.title) || 'Featured from post',
  description: source.description || null,
  location: source.location || null,
  visibility: 'public',
  graphicWarning: false,
  isAIEnhanced: false,
  dashGcoinTotal: 0,
  filterPreset: null,
  filterStrength: null,
  media: {
    id: String(source.fileId || `post-video-media:${source.sourcePostId}`),
    url: String(source.mediaUrl || ''),
    mimeType: 'video/mp4',
    thumbnailUrl: source.thumbnailUrl || null
  },
  tags: [],
  status: 'active',
  metrics: {
    impressions: 0,
    views3s: 0,
    views10s: 0,
    views25pct: 0,
    views50pct: 0,
    views95pct: 0,
    likes: 0,
    comments: 0,
    reposts: 0,
    shares: 0,
    sends: 0,
    dashGcoinTotal: 0
  },
  viewer: {
    liked: false,
    impressed: false,
    isFollowingAuthor:
      typeof source.isFollowingAuthor === 'boolean' ? Boolean(source.isFollowingAuthor) : undefined
  },
  createdAt: source.createdAt || new Date().toISOString(),
  updatedAt: source.createdAt || new Date().toISOString()
});

const inferPostAttachmentType = (attachment: any) => {
  const mimeType = String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase();
  if (mimeType.startsWith('video/')) return 'video';
  const explicitType = String(attachment?.type || attachment?.kind || '').trim().toLowerCase();
  if (explicitType === 'video') return 'video';
  const mediaUrl = String(attachment?.url || attachment?.path || attachment?.downloadUrl || '').trim().toLowerCase();
  if (/\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(mediaUrl)) return 'video';
  return explicitType;
};

const resolveAttachmentBridgeId = (attachment: any, fallback = '') => {
  return (
    String(
      attachment?.fileId ||
        attachment?.file_id ||
        attachment?.file?.id ||
        attachment?.asset?.id ||
        attachment?.id ||
        fallback
    ).trim() || fallback
  );
};

const findPrimaryVideoAttachment = (post: any, preferredFileId?: string | null) => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  const videos = attachments.filter((attachment: any) => inferPostAttachmentType(attachment) === 'video');
  const normalizedPreferred = String(preferredFileId || '').trim();
  if (normalizedPreferred) {
    const exact = videos.find((attachment: any) => resolveAttachmentBridgeId(attachment) === normalizedPreferred);
    if (exact) return exact;
  }
  return videos[0] || null;
};

const buildViewerSourceFromPost = (
  post: any,
  preferredFileId?: string | null
): PendingPostVideoScrollViewerSource | null => {
  const postId = String(post?.id || '').trim();
  const attachment = findPrimaryVideoAttachment(post, preferredFileId);
  const mediaUrl = attachment ? String(resolvePostAttachmentMediaUrl(attachment) || '').trim() : '';
  if (!postId || !attachment || !mediaUrl) return null;

  const attachmentId = resolveAttachmentBridgeId(attachment, mediaUrl);
  return {
    sourcePostId: postId,
    fileId: attachmentId,
    mediaUrl,
    thumbnailUrl: String(resolvePostAttachmentPosterUrl(attachment) || '').trim() || null,
    title: cleanPostVideoTitle(post?.title),
    description: String(post?.content || post?.description || '').trim() || null,
    location: String(post?.location || '').trim() || null,
    authorName:
      String(
        post?.author?.displayName ||
          post?.author?.name ||
          post?.authorName ||
          post?.userName ||
          post?.user_name ||
          ''
      ).trim() || null,
    authorAvatar:
      String(post?.author?.avatarUrl || post?.author?.avatar || post?.authorAvatar || '').trim() || null,
    authorUsername:
      String(post?.author?.username || post?.authorUsername || post?.userUsername || '').trim() || null,
    isFollowingAuthor:
      typeof post?.viewer?.isFollowingAuthor === 'boolean' ? Boolean(post.viewer.isFollowingAuthor) : null,
    createdAt: String(post?.createdAt || '').trim() || null
  };
};

const buildViewerSeedScrollFromPost = (post: any): ScrollVideo | null => {
  const postId = String(post?.id || '').trim();
  const attachment = findPrimaryVideoAttachment(post);
  const mediaUrl = attachment ? String(resolvePostAttachmentMediaUrl(attachment) || '').trim() : '';
  if (!postId || !attachment || !mediaUrl) return null;

  const attachmentId = resolveAttachmentBridgeId(attachment, mediaUrl);
  const authorId =
    String(post?.author?.id || post?.authorId || post?.userId || post?.user_id || '').trim() || postId;
  const authorName =
    String(
      post?.author?.displayName ||
        post?.author?.name ||
        post?.authorName ||
        post?.userName ||
        post?.user_name ||
        'Scrolith creator'
    ).trim() || 'Scrolith creator';

  return {
    id: `post-video:${postId}:${attachmentId}`,
    authorId,
    bridgeSource: {
      type: 'post',
      postId,
      mediaFileId: attachmentId
    },
    author: {
      id: authorId,
      name: authorName,
      avatar:
        String(post?.author?.avatarUrl || post?.author?.avatar || post?.authorAvatar || '').trim() || null,
      username:
        String(post?.author?.username || post?.authorUsername || post?.userUsername || '').trim() || null,
      isVerified: Boolean(post?.author?.isVerified)
    },
    title: cleanPostVideoTitle(post?.title) || 'Featured from post',
    description: String(post?.content || post?.description || '').trim() || null,
    location: String(post?.location || '').trim() || null,
    visibility: 'public',
    graphicWarning: Boolean(post?.graphicWarning),
    isAIEnhanced: Boolean(post?.isAIEnhanced),
    dashGcoinTotal: Number(post?.dashGcoinTotal ?? post?.interactions?.dashGcoinTotal ?? post?.interactions?.dash ?? 0),
    filterPreset: null,
    filterStrength: null,
    media: {
      id: attachmentId,
      url: mediaUrl,
      mimeType: String(attachment?.mimeType || attachment?.mime_type || 'video/mp4').trim() || 'video/mp4',
      thumbnailUrl: String(resolvePostAttachmentPosterUrl(attachment) || '').trim() || null
    },
    tags: [],
    offerTags: [],
    status: 'active',
    metrics: {
      impressions: Number(post?.interactions?.impressions || 0),
      views3s: Number(post?.interactions?.views3s || 0),
      views10s: Number(post?.interactions?.views10s || 0),
      views25pct: Number(post?.interactions?.views25pct || 0),
      views50pct: Number(post?.interactions?.views50pct || 0),
      views95pct: Number(post?.interactions?.views95pct || 0),
      likes: Number(post?.interactions?.likes || post?.interactions?.reactions || 0),
      comments: Number(post?.interactions?.comments || 0),
      reposts: Number(post?.interactions?.reposts || 0),
      shares: Number(post?.interactions?.shares || 0),
      sends: Number(post?.interactions?.sends || 0),
      dashGcoinTotal: Number(post?.dashGcoinTotal ?? post?.interactions?.dashGcoinTotal ?? post?.interactions?.dash ?? 0)
    },
    viewer: {
      liked: Boolean(post?.userState?.liked || post?.viewer?.liked),
      impressed: false,
      isFollowingAuthor:
        typeof post?.viewer?.isFollowingAuthor === 'boolean' ? Boolean(post.viewer.isFollowingAuthor) : undefined
    },
    createdAt: post?.createdAt || new Date().toISOString(),
    updatedAt: post?.updatedAt || post?.createdAt || new Date().toISOString()
  };
};

type ScrollFeedProps = {
  embedded?: boolean;
  onClose?: () => void;
  initialItems?: ScrollVideo[];
  initialActiveScrollId?: string | null;
  initialViewerSource?: PendingPostVideoScrollViewerSource | null;
  initialSeriesId?: string | null;
};

type ScrollFeedRouteState = {
  pendingViewerSource?: PendingPostVideoScrollViewerSource | null;
};

const ScrollFeed: React.FC<ScrollFeedProps> = ({
  embedded = false,
  onClose,
  initialItems = [],
  initialActiveScrollId = null,
  initialViewerSource = null,
  initialSeriesId = null
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ScrollFeedRouteState | null) || null;
  const routePendingViewerSource = routeState?.pendingViewerSource || null;
  const { user } = useUser();
  const followStateMap = useFollowStateMap();
  const { status: liveFeatureStatus } = useLiveFeature();
  const { showNotification } = useNotification();
  const { profile } = usePerformanceProfile();
  const [items, setItems] = useState<ScrollVideo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => readStoredIndex());
  const [muted, setMuted] = useState(() => readMutedPreference());
  const [createOpen, setCreateOpen] = useState(false);
  const [config, setConfig] = useState<ScrollConfig | null>(null);
  const [sourceVideo, setSourceVideo] = useState<PendingPostVideoScrollSource | null>(null);
  const [editingScroll, setEditingScroll] = useState<ScrollVideo | null>(null);
  const [remixSource, setRemixSource] = useState<ScrollVideo | null>(null);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [activeActionScroll, setActiveActionScroll] = useState<ScrollVideo | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveDiscoveryOpen, setLiveDiscoveryOpen] = useState(false);
  const [seriesModalOpen, setSeriesModalOpen] = useState(false);
  const [seriesDetail, setSeriesDetail] = useState<ScrollSeriesDetail | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesActiveScrollId, setSeriesActiveScrollId] = useState<string | null>(null);
  const [scrollAds, setScrollAds] = useState<AdCampaign[]>([]);
  const [scrollAdPolicy, setScrollAdPolicy] = useState<ScrollAdsRuntimePolicy>(() =>
    normalizeScrollAdPolicy(DEFAULT_SCROLL_AD_POLICY)
  );
  const [activeScrollAd, setActiveScrollAd] = useState<{ ad: AdCampaign; key: string; scrollId: string } | null>(null);
  /** Phase 22.1B — deep-link target missing / unauthorized */
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const deepLinkResolvedRef = useRef<string | null>(null);
  const showLiveDiscovery = liveFeatureStatus.enabled && liveFeatureStatus.experienceConfig?.showFeaturedRailInScrollFeed !== false;
  const autoAdvanceOnEnd = !embedded && SCROLL_VIDEO_ROUTE_PATTERN.test(location.pathname);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const viewerSeedSourceRef = useRef<PendingPostVideoScrollViewerSource | null>(null);
  const seededItemsRef = useRef<ScrollVideo[]>(Array.isArray(initialItems) ? initialItems.filter(Boolean) : []);
  const openedSeriesSourceRef = useRef<string | null>(null);
  const pendingViewerSourceConsumedRef = useRef(false);
  const consumedPostVideoRouteKeyRef = useRef<string | null>(null);
  const itemsRef = useRef<ScrollVideo[]>([]);
  const activeIndexRef = useRef(activeIndex);
  const nextCursorRef = useRef<string | null>(null);
  const postVideoNextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const pendingAutoAdvanceIndexRef = useRef<number | null>(null);
  const wheelNavigationLockRef = useRef<number>(0);
  const touchSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const displayedScrollAdKeysRef = useRef<Set<string>>(new Set());
  const scrollAdTimerRef = useRef<number | null>(null);
  const sessionScrollAdCountRef = useRef(0);
  const lastScrollAdShownAtRef = useRef(0);
  const sessionScrollAdViewCountRef = useRef(0);
  const lastScrollAdViewIdRef = useRef('');

  const patchMetrics = useCallback((scrollId: string, metrics: Partial<ScrollVideo['metrics']>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === scrollId
          ? {
              ...item,
              metrics: {
                ...item.metrics,
                ...metrics
              }
            }
          : item
      )
    );
  }, []);

  const patchPostBridgeState = useCallback(
    (
      postId: string,
      update: Partial<ScrollVideo> & { metrics?: Partial<ScrollVideo['metrics']> }
    ) => {
      const normalizedPostId = String(postId || '').trim();
      if (!normalizedPostId) return;
      setItems((prev) =>
        prev.map((item) => {
          const bridge = getPostBridgeSource(item);
          if (!bridge || bridge.postId !== normalizedPostId) return item;
          return {
            ...item,
            ...update,
            metrics: {
              ...item.metrics,
              ...(update.metrics || {})
            }
          };
        })
      );
    },
    []
  );

  const incrementPostBridgeMetric = useCallback(
    (postId: string, field: keyof ScrollVideo['metrics'], amount = 1) => {
      const normalizedPostId = String(postId || '').trim();
      if (!normalizedPostId) return;
      setItems((prev) =>
        prev.map((item) => {
          const bridge = getPostBridgeSource(item);
          if (!bridge || bridge.postId !== normalizedPostId) return item;
          return {
            ...item,
            metrics: {
              ...item.metrics,
              [field]: Math.max(0, Number((item.metrics as any)?.[field] || 0) + amount)
            }
          };
        })
      );
    },
    []
  );

  const patchScrollState = useCallback(
    (
      scrollId: string,
      update: Partial<ScrollVideo> & { metrics?: Partial<ScrollVideo['metrics']> }
    ) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === scrollId
            ? {
                ...item,
                ...update,
                metrics: {
                  ...item.metrics,
                  ...(update.metrics || {})
                }
              }
            : item
        )
      );
    },
    []
  );

  const mergeScrollItems = useCallback((incoming: ScrollVideo[]) => {
    setItems((prev) => {
      const nextMap = new Map<string, ScrollVideo>();
      prev.forEach((item) => nextMap.set(item.id, item));
      (incoming || []).forEach((item) => {
        if (!item?.id) return;
        nextMap.set(item.id, item);
      });
      return Array.from(nextMap.values());
    });
  }, []);

  const scrollToIndex = useCallback((nextIndex: number, behavior: ScrollBehavior = 'smooth') => {
    const maxIndex = Math.max(0, itemsRef.current.length - 1);
    const clamped = Math.max(0, Math.min(nextIndex, maxIndex));
    setActiveIndex(clamped);
    itemRefs.current[clamped]?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  const hydratePostVideoStream = useCallback(
    async (activeSource: PendingPostVideoScrollViewerSource) => {
      try {
        const response = await CommunityService.getFeed({
          limit: Math.max(18, Number(profile.feedPageSize || 0) * 3 || 18),
          scope: 'discover'
        });
        const rows = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];
        const activeSeed = buildViewerSeedScroll(activeSource);
        const discovered = rows.map((post: any) => buildViewerSeedScrollFromPost(post)).filter(Boolean) as ScrollVideo[];
        const seen = new Set<string>();
        const synthetic: ScrollVideo[] = [];
        const pushUnique = (entry: ScrollVideo | null | undefined) => {
          if (!entry?.id || seen.has(entry.id)) return;
          seen.add(entry.id);
          synthetic.push(entry);
        };
        pushUnique(activeSeed);
        discovered.forEach((entry) => pushUnique(entry));
        if (!synthetic.length) return;
        seededItemsRef.current = synthetic;
        setItems((prev) => {
          const next: ScrollVideo[] = [];
          const nextSeen = new Set<string>();
          const pushIntoNext = (entry: ScrollVideo | null | undefined) => {
            if (!entry?.id || nextSeen.has(entry.id)) return;
            nextSeen.add(entry.id);
            next.push(entry);
          };
          synthetic.forEach((entry) => pushIntoNext(entry));
          prev
            .filter((entry) => !String(entry?.id || '').startsWith('post-video:'))
            .forEach((entry) => pushIntoNext(entry));
          return next;
        });
      } catch {
        // Keep the tapped post playable even if related post-video discovery fails.
      }
    },
    [profile.feedPageSize]
  );

  const loadPostVideoSeeds = useCallback(async (cursor?: string | null) => {
    try {
      const response = await CommunityService.getFeed({
        limit: Math.max(36, Number(profile.feedPageSize || 0) * 4 || 36),
        cursor: cursor || undefined,
        scope: 'discover'
      });
      const rows = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];
      const seen = new Set<string>();
      const videos: ScrollVideo[] = [];
      rows.forEach((post: any) => {
        const seed = buildViewerSeedScrollFromPost(post);
        if (!seed?.id || seen.has(seed.id)) return;
        seen.add(seed.id);
        videos.push(seed);
      });
      return {
        items: videos,
        nextCursor: String(response?.nextCursor || '').trim() || null
      };
    } catch {
      return { items: [], nextCursor: null };
    }
  }, [profile.feedPageSize]);

  const resolvePostVideoRouteSource = useCallback(async (params: URLSearchParams) => {
    const postId = String(params.get('post') || params.get('postId') || '').trim();
    const preferredFileId = String(params.get('file') || params.get('fileId') || '').trim() || null;
    if (!postId) return null;
    try {
      const response = await CommunityService.getPostById(postId);
      const post = response?.data || response?.post || response;
      return buildViewerSourceFromPost(post, preferredFileId);
    } catch (error) {
      console.error('Failed to recover post video route source', error);
      return null;
    }
  }, []);

  const loadLiveSessions = useCallback(async () => {
    if (!showLiveDiscovery) {
      setLiveSessions([]);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }
    try {
      setLiveLoading(true);
      const response = await LiveService.getActiveSessions(24);
      const next = Array.isArray(response?.items) ? response.items : [];
      setLiveSessions(next);
      setLiveError(null);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load live discovery.';
      setLiveError(message);
    } finally {
      setLiveLoading(false);
    }
  }, [showLiveDiscovery]);

  const ensureAuth = useCallback(
    (promptMessage: string) => {
      if (user?.id) return true;
      if (window.confirm(promptMessage)) window.location.href = '/auth/login';
      return false;
    },
    [user?.id]
  );

  const buildScrollUrl = useCallback((scrollId: string) => {
    // Phase 22.1B — canonical /scroll?scroll=<id>
    return buildPublicAppUrl(buildScrollVideoUrl(scrollId));
  }, []);

  const loadFeed = useCallback(
    async (cursor?: string | null) => {
      try {
        if (cursor) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        if (!cursor) postVideoNextCursorRef.current = null;
        const isPostVideoOnlyCursor = cursor === POST_VIDEO_MORE_CURSOR;
        const nativeCursor = isPostVideoOnlyCursor ? null : cursor || undefined;
        const shouldLoadPostVideos = !cursor || Boolean(postVideoNextCursorRef.current);
        const [data, postVideoSeedResult] = await Promise.all([
          isPostVideoOnlyCursor
            ? Promise.resolve({ items: [], nextCursor: null, config: undefined })
            : ScrollService.getFeed({
                cursor: nativeCursor || undefined,
                limit: profile.feedPageSize
              }),
          shouldLoadPostVideos ? loadPostVideoSeeds(cursor ? postVideoNextCursorRef.current : null) : Promise.resolve({ items: [], nextCursor: null })
        ]);
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        const postVideoSeeds = Array.isArray(postVideoSeedResult?.items) ? postVideoSeedResult.items : [];
        postVideoNextCursorRef.current = postVideoSeedResult?.nextCursor || null;
        const seededSource = !cursor ? viewerSeedSourceRef.current : null;
        const seededItem = seededSource ? buildViewerSeedScroll(seededSource) : null;
        if (!isPostVideoOnlyCursor) {
          setConfig((data?.config as ScrollConfig) || null);
        }
        setNextCursor(data?.nextCursor || (postVideoNextCursorRef.current ? POST_VIDEO_MORE_CURSOR : null));
        setItems((prev) => {
          if (!cursor) {
            const merged: ScrollVideo[] = [];
            const seen = new Set<string>();
            const pushUnique = (entry: ScrollVideo | null | undefined) => {
              if (!entry?.id || seen.has(entry.id)) return;
              seen.add(entry.id);
              merged.push(entry);
            };
            pushUnique(seededItem);
            seededItemsRef.current.forEach((entry) => pushUnique(entry));
            postVideoSeeds.forEach((entry) => pushUnique(entry));
            nextItems.forEach((entry) => pushUnique(entry));
            return merged;
          }
          const existing = new Set(prev.map((entry) => entry.id));
          const merged = [...prev];
          for (const entry of [...postVideoSeeds, ...nextItems]) {
            if (!existing.has(entry.id)) merged.push(entry);
          }
          return merged;
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to load scroll feed.';
        showNotification('error', 'Scroll', message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [loadPostVideoSeeds, profile.feedPageSize, showNotification]
  );

  useEffect(() => {
    void loadFeed(null);
  }, [loadFeed]);

  useEffect(() => {
    viewerSeedSourceRef.current = initialViewerSource || null;
  }, [initialViewerSource]);

  useEffect(() => {
    if (!user?.id) return;
    const seed: Record<string, boolean> = {};
    const authorIds = new Set<string>();
    items.forEach((item) => {
      const authorId = String(item?.author?.id || item?.authorId || '').trim();
      if (!authorId || authorId === String(user.id)) return;
      authorIds.add(authorId);
      if (typeof item?.viewer?.isFollowingAuthor === 'boolean') {
        seed[authorId] = Boolean(item.viewer.isFollowingAuthor);
      }
    });
    if (Object.keys(seed).length) {
      setFollowStatuses(seed);
    }
    const unresolved = Array.from(authorIds).filter((id) => followStateMap[id] === undefined && !Object.prototype.hasOwnProperty.call(seed, id));
    if (!unresolved.length) return;
    let active = true;
    CommunityService.getFollowStatus(unresolved)
      .then((statusMap) => {
        if (!active || !statusMap) return;
        setFollowStatuses(statusMap);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [followStateMap, items, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onFollowUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      applyFollowUpdatePayload(detail, user?.id);
    };
    window.addEventListener('community:follow_updated', onFollowUpdated as EventListener);
    return () => window.removeEventListener('community:follow_updated', onFollowUpdated as EventListener);
  }, [user?.id]);

  useEffect(() => {
    seededItemsRef.current = Array.isArray(initialItems) ? initialItems.filter(Boolean) : [];
    if (!embedded || seededItemsRef.current.length === 0) return;
    setItems((prev) => {
      const next = [...seededItemsRef.current];
      const seen = new Set(next.map((entry) => entry.id));
      prev.forEach((entry) => {
        if (!entry?.id || seen.has(entry.id)) return;
        seen.add(entry.id);
        next.push(entry);
      });
      return next;
    });
  }, [embedded, initialItems]);

  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(location.search);
    if (params.get('create') !== 'post-video') return;
    const pendingSource = readPendingPostVideoScrollSource();
    setSourceVideo(pendingSource);
    setRemixSource(null);
    setCreateOpen(true);
    params.delete('create');
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : ''
      },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(location.search);
    if (params.get('watch') !== 'post-video') return;
    const routeKey = [
      params.get('watch') || '',
      params.get('post') || params.get('postId') || routePendingViewerSource?.sourcePostId || '',
      params.get('file') || params.get('fileId') || routePendingViewerSource?.fileId || ''
    ].join(':');
    if (consumedPostVideoRouteKeyRef.current === routeKey) return;

    let cancelled = false;
    const activatePostVideoRoute = async () => {
      const pendingViewerSource =
        routePendingViewerSource ||
        readPendingPostVideoScrollViewerSource() ||
        (await resolvePostVideoRouteSource(params));

      if (cancelled) return;
      if (!pendingViewerSource) {
        showNotification('warning', 'Scroll', 'This post video is no longer available.');
        const cleaned = new URLSearchParams(location.search);
        cleaned.delete('watch');
        cleaned.delete('post');
        cleaned.delete('postId');
        cleaned.delete('file');
        cleaned.delete('fileId');
        navigate(
          {
            pathname: location.pathname,
            search: cleaned.toString() ? `?${cleaned.toString()}` : ''
          },
          { replace: true, state: { ...(routeState || {}), pendingViewerSource: null } }
        );
        return;
      }

      consumedPostVideoRouteKeyRef.current = routeKey;
      pendingViewerSourceConsumedRef.current = true;
      viewerSeedSourceRef.current = pendingViewerSource;
      const seededItem = buildViewerSeedScroll(pendingViewerSource);
      seededItemsRef.current = [seededItem];
      setActiveIndex(0);
      setItems((prev) => [seededItem, ...prev.filter((entry) => entry.id !== seededItem.id)]);
      void hydratePostVideoStream(pendingViewerSource);
      clearPendingPostVideoScrollViewerSource();

      if (routePendingViewerSource) {
        navigate(
          {
            pathname: location.pathname,
            search: location.search
          },
          {
            replace: true,
            state: {
              ...(routeState || {}),
              pendingViewerSource: null
            }
          }
        );
      }
    };

    void activatePostVideoRoute();
    return () => {
      cancelled = true;
    };
  }, [
    embedded,
    hydratePostVideoStream,
    location.pathname,
    location.search,
    navigate,
    resolvePostVideoRouteSource,
    routePendingViewerSource,
    routeState,
    showNotification
  ]);

  useEffect(() => {
    if (embedded) return;
    if (pendingViewerSourceConsumedRef.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get('watch') === 'post-video') return;
    const pendingViewerSource = routePendingViewerSource;
    if (!pendingViewerSource) return;

    pendingViewerSourceConsumedRef.current = true;
    viewerSeedSourceRef.current = pendingViewerSource;
    const seededItem = buildViewerSeedScroll(pendingViewerSource);
    seededItemsRef.current = [seededItem];
    setActiveIndex(0);
    setItems((prev) => [seededItem, ...prev.filter((entry) => entry.id !== seededItem.id)]);
    void hydratePostVideoStream(pendingViewerSource);
    clearPendingPostVideoScrollViewerSource();

    navigate(
      {
        pathname: location.pathname,
        search: location.search
      },
      {
        replace: true,
        state: {
          ...(routeState || {}),
          pendingViewerSource: null
        }
      }
    );
  }, [embedded, hydratePostVideoStream, location.pathname, location.search, navigate, routePendingViewerSource, routeState]);

  useEffect(() => {
    const targetScrollId = String(initialActiveScrollId || '').trim();
    if (!targetScrollId || items.length === 0) return;
    const nextIndex = items.findIndex((entry) => entry.id === targetScrollId);
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  }, [initialActiveScrollId, items]);

  // Phase 22.1B — resolve ?scroll= / ?video= deep links without feed reset
  useEffect(() => {
    if (embedded) return;
    const targetId =
      parseScrollVideoIdFromSearch(location.search) ||
      String(initialActiveScrollId || '').trim();
    if (!targetId) {
      setDeepLinkError(null);
      return;
    }
    if (deepLinkResolvedRef.current === targetId) return;

    const localIndex = items.findIndex((entry) => entry.id === targetId);
    if (localIndex >= 0) {
      deepLinkResolvedRef.current = targetId;
      setDeepLinkError(null);
      setActiveIndex(localIndex);
      trackScrollDeepLinkSuccess(targetId);
      return;
    }

    // Wait until initial feed load settles before remote fetch
    if (loading) return;

    let cancelled = false;
    void (async () => {
      try {
        const video = await ScrollService.getById(targetId);
        if (cancelled || !video?.id) {
          throw new Error('unavailable');
        }
        deepLinkResolvedRef.current = targetId;
        setDeepLinkError(null);
        setItems((prev) => {
          if (prev.some((entry) => entry.id === video.id)) return prev;
          // Insert at front without wiping session order of existing items
          return [video, ...prev];
        });
        setActiveIndex(0);
        trackScrollDeepLinkSuccess(targetId);
      } catch (error: any) {
        if (cancelled) return;
        deepLinkResolvedRef.current = targetId;
        const message =
          error?.response?.data?.error ||
          error?.message ||
          'This video is no longer available.';
        setDeepLinkError(message);
        trackScrollDeepLinkFailure(targetId, message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [embedded, initialActiveScrollId, items, loading, location.search]);

  useEffect(() => {
    if (!showLiveDiscovery) {
      setLiveDiscoveryOpen(false);
      return;
    }
    void loadLiveSessions();
    const interval = window.setInterval(() => {
      void loadLiveSessions();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [showLiveDiscovery, loadLiveSessions]);

  const loadScrollAds = useCallback(async () => {
    try {
      const [runtimeConfig, preRollAds, feedAds] = await Promise.all([
        AdService.getRuntimeConfig(),
        AdService.getAds({ role: user?.role, placement: 'scroll_preroll', limit: 12 }),
        AdService.getAds({ role: user?.role, placement: 'scroll_feed', limit: 12 })
      ]);
      const policy = normalizeScrollAdPolicy(runtimeConfig?.scrollAds || DEFAULT_SCROLL_AD_POLICY);
      setScrollAdPolicy(policy);
      if (!policy.enabled) {
        setScrollAds([]);
        return;
      }

      const pacedAds = buildPacedScrollAdPool(preRollAds, feedAds, policy);
      if (pacedAds.length > 0) {
        setScrollAds(pacedAds);
        return;
      }

      // Backward-compatible bridge for existing campaigns while admins migrate to Scroll placements.
      if (policy.fallbackToCommunityFeed) {
        const [homepageFallbackAds, communityFallbackAds] = await Promise.all([
          AdService.getAds({ role: user?.role, placement: 'homepage_feed', limit: 8 }),
          AdService.getAds({ role: user?.role, placement: 'community_feed', limit: 8 })
        ]);
        const fallbackById = new Map<string, AdCampaign>();
        [...homepageFallbackAds, ...communityFallbackAds].forEach((ad) => {
          const id = String(ad?.id || '').trim();
          if (id && !fallbackById.has(id)) fallbackById.set(id, ad);
        });
        setScrollAds(Array.from(fallbackById.values()));
      } else {
        setScrollAds([]);
      }
    } catch (error) {
      console.warn('Failed to load Scroll ads', error);
      setScrollAdPolicy(normalizeScrollAdPolicy(DEFAULT_SCROLL_AD_POLICY));
      setScrollAds([]);
    }
  }, [user?.role]);

  useEffect(() => {
    if (embedded) {
      setScrollAds([]);
      return;
    }
    void loadScrollAds();
    const events = ['community:ad_created', 'community:ad_status_updated', 'community:ads_config_updated'];
    events.forEach((eventName) => window.addEventListener(eventName, loadScrollAds as EventListener));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, loadScrollAds as EventListener));
    };
  }, [embedded, loadScrollAds]);

  useEffect(() => {
    if (scrollAdTimerRef.current !== null) {
      window.clearTimeout(scrollAdTimerRef.current);
      scrollAdTimerRef.current = null;
    }
    setActiveScrollAd(null);

    if (
      embedded ||
      !scrollAdPolicy.enabled ||
      loading ||
      createOpen ||
      commentOpen ||
      repostOpen ||
      shareOpen ||
      dashOpen ||
      liveDiscoveryOpen ||
      seriesModalOpen ||
      scrollAds.length === 0 ||
      items.length === 0
    ) {
      return;
    }

    const activeScroll = items[activeIndex];
    if (!activeScroll?.id) return;
    const activeScrollId = String(activeScroll.id || '').trim();
    if (lastScrollAdViewIdRef.current !== activeScrollId) {
      lastScrollAdViewIdRef.current = activeScrollId;
      sessionScrollAdViewCountRef.current += 1;
    }
    const scrollPosition = Math.max(1, sessionScrollAdViewCountRef.current);
    const firstSlot = Math.max(1, scrollAdPolicy.firstAdAfterScrolls);
    const repeatEvery = Math.max(1, scrollAdPolicy.repeatEveryScrolls);
    const shouldServeAd =
      scrollPosition === firstSlot ||
      (scrollPosition > firstSlot && (scrollPosition - firstSlot) % repeatEvery === 0);
    if (!shouldServeAd) return;

    const now = Date.now();
    if (
      scrollAdPolicy.minSecondsBetweenAds > 0 &&
      now - lastScrollAdShownAtRef.current < scrollAdPolicy.minSecondsBetweenAds * 1000
    ) {
      return;
    }
    if (
      scrollAdPolicy.maxAdsPerSession > 0 &&
      sessionScrollAdCountRef.current >= scrollAdPolicy.maxAdsPerSession
    ) {
      return;
    }

    const capState = readScrollAdCapState();
    if (scrollAdPolicy.maxAdsPerViewerDay > 0 && capState.total >= scrollAdPolicy.maxAdsPerViewerDay) {
      return;
    }

    const perAdCooldownMs = Math.max(0, scrollAdPolicy.perAdCooldownMinutes) * 60 * 1000;
    const orderedAds = scrollAds.map((_, offset) => scrollAds[(activeIndex + offset) % Math.max(1, scrollAds.length)]);
    const ad = orderedAds.find((candidate) => {
        const adId = String(candidate?.id || '').trim();
        if (!adId) return false;
        const cap = capState.byAd?.[adId];
        if (perAdCooldownMs > 0 && cap?.lastAt && now - Number(cap.lastAt || 0) < perAdCooldownMs) return false;
        const placements = getAdPlacements(candidate);
        if (!placements.includes('scroll_preroll') && !placements.includes('scroll_feed') && !scrollAdPolicy.fallbackToCommunityFeed) {
          return false;
        }
        return true;
      });
    if (!ad?.id) return;
    const key = `${activeScroll.id}:${ad.id}`;
    if (displayedScrollAdKeysRef.current.has(key)) return;

    scrollAdTimerRef.current = window.setTimeout(() => {
      displayedScrollAdKeysRef.current.add(key);
      sessionScrollAdCountRef.current += 1;
      lastScrollAdShownAtRef.current = Date.now();
      const nextCapState = readScrollAdCapState();
      const adCap = nextCapState.byAd[String(ad.id)] || { count: 0, lastAt: 0 };
      nextCapState.total = Math.max(0, Number(nextCapState.total || 0)) + 1;
      nextCapState.byAd[String(ad.id)] = {
        count: Math.max(0, Number(adCap.count || 0)) + 1,
        lastAt: Date.now()
      };
      writeScrollAdCapState(nextCapState);
      setActiveScrollAd({ ad, key, scrollId: activeScroll.id });
    }, 900);

    return () => {
      if (scrollAdTimerRef.current !== null) {
        window.clearTimeout(scrollAdTimerRef.current);
        scrollAdTimerRef.current = null;
      }
    };
  }, [
    activeIndex,
    commentOpen,
    createOpen,
    dashOpen,
    embedded,
    items,
    liveDiscoveryOpen,
    loading,
    repostOpen,
    scrollAds,
    scrollAdPolicy,
    seriesModalOpen,
    shareOpen
  ]);

  useEffect(() => {
    localStorage.setItem(LAST_SCROLL_INDEX_KEY, String(Math.max(0, activeIndex)));
  }, [activeIndex]);

  useEffect(() => {
    localStorage.setItem(GLOBAL_SCROLL_MUTED_KEY, muted ? 'true' : 'false');
  }, [muted]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const navigateRelative = useCallback(
    async (delta: number) => {
      if (!Number.isFinite(delta) || delta === 0) return;
      const nextIndex = Math.max(0, activeIndexRef.current + (delta > 0 ? 1 : -1));
      if (nextIndex < itemsRef.current.length) {
        scrollToIndex(nextIndex);
        return;
      }
      if (delta > 0 && nextCursorRef.current && !loadingMoreRef.current) {
        pendingAutoAdvanceIndexRef.current = nextIndex;
        await loadFeed(nextCursorRef.current);
      }
    },
    [loadFeed, scrollToIndex]
  );

  const handleAdvanceToNextScroll = useCallback(
    async (originIndex: number) => {
      const nextIndex = Math.max(0, originIndex + 1);
      if (nextIndex < itemsRef.current.length) {
        scrollToIndex(nextIndex);
        return;
      }
      if (!nextCursorRef.current || loadingMoreRef.current) return;
      pendingAutoAdvanceIndexRef.current = nextIndex;
      await loadFeed(nextCursorRef.current);
    },
    [loadFeed, scrollToIndex]
  );

  useEffect(() => {
    const pendingIndex = pendingAutoAdvanceIndexRef.current;
    if (pendingIndex === null) return;
    if (pendingIndex < items.length) {
      pendingAutoAdvanceIndexRef.current = null;
      scrollToIndex(pendingIndex);
      return;
    }
    if (!nextCursor && !loadingMore) {
      pendingAutoAdvanceIndexRef.current = null;
    }
  }, [items.length, loadingMore, nextCursor, scrollToIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index || -1);
          if (idx < 0) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { idx, ratio: entry.intersectionRatio };
          }
        }
        if (best) setActiveIndex(best.idx);
      },
      {
        root: container,
        threshold: [0.55, 0.7, 0.9]
      }
    );

    Object.entries(itemRefs.current).forEach(([idx, node]) => {
      if (!node) return;
      node.dataset.index = String(idx);
      observerRef.current?.observe(node);
    });

    return () => observerRef.current?.disconnect();
  }, [items]);

  useEffect(() => {
    if (loading) return;
    const idx = Math.max(0, Math.min(activeIndex, itemsRef.current.length - 1));
    itemRefs.current[idx]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    // restore once after initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const threshold = Math.max(1, profile.prefetchWindow);
    const shouldPrefetch = activeIndex >= items.length - threshold;
    if (!shouldPrefetch || !nextCursor || loadingMore) return;
    void loadFeed(nextCursor);
  }, [activeIndex, items.length, nextCursor, loadingMore, loadFeed, profile.prefetchWindow]);

  // Phase 23 — predictive media prefetch for next 1–2 videos
  useEffect(() => {
    if (!items.length) return;
    const urls: string[] = [];
    for (let i = activeIndex + 1; i <= activeIndex + 2 && i < items.length; i += 1) {
      const media = resolveInlineMedia(items[i]?.media || items[i], { typeHint: 'video' });
      if (media?.src) urls.push(media.src);
    }
    prefetchScrollMediaUrls(urls, profile.dataSaver ? 1 : 2);
  }, [activeIndex, items, profile.dataSaver]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (isInteractiveScrollControlTarget(event.target)) return;
      event.preventDefault();
      void navigateRelative(event.key === 'ArrowDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigateRelative]);

  useEffect(() => {
    const onNew = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const scroll = detail?.scroll;
      if (!scroll?.id) return;
      setItems((prev) => [scroll, ...prev.filter((entry) => entry.id !== scroll.id)]);
    };
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const scroll = detail?.scroll;
      if (!scroll?.id) return;
      patchScrollState(scroll.id, scroll);
    };
    const onEngagement = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail?.scrollId || !detail?.metrics) return;
      patchMetrics(detail.scrollId, detail.metrics);
    };
    const onReactionUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const targetType = String(detail?.targetType || '').toUpperCase();
      const scrollId = String(detail?.targetId || '').trim();
      const counts = detail?.counts && typeof detail.counts === 'object' ? detail.counts : {};
      const likes = Object.values(counts).reduce((total: number, value: any) => total + Math.max(0, Number(value || 0)), 0);
      if (targetType === 'SCROLL') {
        if (!scrollId) return;
        patchMetrics(scrollId, { likes });
        return;
      }
      if (targetType === 'POST' && scrollId) {
        patchPostBridgeState(scrollId, { metrics: { likes } });
      }
    };
    const onRemoved = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const scrollId = String(detail?.scrollId || '');
      if (!scrollId) return;
      setItems((prev) => prev.filter((entry) => entry.id !== scrollId));
    };
    const onGcoinDonated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const scrollId = String(detail?.scrollId || '').trim();
      if (!scrollId) return;
      patchScrollState(scrollId, {
        dashGcoinTotal: Number(detail?.dashGcoinTotal || 0),
        metrics: detail?.metrics || {}
      });
    };
    const onLiveChanged = () => {
      void loadLiveSessions();
    };
    window.addEventListener('scroll:new', onNew);
    window.addEventListener('scroll:updated', onUpdated);
    window.addEventListener('scroll:engagement_update', onEngagement);
    window.addEventListener('scroll:impression_update', onEngagement);
    window.addEventListener('reactions:updated', onReactionUpdated as EventListener);
    window.addEventListener('scroll:removed', onRemoved);
    window.addEventListener('scroll:gcoin_donated', onGcoinDonated);
    window.addEventListener('live:started', onLiveChanged as EventListener);
    window.addEventListener('live:ended', onLiveChanged as EventListener);
    window.addEventListener('live:viewer_count_updated', onLiveChanged as EventListener);
    return () => {
      window.removeEventListener('scroll:new', onNew);
      window.removeEventListener('scroll:updated', onUpdated);
      window.removeEventListener('scroll:engagement_update', onEngagement);
      window.removeEventListener('scroll:impression_update', onEngagement);
      window.removeEventListener('reactions:updated', onReactionUpdated as EventListener);
      window.removeEventListener('scroll:removed', onRemoved);
      window.removeEventListener('scroll:gcoin_donated', onGcoinDonated);
      window.removeEventListener('live:started', onLiveChanged as EventListener);
      window.removeEventListener('live:ended', onLiveChanged as EventListener);
      window.removeEventListener('live:viewer_count_updated', onLiveChanged as EventListener);
    };
  }, [loadLiveSessions, patchMetrics, patchPostBridgeState, patchScrollState]);

  /**
   * Phase 23 — accept either ScrollVideo or scrollId (ScrollCard passes id).
   * Optimistic metric patch with server reconciliation; offline learning queue.
   */
  const handleEngage = useCallback(
    async (
      scrollOrId: ScrollVideo | string,
      type: ScrollEngagementType,
      payload?: { watchedSeconds?: number }
    ) => {
      const scroll =
        typeof scrollOrId === 'string'
          ? itemsRef.current.find((entry) => entry.id === scrollOrId) || null
          : scrollOrId;
      const scrollId = String(
        (typeof scrollOrId === 'string' ? scrollOrId : scroll?.id) || ''
      ).trim();
      if (!scrollId) return;

      const postBridge = scroll ? getPostBridgeSource(scroll) : null;
      if (postBridge) {
        if (type === 'impression') {
          try {
            await CommunityService.postView(postBridge.postId);
          } catch {
            // non-blocking by design
          }
        }
        return;
      }

      const metricField = mapEngageTypeToMetricField(type);
      let snapshot: ReturnType<typeof applyOptimisticMetricDelta>['snapshot'] | null = null;
      if (metricField && scroll?.metrics && !String(type).startsWith('learn_')) {
        const applied = applyOptimisticMetricDelta(scroll.metrics, metricField, 1);
        snapshot = applied.snapshot;
        patchMetrics(scrollId, applied.next);
      }

      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline) {
        enqueueScrollLearningEvent(
          createLearningEvent(scrollId, 'watch_duration', payload?.watchedSeconds, {
            engageType: type,
            offline: true
          })
        );
        return;
      }

      try {
        const response = await ScrollService.engage(scrollId, {
          type,
          watchedSeconds: payload?.watchedSeconds
        });
        if (response?.metrics) {
          patchMetrics(scrollId, response.metrics);
        }
      } catch {
        if (snapshot) {
          patchMetrics(scrollId, snapshot);
        }
        enqueueScrollLearningEvent(
          createLearningEvent(scrollId, 'watch_duration', payload?.watchedSeconds, {
            engageType: type,
            failed: true
          })
        );
      }
    },
    [patchMetrics]
  );

  // Phase 23 — offline recovery: drain learning queue when back online
  useEffect(() => {
    const flush = async () => {
      const queued = drainScrollLearningQueue();
      for (const event of queued) {
        const type = String((event.meta as any)?.engageType || 'learn_watch') as ScrollEngagementType;
        try {
          await ScrollService.engage(event.scrollId, {
            type: type.startsWith('learn_') || type.startsWith('view_') || type === 'impression' ? type : 'learn_watch',
            watchedSeconds: event.value
          });
        } catch {
          enqueueScrollLearningEvent(event);
          break;
        }
      }
    };
    const onOnline = () => {
      void flush();
    };
    window.addEventListener('online', onOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void flush();
    }
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const handleShareToStory = useCallback(
    async (scroll: ScrollVideo) => {
      if (!ensureAuth('Log in to share Scroll videos to Story?')) return;
      const postBridge = getPostBridgeSource(scroll);
      const mediaFileId = String(postBridge?.mediaFileId || scroll?.media?.id || '').trim();
      if (!mediaFileId) {
        showNotification('error', 'Scroll', 'Scroll media is not available.');
        return;
      }
      try {
        await CommunityService.createStory({
          type: 'video',
          mediaFileId,
          content: scroll.title || scroll.description || 'Shared from Scroll'
        });
        if (postBridge) {
          await CommunityService.postShare(postBridge.postId, 'story');
        } else {
          await handleEngage(scroll, 'share');
        }
        showNotification('success', 'Scroll', 'Shared to Story.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to share to Story.';
        showNotification('error', 'Scroll', message);
      }
    },
    [ensureAuth, handleEngage, showNotification]
  );

  const handleRepost = useCallback(
    async (scroll: ScrollVideo) => {
      if (!ensureAuth('Log in to repost Scroll videos?')) return;
      setActiveActionScroll(scroll);
      setRepostOpen(true);
    },
    [ensureAuth]
  );

  const handleSend = useCallback(
    async (scroll: ScrollVideo) => {
      setActiveActionScroll(scroll);
      setShareOpen(true);
    },
    []
  );

  const handleComment = useCallback(
    async (scroll: ScrollVideo) => {
      if (!ensureAuth('Log in to comment on Scroll videos?')) return;
      setActiveActionScroll(scroll);
      setCommentOpen(true);
    },
    [ensureAuth]
  );

  const handleDash = useCallback(
    async (scroll: ScrollVideo) => {
      if (!ensureAuth('Log in to dash Scroll creators?')) return;
      setActiveActionScroll(scroll);
      setDashOpen(true);
    },
    [ensureAuth]
  );

  const handleReport = useCallback(
    async (scroll: ScrollVideo) => {
      const rate = canSubmitScrollReportNow();
      if (!rate.allowed) {
        const seconds = Math.ceil(Number(rate.retryAfterMs || 0) / 1000);
        showNotification(
          'error',
          'Scroll',
          `Please wait ${seconds || 60}s before submitting another report.`
        );
        return;
      }
      const raw = window.prompt('Report reason');
      const validated = validateScrollReportReason(raw);
      if (!validated.ok) {
        if (raw != null) showNotification('error', 'Scroll', validated.error);
        return;
      }
      const postBridge = getPostBridgeSource(scroll);
      const previousPending = Math.max(0, Number(scroll.pendingReportCount || 0));
      // Optimistic pending report count
      if (postBridge) {
        patchPostBridgeState(postBridge.postId, { pendingReportCount: previousPending + 1 });
      } else {
        patchScrollState(scroll.id, { pendingReportCount: previousPending + 1 });
      }
      try {
        setReportBusyId(scroll.id);
        if (postBridge) {
          await postOptionsApi.report(postBridge.postId, { reason: validated.reason });
        } else {
          await ScrollService.report(scroll.id, { reason: validated.reason });
        }
        markScrollReportSubmitted();
        // Safety signal (no free-text reason in analytics payload)
        try {
          console.info(
            '[scroll-safety]',
            JSON.stringify(
              buildScrollAbuseSignal({
                scrollId: scroll.id,
                action: 'report',
                reasonCode: 'user_report'
              })
            )
          );
        } catch {
          /* ignore */
        }
        showNotification('success', 'Scroll', 'Report submitted.');
      } catch (error: any) {
        // Rollback optimistic pending count
        if (postBridge) {
          patchPostBridgeState(postBridge.postId, { pendingReportCount: previousPending });
        } else {
          patchScrollState(scroll.id, { pendingReportCount: previousPending });
        }
        const message = error?.response?.data?.error || error?.message || 'Failed to submit report.';
        showNotification('error', 'Scroll', message);
      } finally {
        setReportBusyId(null);
      }
    },
    [patchPostBridgeState, patchScrollState, showNotification]
  );

  const handleEdit = useCallback((scroll: ScrollVideo) => {
    setSourceVideo(null);
    setRemixSource(null);
    setEditingScroll(scroll);
    setCreateOpen(true);
  }, []);

  const handleRemix = useCallback(
    async (scroll: ScrollVideo, mode: 'remix' | 'duet' = 'remix') => {
      if (!ensureAuth(`Log in to create a ${mode} response?`)) return;
      setSourceVideo(null);
      setEditingScroll(null);
      setRemixSource({
        ...scroll,
        responseMode: mode
      });
      setCreateOpen(true);
    },
    [ensureAuth]
  );

  const handleOpenSeries = useCallback(
    async (seriesId: string, scrollId?: string) => {
      const targetSeriesId = String(seriesId || '').trim();
      if (!targetSeriesId) return;
      try {
        setSeriesModalOpen(true);
        setSeriesLoading(true);
        setSeriesError(null);
        setSeriesActiveScrollId(String(scrollId || '').trim() || null);
        const detail = await ScrollService.getSeries(targetSeriesId);
        setSeriesDetail(detail);
        mergeScrollItems(detail?.items?.map((entry) => entry.scroll).filter(Boolean) || []);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to load series.';
        setSeriesError(message);
      } finally {
        setSeriesLoading(false);
      }
    },
    [mergeScrollItems]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const querySeriesId = embedded ? '' : String(params.get('series') || '').trim();
    const targetSeriesId = String(initialSeriesId || querySeriesId || '').trim();
    if (!targetSeriesId) {
      openedSeriesSourceRef.current = null;
      return;
    }
    const targetScrollId = embedded
      ? String(initialActiveScrollId || '').trim()
      : parseScrollVideoIdFromSearch(params) || String(params.get('scroll') || '').trim();
    const openKey = `${embedded ? 'embedded' : 'route'}:${targetSeriesId}:${targetScrollId || ''}`;
    if (openedSeriesSourceRef.current === openKey) return;
    openedSeriesSourceRef.current = openKey;
    void handleOpenSeries(targetSeriesId, targetScrollId || undefined);
  }, [embedded, handleOpenSeries, initialActiveScrollId, initialSeriesId, location.search]);

  const handleSelectSeriesScroll = useCallback(
    (scrollId: string) => {
      const targetScrollId = String(scrollId || '').trim();
      if (!targetScrollId) return;
      const nextIndex = items.findIndex((entry) => entry.id === targetScrollId);
      if (nextIndex >= 0) {
        scrollToIndex(nextIndex);
      }
      setSeriesActiveScrollId(targetScrollId);
      setSeriesModalOpen(false);
    },
    [items, scrollToIndex]
  );

  const handleDelete = useCallback(
    async (scroll: ScrollVideo) => {
      if (!window.confirm('Delete this Scroll video? This cannot be undone.')) return;
      try {
        await ScrollService.remove(scroll.id);
        setItems((prev) => prev.filter((entry) => entry.id !== scroll.id));
        showNotification('success', 'Scroll', 'Scroll video deleted.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to delete Scroll video.';
        showNotification('error', 'Scroll', message);
      }
    },
    [showNotification]
  );

  const headlinePreviewLimit = Math.max(40, Number(config?.headlinePreviewCharacters || 72));
  const descriptionPreviewLimit = Math.max(60, Number(config?.descriptionPreviewCharacters || 120));
  const interestSurveyScrollIds = useMemo(
    () =>
      new Set(
        pickInterestSurveyCandidateIds(
          items.map((scroll) => ({
            id: String(scroll?.id || '').startsWith('post-video:') ? '' : scroll?.id,
            authorId: scroll?.authorId,
            initialSignal: scroll?.viewer?.feedbackSignal
          })),
          user?.id,
          'scroll',
          4
        )
      ),
    [items, user?.id]
  );

  const repostScroll = useCallback(
    async (withComment?: string) => {
      if (!activeActionScroll?.id || actionBusy) return;
      setActionBusy(true);
      try {
        const postBridge = getPostBridgeSource(activeActionScroll);
        if (postBridge) {
          const ok = await CommunityService.postRepost(postBridge.postId, {
            createWrapper: true,
            content: withComment ? withComment.trim() : undefined
          });
          if (!ok) {
            throw new Error('Failed to repost this post video.');
          }
          incrementPostBridgeMetric(postBridge.postId, 'reposts');
        } else {
          const text = withComment
            ? `${withComment.trim()}\n\n${buildScrollUrl(activeActionScroll.id)}`
            : `${activeActionScroll.description || activeActionScroll.title || 'Shared from Scroll'}\n\n${buildScrollUrl(activeActionScroll.id)}`;
          await CommunityService.createPost({
            title: activeActionScroll.title || 'Scroll repost',
            content: text
          });
          await handleEngage(activeActionScroll, 'repost');
        }
        setRepostOpen(false);
        showNotification('success', 'Scroll', 'Shared to your feed.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to repost Scroll.';
        showNotification('error', 'Scroll', message);
      } finally {
        setActionBusy(false);
      }
    },
    [actionBusy, activeActionScroll, buildScrollUrl, handleEngage, incrementPostBridgeMetric, showNotification]
  );

  const activeScrollUrl = activeActionScroll?.id ? buildScrollUrl(activeActionScroll.id) : '';
  const activeActionPostBridge = activeActionScroll ? getPostBridgeSource(activeActionScroll) : null;
  const activeVideoScrollAdOpen = Boolean(activeScrollAd?.ad && isVideoAdCreative(activeScrollAd.ad));
  const handleClose = useCallback(() => {
    if (embedded && onClose) {
      onClose();
      return;
    }
    navigate(-1);
  }, [embedded, navigate, onClose]);

  return (
    <div className="relative h-screen bg-black text-white">
      {deepLinkError ? (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center"
          data-testid="scroll-deeplink-unavailable"
          role="alert"
        >
          <p className="text-lg font-semibold text-white">This video is no longer available.</p>
          <p className="max-w-sm text-sm text-white/70">{deepLinkError}</p>
          <button
            type="button"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900"
            onClick={() => {
              setDeepLinkError(null);
              navigate('/scroll', { replace: true });
            }}
          >
            Browse Scroll
          </button>
        </div>
      ) : null}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4">
        <button
          type="button"
          onClick={handleClose}
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((prev) => !prev)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-black/45 px-3 text-xs font-semibold text-white transition hover:bg-black/65"
            aria-label={muted ? 'Unmute all Scrolls' : 'Mute all Scrolls'}
            aria-pressed={muted}
            data-testid="scroll-feed-mute-control"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">{muted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceVideo(null);
              setEditingScroll(null);
              setRemixSource(null);
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 transition"
          >
            <PlusCircle className="h-4 w-4" />
            Create
          </button>
        </div>
      </header>

      {showLiveDiscovery ? (
        <section className="pointer-events-auto absolute left-3 top-20 z-30 max-w-[220px] sm:left-4 sm:top-24">
          <div className="rounded-[22px] border border-white/15 bg-black/30 p-2.5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.72)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setLiveDiscoveryOpen(true)}
              className="flex w-full items-center gap-3 rounded-[18px] px-2 py-1.5 text-left text-white transition hover:bg-white/10"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-300/30 bg-rose-500/15 text-rose-100">
                <Radio className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">Live now</p>
                <p className="truncate text-xs font-semibold text-white/95">
                  {liveLoading ? 'Checking streams...' : `${liveSessions.length} active stream${liveSessions.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/70" />
            </button>
            {liveError ? (
              <button
                type="button"
                onClick={() => void loadLiveSessions()}
                className="mt-2 w-full rounded-[16px] border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-left text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/15"
              >
                Retry live discovery
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div
        ref={containerRef}
        className="h-screen snap-y snap-mandatory overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}
        onWheelCapture={(event) => {
          if (isInteractiveScrollControlTarget(event.target)) return;
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || Math.abs(event.deltaY) < 40) return;
          const now = Date.now();
          if (now - wheelNavigationLockRef.current < 420) {
            event.preventDefault();
            return;
          }
          wheelNavigationLockRef.current = now;
          event.preventDefault();
          void navigateRelative(event.deltaY > 0 ? 1 : -1);
        }}
        onTouchStartCapture={(event) => {
          if (isInteractiveScrollControlTarget(event.target)) {
            touchSwipeStartRef.current = null;
            return;
          }
          const touch = event.changedTouches?.[0];
          if (!touch) {
            touchSwipeStartRef.current = null;
            return;
          }
          touchSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEndCapture={(event) => {
          const start = touchSwipeStartRef.current;
          touchSwipeStartRef.current = null;
          if (!start || isInteractiveScrollControlTarget(event.target)) return;
          const touch = event.changedTouches?.[0];
          if (!touch) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaY) < 54 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.2) return;
          event.preventDefault();
          void navigateRelative(deltaY > 0 ? -1 : 1);
        }}
      >
        {loading ? (
          <FeedLoadSkeleton
            variant="scroll"
            label="Loading Scroll feed"
            className="h-screen w-full"
          />
        ) : items.length === 0 ? (
          <div className="flex h-screen flex-col items-center justify-center px-6 text-center">
            <p className="text-xl font-semibold">No Scroll videos yet.</p>
            <p className="mt-2 text-sm text-white/70">Create the first one and start your vertical feed.</p>
              <button
                type="button"
                  onClick={() => {
                    setSourceVideo(null);
                    setEditingScroll(null);
                    setRemixSource(null);
                    setCreateOpen(true);
                  }}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 transition"
              >
              <PlusCircle className="h-4 w-4" />
              Create Scroll
            </button>
          </div>
        ) : (
          <>
      {items.map((scroll, index) => {
              // Phase 23 — virtualized mount window around active card
              const virtualWindow = computeScrollVirtualWindow(
                activeIndex,
                items.length,
                profile.dataSaver || profile.lowBandwidth ? 1 : 2
              );
              const inWindow = isIndexInVirtualWindow(index, virtualWindow);
              const isNeighbor =
                Math.abs(index - activeIndex) === 1 || Math.abs(index - activeIndex) === 2;
              return (
              <div
                key={scroll.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="h-screen w-full"
                data-index={index}
                data-virtualized={inWindow ? 'hot' : 'cold'}
              >
                {inWindow ? (
                <ScrollCard
                  scroll={scroll}
                  isActive={index === activeIndex}
                  isNeighbor={isNeighbor && index !== activeIndex}
                  autoAdvanceOnEnd={autoAdvanceOnEnd}
                  playbackBlocked={activeVideoScrollAdOpen && activeScrollAd?.scrollId === scroll.id}
                  initialIsFollowing={
                    (() => {
                      const authorId = String(scroll.author?.id || scroll.authorId || '').trim();
                      if (!authorId) return undefined;
                      return followStateMap[authorId] ?? scroll.viewer?.isFollowingAuthor;
                    })()
                  }
                  autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                  muted={muted}
                  dataSaver={Boolean(profile.dataSaver || profile.lowBandwidth)}
                  networkClass={detectNetworkClass()}
                  onToggleMute={() => setMuted((prev) => !prev)}
                  onRequestNext={() => handleAdvanceToNextScroll(index)}
                  onEngage={handleEngage}
                  onComment={handleComment}
                  onShareToStory={handleShareToStory}
                  onRepost={handleRepost}
                  onDash={handleDash}
                  onSend={handleSend}
                  onReport={handleReport}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRemix={handleRemix}
                  onOpenSeries={handleOpenSeries}
                  headlinePreviewLimit={headlinePreviewLimit}
                  descriptionPreviewLimit={descriptionPreviewLimit}
                  interestSurveyEnabled={interestSurveyScrollIds.has(scroll.id)}
                  reactionTargetType={getPostBridgeSource(scroll) ? 'POST' : 'SCROLL'}
                  reactionTargetId={getPostBridgeSource(scroll)?.postId || scroll.id}
                />
                ) : (
                  <div
                    className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
                    aria-hidden
                    data-virtualized-placeholder="cold"
                  >
                    <div className="absolute inset-0 scrolith-shimmer-dark opacity-50" />
                    <div className="relative z-[1] flex flex-col items-center gap-3">
                      <div className="h-28 w-16 rounded-xl border border-white/10 bg-white/5" />
                      <div className="h-2 w-20 rounded-full bg-white/10" />
                    </div>
                  </div>
                )}
              </div>
            );
            })}
            {loadingMore ? (
              <div
                className="flex h-20 flex-col items-center justify-center gap-2 bg-black/80"
                role="status"
                aria-label="Loading more Scroll videos"
              >
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                <span className="text-[11px] font-medium tracking-wide text-white/50">
                  Loading more…
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ScrollAdOverlay
        ad={activeScrollAd?.ad || null}
        isOpen={Boolean(activeScrollAd)}
        muted={muted}
        videoSkipDelaySeconds={scrollAdPolicy.videoSkipDelaySeconds}
        staticSkipDelaySeconds={scrollAdPolicy.staticSkipDelaySeconds}
        onClose={() => setActiveScrollAd(null)}
        onComplete={() => setActiveScrollAd(null)}
      />

      {showLiveDiscovery && liveDiscoveryOpen ? (
        <div className="fixed inset-0 z-[60] bg-black/90 text-white">
          <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Let's Live Stream</p>
              <p className="text-xs text-white/70">Tap any stream to watch in full live viewer.</p>
            </div>
            <button
              type="button"
              onClick={() => setLiveDiscoveryOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 hover:bg-white/20"
              aria-label="Close live discovery"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="h-[calc(100vh-60px)] snap-y snap-mandatory overflow-y-auto">
            {liveSessions.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-base font-semibold">No active live streams.</p>
                <button
                  type="button"
                  onClick={() => void loadLiveSessions()}
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/20"
                >
                  Refresh
                </button>
              </div>
            ) : (
              liveSessions.map((live) => (
                <div key={live.id} className="flex h-[70vh] snap-start items-center justify-center px-4 py-6">
                  <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-100">
                        <Radio className="h-3 w-3" />
                        LIVE
                      </span>
                      <span className="text-[11px] text-white/75">Viewers {Number(live.viewerCount || 0)}</span>
                    </div>
                    <p className="mt-3 text-base font-semibold">{live.title || 'Live session'}</p>
                    <p className="mt-1 text-xs text-white/75">{live.description || 'Watch and engage in real time.'}</p>
                    <p className="mt-2 text-xs text-white/80">Host: {live.host?.name || 'Scrolith host'}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLiveDiscoveryOpen(false);
                        navigate(`/live/${encodeURIComponent(live.id)}`);
                      }}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-cyan-200"
                    >
                      Watch Live
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {reportBusyId ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center">
          <div className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/90 backdrop-blur">Submitting report...</div>
        </div>
      ) : null}

      {activeActionPostBridge ? (
        <div
          className={`fixed inset-0 z-[70] ${commentOpen ? 'pointer-events-auto' : 'pointer-events-none opacity-0'}`}
          data-scroll-skip-swipe="true"
          aria-hidden={!commentOpen}
        >
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-[1px]"
            onClick={() => setCommentOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88svh] overflow-hidden rounded-t-[28px] bg-white text-slate-900 shadow-[0_-24px_64px_-28px_rgba(15,23,42,0.5)] md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[min(56rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-[30px]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Comments</p>
                <p className="text-xs text-slate-500">This video was opened from a post.</p>
              </div>
              <button
                type="button"
                onClick={() => setCommentOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="max-h-[calc(88svh-64px)] overflow-y-auto px-4 py-3" data-scroll-skip-swipe="true">
              <PostComments
                postId={activeActionPostBridge.postId}
                authorId={activeActionScroll?.authorId}
                initialCount={Number(activeActionScroll?.metrics?.comments || 0)}
                expanded
                onCountChange={(postId, count) => {
                  patchPostBridgeState(postId, { metrics: { comments: count } });
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <ScrollCommentsSheet
          scroll={activeActionScroll}
          isOpen={commentOpen}
          onClose={() => setCommentOpen(false)}
          onCountChange={(scrollId, count) => {
            patchMetrics(scrollId, { comments: count });
          }}
        />
      )}

      <RepostModal
        isOpen={repostOpen}
        onClose={() => {
          if (actionBusy) return;
          setRepostOpen(false);
        }}
        busy={actionBusy}
        onRepostNow={async () => repostScroll()}
        onRepostWithComment={async (comment) => repostScroll(comment)}
      />

      <PostShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={activeActionPostBridge?.postId}
        postUrl={activeScrollUrl || buildPublicAppUrl('/scroll')}
        entityLabel="scroll"
        shareText={
          activeActionScroll
            ? `${String(activeActionScroll.title || 'Check this Scroll on Scrolith').trim()}${String(activeActionScroll.description || '').trim() ? `\n\n${String(activeActionScroll.description).trim()}` : ''}`
            : 'Check this Scroll on Scrolith'
        }
        onShareToNetwork={() => {
          if (!activeActionScroll) return;
          setShareOpen(false);
          setRepostOpen(true);
        }}
        onTrackedShare={async () => {
          if (activeActionPostBridge?.postId) {
            incrementPostBridgeMetric(activeActionPostBridge.postId, 'sends');
            return;
          }
          if (!activeActionScroll?.id) return;
          await handleEngage(activeActionScroll, 'send');
        }}
      />

      <SendGcoinModal
        isOpen={dashOpen}
        onClose={() => setDashOpen(false)}
        donatePostId={activeActionPostBridge?.postId}
        donateScrollId={activeActionPostBridge ? undefined : activeActionScroll?.id}
        titleOverride="Dash Gcoin"
        subtitleOverride="Support this Scroll creator instantly with your Gcoin balance."
        onSuccess={async (result) => {
          const postBridge = activeActionScroll ? getPostBridgeSource(activeActionScroll) : null;
          const data = result?.data || {};
          if (postBridge?.postId) {
            patchPostBridgeState(postBridge.postId, {
              dashGcoinTotal: Number(data?.dashGcoinTotal || 0),
              metrics: data?.metrics || {}
            });
            return;
          }
          const scrollId = String(activeActionScroll?.id || '').trim();
          if (!scrollId) return;
          patchScrollState(scrollId, {
            dashGcoinTotal: Number(data?.dashGcoinTotal || 0),
            metrics: data?.metrics || {}
          });
          await handleEngage(activeActionScroll, 'dash');
        }}
      />

      <ScrollCreateModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setSourceVideo(null);
          setEditingScroll(null);
          setRemixSource(null);
          clearPendingPostVideoScrollSource();
        }}
        editScroll={editingScroll}
        remixSource={remixSource}
        sourceVideo={sourceVideo}
        onCreated={(scroll) => {
          setItems((prev) => [scroll, ...prev.filter((entry) => entry.id !== scroll.id)]);
          setActiveIndex(0);
          setSourceVideo(null);
          setEditingScroll(null);
          setRemixSource(null);
          clearPendingPostVideoScrollSource();
        }}
        onUpdated={(scroll) => {
          setItems((prev) => prev.map((entry) => (entry.id === scroll.id ? scroll : entry)));
          setEditingScroll(null);
          setRemixSource(null);
        }}
        config={config}
      />

      <ScrollSeriesModal
        open={seriesModalOpen}
        loading={seriesLoading}
        series={seriesDetail}
        error={seriesError}
        activeScrollId={seriesActiveScrollId}
        onClose={() => setSeriesModalOpen(false)}
        onSelectScroll={handleSelectSeriesScroll}
      />
    </div>
  );
};

export default ScrollFeed;
