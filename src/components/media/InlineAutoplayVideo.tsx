import React, { useEffect, useRef, useState } from 'react';

type InlineAutoplayVideoProps = {
  src: string;
  poster?: string | null;
  className?: string;
  controls?: boolean;
  loop?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
};

const InlineAutoplayVideo: React.FC<InlineAutoplayVideoProps> = ({
  src,
  poster,
  className = '',
  controls = true,
  loop = false,
  preload = 'metadata'
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const userPausedRef = useRef(false);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    node.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nextInView = Boolean(entries[0]?.isIntersecting);
        setIsInView(nextInView);
        if (!nextInView) {
          userPausedRef.current = false;
        }
      },
      {
        threshold: 0.6,
        rootMargin: '0px 0px -10% 0px'
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    if (!isInView || document.hidden) {
      if (!node.paused) node.pause();
      return;
    }

    if (userPausedRef.current) return;
    const playAttempt = node.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
      playAttempt.catch(() => {});
    }
  }, [isInView, src]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const node = videoRef.current;
      if (!node) return;

      if (document.hidden) {
        if (!node.paused) node.pause();
        return;
      }

      if (!isInView || userPausedRef.current) return;
      const playAttempt = node.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isInView]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const onVolumeChange = () => {
      setIsMuted(Boolean(node.muted || node.volume === 0));
    };

    const onPause = () => {
      if (isInView && !node.ended) {
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
  }, [isInView]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className={className}
        controls={controls}
        autoPlay
        playsInline
        muted={isMuted}
        loop={loop}
        preload={preload}
      />
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsMuted((prev) => !prev);
        }}
        className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/80"
        aria-label={isMuted ? 'Unmute video' : 'Mute video'}
      >
        {isMuted ? 'Unmute' : 'Mute'}
      </button>
    </div>
  );
};

export default InlineAutoplayVideo;
