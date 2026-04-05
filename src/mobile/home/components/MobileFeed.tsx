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
import PostEngagementBar from '../../../community/components/PostEngagementBar';
import FollowButton from '../../../community/components/FollowButton';
import PostOptionsButton from '../../../community/components/post-options/PostOptionsButton';
import ExpandablePreviewText from '../../../components/common/ExpandablePreviewText';
import VerifiedBadge from '../../../components/common/VerifiedBadge';
import InlineAutoplayVideo from '../../../components/media/InlineAutoplayVideo';
import OptimizedImage from '../../../components/media/OptimizedImage';
import type { PreviewMedia } from '../../../components/media/MediaPreviewModal';
import PostVideoActionBar from '../../../components/media/PostVideoActionBar';
import { INLINE_VIDEO_PREVIEW_AUTOPLAY } from '../../../utils/inlineMedia';
import { resolvePostAttachmentMediaUrl, resolvePostAttachmentPosterUrl } from '../../../utils/postAttachmentMedia';
import {
  stashPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollViewerSource
} from '../../../utils/postVideoScrollBridge';
import { resolveVerificationLevel } from '../../../utils/verification';
import FeedAdCard from './FeedAdCard';
import RecommendedListingCard from './RecommendedListingCard';
import SuggestedCard from './SuggestedCard';
import { usePerformanceProfile } from '../../../hooks/usePerformanceProfile';
import type { MemberHomeHighlightItem, MemberHomeHighlightPill } from '../../../components/member-home/MemberHomeHighlightsBoard';
import { getHighlightedCommunityEvents, type HighlightCommunityEvent } from '../../../utils/communityEventHighlights';
import { MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';

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

const isVideo = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('video/');
const isImage = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('image/');
const BRAND_LOGO_URL = '/logo.png';
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
  if (Array.isArray(payload?.jobs)) return payload.jobs as Job[];
  if (Array.isArray(payload)) return payload as Job[];
  return [];
};

const extractGigsFromPayload = (payload: any): Gig[] => {
  if (Array.isArray(payload?.gigs)) return payload.gigs as Gig[];
  if (Array.isArray(payload)) return payload as Gig[];
  return [];
};

const extractFeedItemsFromPayload = (payload: any): any[] => {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.posts)) return payload.posts;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.posts)) return payload.data.posts;
  if (Array.isArray(payload?.data)) return payload.data;
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
    const mime = String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase();
    const type = String(attachment?.type || '').trim().toLowerCase();
    if (!isVideo(mime) && type !== 'video') continue;
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
  const initialRenderCount = constrainedForFeed ? 4 : 6;
  const renderStep = constrainedForFeed ? 3 : 5;
  const listingCardEveryPosts = clamp(Number((feedSettings as any).listingCardEveryPosts ?? 2) || 2, 1, 6);
  const maxListingCardsPerFeed = clamp(Number((feedSettings as any).maxListingCardsPerFeed ?? 8) || 8, 1, 16);
  const listingPoolLimit = Math.max(
    constrainedForFeed ? 4 : 8,
    maxListingCardsPerFeed * (constrainedForFeed ? 2 : 3)
  );

  const promotedFrequency = clamp(Number(feedSettings.promotedFrequency ?? 6) || 6, 2, 20);

  const [posts, setPosts] = useState<any[]>([]);
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
  const deferredPosts = useDeferredValue(posts);
  const visiblePosts = useMemo(
    () => deferredPosts.slice(0, Math.min(renderedPostCount, deferredPosts.length)),
    [deferredPosts, renderedPostCount]
  );
  const listingSlots = useMemo(() => {
    if (!showRecommendedGigsJobs || !user?.id || !posts.length) return 0;
    const baseSlots = Math.floor(posts.length / listingCardEveryPosts);
    const sparseSlots = posts.length > 0 ? 1 : 0;
    return Math.min(maxListingCardsPerFeed, Math.max(baseSlots, sparseSlots));
  }, [showRecommendedGigsJobs, user?.id, posts.length, listingCardEveryPosts, maxListingCardsPerFeed]);

  const listingCardEntries = useMemo(() => {
    if (!showRecommendedGigsJobs || !user?.id || !posts.length || listingSlots <= 0) {
      return [] as Array<{ kind: 'job' | 'gig'; item: any }>;
    }

    const jobPool = shuffle(dedupeById((recommendedJobs || []) as Array<Job & { id: string }>)).slice(0, listingSlots * 3);
    const gigPool = shuffle(dedupeById((recommendedGigs || []) as Array<Gig & { id: string }>)).slice(0, listingSlots * 3);
    const entries: Array<{ kind: 'job' | 'gig'; item: any }> = [];
    let preferJob = ((String(user.id || '').length + posts.length) % 2) === 0;

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
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    items.push({
      id: 'mobile-scrolitha-coach',
      eyebrow: 'Scrolitha coach',
      title: 'Improve posts, gigs, and briefs faster',
      description: 'Open Scrolitha coach inside member_home to tighten your next post, listing, or brief.',
      meta: 'Posts · Gigs · Briefs',
      badge: 'AI',
      ctaLabel: 'Open coach',
      onClick: () => openInsightsSection('scrolitha-coach', 'growth'),
      mediaUrl: '/logo.png',
      icon: <Sparkles className="h-4 w-4" />,
      tone: 'violet'
    });

    if (topJob) {
      const budgetLabel = formatHighlightMoney((topJob as any)?.budget);
      items.push({
        id: `mobile-job:${topJob.id}`,
        eyebrow: 'Featured jobs',
        title: topJob.title || 'Recommended job',
        description: [topJob.clientName || 'Employer', topJob.category || topJob.subcategory || 'Professional opportunity']
          .filter(Boolean)
          .join(' · '),
        meta: budgetLabel ? `Budget $${budgetLabel}` : 'Flexible budget',
        badge: 'Live',
        ctaLabel: 'Browse jobs',
        href: '/browse-jobs',
        mediaUrl: resolveHighlightListingImage(topJob as any),
        icon: <Briefcase className="h-4 w-4" />,
        tone: 'blue'
      });
    }

    if (topGig) {
      const priceLabel = formatHighlightMoney((topGig as any)?.price);
      items.push({
        id: `mobile-gig:${topGig.id}`,
        eyebrow: 'Featured gigs',
        title: topGig.title || 'Recommended gig',
        description: [topGig.freelancerName || 'Freelancer', topGig.category || topGig.subcategory || 'Service listing']
          .filter(Boolean)
          .join(' · '),
        meta: priceLabel ? `From $${priceLabel}` : 'Pricing available',
        badge: 'Recommended',
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
      items.push({
        id: 'mobile-network-highlights',
        eyebrow: 'Follow recommendations',
        title: networkLead,
        description:
          followPool || 'Suggested people and pages are already integrated into your home feed for faster growth.',
        meta: `${suggestedPeople.length} people · ${suggestedPages.length} pages`,
        badge: 'Grow',
        ctaLabel: 'Open recommendations',
        onClick: () =>
          scrollToFeedSection(
            suggestedPeople.length
              ? 'mobile-member-home-people-suggestions'
              : suggestedPages.length
                ? 'mobile-member-home-page-suggestions'
                : 'mobile-member-home-feed-stream'
          ),
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
        mediaUrl: Array.isArray(topAd.media) ? String(topAd.media[0]?.url || '').trim() : '',
        icon: <Megaphone className="h-4 w-4" />,
        tone: 'amber'
      });
    } else if (topPost) {
      items.push({
        id: `mobile-post:${topPost.id}`,
        eyebrow: 'Feed pulse',
        title: topPost.title || topPost.author?.displayName || topPost.authorName || 'Fresh from your network',
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
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const viewTrackedRef = useRef<Set<string>>(new Set());
  const postMediaTapTimersRef = useRef<Record<string, number>>({});
  const postMediaLastTapAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    if (!feedCacheKey) return;
    try {
      const raw = localStorage.getItem(feedCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ts?: number; items?: any[]; cursor?: string | null };
      const cachedPosts = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!cachedPosts.length) return;
      postsRef.current = cachedPosts;
      const cachedCursor = parsed?.cursor ? String(parsed.cursor) : null;
      cursorRef.current = cachedCursor;
      startTransition(() => {
        setPosts(cachedPosts);
        setCursor(cachedCursor);
        setRenderedPostCount(Math.min(initialRenderCount, cachedPosts.length || initialRenderCount));
      });
      setLoading(false);
      setError(null);
    } catch {
      // Ignore cache parse errors and continue network-first.
    }
  }, [feedCacheKey, initialRenderCount]);

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
    if (loading || error || posts.length === 0) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleHandle: number | null = null;
    const readyDelay = constrainedForFeed ? 2600 : 1200;
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
  }, [constrainedForFeed, error, loading, posts.length]);

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
    const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
    return (
      attachments.find(
        (entry: any) =>
          Boolean(entry) &&
          (isVideo(entry?.mimeType) || String(entry?.type || '').toLowerCase() === 'video')
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
        title: String(post?.title || media?.name || '').trim() || null,
        description: String(post?.content || '').trim() || null,
        location: String(post?.location || '').trim() || null,
        authorName: String(post?.author?.displayName || post?.authorName || '').trim() || null,
        authorAvatar: String(post?.author?.avatarUrl || post?.authorAvatar || '').trim() || null,
        authorUsername: String(post?.author?.username || post?.authorUsername || '').trim() || null,
        createdAt: String(post?.createdAt || '').trim() || null
      };
      if (onOpenPostVideoScroll) {
        onOpenPostVideoScroll(sourcePayload);
        return;
      }
      stashPendingPostVideoScrollViewerSource(sourcePayload);
      navigate('/scroll?watch=post-video');
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

  const triggerPostDoubleTapLike = useCallback(
    async (post: any) => {
      const postId = String(post?.id || '').trim();
      if (!postId) return;
      if (!user?.id) {
        if (confirm('Log in to like posts?')) window.location.href = '/auth/login';
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
      if (isVideo(media?.mimeType) || String(media?.type || '').toLowerCase() === 'video') {
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

  const load = useCallback(async (mode: 'initial' | 'more') => {
    const now = Date.now();
    if (rateLimitUntilRef.current && now < rateLimitUntilRef.current) {
      return;
    }
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const feedLimit = Math.max(6, Math.min(24, Number(profile.feedPageSize || (constrainedForFeed ? 8 : 12))));

    try {
      if (mode === 'initial') {
        setLoading(postsRef.current.length === 0);
        setError(null);
        setStatusMessage(null);
      } else {
        setLoadingMore(true);
      }

      let nextPosts: any[] = [];
      let nextCursor: string | null = null;
      let usedPostsFallback = false;
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
              postsRef.current = fallbackItems;
              startTransition(() => {
                setPosts(fallbackItems);
                setRenderedPostCount(Math.min(initialRenderCount, fallbackItems.length || initialRenderCount));
              });
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
      cursorRef.current = nextCursor;
      const mergedPosts = shouldPreserveExistingFeed
        ? postsRef.current
        : mode === 'more'
          ? [...postsRef.current, ...nextPosts]
          : nextPosts;
      postsRef.current = mergedPosts;
      startTransition(() => {
        setCursor(nextCursor);
        setPosts(mergedPosts);
        if (mode === 'initial') {
          setRenderedPostCount(Math.min(initialRenderCount, mergedPosts.length || initialRenderCount));
        }
      });
      if (shouldPreserveExistingFeed) {
        setStatusMessage('Showing your saved feed while we reconnect.');
      }
        if (mergedPosts.length > 0) {
          try {
            localStorage.setItem(
              feedCacheKey,
              JSON.stringify({
                ts: Date.now(),
                cursor: nextCursor,
                items: mergedPosts.slice(0, 80)
              })
            );
          } catch {
            // Ignore cache write errors.
          }
        }
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
  }, [constrainedForFeed, profile.feedPageSize, feedCacheKey, initialRenderCount]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (feedSettings.showPromoted === false) return;
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const delayMs = constrainedForFeed ? 1800 : 900;
    const timer = window.setTimeout(() => {
      CommunityService.getPublicAds({ placement: 'feed', limit: constrainedForFeed ? 4 : 8 })
        .then((items) => {
          if (cancelled) return;
          setAds(shuffle(Array.isArray(items) ? items : []));
        })
        .catch(() => {
          if (cancelled) return;
          setAds([]);
        });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedSettings.showPromoted, secondaryFeedReady, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (!showRecommendedGigsJobs) {
      setRecommendedJobs([]);
      setRecommendedGigs([]);
      return;
    }
    if (!user?.id) return;
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const requestLimit = constrainedForFeed ? Math.max(3, Math.min(8, listingPoolLimit)) : Math.max(4, Math.min(14, listingPoolLimit));
    const timer = window.setTimeout(() => {
      const jobRequests: Array<Promise<any>> = constrainedForFeed
        ? [jobsApi.getJobs({ status: 'active', limit: requestLimit, recommended: true })]
        : [
            jobsApi.getJobs({ status: 'active', limit: requestLimit, featuredOnly: true }),
            jobsApi.getJobs({ status: 'active', limit: requestLimit, recommended: true })
          ];
      const gigRequests: Array<Promise<any>> = constrainedForFeed
        ? [gigsApi.getGigs({ status: 'active', limit: requestLimit, recommended: true })]
        : [
            gigsApi.getGigs({ status: 'active', limit: requestLimit, featuredOnly: true }),
            gigsApi.getGigs({ status: 'active', limit: requestLimit, recommended: true })
          ];

      Promise.all([
        Promise.allSettled(jobRequests),
        Promise.allSettled(gigRequests)
      ])
        .then(([jobsResults, gigsResults]) => {
          if (cancelled) return;
          const jobsList = dedupeById(
            shuffle(
              jobsResults.flatMap((result) =>
                result.status === 'fulfilled' ? extractJobsFromPayload(result.value) : []
              )
            ) as Array<Job & { id: string }>
          ).slice(0, requestLimit);
          const gigsList = dedupeById(
            shuffle(
              gigsResults.flatMap((result) =>
                result.status === 'fulfilled' ? extractGigsFromPayload(result.value) : []
              )
            ) as Array<Gig & { id: string }>
          ).slice(0, requestLimit);

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
  }, [showRecommendedGigsJobs, user?.id, secondaryFeedReady, loading, error, listingPoolLimit, constrainedForFeed]);

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
    if (constrainedForFeed) {
      setSuggestedPeople([]);
      return;
    }
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.allSettled([
        RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: 4 }),
        RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: 4 })
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
              return { id, name, username, avatarUrl, targetType: 'user' as const };
            })
            .filter(Boolean);
          setSuggestedPeople(mapped.slice(0, 4));
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestedPeople([]);
        });
    }, 1600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedSettings.showSuggestedPeople, user?.id, secondaryFeedReady, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showSuggestedPages === false) return;
    if (!user?.id) return;
    if (constrainedForFeed) {
      setSuggestedPages([]);
      return;
    }
    if (!secondaryFeedReady) return;
    if (loading || error) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      RecoService.getAccounts({ surface: 'member_home', type: 'page', limit: 4 })
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
              return { id, name, username, avatarUrl, targetType: 'page' as const };
            })
            .filter(Boolean);
          setSuggestedPages(mapped.slice(0, 4));
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestedPages([]);
        });
    }, 1800);
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
      void load('initial');
    }, 60000);
    return () => window.clearInterval(id);
  }, [isConnected, load, shouldAttemptLiveConnections]);

  useEffect(() => {
    if (!isOnline || recoveryTick <= 0) return;
    void load('initial');
  }, [isOnline, recoveryTick, load]);

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
  }, []);

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
        if (renderedPostCount < posts.length) {
          setRenderedPostCount((prev) => Math.min(posts.length, prev + renderStep));
          return;
        }
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
  }, [cursor, loading, loadingMore, load, posts.length, renderStep, renderedPostCount]);

  const showTagsCard = feedSettings.showTrendingTags !== false && trendingTags.length > 0;
  const showPeopleCard = feedSettings.showSuggestedPeople !== false && suggestedPeople.length > 0;
  const showPagesCard = feedSettings.showSuggestedPages !== false && suggestedPages.length > 0;

  if (loading && posts.length === 0) {
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

  if (!posts.length) {
    return (
      <div className={MOBILE_PAGE_SECTION_CLASS}>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No posts yet. Be the first to share an update.
        </div>
      </div>
    );
  }

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
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
            onClick={() => void load('initial')}
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
              title="Member Home Highlights"
              subtitle="Scrolitha coach, live office hours, recommended opportunities, follow suggestions, and live post momentum in one place."
              pills={highlightPills}
              items={highlightItems}
              compact
            />
          </Suspense>
        ) : null}
        {visiblePosts.map((post, idx) => {
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
          const showMedia = postCardSettings.mediaPreviewEnabled !== false;

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
                className="cursor-pointer rounded-[30px] border border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/70 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]"
                onClick={(event) => {
                  if (isIgnoredSurfaceTarget(event.target)) return;
                  openPostCard(post);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      to={profileUrl}
                      className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-50 shadow-sm"
                        aria-label={`View ${authorName} profile`}
                      >
                        {authorAvatar ? (
                          <OptimizedImage
                            src={authorAvatar}
                            alt={authorName}
                            width={96}
                            height={96}
                            sizes="48px"
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              (event.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                    </Link>
                    <div className="min-w-0 pt-0.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          to={profileUrl}
                          className="min-w-0 text-[15px] font-semibold text-slate-950 break-words [overflow-wrap:anywhere] hover:text-slate-700"
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
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{relativeTime(createdAt) || 'now'}</span>
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

                  <div className="flex items-center gap-2">
                    {authorId && String(authorId) !== String(user?.id || '') ? (
                      <FollowButton
                        targetUserId={String(authorId)}
                        currentUserId={user?.id}
                        initialIsFollowing={
                          typeof post?.viewer?.isFollowingAuthor === 'boolean'
                            ? Boolean(post.viewer.isFollowingAuthor)
                            : undefined
                        }
                        onRequireLogin={() => navigate('/auth/login')}
                        className="h-9 border-slate-200 bg-white px-3.5 text-[11px] uppercase tracking-[0.16em] text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                      />
                    ) : null}

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

                <div className="mt-4 space-y-4">
                  {post?.title ? (
                    <button
                      type="button"
                      onClick={() => openPostCard(post)}
                      className="text-left text-lg font-semibold tracking-tight text-slate-950 break-words [overflow-wrap:anywhere] hover:text-blue-700 hover:underline"
                    >
                      {post.title}
                    </button>
                  ) : null}
                  <div
                    className="cursor-pointer text-[15px] leading-7 text-slate-700 break-words [overflow-wrap:anywhere]"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => openPostFromText(event, post)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openPostCard(post);
                      }
                    }}
                  >
                    <ExpandablePreviewText
                      text={content}
                      className="inline"
                      buttonClassName="text-slate-900"
                      renderText={(visibleText) => (
                        <MentionText text={visibleText} viewerId={user?.id} viewerUsername={user?.username} />
                      )}
                    />
                  </div>

                  {showHashtags && tags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {tags.slice(0, 8).map((tag: string) => (
                        <Link
                          key={`${postId}_tag_${tag}`}
                          to={`/community/tags/${encodeURIComponent(tag)}`}
                          className="max-w-full break-all rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
                        >
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  ) : null}

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

                  {showMedia && attachments.length ? (
                    <div className="relative grid gap-2">
                      <div className={shouldBlurMedia ? 'pointer-events-none blur-sm' : ''}>
                        {attachments.slice(0, 3).map((file: any) => {
                          const mediaKey = String(file.id || file.url || '');
                          return (
                            <div
                              key={`${postId}_att_${file.id || file.url}`}
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
                            >
                              {isVideo(file.mimeType) ? (
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
                                    src={resolvePostAttachmentMediaUrl(file)}
                                    poster={resolvePostAttachmentPosterUrl(file)}
                                    className="h-[17.5rem] w-full object-cover sm:h-[20rem]"
                                    controls={false}
                                    autoplayEnabled={INLINE_VIDEO_PREVIEW_AUTOPLAY}
                                    preload="metadata"
                                    loadingLabel="Video loading"
                                    overlay={(videoElement) => (
                                      <PostVideoActionBar
                                        postId={postId}
                                        postTitle={post?.title}
                                        postContent={post?.content}
                                        postLocation={post?.location}
                                        media={{
                                          id: file?.id,
                                          fileId: file?.fileId || file?.file_id || file?.file?.id || file?.asset?.id || file?.id || null,
                                          url: resolvePostAttachmentMediaUrl(file),
                                          thumbnailUrl: resolvePostAttachmentPosterUrl(file),
                                          name: file?.name || file?.originalName || file?.filename,
                                          mimeType: file?.mimeType || file?.mime_type
                                        }}
                                        videoElement={videoElement}
                                      />
                                    )}
                                  />
                                </div>
                              ) : isImage(file.mimeType) ? (
                                <button
                                  type="button"
                                  onClick={() => handlePostMediaPrimaryAction(post, file)}
                                  onDoubleClick={(event) => onPostMediaDoubleClick(event, post, mediaKey)}
                                  onTouchEnd={(event) => onPostMediaTouchEnd(event, post, mediaKey)}
                                  className="block h-[17.5rem] w-full text-left sm:h-[20rem]"
                                >
                                  <OptimizedImage
                                    src={resolvePostAttachmentMediaUrl(file)}
                                    fallbackSrc={resolvePostAttachmentPosterUrl(file)}
                                    alt={file.name || 'Attachment'}
                                    width={640}
                                    height={400}
                                    sizes="(max-width: 768px) 100vw, 640px"
                                    className="h-[17.5rem] w-full object-cover sm:h-[20rem]"
                                    loading="lazy"
                                    decoding="async"
                                  />
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
                <div id="mobile-member-home-people-suggestions">
                  <SuggestedCard data={{ kind: 'people', title: 'Suggested people', items: suggestedPeople.map((p) => ({ ...p, name: p.name, username: p.username, avatarUrl: p.avatarUrl, targetType: 'user' })) }} />
                </div>
              ) : null}

              {idx === 5 && showPagesCard ? (
                <div id="mobile-member-home-page-suggestions">
                  <SuggestedCard data={{ kind: 'pages', title: 'Suggested pages', items: suggestedPages.map((p) => ({ ...p, name: p.name, username: p.username, avatarUrl: p.avatarUrl, targetType: 'page' })) }} />
                </div>
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

        {renderedPostCount < posts.length ? (
          <div className="py-3 text-center text-xs font-medium text-slate-500">
            Scroll to reveal more posts.
          </div>
        ) : !cursor ? (
          <div className="py-6 text-center text-xs text-slate-500">You're all caught up.</div>
        ) : null}
      </div>

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
