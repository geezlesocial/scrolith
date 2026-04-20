import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

type AdVideoPlayerProps = {
  src: string;
  className?: string;
  videoClassName?: string;
  loop?: boolean;
  autoPlay?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  mutedDefault?: boolean;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  soundButtonClassName?: string;
  showSoundLabel?: boolean;
  onEnded?: () => void;
};

const AdVideoPlayer: React.FC<AdVideoPlayerProps> = ({
  src,
  className = 'h-full w-full',
  videoClassName = 'h-full w-full object-cover',
  loop = true,
  autoPlay = true,
  preload = 'auto',
  mutedDefault = true,
  muted: controlledMuted,
  onMutedChange,
  soundButtonClassName = 'right-3 top-3 h-10 min-w-10 px-3',
  showSoundLabel = true,
  onEnded
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [internalMuted, setInternalMuted] = useState(mutedDefault);
  const muted = controlledMuted ?? internalMuted;

  useEffect(() => {
    if (controlledMuted === undefined) setInternalMuted(mutedDefault);
  }, [controlledMuted, mutedDefault, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    video.muted = muted;
    video.playsInline = true;
    if (!muted) video.volume = 1;
    if (!autoPlay) return;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => undefined);
    }
  }, [autoPlay, muted, src]);

  const toggleMuted = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const video = videoRef.current;
    const nextMuted = !muted;
    if (video) {
      video.muted = nextMuted;
      if (!nextMuted) video.volume = 1;
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          video.muted = true;
          setInternalMuted(true);
          onMutedChange?.(true);
        });
      }
    }
    setInternalMuted(nextMuted);
    onMutedChange?.(nextMuted);
  };

  return (
    <div className={`relative overflow-hidden ${className}`} data-inline-video-control="true">
      <video
        ref={videoRef}
        src={src}
        className={videoClassName}
        muted={muted}
        autoPlay={autoPlay}
        loop={loop}
        playsInline
        preload={preload}
        controls={false}
        onEnded={onEnded}
        onContextMenu={(event) => event.preventDefault()}
      />
      <button
        type="button"
        onClick={toggleMuted}
        className={`absolute z-10 inline-flex items-center justify-center gap-1 rounded-full border border-white/30 bg-black/60 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/70 ${soundButtonClassName}`}
        aria-label={muted ? 'Unmute ad sound' : 'Mute ad sound'}
        title={muted ? 'Unmute ad' : 'Mute ad'}
        data-inline-video-control="true"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {showSoundLabel ? <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span> : null}
      </button>
    </div>
  );
};

export default AdVideoPlayer;
