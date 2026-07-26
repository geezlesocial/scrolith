import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type InlineAutoplayVideoProps = {
  src: string;
  fallbackSrc?: string | null;
  fallbackSources?: Array<string | null | undefined>;
  poster?: string | null;
  className?: string;
  containerClassName?: string;
  controls?: boolean;
  loop?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  autoplayEnabled?: boolean;
  active?: boolean;
  muted?: boolean;
  defaultMuted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  showMuteToggle?: boolean;
  threshold?: number;
  rootMargin?: string;
  preloadRootMargin?: string;
  eagerLoad?: boolean;
  onDoubleTapLike?: () => void;
  onEnded?: () => void;
  onLoadStart?: () => void;
  onLoadedData?: () => void;
  onCanPlay?: () => void;
  onPlaying?: () => void;
  onError?: () => void;
  overlay?: React.ReactNode | ((video: HTMLVideoElement | null) => React.ReactNode);
  loadingLabel?: string | false;
};

const MAX_ACTIVE_AUTOPLAY_VIDEOS = 2;
const activeAutoplayVideos = new Set<HTMLVideoElement>();

const canUseNavigatorConnection = () =>
  typeof navigator !== 'undefined' && 'connection' in navigator;

const prefersReducedMediaData = () => {
  if (!canUseNavigatorConnection()) return false;
  const connection = (navigator as any).connection;
  return Boolean(
    connection?.saveData ||
      ['slow-2g', '2g'].includes(String(connection?.effectiveType || '').toLowerCase())
  );
};

const pauseOldestAutoplayPeer = (current: HTMLVideoElement) => {
  activeAutoplayVideos.delete(current);
  activeAutoplayVideos.add(current);
  while (activeAutoplayVideos.size > MAX_ACTIVE_AUTOPLAY_VIDEOS) {
    const oldest = activeAutoplayVideos.values().next().value as HTMLVideoElement | undefined;
    if (!oldest || oldest === current) break;
    activeAutoplayVideos.delete(oldest);
    try {
      if (!oldest.paused) oldest.pause();
    } catch {
      // ignore pause races from recycled feed/story nodes
    }
  }
};

const releaseVideoBuffer = (node: HTMLVideoElement) => {
  try {
    node.pause();
    node.removeAttribute('src');
    node.load();
  } catch {
    // Best-effort cleanup so offscreen feed/story videos do not keep buffers alive.
  }
};

const InlineAutoplayVideo: React.FC<InlineAutoplayVideoProps> = ({
  src,
  fallbackSrc,
  fallbackSources,
  poster,
  className = '',
  containerClassName = '',
  controls = true,
  loop = false,
  preload = 'metadata',
  autoplayEnabled = true,
  active = true,
  muted,
  defaultMuted = true,
  onMutedChange,
  showMuteToggle = true,
  threshold = 0.35,
  rootMargin = '0px 0px -10% 0px',
  preloadRootMargin = '160px 0px 160px 0px',
  eagerLoad = false,
  onDoubleTapLike,
  onEnded,
  onLoadStart,
  onLoadedData,
  onCanPlay,
  onPlaying,
  onError,
  overlay,
  loadingLabel = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
  const [internalMuted, setInternalMuted] = useState(defaultMuted);
  const [isInView, setIsInView] = useState(false);
  const [shouldLoadSource, setShouldLoadSource] = useState(() => eagerLoad || !autoplayEnabled || controls);
  const [isLoadingVideo, setIsLoadingVideo] = useState(() => Boolean(src));
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const userPausedRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const stalledRecoveryRef = useRef(0);
  const offscreenReleaseTimerRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  const autoplayEnabledRef = useRef(autoplayEnabled);
  const isInViewRef = useRef(isInView);
  const internalPauseUntilRef = useRef(0);
  const isMuted = muted ?? internalMuted;
  const fallbackSourcesKey = useMemo(
    () => (fallbackSources || []).map((value) => String(value || '').trim()).filter(Boolean).join('\n'),
    [fallbackSources]
  );
  const sourceCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [src, fallbackSrc, ...fallbackSourcesKey.split('\n')]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }, [fallbackSrc, fallbackSourcesKey, src]);
  const sourceCandidatesKey = useMemo(() => sourceCandidates.join('\n'), [sourceCandidates]);
  const activeSrc = sourceCandidates[activeSourceIndex] || sourceCandidates[0] || '';
  // Cache-bust only http(s) URLs after an explicit retry. Never rewrite blob:/data: previews
  // (composer local ObjectURLs break if we append ?_r=…).
  const effectiveSrc = (() => {
    const raw = String(activeSrc || '').trim();
    if (!raw) return '';
    if (reloadToken <= 0) return raw;
    if (/^(blob:|data:)/i.test(raw)) return raw;
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith('/')) return raw;
    return `${raw}${raw.includes('?') ? '&' : '?'}_r=${reloadToken}`;
  })();
  const setVideoElement = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoNode((current) => (current === node ? current : node));
  }, []);

  const resumePlaybackFromInteraction = useCallback(() => {
    const node = videoRef.current;
    if (!node || !activeSrc || !active) return;

    userPausedRef.current = false;
    internalPauseUntilRef.current = 0;
    node.muted = isMuted;
    node.playsInline = true;

    const playNow = () => {
      pauseOldestAutoplayPeer(node);
      const playAttempt = node.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => undefined);
      }
    };

    if (!shouldLoadSource) {
      setShouldLoadSource(true);
      window.setTimeout(() => {
        if (videoRef.current === node) {
          try {
            node.load();
          } catch {}
          playNow();
        }
      }, 0);
      return;
    }

    if (node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playNow();
      return;
    }

    const playWhenReady = () => {
      node.removeEventListener('loadeddata', playWhenReady);
      node.removeEventListener('canplay', playWhenReady);
      playNow();
    };

    node.addEventListener('loadeddata', playWhenReady);
    node.addEventListener('canplay', playWhenReady);
    try {
      node.load();
    } catch {}
  }, [active, activeSrc, isMuted, shouldLoadSource]);

  useEffect(() => {
    activeRef.current = active;
    autoplayEnabledRef.current = autoplayEnabled;
    isInViewRef.current = isInView;
  }, [active, autoplayEnabled, isInView]);

  useEffect(() => {
    userPausedRef.current = false;
    internalPauseUntilRef.current = 0;
    setHasPlaybackError(false);
    setActiveSourceIndex(0);
    setIsLoadingVideo(Boolean(sourceCandidates[0] || src));
    if (eagerLoad) setShouldLoadSource(Boolean(src));
  }, [eagerLoad, sourceCandidatesKey, src]);

  useEffect(() => {
    if (eagerLoad && src) setShouldLoadSource(true);
  }, [eagerLoad, src]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    node.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const preloadObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoadSource(true);
        }
      },
      {
        threshold: 0.01,
        rootMargin: prefersReducedMediaData() ? '60px 0px 60px 0px' : preloadRootMargin
      }
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const nextInView = Boolean(entries[0]?.isIntersecting);
        setIsInView(nextInView);
        if (!nextInView) {
          userPausedRef.current = false;
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    preloadObserver.observe(node);
    observer.observe(node);
    return () => {
      preloadObserver.disconnect();
      observer.disconnect();
    };
  }, [preloadRootMargin, rootMargin, threshold]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    if (offscreenReleaseTimerRef.current) {
      window.clearTimeout(offscreenReleaseTimerRef.current);
      offscreenReleaseTimerRef.current = null;
    }

    node.muted = isMuted;
    node.playsInline = true;
    node.loop = loop;

    const pauseProgrammatically = () => {
      internalPauseUntilRef.current = Date.now() + 300;
      if (!node.paused) node.pause();
      activeAutoplayVideos.delete(node);
    };

    const playIfAllowed = () => {
      if (!autoplayEnabled || !active || !isInView || document.hidden || userPausedRef.current) return;
      node.muted = isMuted;
      pauseOldestAutoplayPeer(node);
      const playAttempt = node.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => undefined);
      }
    };

    if (!autoplayEnabled || !active || !isInView || document.hidden) {
      pauseProgrammatically();
      if (!active || document.hidden) return;
      offscreenReleaseTimerRef.current = window.setTimeout(() => {
        const current = videoRef.current;
        if (!current || isInViewRef.current || userPausedRef.current) return;
        releaseVideoBuffer(current);
        setShouldLoadSource(false);
      }, 45000);
      return;
    }

    if (userPausedRef.current) return;

    playIfAllowed();
    node.addEventListener('loadedmetadata', playIfAllowed);
    node.addEventListener('canplay', playIfAllowed);

    return () => {
      node.removeEventListener('loadedmetadata', playIfAllowed);
      node.removeEventListener('canplay', playIfAllowed);
    };
  }, [active, activeSrc, autoplayEnabled, isInView, isMuted, loop, reloadToken, hasPlaybackError]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const node = videoRef.current;
      if (!node) return;

      if (document.hidden) {
        internalPauseUntilRef.current = Date.now() + 300;
        if (!node.paused) node.pause();
        activeAutoplayVideos.delete(node);
        return;
      }

      if (!autoplayEnabled || !active || !isInView || userPausedRef.current) return;
      node.muted = isMuted;
      pauseOldestAutoplayPeer(node);
      const playAttempt = node.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [active, autoplayEnabled, isInView, isMuted]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const syncLoadingState = () => {
      const hasSource = Boolean(node.currentSrc || node.getAttribute('src') || activeSrc);
      const ready = hasSource && node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      setIsLoadingVideo(Boolean(hasSource && !ready && !node.ended));
    };

    const handleLoadStart = () => {
      setIsLoadingVideo(Boolean(activeSrc));
      onLoadStart?.();
    };
    const handleWaiting = () => {
      if (!node.ended) setIsLoadingVideo(true);
    };
    const recoverFromStallOnce = () => {
      if (!activeRef.current || document.hidden || !isInViewRef.current || userPausedRef.current) return;
      if (node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (stalledRecoveryRef.current >= 1) return;
      stalledRecoveryRef.current += 1;
      setIsLoadingVideo(true);
      window.setTimeout(() => {
        const current = videoRef.current;
        if (!current || current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
        try {
          current.load();
        } catch {}
        if (autoplayEnabledRef.current && activeRef.current && !document.hidden) {
          pauseOldestAutoplayPeer(current);
          const playAttempt = current.play();
          if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => undefined);
          }
        }
      }, 250);
    };
    const handleLoadedData = () => {
      stalledRecoveryRef.current = 0;
      setIsLoadingVideo(false);
      onLoadedData?.();
    };
    const handleCanPlay = () => {
      stalledRecoveryRef.current = 0;
      setIsLoadingVideo(false);
      onCanPlay?.();
    };
    const handlePlaying = () => {
      stalledRecoveryRef.current = 0;
      setIsLoadingVideo(false);
      onPlaying?.();
    };
    const handleSeeked = () => setIsLoadingVideo(false);
    const handleEnded = () => setIsLoadingVideo(false);
    const handleEmptied = () => setIsLoadingVideo(Boolean(activeSrc));
    const handleError = () => {
      setIsLoadingVideo(false);
      if (activeSourceIndex + 1 < sourceCandidates.length) {
        setActiveSourceIndex((index) => index + 1);
        setHasPlaybackError(false);
        setIsLoadingVideo(true);
        window.setTimeout(() => {
          const current = videoRef.current;
          if (!current) return;
          try {
            current.load();
          } catch {}
          if (autoplayEnabledRef.current && activeRef.current && !document.hidden) {
            const playAttempt = current.play();
            if (playAttempt && typeof playAttempt.catch === 'function') {
              playAttempt.catch(() => undefined);
            }
          }
        }, 40);
        return;
      }
      setHasPlaybackError(true);
      onError?.();
    };

    syncLoadingState();

    node.addEventListener('loadstart', handleLoadStart);
    node.addEventListener('waiting', handleWaiting);
    node.addEventListener('stalled', recoverFromStallOnce);
    node.addEventListener('suspend', recoverFromStallOnce);
    node.addEventListener('loadeddata', handleLoadedData);
    node.addEventListener('canplay', handleCanPlay);
    node.addEventListener('playing', handlePlaying);
    node.addEventListener('seeked', handleSeeked);
    node.addEventListener('ended', handleEnded);
    node.addEventListener('emptied', handleEmptied);
    node.addEventListener('error', handleError);

    return () => {
      node.removeEventListener('loadstart', handleLoadStart);
      node.removeEventListener('waiting', handleWaiting);
      node.removeEventListener('stalled', recoverFromStallOnce);
      node.removeEventListener('suspend', recoverFromStallOnce);
      node.removeEventListener('loadeddata', handleLoadedData);
      node.removeEventListener('canplay', handleCanPlay);
      node.removeEventListener('playing', handlePlaying);
      node.removeEventListener('seeked', handleSeeked);
      node.removeEventListener('ended', handleEnded);
      node.removeEventListener('emptied', handleEmptied);
      node.removeEventListener('error', handleError);
    };
  }, [
    activeSourceIndex,
    activeSrc,
    onCanPlay,
    onError,
    onLoadStart,
    onLoadedData,
    onPlaying,
    shouldLoadSource,
    sourceCandidates.length
  ]);

  const effectivePreload: 'none' | 'metadata' | 'auto' =
    shouldLoadSource && active && isInView ? preload : shouldLoadSource ? 'metadata' : 'none';

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const onVolumeChange = () => {
      const nextMuted = Boolean(node.muted || node.volume === 0);
      if (muted === undefined) {
        setInternalMuted((prev) => (prev === nextMuted ? prev : nextMuted));
      }
      if (nextMuted !== isMuted) {
        onMutedChange?.(nextMuted);
      }
    };

    const onPause = () => {
      if (
        Date.now() >= internalPauseUntilRef.current &&
        isInViewRef.current &&
        activeRef.current &&
        autoplayEnabledRef.current &&
        !document.hidden &&
        !node.ended
      ) {
        userPausedRef.current = true;
      }
    };

    const onPlay = () => {
      userPausedRef.current = false;
      pauseOldestAutoplayPeer(node);
    };

    node.addEventListener('volumechange', onVolumeChange);
    node.addEventListener('pause', onPause);
    node.addEventListener('play', onPlay);

    return () => {
      node.removeEventListener('volumechange', onVolumeChange);
      node.removeEventListener('pause', onPause);
      node.removeEventListener('play', onPlay);
    };
  }, [isMuted, muted, onMutedChange]);

  useEffect(() => {
    return () => {
      const node = videoRef.current;
      if (!node) return;
      activeAutoplayVideos.delete(node);
      if (offscreenReleaseTimerRef.current) window.clearTimeout(offscreenReleaseTimerRef.current);
      releaseVideoBuffer(node);
    };
  }, []);

  const overlayContent = typeof overlay === 'function' ? overlay(videoNode) : overlay;

  const retryPlayback = useCallback(
    (event?: React.MouseEvent | React.PointerEvent) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      setHasPlaybackError(false);
      setActiveSourceIndex(0);
      stalledRecoveryRef.current = 0;
      setIsLoadingVideo(Boolean(sourceCandidates[0] || src));
      setShouldLoadSource(true);
      setReloadToken((token) => token + 1);
      window.setTimeout(() => resumePlaybackFromInteraction(), 40);
    },
    [resumePlaybackFromInteraction, sourceCandidates, src]
  );

  // Never use the server-generated SVG placeholder as a real poster — it freezes the UI on "Video Preview".
  const safePoster =
    poster && !/__video_fallback_thumbnail|video_fallback|video-preview\.svg/i.test(String(poster))
      ? poster
      : undefined;

  return (
    <div className={['relative', containerClassName].filter(Boolean).join(' ')}>
      <video
        ref={setVideoElement}
        src={shouldLoadSource && !hasPlaybackError ? effectiveSrc : undefined}
        poster={safePoster || undefined}
        className={className}
        controls={controls}
        controlsList={controls ? 'nodownload' : undefined}
        autoPlay={autoplayEnabled && active && !hasPlaybackError}
        playsInline
        muted={isMuted}
        loop={loop}
        preload={effectivePreload}
        disablePictureInPicture
        disableRemotePlayback
        // @ts-expect-error webkit-playsinline keeps older Android WebViews in inline mode.
        webkit-playsinline="true"
        onContextMenu={(event) => event.preventDefault()}
        onDoubleClick={(event) => {
          if (!onDoubleTapLike) return;
          event.preventDefault();
          event.stopPropagation();
          onDoubleTapLike();
        }}
        onTouchEnd={(event) => {
          if (!onDoubleTapLike) return;
          const now = Date.now();
          const lastTap = lastTapAtRef.current;
          if (lastTap && now - lastTap <= 320) {
            event.preventDefault();
            event.stopPropagation();
            lastTapAtRef.current = 0;
            onDoubleTapLike();
            return;
          }
          lastTapAtRef.current = now;
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
          if (controls) return;
          if (hasPlaybackError) {
            retryPlayback(event);
            return;
          }
          resumePlaybackFromInteraction();
        }}
        onClick={() => {
          if (controls) return;
          if (hasPlaybackError) {
            retryPlayback();
            return;
          }
          resumePlaybackFromInteraction();
        }}
        onEnded={onEnded}
      />
      {hasPlaybackError ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/85 px-4 text-center">
          <p className="text-sm font-semibold text-white">Video unavailable</p>
          <p className="max-w-[16rem] text-[11px] text-white/75">
            The media file could not be loaded. Tap retry, or re-upload if this post was created during a storage outage.
          </p>
          <button
            type="button"
            data-inline-video-control="true"
            onClick={retryPlayback}
            className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-900 shadow hover:bg-slate-100"
          >
            Retry playback
          </button>
        </div>
      ) : null}
      {loadingLabel !== false && shouldLoadSource && isLoadingVideo && !hasPlaybackError ? (
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {typeof loadingLabel === 'string' && loadingLabel.trim() ? loadingLabel : 'Video loading'}
          </span>
        </div>
      ) : null}
      {overlayContent ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
          {overlayContent}
        </div>
      ) : null}
      {showMuteToggle && !hasPlaybackError ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextMuted = !isMuted;
            if (muted === undefined) {
              setInternalMuted(nextMuted);
            }
            onMutedChange?.(nextMuted);
          }}
          data-inline-video-control="true"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/80"
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
      ) : null}
    </div>
  );
};

export default InlineAutoplayVideo;
