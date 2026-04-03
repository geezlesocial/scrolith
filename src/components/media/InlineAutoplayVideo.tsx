import React, { useCallback, useEffect, useRef, useState } from 'react';

type InlineAutoplayVideoProps = {
  src: string;
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
  onDoubleTapLike?: () => void;
  onEnded?: () => void;
  overlay?: React.ReactNode | ((video: HTMLVideoElement | null) => React.ReactNode);
  loadingLabel?: string | false;
};

const InlineAutoplayVideo: React.FC<InlineAutoplayVideoProps> = ({
  src,
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
  onDoubleTapLike,
  onEnded,
  overlay,
  loadingLabel = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
  const [internalMuted, setInternalMuted] = useState(defaultMuted);
  const [isInView, setIsInView] = useState(false);
  const [shouldLoadSource, setShouldLoadSource] = useState(() => !autoplayEnabled || controls);
  const [isLoadingVideo, setIsLoadingVideo] = useState(() => Boolean(src));
  const userPausedRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const activeRef = useRef(active);
  const autoplayEnabledRef = useRef(autoplayEnabled);
  const isInViewRef = useRef(isInView);
  const internalPauseUntilRef = useRef(0);
  const isMuted = muted ?? internalMuted;
  const setVideoElement = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoNode((current) => (current === node ? current : node));
  }, []);

  const resumePlaybackFromInteraction = useCallback(() => {
    const node = videoRef.current;
    if (!node || !src || !active) return;

    userPausedRef.current = false;
    internalPauseUntilRef.current = 0;
    node.muted = isMuted;
    node.playsInline = true;

    const playNow = () => {
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
  }, [active, isMuted, shouldLoadSource, src]);

  useEffect(() => {
    activeRef.current = active;
    autoplayEnabledRef.current = autoplayEnabled;
    isInViewRef.current = isInView;
  }, [active, autoplayEnabled, isInView]);

  useEffect(() => {
    userPausedRef.current = false;
    internalPauseUntilRef.current = 0;
    setIsLoadingVideo(Boolean(src));
  }, [src]);

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
        rootMargin: preloadRootMargin
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

    node.muted = isMuted;
    node.playsInline = true;
    node.loop = loop;

    const pauseProgrammatically = () => {
      internalPauseUntilRef.current = Date.now() + 300;
      if (!node.paused) node.pause();
    };

    const playIfAllowed = () => {
      if (!autoplayEnabled || !active || !isInView || document.hidden || userPausedRef.current) return;
      node.muted = isMuted;
      const playAttempt = node.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => undefined);
      }
    };

    if (!autoplayEnabled || !active || !isInView || document.hidden) {
      pauseProgrammatically();
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
  }, [active, autoplayEnabled, isInView, isMuted, loop, src]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const node = videoRef.current;
      if (!node) return;

      if (document.hidden) {
        internalPauseUntilRef.current = Date.now() + 300;
        if (!node.paused) node.pause();
        return;
      }

      if (!autoplayEnabled || !active || !isInView || userPausedRef.current) return;
      node.muted = isMuted;
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
      const hasSource = Boolean(node.currentSrc || node.getAttribute('src') || src);
      const ready = hasSource && node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      setIsLoadingVideo(Boolean(hasSource && !ready && !node.ended));
    };

    const handleLoadStart = () => setIsLoadingVideo(Boolean(src));
    const handleWaiting = () => {
      if (!node.ended) setIsLoadingVideo(true);
    };
    const handleLoadedData = () => setIsLoadingVideo(false);
    const handleCanPlay = () => setIsLoadingVideo(false);
    const handlePlaying = () => setIsLoadingVideo(false);
    const handleSeeked = () => setIsLoadingVideo(false);
    const handleEnded = () => setIsLoadingVideo(false);
    const handleEmptied = () => setIsLoadingVideo(Boolean(src));
    const handleError = () => setIsLoadingVideo(false);

    syncLoadingState();

    node.addEventListener('loadstart', handleLoadStart);
    node.addEventListener('waiting', handleWaiting);
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
      node.removeEventListener('loadeddata', handleLoadedData);
      node.removeEventListener('canplay', handleCanPlay);
      node.removeEventListener('playing', handlePlaying);
      node.removeEventListener('seeked', handleSeeked);
      node.removeEventListener('ended', handleEnded);
      node.removeEventListener('emptied', handleEmptied);
      node.removeEventListener('error', handleError);
    };
  }, [src, shouldLoadSource]);

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

  const overlayContent = typeof overlay === 'function' ? overlay(videoNode) : overlay;

  return (
    <div className={['relative', containerClassName].filter(Boolean).join(' ')}>
      <video
        ref={setVideoElement}
        src={shouldLoadSource ? src : undefined}
        poster={poster || undefined}
        className={className}
        controls={controls}
        controlsList={controls ? 'nodownload' : undefined}
        autoPlay={autoplayEnabled && active}
        playsInline
        muted={isMuted}
        loop={loop}
        preload={effectivePreload}
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
          resumePlaybackFromInteraction();
        }}
        onClick={() => {
          if (controls) return;
          resumePlaybackFromInteraction();
        }}
        onEnded={onEnded}
      />
      {loadingLabel !== false && shouldLoadSource && isLoadingVideo ? (
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
      {showMuteToggle ? (
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
