import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Volume2, VolumeX, MessageCircle, Repeat2, Send, Coins, Flag, Maximize2, Sparkles } from 'lucide-react';
import type { ScrollEngagementType, ScrollVideo } from '../../services/scroll';
import ExpandablePreviewText from '../../components/common/ExpandablePreviewText';
import ContentOfferTags from '../../components/commerce/ContentOfferTags';
import ReactionBar from '../../community/components/ReactionBar';
import { ReactionsService } from '../../services/reactions';
import { useUser } from '../../context/UserContext';
import { resolveInlineMedia } from '../../utils/inlineMedia';
import { CARD_TEXT_PREVIEW_LIMIT } from '../../utils/textPreview';
import GraphicWarningGate from '../../components/media/GraphicWarningGate';
import OverlayActionRailButton from '../../components/media/OverlayActionRailButton';

type ScrollCardProps = {
  scroll: ScrollVideo;
  isActive: boolean;
  autoplayEnabled: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onEngage: (scrollId: string, type: ScrollEngagementType, payload?: { watchedSeconds?: number }) => Promise<void> | void;
  onComment: (scroll: ScrollVideo) => Promise<void> | void;
  onShareToStory: (scroll: ScrollVideo) => Promise<void> | void;
  onRepost: (scroll: ScrollVideo) => Promise<void> | void;
  onDash: (scroll: ScrollVideo) => Promise<void> | void;
  onSend: (scroll: ScrollVideo) => Promise<void> | void;
  onReport: (scroll: ScrollVideo) => Promise<void> | void;
};

const authorInitial = (name?: string | null) => String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
const formatGcoin = (value: number) => {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(safe >= 10000 ? 0 : 1)}K`;
  return `${safe}`;
};

const ScrollCard: React.FC<ScrollCardProps> = ({
  scroll,
  isActive,
  autoplayEnabled,
  muted,
  onToggleMute,
  onEngage,
  onComment,
  onShareToStory,
  onRepost,
  onDash,
  onSend,
  onReport
}) => {
  const { user } = useUser();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const marksRef = useRef<Record<string, boolean>>({});
  const mediaGestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const mediaLastTapAtRef = useRef(0);
  const [graphicRevealed, setGraphicRevealed] = useState(false);

  useEffect(() => {
    marksRef.current = {};
  }, [scroll.id]);

  useEffect(() => {
    setGraphicRevealed(false);
  }, [scroll.id]);

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
    video.loop = true;

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
  }, [autoplayEnabled, isActive, muted, scroll.id]);

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

  const media = resolveInlineMedia(scroll?.media || scroll, { typeHint: 'video' });
  const mediaUrl = media.src;
  const authorName = scroll.author?.name || 'Community member';
  const description = String(scroll.description || '').trim();
  const title = String(scroll.title || '').trim();
  const topLine = title || description || 'Scroll video';
  const dashGcoinTotal = Number(scroll.dashGcoinTotal ?? scroll.metrics?.dashGcoinTotal ?? 0);
  const tagCount = Array.isArray(scroll.tags) ? scroll.tags.length : 0;
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

  return (
    <article
      ref={rootRef}
      className="relative h-screen w-full snap-start bg-black text-white overflow-hidden"
      aria-label={`Scroll by ${authorName}`}
      onTouchStart={(event) => {
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
            <img
              src={media.poster}
              alt=""
              aria-hidden
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
              loop
              playsInline
              autoPlay={autoplayEnabled && isActive}
              controls={!autoplayEnabled}
              controlsList={!autoplayEnabled ? 'nodownload' : undefined}
              preload={isActive ? (autoplayEnabled ? 'auto' : 'metadata') : 'none'}
              onTimeUpdate={handleTimeUpdate}
              poster={media.poster}
              onContextMenu={(event) => event.preventDefault()}
            />
          </GraphicWarningGate>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-gray-900 text-sm text-gray-300">
          Media unavailable
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

      <div className="pointer-events-none absolute left-4 right-4 top-4 z-30 flex items-center justify-between">
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/15 ring-2 ring-white/70 overflow-hidden flex items-center justify-center text-sm font-semibold">
            {scroll.author?.avatar ? (
              <img src={scroll.author.avatar} alt={authorName} className="h-full w-full object-cover" />
            ) : (
              <span>{authorInitial(authorName)}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{authorName}</p>
            <p className="text-xs text-white/80">{scroll.author?.username ? `@${scroll.author.username}` : 'Scrolith'}</p>
          </div>
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

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleExpand}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
            aria-label="Expand video"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="absolute right-2.5 top-1/2 z-30 pointer-events-auto flex -translate-y-1/2 flex-col items-center gap-1.5 sm:right-3">
        <ReactionBar
          targetType="SCROLL"
          targetId={scroll.id}
          layout="rail"
          className="w-[68px]"
          compact
          railVariant="launcher"
          railLauncherLabel="Reaction"
        />
        {rightActions.map((action) => (
          <OverlayActionRailButton
            key={action.key}
            onClick={action.onClick}
            icon={action.icon}
            label={action.label}
          />
        ))}
        <OverlayActionRailButton
          onClick={() => onShareToStory(scroll)}
          icon={Sparkles}
          label="Story"
        />
        <OverlayActionRailButton
          onClick={() => onReport(scroll)}
          icon={Flag}
          label="Report"
          danger
        />
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-5 z-20 pr-[76px] sm:pr-[88px]">
        <div className="w-full max-w-[min(44rem,100%)] space-y-2">
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] font-semibold text-white/85 shadow-[0_12px_36px_-24px_rgba(15,23,42,0.9)] backdrop-blur-md">
            <span>{Number(scroll.metrics.likes || 0)} likes</span>
            <span>{Number(scroll.metrics.comments || 0)} comments</span>
            <span>{Number(scroll.metrics.reposts || 0)} reposts</span>
            <span>{Number(scroll.metrics.sends || 0)} sends</span>
            <span>{formatGcoin(dashGcoinTotal)} GC dashed</span>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-black/34 px-3.5 py-3 text-white shadow-[0_18px_48px_-28px_rgba(15,23,42,0.95)] backdrop-blur-md">
            <ExpandablePreviewText
              text={topLine}
              limit={CARD_TEXT_PREVIEW_LIMIT}
              textClassName="text-[15px] font-semibold leading-snug text-white sm:text-base"
              buttonClassName="text-white"
            />
            {description && title ? (
              <ExpandablePreviewText
                text={description}
                limit={CARD_TEXT_PREVIEW_LIMIT}
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
          </div>
          <div className="pointer-events-auto">
            <ContentOfferTags offerTags={scroll.offerTags} variant="dark" />
          </div>
        </div>
      </div>
    </article>
  );
};

export default ScrollCard;

