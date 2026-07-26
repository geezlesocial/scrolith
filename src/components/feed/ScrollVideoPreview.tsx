/**
 * Phase 22.1B — lightweight muted Scroll video preview for recommendation cards.
 * IntersectionObserver driven muted Scroll preview.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

type Props = {
  src?: string | null;
  poster?: string | null;
  title?: string;
  className?: string;
  /** Called when muted preview actually starts playing. */
  onPreviewStarted?: () => void;
  /** Called when autoplay is blocked. */
  onPreviewBlocked?: () => void;
  onClick?: (event: React.MouseEvent) => void;
};

const ScrollVideoPreview: React.FC<Props> = ({
  src,
  poster,
  title = 'Scroll video',
  className = '',
  onPreviewStarted,
  onPreviewBlocked,
  onClick
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const mediaSrc = String(src || '').trim();
  const posterSrc = String(poster || '').trim();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setVisible(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= 0.35));
      },
      { threshold: [0, 0.35, 0.6], rootMargin: '80px 0px' }
    );
    obs.observe(root);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaSrc) return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    let cancelled = false;
    const run = async () => {
      if (!visible || document.visibilityState === 'hidden') {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        return;
      }
      video.muted = true;
      video.playsInline = true;
      video.defaultMuted = true;
      try {
        await video.play();
        if (cancelled) return;
        setAutoplayBlocked(false);
        if (!hasStarted) {
          setHasStarted(true);
          onPreviewStarted?.();
        }
      } catch {
        if (cancelled) return;
        setAutoplayBlocked(true);
        onPreviewBlocked?.();
      }
    };
    void run();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    };
  }, [visible, mediaSrc, hasStarted, onPreviewStarted, onPreviewBlocked]);

  return (
    <div
      ref={rootRef}
      className={`relative w-full overflow-hidden bg-slate-900 ${className}`}
      style={{ aspectRatio: '9 / 16', maxHeight: 280 }}
      data-testid="scroll-video-preview"
      data-preview-visible={visible ? 'true' : 'false'}
      data-preview-blocked={autoplayBlocked ? 'true' : 'false'}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick(event as unknown as React.MouseEvent);
              }
            }
          : undefined
      }
      aria-label={title}
    >
      {mediaSrc ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={visible ? mediaSrc : undefined}
          poster={posterSrc || undefined}
          muted
          playsInline
          loop
          preload={visible ? 'metadata' : 'none'}
          controls={false}
          // @ts-expect-error webkit-playsinline for older WebViews
          webkit-playsinline="true"
          disablePictureInPicture
          disableRemotePlayback
        />
      ) : posterSrc ? (
        <img src={posterSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-indigo-950 text-white/80 text-xs font-semibold">
          Scroll
        </div>
      )}

      {(autoplayBlocked || !mediaSrc) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </div>
      )}
    </div>
  );
};

export default React.memo(ScrollVideoPreview);
