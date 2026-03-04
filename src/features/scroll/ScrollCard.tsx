import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, MessageCircle, Repeat2, Send, Coins, Flag, Maximize2, Sparkles } from 'lucide-react';
import type { ScrollEngagementType, ScrollVideo } from '../../services/scroll';
import ReactionBar from '../../community/components/ReactionBar';
import { ReactionsService } from '../../services/reactions';
import { useUser } from '../../context/UserContext';

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

  useEffect(() => {
    marksRef.current = {};
  }, [scroll.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // autoplay failures are expected on some devices until user interaction
      });
    }
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

  const mediaUrl = scroll.media?.url || '';
  const authorName = scroll.author?.name || 'Community member';
  const description = String(scroll.description || '').trim();
  const title = String(scroll.title || '').trim();
  const topLine = title || description || 'Scroll video';
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
      { key: 'comment', label: 'Comment', icon: MessageCircle, onClick: () => onComment(scroll), value: scroll.metrics.comments },
      { key: 'repost', label: 'Repost', icon: Repeat2, onClick: () => onRepost(scroll), value: scroll.metrics.reposts },
      { key: 'dash', label: 'Dash', icon: Coins, onClick: () => onDash(scroll), value: scroll.metrics.shares },
      { key: 'send', label: 'Send', icon: Send, onClick: () => onSend(scroll), value: scroll.metrics.sends }
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
          {scroll.media?.thumbnailUrl ? (
            <img
              src={scroll.media.thumbnailUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-35 scale-110"
            />
          ) : null}
          <video
            ref={videoRef}
            src={mediaUrl}
            className="relative z-0 h-full w-full object-contain"
            style={mediaFilterStyle}
            muted={muted}
            loop
            playsInline
            controls={!autoplayEnabled}
            preload={isActive ? (autoplayEnabled ? 'auto' : 'metadata') : 'none'}
            onTimeUpdate={handleTimeUpdate}
            poster={scroll.media?.thumbnailUrl || undefined}
          />
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

      <div className="absolute right-2.5 top-[58%] z-30 pointer-events-auto flex -translate-y-1/2 flex-col items-center gap-1.5">
        <ReactionBar
          targetType="SCROLL"
          targetId={scroll.id}
          layout="rail"
          className="w-[54px]"
          compact
        />
        {rightActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/40 px-1.5 py-1.5 text-white transition hover:bg-black/60"
            aria-label={action.label}
          >
            <action.icon className="h-3.5 w-3.5" />
            <span className="mt-1 text-[11px] font-semibold">{Number(action.value || 0)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onShareToStory(scroll)}
          className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/40 px-1.5 py-1.5 text-white transition hover:bg-black/60"
          aria-label="Share to Story"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="mt-1 text-[11px] font-semibold">Story</span>
        </button>
        <button
          type="button"
          onClick={() => onReport(scroll)}
          className="inline-flex min-w-[52px] flex-col items-center rounded-xl bg-black/40 px-1.5 py-1.5 text-white transition hover:bg-black/60"
          aria-label="Report"
        >
          <Flag className="h-3.5 w-3.5" />
          <span className="mt-1 text-[11px] font-semibold">Report</span>
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-6 z-20">
        <div className="max-w-[70%] md:max-w-[60%]">
          <p className="text-base font-semibold leading-snug">{topLine}</p>
          {description && title ? <p className="mt-1 text-sm text-white/85 line-clamp-3">{description}</p> : null}
          {scroll.location ? <p className="mt-1 text-xs text-white/80">Location: {scroll.location}</p> : null}
          <p className="mt-2 text-[11px] text-white/70">{new Date(scroll.createdAt).toLocaleString()}</p>
        </div>
      </div>
    </article>
  );
};

export default ScrollCard;
