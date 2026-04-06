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
import ExpandablePreviewText from '../../components/common/ExpandablePreviewText';
import ContentOfferTags from '../../components/commerce/ContentOfferTags';
import ReactionBar from '../../community/components/ReactionBar';
import FollowButton from '../../community/components/FollowButton';
import { ReactionsService } from '../../services/reactions';
import { useUser } from '../../context/UserContext';
import { resolveInlineMedia } from '../../utils/inlineMedia';
import GraphicWarningGate from '../../components/media/GraphicWarningGate';
import OverlayActionRailButton from '../../components/media/OverlayActionRailButton';
import OptimizedImage from '../../components/media/OptimizedImage';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';
import ContentInterestSurvey from '../../components/recommendation/ContentInterestSurvey';

type ScrollCardProps = {
  scroll: ScrollVideo;
  isActive: boolean;
  autoplayEnabled: boolean;
  autoAdvanceOnEnd?: boolean;
  muted: boolean;
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
};

const authorInitial = (name?: string | null) => String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
const formatGcoin = (value: number) => {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(safe >= 10000 ? 0 : 1)}K`;
  return `${safe}`;
};

const TOUCH_CONTROL_HIDE_DELAY_MS = 20000;

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
  autoplayEnabled,
  autoAdvanceOnEnd = false,
  muted,
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
  headlinePreviewLimit = 72,
  descriptionPreviewLimit = 120,
  interestSurveyEnabled = false,
  initialIsFollowing
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const marksRef = useRef<Record<string, boolean>>({});
  const mediaGestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const mediaLastTapAtRef = useRef(0);
  const controlsHideTimerRef = useRef<number | null>(null);
  const ownerMenuRef = useRef<HTMLDivElement | null>(null);
  const [graphicRevealed, setGraphicRevealed] = useState(false);
  const [touchOverlayMode, setTouchOverlayMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [interestSignal, setInterestSignal] = useState<string | null>(scroll.viewer?.feedbackSignal || null);
  const media = resolveInlineMedia(scroll?.media || scroll, { typeHint: 'video' });
  const mediaUrl = media.src;
  const authorName = scroll.author?.name || 'Community member';
  const authorAvatar = resolveScrollAuthorAvatar(scroll);
  const authorProfileUrl = resolveScrollAuthorProfileUrl(scroll);
  const description = String(scroll.description || '').trim();
  const title = String(scroll.title || '').trim();
  const headlineLine = title || description || 'Scroll video';
  const secondaryLine = title && description ? description : '';
  const dashGcoinTotal = Number(scroll.dashGcoinTotal ?? scroll.metrics?.dashGcoinTotal ?? 0);
  const tagCount = Array.isArray(scroll.tags) ? scroll.tags.length : 0;
  const sourceHeadline = String(scroll.sourceScroll?.title || scroll.sourceScroll?.description || '').trim();
  const series = Array.isArray(scroll.series) ? scroll.series : [];
  const hasOwnerActions = Boolean(scroll.canEdit || scroll.canDelete);
  const overlayControlsVisible = !touchOverlayMode || controlsVisible || ownerMenuOpen;

  useEffect(() => {
    marksRef.current = {};
  }, [scroll.id]);

  useEffect(() => {
    setGraphicRevealed(false);
  }, [scroll.id]);

  useEffect(() => {
    setInterestSignal(scroll.viewer?.feedbackSignal || null);
  }, [scroll.id, scroll.viewer?.feedbackSignal]);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const revealControls = useCallback(() => {
    if (!touchOverlayMode) return;
    setControlsVisible(true);
  }, [touchOverlayMode]);

  const resumePlaybackFromGesture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !mediaUrl || !isActive || !autoplayEnabled) return;
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
  }, [autoplayEnabled, isActive, mediaUrl, muted]);

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
    if (!touchOverlayMode || !controlsVisible || ownerMenuOpen) return;

    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, TOUCH_CONTROL_HIDE_DELAY_MS);

    return clearControlsHideTimer;
  }, [clearControlsHideTimer, controlsVisible, ownerMenuOpen, touchOverlayMode]);

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

    const tryPlay = () => {
      if (!isActive || !autoplayEnabled || document.hidden) return;
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
      video.pause();
      try {
        video.currentTime = 0;
      } catch {}
      return;
    }

    if (!autoplayEnabled) {
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
  }, [autoAdvanceOnEnd, autoplayEnabled, isActive, muted, scroll.id]);

  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) {
        video.pause();
        return;
      }
      if (isActive && autoplayEnabled) {
        void video.play().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [autoplayEnabled, isActive]);

  const handleVideoEnded = useCallback(() => {
    if (!autoAdvanceOnEnd || !isActive) return;
    void onRequestNext?.();
  }, [autoAdvanceOnEnd, isActive, onRequestNext]);

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
      if (ratio >= 0.95) await once('view_95', 'view_95');
    }
  };

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
    const scrollId = String(scroll?.id || '').trim();
    if (!scrollId) return;
    if (!user?.id) {
      if (confirm('Log in to like scroll videos?')) window.location.href = '/auth/login';
      return;
    }
    try {
      const summary = await ReactionsService.react('SCROLL', scrollId, 'like');
      window.dispatchEvent(
        new CustomEvent('reactions:updated', {
          detail: {
            targetType: 'SCROLL',
            targetId: scrollId,
            counts: summary?.counts || {},
            userReaction: summary?.userReaction || null,
            actorUserId: user.id
          }
        })
      );
    } catch (error) {
      console.error('Failed to apply scroll double-tap like', error);
    }
  }, [scroll?.id, user?.id]);

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

  const rightActions = useMemo(
    () => [
      { key: 'comment', label: 'Comment', icon: MessageCircle, onClick: () => onComment(scroll) },
      { key: 'repost', label: 'Repost', icon: Repeat2, onClick: () => onRepost(scroll) },
      { key: 'dash', label: 'Dash', icon: Coins, onClick: () => onDash(scroll) },
      { key: 'send', label: 'Send', icon: Send, onClick: () => onSend(scroll) }
    ],
    [onComment, onDash, onRepost, onSend, scroll]
  );

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
        resumePlaybackFromGesture();
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
              src={mediaUrl}
              className="relative z-0 h-full w-full object-contain"
              style={mediaFilterStyle}
              muted={muted}
              loop={!autoAdvanceOnEnd}
              playsInline
              autoPlay={autoplayEnabled && isActive}
              controls={!autoplayEnabled}
              controlsList={!autoplayEnabled ? 'nodownload' : undefined}
              preload={isActive ? (autoplayEnabled ? 'auto' : 'metadata') : 'none'}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              poster={media.poster}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => resumePlaybackFromGesture()}
            />
          </GraphicWarningGate>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-gray-900 text-sm text-gray-300">
          Media unavailable
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

      <div className="pointer-events-none absolute left-4 right-4 top-4 z-30 flex items-start justify-between gap-3">
          <div className="pointer-events-auto">
            {authorProfileUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  navigate(authorProfileUrl, { state: { fromMobileHome: true } });
                }}
                className="flex items-start gap-3 text-left"
              >
                <div className="h-10 w-10 rounded-full bg-white/15 ring-2 ring-white/70 overflow-hidden flex items-center justify-center text-sm font-semibold">
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{authorName}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
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
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-white/15 ring-2 ring-white/70 overflow-hidden flex items-center justify-center text-sm font-semibold">
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{authorName}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
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
            </div>
          </div>

        <div
          className={`pointer-events-auto flex items-center gap-2 transition-all duration-300 ${
            overlayControlsVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              revealControls();
              onToggleMute();
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              revealControls();
              void handleExpand();
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
                aria-label="Open scroll owner actions"
                aria-expanded={ownerMenuOpen}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {ownerMenuOpen ? (
                <div className="absolute right-0 top-12 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 text-sm text-white shadow-[0_24px_64px_-24px_rgba(15,23,42,0.95)] backdrop-blur-xl">
                  {scroll.canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOwnerMenuOpen(false);
                        void onEdit(scroll);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-white/90 transition hover:bg-white/10"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit scroll
                    </button>
                  ) : null}
                  {scroll.canDelete ? (
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
          targetType="SCROLL"
          targetId={scroll.id}
          layout="rail"
          className="w-[60px] sm:w-[68px]"
          compact
          railVariant="launcher"
          railLauncherLabel="Reaction"
        />
        {rightActions.map((action) => (
          <OverlayActionRailButton
            key={action.key}
            onClick={() => {
              revealControls();
              void action.onClick();
            }}
            icon={action.icon}
            label={action.label}
            className="min-h-[42px] min-w-[58px] rounded-[18px] sm:min-h-[46px] sm:min-w-[64px] sm:rounded-2xl"
          />
        ))}
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
        className={`pointer-events-none absolute inset-x-4 bottom-5 z-20 transition-all duration-300 ${
          touchOverlayMode && !overlayControlsVisible
            ? 'translate-y-6 opacity-0'
            : 'translate-y-0 opacity-100'
        } ${touchOverlayMode && !overlayControlsVisible ? 'pr-0 pointer-events-none' : 'pr-[76px] sm:pr-[88px]'}`}
      >
        <div className="w-full max-w-[min(44rem,100%)] space-y-2">
          <div className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] font-semibold text-white/85 shadow-[0_12px_36px_-24px_rgba(15,23,42,0.9)] backdrop-blur-md">
            <span>{Number(scroll.metrics.likes || 0)} likes</span>
            <span>{Number(scroll.metrics.comments || 0)} comments</span>
            <span>{Number(scroll.metrics.reposts || 0)} reposts</span>
            <span>{Number(scroll.metrics.sends || 0)} sends</span>
            <span>{formatGcoin(dashGcoinTotal)} GC dashed</span>
          </div>
          {scroll.sourceScroll ? (
            <div className="pointer-events-auto rounded-[22px] border border-fuchsia-300/20 bg-fuchsia-400/10 px-3.5 py-3 text-white shadow-[0_18px_48px_-28px_rgba(15,23,42,0.95)] backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-300/25 bg-fuchsia-500/15 text-fuchsia-100">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100/90">
                    {scroll.responseMode === 'duet' ? 'Duet response' : 'Remix response'}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {scroll.sourceScroll.unavailable ? 'Original Scroll unavailable' : sourceHeadline || 'Original Scroll'}
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    {scroll.sourceScroll.author?.name || 'Community member'}
                    {scroll.sourceScroll.author?.username ? ` · @${scroll.sourceScroll.author.username}` : ''}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-auto rounded-[24px] border border-white/10 bg-black/34 px-3.5 py-3 text-white shadow-[0_18px_48px_-28px_rgba(15,23,42,0.95)] backdrop-blur-md">
            <ExpandablePreviewText
              text={headlineLine}
              limit={headlinePreviewLimit}
              textClassName="text-[15px] font-semibold leading-snug text-white sm:text-base"
              buttonClassName="text-white"
            />
            {secondaryLine ? (
              <ExpandablePreviewText
                text={secondaryLine}
                limit={descriptionPreviewLimit}
                className="mt-1.5"
                textClassName="text-sm leading-relaxed text-white/85"
                buttonClassName="text-white"
              />
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/75">
              {scroll.location ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2.5 py-1">
                  {scroll.location}
                </span>
              ) : null}
              {tagCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2.5 py-1">
                  {tagCount} tag{tagCount === 1 ? '' : 's'}
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2.5 py-1">
                {new Date(scroll.createdAt).toLocaleString()}
              </span>
            </div>
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
    </article>
  );
};

export default ScrollCard;

