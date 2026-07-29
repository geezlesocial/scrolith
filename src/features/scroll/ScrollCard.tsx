import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Clapperboard,
  Link2,
  ListVideo,
  Volume2,
  VolumeX,
  MessageCircle,
  Repeat2,
  Send,
  Coins,
  Flag,
  Sparkles,
  Pencil,
  Trash2,
  MoreHorizontal,
  Maximize2
} from 'lucide-react';
import { ScrollService, type ScrollEngagementType, type ScrollVideo } from '../../services/scroll';
import ContentOfferTags from '../../components/commerce/ContentOfferTags';
import ReactionBar from '../../community/components/ReactionBar';
import FollowButton from '../../community/components/FollowButton';
import { ReactionsService, type ReactionTargetType } from '../../services/reactions';
import { useUser } from '../../context/UserContext';
import { resolveInlineMedia } from '../../utils/inlineMedia';
import GraphicWarningGate from '../../components/media/GraphicWarningGate';
import OverlayActionRailButton from '../../components/media/OverlayActionRailButton';
import OptimizedImage from '../../components/media/OptimizedImage';
import VideoCaptionOverlay from '../../components/media/VideoCaptionOverlay';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';
import ContentInterestSurvey from '../../components/recommendation/ContentInterestSurvey';
import ReactionReactorsModal from '../../community/components/ReactionReactorsModal';
import ReactionSummaryButton from '../../community/components/ReactionSummaryButton';
import {
  clearScrollResumePosition,
  estimateBufferHealth,
  readScrollResumePosition,
  resolveScrollPreloadMode,
  saveScrollResumePosition,
  shouldAttemptAutoplay,
  type ScrollNetworkClass
} from '../../utils/scrollPlayerEngine';
import {
  createLearningEvent,
  mapLearningToEngageType,
  shouldEmitOnceKey,
  type ScrollLearningSignalType
} from '../../utils/scrollLearningEngine';

type ScrollCardProps = {
  scroll: ScrollVideo;
  isActive: boolean;
  /** Neighbor card (prefetch window) */
  isNeighbor?: boolean;
  autoplayEnabled: boolean;
  autoAdvanceOnEnd?: boolean;
  playbackBlocked?: boolean;
  muted: boolean;
  dataSaver?: boolean;
  networkClass?: ScrollNetworkClass;
  onToggleMute: () => void;
  onRequestNext?: () => Promise<void> | void;
  onEngage: (scrollId: string, type: ScrollEngagementType, payload?: { watchedSeconds?: number }) => Promise<void> | void;
  onComment: (scroll: ScrollVideo) => Promise<void> | void;
  onShareToStory: (scroll: ScrollVideo) => Promise<void> | void;
  onRepost: (scroll: ScrollVideo) => Promise<void> | void;
  onDash: (scroll: ScrollVideo) => Promise<void> | void;
  onSend: (scroll: ScrollVideo) => Promise<void> | void;
  onReport: (scroll: ScrollVideo) => Promise<void> | void;
  onEdit: (scroll: ScrollVideo) => Promise<void> | void;
  onDelete: (scroll: ScrollVideo) => Promise<void> | void;
  onRemix: (scroll: ScrollVideo, mode?: 'remix' | 'duet') => Promise<void> | void;
  onOpenSeries: (seriesId: string, scrollId?: string) => Promise<void> | void;
  headlinePreviewLimit?: number;
  descriptionPreviewLimit?: number;
  interestSurveyEnabled?: boolean;
  initialIsFollowing?: boolean;
  reactionTargetType?: ReactionTargetType;
  reactionTargetId?: string;
};

const authorInitial = (name?: string | null) => String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
const formatGcoin = (value: number) => {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(safe >= 10000 ? 0 : 1)}K`;
  return `${safe}`;
};

const DEFAULT_ALLOWED_REACTIONS = [
  { key: 'like', label: 'Like', emoji: '\u{1F44D}', enabled: true },
  { key: 'love', label: 'Love', emoji: '\u2764\uFE0F', enabled: true },
  { key: 'good', label: 'Good', emoji: '\u2705', enabled: true },
  { key: 'happy', label: 'Happy', emoji: '\u{1F604}', enabled: true },
  { key: 'handwave', label: 'Handwave', emoji: '\u{1F44B}', enabled: true },
  { key: 'angry', label: 'Angry', emoji: '\u{1F621}', enabled: true },
  { key: 'cry', label: 'Cry', emoji: '\u{1F622}', enabled: true },
  { key: 'mad', label: 'Mad', emoji: '\u{1F92C}', enabled: true },
  { key: 'sorry', label: 'Sorry', emoji: '\u{1F64F}', enabled: true }
];

// Cinematic: chrome recedes quickly so the video stays primary on touch devices.
const TOUCH_CONTROL_HIDE_DELAY_MS = 4200;
const DESKTOP_CONTROL_HIDE_DELAY_MS = 2800;

const resolveScrollAuthorAvatar = (scroll: ScrollVideo) =>
  resolvePostAttachmentMediaUrl({
    url:
      scroll?.author?.avatarUrl ||
      scroll?.author?.avatar ||
      scroll?.author?.photo ||
      '',
    fileId:
      (scroll as any)?.author?.avatarFileId ||
      (scroll as any)?.author?.avatar_file_id ||
      ''
  });

const resolveScrollAuthorProfileUrl = (scroll: ScrollVideo) => {
  const companySlug = String(
    (scroll as any)?.author?.businessSlug ||
      (scroll as any)?.author?.companySlug ||
      (scroll as any)?.author?.pageSlug ||
      ''
  ).trim();
  if (companySlug) return `/company/${encodeURIComponent(companySlug)}`;

  const username = String(scroll?.author?.username || '').trim().replace(/^@+/, '');
  if (username) return `/u/${encodeURIComponent(username)}`;

  const authorId = String(scroll?.author?.id || '').trim();
  if (authorId) return `/profile/${encodeURIComponent(authorId)}`;
  return null;
};

const ScrollCard: React.FC<ScrollCardProps> = ({
  scroll,
  isActive,
  isNeighbor = false,
  autoplayEnabled,
  autoAdvanceOnEnd = false,
  playbackBlocked = false,
  muted,
  dataSaver = false,
  networkClass,
  onToggleMute,
  onRequestNext,
  onEngage,
  onComment,
  onShareToStory,
  onRepost,
  onDash,
  onSend,
  onReport,
  onEdit,
  onDelete,
  onRemix,
  onOpenSeries,
  interestSurveyEnabled = false,
  initialIsFollowing,
  reactionTargetType = 'SCROLL',
  reactionTargetId
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const marksRef = useRef<Record<string, boolean>>({});
  const learningMarksRef = useRef<Record<string, boolean>>({});
  const mediaGestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const mediaLastTapAtRef = useRef(0);
  const controlsHideTimerRef = useRef<number | null>(null);
  const ownerMenuRef = useRef<HTMLDivElement | null>(null);
  const resumeAfterPlaybackBlockRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const lastSeekEmitRef = useRef(0);
  const replayCountRef = useRef(0);
  const [graphicRevealed, setGraphicRevealed] = useState(false);
  const [touchOverlayMode, setTouchOverlayMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [bufferHealth, setBufferHealth] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [mediaReloadToken, setMediaReloadToken] = useState(0);
  const [activeMediaSourceIndex, setActiveMediaSourceIndex] = useState(0);
  const [interestSignal, setInterestSignal] = useState<string | null>(scroll.viewer?.feedbackSignal || null);
  const media = resolveInlineMedia(scroll?.media || scroll, { typeHint: 'video' });
  const mediaSourceCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [media.src, media.fallbackSrc]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }, [media.fallbackSrc, media.src]);
  const mediaUrl = mediaSourceCandidates[activeMediaSourceIndex] || mediaSourceCandidates[0] || '';
  const playbackSrc = (() => {
    const raw = String(mediaUrl || '').trim();
    if (!raw) return '';
    if (mediaReloadToken <= 0) return raw;
    if (/^(blob:|data:)/i.test(raw)) return raw;
    return `${raw}${raw.includes('?') ? '&' : '?'}_r=${mediaReloadToken}`;
  })();
  const safePoster =
    media.poster && !/__video_fallback_thumbnail|video_fallback/i.test(String(media.poster))
      ? media.poster
      : undefined;

  useEffect(() => {
    setMediaError(false);
    setMediaReloadToken(0);
    setActiveMediaSourceIndex(0);
  }, [media.fallbackSrc, media.src, scroll.id]);
  const preloadMode = resolveScrollPreloadMode({
    isActive,
    isNeighbor,
    autoplayEnabled,
    dataSaver,
    networkClass
  });

  const emitLearning = useCallback(
    async (type: ScrollLearningSignalType, value?: number) => {
      const scrollId = String(scroll.id || '').trim();
      if (!scrollId) return;
      const onceKey = `${type}:${scrollId}`;
      // Allow multi-fire for seek/watch_duration; once for discrete actions
      if (type !== 'seek' && type !== 'watch_duration' && type !== 'pause' && type !== 'resume_play') {
        if (!shouldEmitOnceKey(learningMarksRef.current, onceKey)) return;
      }
      createLearningEvent(scrollId, type, value);
      const engageType = mapLearningToEngageType(type);
      if (!engageType) return;
      try {
        await onEngage(scrollId, engageType as ScrollEngagementType, {
          watchedSeconds: value
        });
      } catch {
        /* non-blocking learning */
      }
    },
    [onEngage, scroll.id]
  );
  const authorName = scroll.author?.name || 'Community member';
  const authorAvatar = resolveScrollAuthorAvatar(scroll);
  const authorProfileUrl = resolveScrollAuthorProfileUrl(scroll);
  const description = String(scroll.description || '').trim();
  const title = String(scroll.title || '').trim();
  const captionLine = description;
  const dashGcoinTotal = Number(scroll.dashGcoinTotal ?? scroll.metrics?.dashGcoinTotal ?? 0);
  const tagCount = Array.isArray(scroll.tags) ? scroll.tags.length : 0;
  const sourceHeadline = String(scroll.sourceScroll?.title || scroll.sourceScroll?.description || '').trim();
  const series = Array.isArray(scroll.series) ? scroll.series : [];
  // Client-side ownership fallback when API flags are missing (deep links / stale payloads).
  const isPostBridge = Boolean(scroll.bridgeSource?.type === 'post' || String(scroll.id || '').startsWith('post-video:'));
  const isOwner =
    Boolean(user?.id) &&
    !isPostBridge &&
    (String(scroll.authorId || scroll.author?.id || '').trim() === String(user?.id || '').trim() ||
      Boolean(scroll.canEdit) ||
      Boolean(scroll.canDelete));
  const canEditScroll = Boolean(scroll.canEdit) || isOwner;
  const canDeleteScroll = Boolean(scroll.canDelete) || isOwner;
  const hasOwnerActions = canEditScroll || canDeleteScroll;
  const overlayControlsVisible = controlsVisible || ownerMenuOpen;
  const reactionInitialCounts = useMemo(
    () => (Number(scroll.metrics?.likes || 0) > 0 ? { like: Number(scroll.metrics.likes || 0) } : undefined),
    [scroll.metrics?.likes]
  );
  const [scrollReactionCounts, setScrollReactionCounts] = useState<Record<string, number>>(reactionInitialCounts || {});
  const [scrollAllowedReactions, setScrollAllowedReactions] = useState(DEFAULT_ALLOWED_REACTIONS);
  const [scrollReactorsOpen, setScrollReactorsOpen] = useState(false);
  const rightActions = useMemo(
    () => [
      {
        key: 'comment',
        label: 'Comment',
        icon: MessageCircle,
        count: Number(scroll.metrics?.comments || 0),
        countSuffix: undefined,
        onClick: () => onComment(scroll)
      },
      {
        key: 'repost',
        label: 'Repost',
        icon: Repeat2,
        count: Number(scroll.metrics?.reposts || 0),
        countSuffix: undefined,
        onClick: () => onRepost(scroll)
      },
      {
        key: 'dash',
        label: 'Dash',
        icon: Coins,
        count: dashGcoinTotal,
        countSuffix: 'GC',
        onClick: () => onDash(scroll)
      },
      {
        key: 'send',
        label: 'Send',
        icon: Send,
        count: Number(scroll.metrics?.sends || 0),
        countSuffix: undefined,
        onClick: () => onSend(scroll)
      }
    ],
    [dashGcoinTotal, onComment, onDash, onRepost, onSend, scroll]
  );

  useEffect(() => {
    marksRef.current = {};
    learningMarksRef.current = {};
    resumeAppliedRef.current = false;
    replayCountRef.current = 0;
    setBufferHealth(0);
  }, [scroll.id]);

  useEffect(() => {
    setScrollReactionCounts(reactionInitialCounts || {});
  }, [reactionInitialCounts, reactionTargetId, scroll.id]);

  useEffect(() => {
    setGraphicRevealed(false);
  }, [scroll.id]);

  useEffect(() => {
    setInterestSignal(scroll.viewer?.feedbackSignal || null);
  }, [scroll.id, scroll.viewer?.feedbackSignal]);

  useEffect(() => {
    const targetId = String(reactionTargetId || scroll.id || '').trim();
    if (!targetId) return;
    let active = true;
    ReactionsService.getSummary(reactionTargetType, targetId)
      .then((summary) => {
        if (!active || !summary) return;
        setScrollReactionCounts(summary.counts || {});
        if (Array.isArray(summary.allowed) && summary.allowed.length) {
          setScrollAllowedReactions(summary.allowed);
        }
      })
      .catch((error: any) => {
        const status = Number(error?.response?.status || 0);
        if (status && status !== 401 && status !== 403 && status !== 404) {
          console.warn('Failed to load scroll reaction summary', error);
        }
      });
    return () => {
      active = false;
    };
  }, [reactionTargetId, reactionTargetType, scroll.id]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const raw = (event as CustomEvent).detail;
      const detail = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      if (!detail) return;
      if (String(detail.targetType || '').toUpperCase() !== String(reactionTargetType)) return;
      const targetId = String(reactionTargetId || scroll.id || '').trim();
      const eventTargetId = String(detail.targetId || detail.scrollId || '').trim();
      if (!targetId || eventTargetId !== targetId) return;
      if (detail.counts && typeof detail.counts === 'object' && !Array.isArray(detail.counts)) {
        setScrollReactionCounts(detail.counts as Record<string, number>);
      }
    };
    window.addEventListener('reactions:updated', onUpdated as EventListener);
    window.addEventListener('scroll:reaction_updated', onUpdated as EventListener);
    return () => {
      window.removeEventListener('reactions:updated', onUpdated as EventListener);
      window.removeEventListener('scroll:reaction_updated', onUpdated as EventListener);
    };
  }, [reactionTargetId, reactionTargetType, scroll.id]);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
  }, []);

  const resumePlaybackFromGesture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !mediaUrl || !isActive || !autoplayEnabled || playbackBlocked) return;
    video.muted = muted;
    video.playsInline = true;

    const playNow = () => {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => undefined);
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playNow();
      return;
    }

    const playWhenReady = () => {
      video.removeEventListener('loadeddata', playWhenReady);
      video.removeEventListener('canplay', playWhenReady);
      playNow();
    };

    video.addEventListener('loadeddata', playWhenReady);
    video.addEventListener('canplay', playWhenReady);
    try {
      video.load();
    } catch {}
  }, [autoplayEnabled, isActive, mediaUrl, muted, playbackBlocked]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    const syncTouchOverlayMode = () => {
      const nextTouchOverlayMode = Boolean(mediaQuery.matches);
      setTouchOverlayMode(nextTouchOverlayMode);
      setControlsVisible(!nextTouchOverlayMode);
      setOwnerMenuOpen(false);
    };

    syncTouchOverlayMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncTouchOverlayMode);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(syncTouchOverlayMode);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', syncTouchOverlayMode);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(syncTouchOverlayMode);
      }
    };
  }, []);

  useEffect(() => {
    setOwnerMenuOpen(false);
    setControlsVisible(!touchOverlayMode);
  }, [scroll.id, touchOverlayMode]);

  useEffect(() => {
    clearControlsHideTimer();
    if (!autoplayEnabled || !isActive || !controlsVisible || ownerMenuOpen) return;

    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, touchOverlayMode ? TOUCH_CONTROL_HIDE_DELAY_MS : DESKTOP_CONTROL_HIDE_DELAY_MS);

    return clearControlsHideTimer;
  }, [autoplayEnabled, clearControlsHideTimer, controlsVisible, isActive, ownerMenuOpen, touchOverlayMode]);

  useEffect(() => clearControlsHideTimer, [clearControlsHideTimer]);

  useEffect(() => {
    if (!ownerMenuOpen) return;

    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      if (ownerMenuRef.current?.contains(event.target as Node)) return;
      setOwnerMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOwnerMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [ownerMenuOpen]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyResumeIfNeeded = () => {
      if (resumeAppliedRef.current || !isActive) return;
      const saved = readScrollResumePosition(scroll.id);
      if (saved == null) return;
      try {
        if (Number.isFinite(video.duration) && video.duration > 0 && saved < video.duration - 0.5) {
          video.currentTime = saved;
          resumeAppliedRef.current = true;
        }
      } catch {
        /* ignore seek failures */
      }
    };

    const tryPlay = () => {
      if (
        !shouldAttemptAutoplay({
          isActive,
          autoplayEnabled,
          playbackBlocked,
          documentHidden: document.hidden
        })
      ) {
        return;
      }
      applyResumeIfNeeded();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // autoplay failures are expected on some devices until user interaction
        });
      }
    };

    video.muted = muted;
    video.playsInline = true;
    video.loop = !autoAdvanceOnEnd;

    if (!isActive) {
      // Persist resume position when leaving the card
      try {
        saveScrollResumePosition(scroll.id, Number(video.currentTime || 0), Number(video.duration || 0));
      } catch {
        /* ignore */
      }
      video.pause();
      // Keep position for resume; do not force to 0 (enterprise resume behavior)
      return;
    }

    if (!autoplayEnabled) {
      video.pause();
      return;
    }

    if (playbackBlocked) {
      resumeAfterPlaybackBlockRef.current = !video.paused;
      video.pause();
      return;
    }

    tryPlay();
    video.addEventListener('loadedmetadata', tryPlay);
    video.addEventListener('canplay', tryPlay);

    return () => {
      video.removeEventListener('loadedmetadata', tryPlay);
      video.removeEventListener('canplay', tryPlay);
    };
  }, [autoAdvanceOnEnd, autoplayEnabled, isActive, muted, playbackBlocked, scroll.id]);

  // Phase 23 — learning: mute / unmute transitions (skip first paint)
  const prevMutedRef = useRef(muted);
  useEffect(() => {
    if (!isActive) {
      prevMutedRef.current = muted;
      return;
    }
    if (prevMutedRef.current === muted) return;
    prevMutedRef.current = muted;
    void emitLearning(muted ? 'mute' : 'unmute');
  }, [muted, isActive, emitLearning]);

  // Phase 23 — buffer health pulse (active only)
  useEffect(() => {
    if (!isActive) return;
    const tick = () => {
      setBufferHealth(estimateBufferHealth(videoRef.current));
    };
    tick();
    const id = window.setInterval(tick, 1200);
    return () => window.clearInterval(id);
  }, [isActive, scroll.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive || !autoplayEnabled || playbackBlocked) return;
    if (!resumeAfterPlaybackBlockRef.current || document.hidden) return;
    resumeAfterPlaybackBlockRef.current = false;
    video.muted = muted;
    video.playsInline = true;
    void video.play().catch(() => undefined);
  }, [autoplayEnabled, isActive, muted, playbackBlocked, scroll.id]);

  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) {
        video.pause();
        return;
      }
      if (isActive && autoplayEnabled && !playbackBlocked) {
        void video.play().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [autoplayEnabled, isActive, playbackBlocked]);

  const handleVideoEnded = useCallback(() => {
    if (!isActive) return;
    clearScrollResumePosition(scroll.id);
    void emitLearning('completion');
    replayCountRef.current += 1;
    if (replayCountRef.current > 1) {
      void emitLearning('replay');
    }
    if (!autoAdvanceOnEnd) return;
    void onRequestNext?.();
  }, [autoAdvanceOnEnd, emitLearning, isActive, onRequestNext, scroll.id]);

  const handleTimeUpdate = async () => {
    if (!isActive || !videoRef.current) return;
    const current = Number(videoRef.current.currentTime || 0);
    const duration = Number(videoRef.current.duration || 0);

    const once = async (key: string, type: ScrollEngagementType, payload?: { watchedSeconds?: number }) => {
      if (marksRef.current[key]) return;
      marksRef.current[key] = true;
      await onEngage(scroll.id, type, payload);
    };

    if (current >= 2) await once('impression', 'impression', { watchedSeconds: current });
    if (current >= 3) await once('view_3s', 'view_3s');
    if (current >= 10) await once('view_10s', 'view_10s');
    if (duration > 0) {
      const ratio = current / duration;
      if (ratio >= 0.25) await once('view_25', 'view_25');
      if (ratio >= 0.5) await once('view_50', 'view_50');
      if (ratio >= 0.95) {
        await once('view_95', 'view_95');
        void emitLearning('completion', current);
      }
    }
    // Periodic watch_duration learning (throttled via once marks per 15s bucket)
    if (current >= 15) {
      const bucket = Math.floor(current / 15);
      const key = `learn_watch_${bucket}`;
      if (shouldEmitOnceKey(learningMarksRef.current, key)) {
        void emitLearning('watch_duration', current);
      }
    }
  };

  const handlePause = useCallback(() => {
    if (!isActive) return;
    void emitLearning('pause');
    const video = videoRef.current;
    if (video) {
      saveScrollResumePosition(scroll.id, Number(video.currentTime || 0), Number(video.duration || 0));
    }
  }, [emitLearning, isActive, scroll.id]);

  const handlePlay = useCallback(() => {
    if (!isActive) return;
    void emitLearning('resume_play');
    void emitLearning('watch_started');
  }, [emitLearning, isActive]);

  const handleSeeked = useCallback(() => {
    if (!isActive) return;
    const now = Date.now();
    if (now - lastSeekEmitRef.current < 1500) return;
    lastSeekEmitRef.current = now;
    const video = videoRef.current;
    void emitLearning('seek', Number(video?.currentTime || 0));
  }, [emitLearning, isActive]);

  const handleExpand = async () => {
    const container = rootRef.current;
    if (!container) return;
    const anyContainer = container as any;
    const anyDocument = document as any;
    if (document.fullscreenElement) {
      await document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    await (anyContainer.requestFullscreen?.() ||
      anyContainer.webkitRequestFullscreen?.() ||
      anyContainer.msRequestFullscreen?.() ||
      Promise.resolve()).catch(() => undefined);
    if (!anyDocument.fullscreenElement && isActive && videoRef.current) {
      void videoRef.current.play().catch(() => undefined);
    }
  };

  const triggerDoubleTapLike = useCallback(async () => {
    const targetId = String(reactionTargetId || scroll?.id || '').trim();
    if (!targetId) return;
    if (!user?.id) {
      if (confirm('Log in to like scroll videos?')) window.location.href = '/auth/login';
      return;
    }
    try {
      const summary = await ReactionsService.react(reactionTargetType, targetId, 'like');
      window.dispatchEvent(
        new CustomEvent('reactions:updated', {
          detail: {
            targetType: reactionTargetType,
            targetId,
            counts: summary?.counts || {},
            userReaction: summary?.userReaction || null,
            actorUserId: user.id
          }
        })
      );
    } catch (error) {
      console.error('Failed to apply scroll double-tap like', error);
    }
  }, [reactionTargetId, reactionTargetType, scroll?.id, user?.id]);

  const mediaFilterStyle = useMemo(() => {
    const strength = Math.max(0, Math.min(100, Number(scroll.filterStrength ?? 60))) / 100;
    const preset = String(scroll.filterPreset || 'none').toLowerCase();
    if (!preset || preset === 'none') return { filter: 'none' } as React.CSSProperties;
    if (preset === 'bw') return { filter: `grayscale(${0.4 + strength * 0.6})` } as React.CSSProperties;
    if (preset === 'sepia') return { filter: `sepia(${0.3 + strength * 0.7})` } as React.CSSProperties;
    if (preset === 'warm')
      return {
        filter: `saturate(${1 + strength * 0.35}) contrast(${1 + strength * 0.08}) brightness(${1 + strength * 0.08})`
      } as React.CSSProperties;
    if (preset === 'vibrant')
      return {
        filter: `saturate(${1.2 + strength * 0.6}) contrast(${1 + strength * 0.2})`
      } as React.CSSProperties;
    if (preset === 'cinematic')
      return {
        filter: `contrast(${1.1 + strength * 0.2}) saturate(${0.85 + strength * 0.2}) brightness(${0.9 + strength * 0.08})`
      } as React.CSSProperties;
    return { filter: 'none' } as React.CSSProperties;
  }, [scroll.filterPreset, scroll.filterStrength]);

  const showInterestSurvey =
    interestSurveyEnabled &&
    isActive &&
    Boolean(user?.id) &&
    String(scroll.author?.id || '').trim() !== String(user?.id || '').trim();

  const handleInterestSurveySubmit = async (signal: 'INTERESTED' | 'NOT_INTERESTED') => {
    if (!user?.id) {
      throw new Error('Authentication required.');
    }
    if (signal === 'INTERESTED') {
      await ScrollService.interested(scroll.id, { surface: 'scroll_interest_survey' });
    } else {
      await ScrollService.notInterested(scroll.id, { surface: 'scroll_interest_survey' });
    }
    setInterestSignal(signal);
  };

  return (
    <article
      ref={rootRef}
      className="relative h-screen w-full snap-start bg-black text-white overflow-hidden"
      aria-label={`Scroll by ${authorName}`}
      onMouseMove={revealControls}
      onMouseDown={revealControls}
      onTouchStart={(event) => {
        revealControls();
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, select, label')) {
          mediaGestureStartRef.current = null;
          return;
        }
        const touch = event.changedTouches?.[0];
        if (!touch) {
          mediaGestureStartRef.current = null;
          return;
        }
        mediaGestureStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, select, label')) return;
        const start = mediaGestureStartRef.current;
        const touch = event.changedTouches?.[0];
        mediaGestureStartRef.current = null;
        if (!start || !touch) return;
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 18) return;
        const now = Date.now();
        if (mediaLastTapAtRef.current && now - mediaLastTapAtRef.current <= 320) {
          event.preventDefault();
          event.stopPropagation();
          mediaLastTapAtRef.current = 0;
          void triggerDoubleTapLike();
          return;
        }
        mediaLastTapAtRef.current = now;
        // Single tap toggles immersive overlays (chrome) without double-tap like.
        setControlsVisible((prev) => !prev);
        setTouchOverlayMode(true);
        resumePlaybackFromGesture();
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, select, label')) return;
        // Desktop single-click also toggles chrome so metadata can recede.
        if (touchOverlayMode) return;
        setControlsVisible((prev) => !prev);
      }}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, select, label')) return;
        event.preventDefault();
        event.stopPropagation();
        void triggerDoubleTapLike();
      }}
    >
      {mediaUrl ? (
        <div className="relative h-full w-full bg-black">
          {media.poster ? (
            <OptimizedImage
              src={media.poster}
              alt=""
              aria-hidden
              width={720}
              height={1280}
              sizes="(max-width: 768px) 100vw, 420px"
              className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-35 scale-110"
            />
          ) : null}
          <GraphicWarningGate
            active={Boolean(scroll.graphicWarning)}
            revealed={graphicRevealed}
            onReveal={() => setGraphicRevealed(true)}
            className="h-full w-full"
            contentClassName="h-full w-full"
          >
            <video
              ref={videoRef}
              src={mediaError ? undefined : playbackSrc}
              className="relative z-0 h-full w-full object-contain"
              style={mediaFilterStyle}
              muted={muted}
              loop={!autoAdvanceOnEnd}
              playsInline
              autoPlay={autoplayEnabled && isActive && !playbackBlocked && !mediaError}
              controls={!autoplayEnabled && !mediaError}
              controlsList={!autoplayEnabled ? 'nodownload' : undefined}
              preload={preloadMode}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onPause={handlePause}
              onPlay={handlePlay}
              onSeeked={handleSeeked}
              onError={() => {
                if (activeMediaSourceIndex + 1 < mediaSourceCandidates.length) {
                  setActiveMediaSourceIndex((index) => index + 1);
                  setMediaError(false);
                  return;
                }
                setMediaError(true);
              }}
              poster={safePoster}
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                if (mediaError) {
                  setMediaError(false);
                  setActiveMediaSourceIndex(0);
                  setMediaReloadToken((token) => token + 1);
                  return;
                }
                setControlsVisible((prev) => !prev);
                setTouchOverlayMode(true);
                resumePlaybackFromGesture();
              }}
            />
            {mediaError ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-300" aria-hidden />
                <p className="text-sm font-semibold text-white">Video unavailable</p>
                <p className="max-w-xs text-xs text-white/70">
                  This media could not be streamed. Retry, or re-upload if the file was lost during a storage outage.
                </p>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMediaError(false);
                    setActiveMediaSourceIndex(0);
                    setMediaReloadToken((token) => token + 1);
                  }}
                  className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
                >
                  Retry playback
                </button>
              </div>
            ) : null}
          </GraphicWarningGate>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-gray-900 text-sm text-gray-300">
          Media unavailable
        </div>
      )}

      {/* Phase 23 — adaptive buffer health (active only, non-intrusive) */}
      {isActive && bufferHealth > 0 && bufferHealth < 0.35 ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium text-white/90"
          role="status"
          aria-live="polite"
        >
          Buffering…
        </div>
      ) : null}

      <div
        className={`pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-transparent to-black/30 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          overlayControlsVisible ? 'opacity-100' : 'opacity-40'
        }`}
      />

      {/* top-14 clears feed Mute/Create header so the name never sits under those controls */}
      <div className="pointer-events-none absolute left-3 right-3 top-14 z-30 flex items-start justify-between gap-2 sm:left-4 sm:right-4 sm:top-16 sm:gap-3">
          {/* Author column — full remaining width under header; name truncates, never under Mute */}
          <div className="pointer-events-auto min-w-0 flex-1 pr-2">
            {authorProfileUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  navigate(authorProfileUrl, { state: { fromMobileHome: true } });
                }}
                className="flex w-full max-w-full items-start gap-2.5 text-left sm:gap-3"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-white/15 ring-2 ring-white/70 overflow-hidden flex items-center justify-center text-sm font-semibold">
                  {authorAvatar ? (
                    <OptimizedImage
                      src={authorAvatar}
                      alt={authorName}
                      width={80}
                      height={80}
                      sizes="40px"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{authorInitial(authorName)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-sm font-semibold leading-tight">{authorName}</p>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-xs text-white/80">{scroll.author?.username ? `@${scroll.author.username}` : 'Scrolith'}</p>
                    {scroll.isAIEnhanced ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-1 text-[10px] font-semibold text-cyan-100 ring-1 ring-cyan-300/40">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    ) : null}
                    {scroll.graphicWarning ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-100 ring-1 ring-amber-300/40">
                        <AlertTriangle className="h-3 w-3" />
                        Graphic warning
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex w-full max-w-full items-start gap-2.5 sm:gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-white/15 ring-2 ring-white/70 overflow-hidden flex items-center justify-center text-sm font-semibold">
                  {authorAvatar ? (
                    <OptimizedImage
                      src={authorAvatar}
                      alt={authorName}
                      width={80}
                      height={80}
                      sizes="40px"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{authorInitial(authorName)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-sm font-semibold leading-tight">{authorName}</p>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-xs text-white/80">{scroll.author?.username ? `@${scroll.author.username}` : 'Scrolith'}</p>
                    {scroll.isAIEnhanced ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-1 text-[10px] font-semibold text-cyan-100 ring-1 ring-cyan-300/40">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    ) : null}
                    {scroll.graphicWarning ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-100 ring-1 ring-amber-300/40">
                        <AlertTriangle className="h-3 w-3" />
                        Graphic warning
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
            <div className="min-w-0">
              <div
                className={`mt-2 transition-all duration-300 ${
                  touchOverlayMode
                    ? overlayControlsVisible
                      ? 'max-h-10 opacity-100'
                      : 'max-h-0 overflow-hidden opacity-0 pointer-events-none'
                    : ''
                }`}
              >
                <FollowButton
                  targetUserId={scroll.author?.id}
                  currentUserId={user?.id}
                  initialIsFollowing={initialIsFollowing}
                  tone="overlay"
                  className="h-7 border-white/15 bg-white/10 px-2.5 text-[11px] text-white shadow-sm backdrop-blur-sm hover:bg-white/20 hover:text-white"
                />
              </div>
              {/* Scroll brand — directly under Follow (enterprise product label) */}
              <div
                className="mt-1.5"
                data-testid="scroll-brand-label"
              >
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/50 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
                  <Clapperboard className="h-3 w-3 text-cyan-200" aria-hidden />
                  <span>Scroll</span>
                </div>
              </div>
            </div>
          </div>

        {/* Right chrome: owner/expand only. Mute is in ScrollFeed header next to Create (no name overlap). */}
        <div
          className={`pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2 transition-all duration-300 ${
            hasOwnerActions || overlayControlsVisible
              ? 'translate-y-0 opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
          data-testid="scroll-top-right-chrome"
        >
          <button
            type="button"
            onClick={() => {
              revealControls();
              void handleExpand();
            }}
            className="hidden h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65 lg:inline-flex"
            aria-label="View fullscreen"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          {hasOwnerActions ? (
            <div ref={ownerMenuRef} className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  revealControls();
                  setOwnerMenuOpen((current) => !current);
                }}
                className="inline-flex h-10 min-w-[40px] items-center justify-center gap-1 rounded-full bg-black/55 px-2.5 text-white ring-1 ring-white/20 transition hover:bg-black/75 sm:min-w-0 sm:px-0 sm:w-10"
                aria-label="Manage your Scroll"
                aria-expanded={ownerMenuOpen}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="pr-1 text-[11px] font-semibold sm:hidden">Manage</span>
              </button>
              {ownerMenuOpen ? (
                <div className="absolute right-0 top-12 z-50 min-w-[200px] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 p-1.5 text-sm text-white shadow-[0_24px_64px_-24px_rgba(15,23,42,0.95)] backdrop-blur-xl">
                  {canEditScroll ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOwnerMenuOpen(false);
                        void onEdit(scroll);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-white/90 transition hover:bg-white/10"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit / update scroll
                    </button>
                  ) : null}
                  {canEditScroll ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOwnerMenuOpen(false);
                        void onEdit(scroll);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-white/90 transition hover:bg-white/10"
                    >
                      <Clapperboard className="h-4 w-4" />
                      Replace video
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerMenuOpen(false);
                      const url = `${window.location.origin}/scroll?scroll=${encodeURIComponent(scroll.id)}`;
                      void navigator.clipboard?.writeText(url).catch(() => undefined);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-white/90 transition hover:bg-white/10"
                  >
                    <Link2 className="h-4 w-4" />
                    Copy link
                  </button>
                  {canDeleteScroll ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOwnerMenuOpen(false);
                        void onDelete(scroll);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-rose-200 transition hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete scroll
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`absolute right-2.5 top-1/2 z-30 pointer-events-auto flex -translate-y-1/2 flex-col items-center gap-1.5 transition-all duration-300 sm:right-3 ${
          overlayControlsVisible ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0 pointer-events-none'
        }`}
      >
        <ReactionBar
          targetType={reactionTargetType}
          targetId={reactionTargetId || scroll.id}
          initialCounts={reactionInitialCounts}
          layout="rail"
          className="w-[60px] sm:w-[68px]"
          compact
          railVariant="launcher"
          railLauncherLabel="Reaction"
        />
        {rightActions.map((action) => {
          const count = Math.max(0, Number(action.count || 0));
          const countLabel = action.countSuffix ? `${formatGcoin(count)} ${action.countSuffix}` : formatGcoin(count);
          return (
            <div key={action.key} className="flex flex-col items-center gap-1">
              <OverlayActionRailButton
                onClick={() => {
                  revealControls();
                  void action.onClick();
                }}
                icon={action.icon}
                label={action.label}
                className="min-h-[42px] min-w-[58px] rounded-[18px] sm:min-h-[46px] sm:min-w-[64px] sm:rounded-2xl"
              />
              {count > 0 ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    revealControls();
                    void action.onClick();
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  className="min-w-9 rounded-full border border-white/12 bg-black/45 px-2 py-0.5 text-center text-[10px] font-bold leading-4 text-white shadow-sm transition hover:bg-black/65"
                  title={`${countLabel} ${action.label.toLowerCase()}`}
                  aria-label={`${countLabel} ${action.label}`}
                >
                  {countLabel}
                </button>
              ) : null}
            </div>
          );
        })}
        <OverlayActionRailButton
          onClick={() => {
            revealControls();
            void onShareToStory(scroll);
          }}
          icon={Sparkles}
          label="Story"
          className="min-h-[42px] min-w-[58px] rounded-[18px] sm:min-h-[46px] sm:min-w-[64px] sm:rounded-2xl"
        />
        <OverlayActionRailButton
          onClick={() => {
            revealControls();
            void onReport(scroll);
          }}
          icon={Flag}
          label="Report"
          danger
          className="min-h-[42px] min-w-[58px] rounded-[18px] sm:min-h-[46px] sm:min-w-[64px] sm:rounded-2xl"
        />
      </div>

      <div
        className={`pointer-events-none absolute inset-x-3 bottom-4 z-20 transition-all duration-300 ease-out motion-reduce:transition-none sm:inset-x-4 sm:bottom-5 ${
          !overlayControlsVisible
            ? 'translate-y-4 opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        } ${overlayControlsVisible ? 'pr-[72px] sm:pr-[88px]' : 'pr-0'}`}
      >
        <div className="w-full max-w-[min(32rem,100%)] space-y-1.5">
          {scroll.sourceScroll ? (
            <div className="pointer-events-auto rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/10 px-2.5 py-2 text-white shadow-[0_14px_34px_-30px_rgba(15,23,42,0.9)] backdrop-blur-[3px]">
              <div className="flex items-start gap-2.5">
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/15 text-fuchsia-100">
                  <Link2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-100/90">
                    {scroll.responseMode === 'duet' ? 'Duet' : 'Remix'}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-sm font-semibold text-white">
                    {scroll.sourceScroll.unavailable ? 'Original unavailable' : sourceHeadline || 'Original Scroll'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <VideoCaptionOverlay text={captionLine} className="max-w-full" />
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/22 px-2.5 py-2 text-white shadow-[0_14px_34px_-30px_rgba(15,23,42,0.88)] backdrop-blur-[3px]">
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/70 sm:text-[11px]">
              {scroll.location ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2 py-0.5">
                  {scroll.location}
                </span>
              ) : null}
              {tagCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2 py-0.5">
                  {tagCount} tag{tagCount === 1 ? '' : 's'}
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2 py-0.5">
                {new Date(scroll.createdAt).toLocaleDateString()}
              </span>
            </div>
            {Object.values(scrollReactionCounts || {}).some((value) => Number(value || 0) > 0) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ReactionSummaryButton
                  counts={scrollReactionCounts}
                  allowed={scrollAllowedReactions}
                  variant="dark"
                  compact
                  className="max-w-full"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    revealControls();
                    setScrollReactorsOpen(true);
                  }}
                />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  revealControls();
                  void onRemix(scroll, 'remix');
                }}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-50 hover:bg-cyan-400/15"
              >
                <Link2 className="h-3.5 w-3.5" />
                Remix
              </button>
              <button
                type="button"
                onClick={() => {
                  revealControls();
                  void onRemix(scroll, 'duet');
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
              >
                <Clapperboard className="h-3.5 w-3.5" />
                Duet
              </button>
              {series.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    revealControls();
                    void onOpenSeries(entry.id, scroll.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1.5 text-xs font-semibold text-fuchsia-50 hover:bg-fuchsia-400/15"
                >
                  <ListVideo className="h-3.5 w-3.5" />
                  {entry.title}
                  <span className="text-[10px] text-fuchsia-100/80">
                    {Math.max(1, Number(entry.position || 1))}/{Math.max(1, Number(entry.itemCount || 1))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {showInterestSurvey ? (
            <div className="pointer-events-auto">
              <ContentInterestSurvey
                entityId={scroll.id}
                viewerId={user?.id}
                contentType="scroll"
                initialSignal={interestSignal}
                enabled
                appearance="dark"
                onSubmit={handleInterestSurveySubmit}
              />
            </div>
          ) : null}
          <div className="pointer-events-auto">
            <ContentOfferTags offerTags={scroll.offerTags} variant="dark" />
          </div>
        </div>
      </div>

      <ReactionReactorsModal
        open={scrollReactorsOpen}
        onClose={() => setScrollReactorsOpen(false)}
        targetType={reactionTargetType}
        targetId={reactionTargetId || scroll.id}
        counts={scrollReactionCounts}
        allowed={scrollAllowedReactions}
        title="People who reacted"
      />
    </article>
  );
};

export default ScrollCard;

