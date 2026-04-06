import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, PlusCircle, Radio, Volume2, VolumeX, X } from 'lucide-react';
import ScrollCard from './ScrollCard';
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
import { LiveService, type LiveSession } from '../../services/live';
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
import { pickInterestSurveyCandidateId } from '../../components/recommendation/ContentInterestSurvey';

const LAST_SCROLL_INDEX_KEY = 'scroll:lastIndex';
const GLOBAL_SCROLL_MUTED_KEY = 'scroll:muted';
const SCROLL_VIDEO_ROUTE_PATTERN = /^\/scroll(?:\/|$)/i;

const readStoredIndex = () => {
  const value = Number(localStorage.getItem(LAST_SCROLL_INDEX_KEY) || 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const readMutedPreference = () => {
  const raw = String(localStorage.getItem(GLOBAL_SCROLL_MUTED_KEY) || 'true').toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
};

const buildViewerSeedScroll = (source: PendingPostVideoScrollViewerSource): ScrollVideo => ({
  id: `post-video:${String(source.sourcePostId || '').trim()}:${String(source.fileId || source.mediaUrl || '').trim()}`,
  authorId: String(source.sourcePostId || '').trim() || 'post-video',
  author: {
    id: String(source.sourcePostId || '').trim() || 'post-video',
    name: String(source.authorName || 'Scrolith creator').trim() || 'Scrolith creator',
    avatar: String(source.authorAvatar || '').trim() || null,
    username: String(source.authorUsername || '').trim() || null,
    isVerified: false
  },
  title: source.title || 'Featured from post',
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

const findPrimaryVideoAttachment = (post: any) => {
  const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
  return attachments.find((attachment: any) => inferPostAttachmentType(attachment) === 'video') || null;
};

const buildViewerSeedScrollFromPost = (post: any): ScrollVideo | null => {
  const postId = String(post?.id || '').trim();
  const attachment = findPrimaryVideoAttachment(post);
  const mediaUrl = attachment ? String(resolvePostAttachmentMediaUrl(attachment) || '').trim() : '';
  if (!postId || !attachment || !mediaUrl) return null;

  const attachmentId =
    String(
      attachment?.fileId ||
        attachment?.file_id ||
        attachment?.file?.id ||
        attachment?.asset?.id ||
        attachment?.id ||
        mediaUrl
    ).trim() || mediaUrl;
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
    author: {
      id: authorId,
      name: authorName,
      avatar:
        String(post?.author?.avatarUrl || post?.author?.avatar || post?.authorAvatar || '').trim() || null,
      username:
        String(post?.author?.username || post?.authorUsername || post?.userUsername || '').trim() || null,
      isVerified: Boolean(post?.author?.isVerified)
    },
    title: String(post?.title || attachment?.name || '').trim() || 'Featured from post',
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
  const showLiveDiscovery = liveFeatureStatus.enabled && liveFeatureStatus.experienceConfig?.showFeaturedRailInScrollFeed !== false;
  const autoAdvanceOnEnd = !embedded && SCROLL_VIDEO_ROUTE_PATTERN.test(location.pathname);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const viewerSeedSourceRef = useRef<PendingPostVideoScrollViewerSource | null>(null);
  const seededItemsRef = useRef<ScrollVideo[]>(Array.isArray(initialItems) ? initialItems.filter(Boolean) : []);
  const openedSeriesSourceRef = useRef<string | null>(null);
  const pendingViewerSourceConsumedRef = useRef(false);
  const itemsRef = useRef<ScrollVideo[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const pendingAutoAdvanceIndexRef = useRef<number | null>(null);

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
    return buildPublicAppUrl(`/scroll?scroll=${encodeURIComponent(scrollId)}`);
  }, []);

  const loadFeed = useCallback(
    async (cursor?: string | null) => {
      try {
        if (cursor) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        const data = await ScrollService.getFeed({
          cursor: cursor || undefined,
          limit: profile.feedPageSize
        });
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        const seededSource = !cursor ? viewerSeedSourceRef.current : null;
        const seededItem = seededSource ? buildViewerSeedScroll(seededSource) : null;
        setConfig((data?.config as ScrollConfig) || null);
        setNextCursor(data?.nextCursor || null);
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
            nextItems.forEach((entry) => pushUnique(entry));
            return merged;
          }
          const existing = new Set(prev.map((entry) => entry.id));
          const merged = [...prev];
          for (const entry of nextItems) {
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
    [profile.feedPageSize, showNotification]
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
    const pendingViewerSource = routePendingViewerSource || readPendingPostVideoScrollViewerSource();
    params.delete('watch');
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : ''
      },
      {
        replace: true,
        state: {
          ...(routeState || {}),
          pendingViewerSource
        }
      }
    );
  }, [embedded, location.pathname, location.search, navigate, routePendingViewerSource, routeState]);

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
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1;
      scrollToIndex(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, scrollToIndex]);

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
      if (String(detail?.targetType || '').toUpperCase() !== 'SCROLL') return;
      const scrollId = String(detail?.targetId || '').trim();
      if (!scrollId) return;
      const counts = detail?.counts && typeof detail.counts === 'object' ? detail.counts : {};
      const likes = Object.values(counts).reduce((total: number, value: any) => total + Math.max(0, Number(value || 0)), 0);
      patchMetrics(scrollId, { likes });
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
  }, [loadLiveSessions, patchMetrics, patchScrollState]);

  const handleEngage = useCallback(
    async (scrollId: string, type: ScrollEngagementType, payload?: { watchedSeconds?: number }) => {
      try {
        const response = await ScrollService.engage(scrollId, {
          type,
          watchedSeconds: payload?.watchedSeconds
        });
        if (response?.metrics) {
          patchMetrics(scrollId, response.metrics);
        }
      } catch {
        // non-blocking by design
      }
    },
    [patchMetrics]
  );

  const handleShareToStory = useCallback(
    async (scroll: ScrollVideo) => {
      if (!scroll?.media?.id) {
        showNotification('error', 'Scroll', 'Scroll media is not available.');
        return;
      }
      try {
        await CommunityService.createStory({
          type: 'video',
          mediaFileId: scroll.media.id,
          content: scroll.title || scroll.description || 'Shared from Scroll'
        });
        showNotification('success', 'Scroll', 'Shared to Story.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to share to Story.';
        showNotification('error', 'Scroll', message);
      }
    },
    [showNotification]
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
      const reason = window.prompt('Report reason');
      if (!reason || !reason.trim()) return;
      try {
        setReportBusyId(scroll.id);
        await ScrollService.report(scroll.id, { reason: reason.trim() });
        showNotification('success', 'Scroll', 'Report submitted.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to submit report.';
        showNotification('error', 'Scroll', message);
      } finally {
        setReportBusyId(null);
      }
    },
    [showNotification]
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
    const targetScrollId = embedded ? String(initialActiveScrollId || '').trim() : String(params.get('scroll') || '').trim();
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
  const interestSurveyScrollId = useMemo(
    () =>
      pickInterestSurveyCandidateId(
        items.map((scroll) => ({
          id: String(scroll?.id || '').startsWith('post-video:') ? '' : scroll?.id,
          authorId: scroll?.authorId,
          initialSignal: scroll?.viewer?.feedbackSignal
        })),
        user?.id,
        'scroll'
      ),
    [items, user?.id]
  );

  const repostScroll = useCallback(
    async (withComment?: string) => {
      if (!activeActionScroll?.id || actionBusy) return;
      setActionBusy(true);
      try {
        const text = withComment
          ? `${withComment.trim()}\n\n${buildScrollUrl(activeActionScroll.id)}`
          : `${activeActionScroll.description || activeActionScroll.title || 'Shared from Scroll'}\n\n${buildScrollUrl(activeActionScroll.id)}`;
        await CommunityService.createPost({
          title: activeActionScroll.title || 'Scroll repost',
          content: text
        });
        await handleEngage(activeActionScroll.id, 'repost');
        setRepostOpen(false);
        showNotification('success', 'Scroll', 'Shared to your feed.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to repost Scroll.';
        showNotification('error', 'Scroll', message);
      } finally {
        setActionBusy(false);
      }
    },
    [actionBusy, activeActionScroll, buildScrollUrl, handleEngage, showNotification]
  );

  const activeScrollUrl = activeActionScroll?.id ? buildScrollUrl(activeActionScroll.id) : '';
  const handleClose = useCallback(() => {
    if (embedded && onClose) {
      onClose();
      return;
    }
    navigate(-1);
  }, [embedded, navigate, onClose]);

  return (
    <div className="relative h-screen bg-black text-white">
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
            aria-label={muted ? 'Unmute all' : 'Mute all'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
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

      <div ref={containerRef} className="h-screen snap-y snap-mandatory overflow-y-auto">
        {loading ? (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
          </div>
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
      {items.map((scroll, index) => (
              <div
                key={scroll.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="h-screen w-full"
                data-index={index}
              >
                <ScrollCard
                  scroll={scroll}
                  isActive={index === activeIndex}
                  autoAdvanceOnEnd={autoAdvanceOnEnd}
                  initialIsFollowing={
                    (() => {
                      const authorId = String(scroll.author?.id || scroll.authorId || '').trim();
                      if (!authorId) return undefined;
                      return followStateMap[authorId] ?? scroll.viewer?.isFollowingAuthor;
                    })()
                  }
                  autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                  muted={muted}
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
                  interestSurveyEnabled={scroll.id === interestSurveyScrollId}
                />
              </div>
            ))}
            {loadingMore ? (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
              </div>
            ) : null}
          </>
        )}
      </div>

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

      <ScrollCommentsSheet
        scroll={activeActionScroll}
        isOpen={commentOpen}
        onClose={() => setCommentOpen(false)}
        onCountChange={(scrollId, count) => {
          patchMetrics(scrollId, { comments: count });
        }}
      />

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
        postUrl={activeScrollUrl || buildPublicAppUrl('/scroll')}
        entityLabel="scroll"
        shareText={
          activeActionScroll
            ? `Check this Scroll on Scrolith: ${activeScrollUrl}`
            : 'Check this Scroll on Scrolith'
        }
        onShareToNetwork={() => {
          if (!activeActionScroll) return;
          setShareOpen(false);
          setRepostOpen(true);
        }}
        onTrackedShare={async () => {
          if (!activeActionScroll?.id) return;
          await handleEngage(activeActionScroll.id, 'send');
        }}
      />

      <SendGcoinModal
        isOpen={dashOpen}
        onClose={() => setDashOpen(false)}
        donateScrollId={activeActionScroll?.id}
        titleOverride="Dash Gcoin"
        subtitleOverride="Support this Scroll creator instantly with your Gcoin balance."
        onSuccess={async (result) => {
          const scrollId = String(activeActionScroll?.id || '').trim();
          if (!scrollId) return;
          const data = result?.data || {};
          patchScrollState(scrollId, {
            dashGcoinTotal: Number(data?.dashGcoinTotal || 0),
            metrics: data?.metrics || {}
          });
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
