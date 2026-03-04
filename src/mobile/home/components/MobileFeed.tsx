import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2Icon as Loader2,
  MoreVerticalIcon as MoreVertical,
  ShieldCheckIcon as ShieldCheck
} from '../../../components/icons/ShellIcons';
import { Link, useNavigate } from 'react-router-dom';

import { useSocket } from '../../../context/SocketContext';
import { useUser } from '../../../context/UserContext';
import { CommunityService } from '../../../services/community';
import { ReactionsService } from '../../../services/reactions';
import { jobsApi, Job } from '../../../services/jobs';
import { gigsApi, Gig } from '../../../services/gigs';
import { RecoService } from '../../../services/reco';
import { MessagingService } from '../../../services/messaging';
import MentionText from '../../../community/components/MentionText';
import PostEngagementBar from '../../../community/components/PostEngagementBar';
import FollowButton from '../../../community/components/FollowButton';
import PostOptionsButton from '../../../community/components/post-options/PostOptionsButton';
import VerifiedBadge from '../../../components/common/VerifiedBadge';
import InlineAutoplayVideo from '../../../components/media/InlineAutoplayVideo';
import { resolveVerificationLevel } from '../../../utils/verification';
import FeedAdCard from './FeedAdCard';
import RecommendedListingCard from './RecommendedListingCard';
import SuggestedCard from './SuggestedCard';
import { usePerformanceProfile } from '../../../hooks/usePerformanceProfile';

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

export default function MobileFeed({ settings }: { settings?: MobileHomeLayoutSettings | null }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isConnected } = useSocket();
  const { profile } = usePerformanceProfile();

  const feedSettings = settings?.feed ?? {};
  const postCardSettings = settings?.postCard ?? {};
  const composerSettings = ((settings as any)?.postComposer || (settings as any)?.post_composer || {}) as Record<string, any>;
  const graphicWarningEnabled = composerSettings.graphicWarningEnabled !== false;
  const graphicWarningLabel = String(composerSettings.graphicWarningLabel || composerSettings.graphic_warning_label || 'Graphic warning').trim() || 'Graphic warning';
  const graphicWarningBlurMedia = composerSettings.graphicWarningBlurMedia !== false;
  const showRecommendedGigsJobs = feedSettings.showRecommendedGigsJobs !== false;
  const [isConstrainedConnection, setIsConstrainedConnection] = useState<boolean>(() => isConstrainedNetwork());
  const constrainedForFeed = isConstrainedConnection || profile.lowBandwidth || profile.dataSaver;
  const listingCardEveryPosts = clamp(Number((feedSettings as any).listingCardEveryPosts ?? 2) || 2, 1, 6);
  const maxListingCardsPerFeed = clamp(Number((feedSettings as any).maxListingCardsPerFeed ?? 8) || 8, 1, 16);
  const listingPoolLimit = Math.max(
    constrainedForFeed ? 4 : 8,
    maxListingCardsPerFeed * (constrainedForFeed ? 2 : 3)
  );

  const promotedFrequency = clamp(Number(feedSettings.promotedFrequency ?? 6) || 6, 2, 20);

  const [posts, setPosts] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insightCollapsedByPost, setInsightCollapsedByPost] = useState<Record<string, boolean>>({});
  const [revealedGraphic, setRevealedGraphic] = useState<Record<string, boolean>>({});

  const [ads, setAds] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState<Array<{ slug: string; label: string; count?: number }>>([]);
  const [suggestedPeople, setSuggestedPeople] = useState<any[]>([]);
  const [suggestedPages, setSuggestedPages] = useState<any[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<Job[]>([]);
  const [recommendedGigs, setRecommendedGigs] = useState<Gig[]>([]);
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

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreArmedRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const loadInFlightRef = useRef(false);
  const rateLimitUntilRef = useRef<number>(0);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const viewTrackedRef = useRef<Set<string>>(new Set());
  const postMediaTapTimersRef = useRef<Record<string, number>>({});
  const postMediaLastTapAtRef = useRef<Record<string, number>>({});

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
      const targetAvatar = payload.kind === 'jobs' ? item?.clientAvatar : item?.freelancerAvatar;

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

  const openPostDetail = useCallback(
    (postId: string) => {
      const id = String(postId || '').trim();
      if (!id) return;
      navigate(`/post/${encodeURIComponent(id)}`);
    },
    [navigate]
  );

  const openPostFromText = useCallback(
    (event: React.MouseEvent<HTMLElement>, postId: string) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, input, textarea, select, label, video, audio')) return;
      openPostDetail(postId);
    },
    [openPostDetail]
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

  const queueOpenPostFromMediaTap = useCallback(
    (postId: string, mediaKey: string) => {
      const timerKey = `${postId}:${mediaKey}`;
      const existing = postMediaTapTimersRef.current[timerKey];
      if (existing) window.clearTimeout(existing);
      postMediaTapTimersRef.current[timerKey] = window.setTimeout(() => {
        delete postMediaTapTimersRef.current[timerKey];
        openPostDetail(postId);
      }, 220);
    },
    [openPostDetail]
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

    try {
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const feedLimit = Math.max(6, Math.min(24, Number(profile.feedPageSize || (constrainedForFeed ? 8 : 12))));
      const resp = await CommunityService.getFeed({
        cursor: mode === 'more' ? cursorRef.current || undefined : undefined,
        limit: feedLimit,
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
  }, [constrainedForFeed, profile.feedPageSize]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (feedSettings.showPromoted === false) return;
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
  }, [feedSettings.showPromoted, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (!showRecommendedGigsJobs || !user?.id) {
      setRecommendedJobs([]);
      setRecommendedGigs([]);
      return;
    }
    if (loading || error) return;
    let cancelled = false;
    const requestLimit = Math.max(4, Math.min(24, listingPoolLimit));
    const timer = window.setTimeout(() => {
      const jobRequests: Array<Promise<any>> = [
        jobsApi.getJobs({ status: 'active', limit: requestLimit, featuredOnly: true }),
        jobsApi.getJobs({ status: 'active', limit: requestLimit, recommended: true }),
        jobsApi.getJobs({ status: 'active', limit: requestLimit })
      ];
      const gigRequests: Array<Promise<any>> = [
        gigsApi.getGigs({ status: 'active', limit: requestLimit, featuredOnly: true }),
        gigsApi.getGigs({ status: 'active', limit: requestLimit, recommended: true }),
        gigsApi.getGigs({ status: 'active', limit: requestLimit })
      ];
      if (!constrainedForFeed) {
        jobRequests.push(jobsApi.getJobs({ status: 'active', limit: requestLimit, random: true }));
        gigRequests.push(gigsApi.getGigs({ status: 'active', limit: requestLimit, random: true }));
      }

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

          setRecommendedJobs(jobsList);
          setRecommendedGigs(gigsList);
        })
        .catch(() => {
          if (cancelled) return;
          setRecommendedJobs([]);
          setRecommendedGigs([]);
        });
    }, 1100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showRecommendedGigsJobs, user?.id, loading, error, listingPoolLimit, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showTrendingTags === false) return;
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
  }, [feedSettings.showTrendingTags, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showSuggestedPeople === false) return;
    if (!user?.id) return;
    if (constrainedForFeed) {
      setSuggestedPeople([]);
      return;
    }
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
              const avatarUrl = account?.avatar || p?.avatar || null;
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
  }, [feedSettings.showSuggestedPeople, user?.id, loading, error, constrainedForFeed]);

  useEffect(() => {
    if (feedSettings.showSuggestedPages === false) return;
    if (!user?.id) return;
    if (constrainedForFeed) {
      setSuggestedPages([]);
      return;
    }
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
              const avatarUrl = account?.avatar || p?.avatar || null;
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
  }, [feedSettings.showSuggestedPages, user?.id, loading, error, constrainedForFeed]);

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
    if (!user?.id || !posts.length) return;
    if (constrainedForFeed) return;
    if (loading || error) return;

    const pending = posts
      .map((p) => String(p?.id || '').trim())
      .filter(Boolean)
      .filter((id) => !viewTrackedRef.current.has(id))
      .slice(0, 4);

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
  }, [posts, user?.id, loading, error, constrainedForFeed]);

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
          const isLong = content.length > 240;
          const isExpanded = Boolean(expanded[postId]);
          const visibleText = isLong && !isExpanded ? `${content.slice(0, 240).trim()}...` : content;

          const commentCount = post?.interactions?.comments ?? 0;
          const reactionCounts = post?.interactions?.reactions ?? {};

          const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
          const showMedia = postCardSettings.mediaPreviewEnabled !== false;

          const hasGraphicWarning = Boolean(post?.graphicWarning) && graphicWarningEnabled;
          const shouldBlurMedia = hasGraphicWarning && graphicWarningBlurMedia && !revealedGraphic[postId];

          const showHashtags = postCardSettings.hashtagsEnabled !== false;
          const tags = Array.isArray(post?.tags) ? post.tags : [];
          const aiInsightText = String(post?.aiInsightText ?? post?.ai_insight_text ?? '').trim();
          const hasAiInsight = Boolean(
            (post?.aiInsightGenerated ?? post?.ai_insight_generated ?? false) && aiInsightText
          );

          return (
            <React.Fragment key={postId || `post_${idx}`}>
              <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      to={profileUrl}
                      className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100"
                      aria-label={`View ${authorName} profile`}
                    >
                      {authorAvatar ? (
                        <img
                          src={authorAvatar}
                          alt={authorName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                    </Link>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          to={profileUrl}
                          className="min-w-0 text-sm font-semibold text-slate-900 break-words [overflow-wrap:anywhere] hover:text-slate-700"
                        >
                          {authorName}
                        </Link>
                        {verificationLevel ? <VerifiedBadge size={16} level={verificationLevel} className="ml-1" /> : null}
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
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span>{relativeTime(createdAt) || 'now'}</span>
                        {post?.visibility ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {String(post.visibility).toUpperCase()}
                          </span>
                        ) : null}
                        {hasGraphicWarning ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            {graphicWarningLabel}
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
                        className="h-9 border-slate-200 bg-white px-3 text-blue-700 hover:bg-blue-50"
                      />
                    ) : null}

                    <PostOptionsButton
                      post={post}
                      icon={<MoreVertical className="h-4 w-4" />}
                      buttonClassName="rounded-full border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
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

                <div className="mt-3 space-y-2">
                  {post?.title ? (
                    <button
                      type="button"
                      onClick={() => openPostDetail(postId)}
                      className="text-left text-base font-semibold text-slate-900 break-words [overflow-wrap:anywhere] hover:text-blue-700 hover:underline"
                    >
                      {post.title}
                    </button>
                  ) : null}
                  <div
                    className="cursor-pointer text-sm text-slate-700 break-words [overflow-wrap:anywhere]"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => openPostFromText(event, postId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openPostDetail(postId);
                      }
                    }}
                  >
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
                          className="max-w-full break-all rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                        >
                          #{tag}
                        </a>
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
                        <span className="max-w-full break-words rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600 [overflow-wrap:anywhere]">
                          Topic: {String(post.topic)}
                        </span>
                      ) : null}
                      {post?.location ? (
                        <span className="max-w-full break-words rounded-full bg-slate-50 px-3 py-1 font-semibold text-slate-600 [overflow-wrap:anywhere]">
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
                              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                            >
                              {isVideo(file.mimeType) ? (
                                <InlineAutoplayVideo
                                  src={file.url}
                                  poster={file.thumbnailUrl || undefined}
                                  className="h-56 w-full object-cover"
                                  controls
                                  autoplayEnabled={profile.autoplayEnabled}
                                  preload="metadata"
                                  onDoubleTapLike={() => {
                                    void triggerPostDoubleTapLike(post);
                                  }}
                                />
                              ) : isImage(file.mimeType) ? (
                                <button
                                  type="button"
                                  onClick={() => queueOpenPostFromMediaTap(postId, mediaKey)}
                                  onDoubleClick={(event) => onPostMediaDoubleClick(event, post, mediaKey)}
                                  onTouchEnd={(event) => onPostMediaTouchEnd(event, post, mediaKey)}
                                  className="block h-56 w-full text-left"
                                >
                                  <img
                                    src={file.url}
                                    alt={file.name || 'Attachment'}
                                    className="h-56 w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </button>
                              ) : (
                                <a
                                  href={file.url}
                                  className="block p-4 text-sm font-semibold text-slate-700 hover:underline"
                                >
                                  {file.name || file.url}
                                </a>
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
