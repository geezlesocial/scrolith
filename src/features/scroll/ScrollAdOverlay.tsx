import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Megaphone, MousePointerClick, Volume2, VolumeX, X } from 'lucide-react';
import type { AdCampaign } from '../../types';
import { AdService } from '../../services/ads';
import { resolveAssetUrl } from '../../utils/assetUrl';
import AdVideoPlayer from '../../components/ads/AdVideoPlayer';

const DEFAULT_VIDEO_SKIP_DELAY_SECONDS = 10;
const DEFAULT_STATIC_SKIP_DELAY_SECONDS = 3;

const getAdMedia = (ad: AdCampaign | null) => {
  if (!ad) return null;
  const media = Array.isArray(ad.media) && ad.media.length > 0 ? ad.media[0] : null;
  if (media?.url) return media;
  const creativeUrl = String(ad.creativeUrl || ad.creative_url || '').trim();
  if (creativeUrl) return { url: creativeUrl, mimeType: 'image/*', name: ad.title };
  return null;
};

const isVideoMedia = (media: any) => {
  const mimeType = String(media?.mimeType || media?.type || '').toLowerCase();
  const url = String(media?.url || '').toLowerCase();
  return mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};

const resolveDestination = (ad: AdCampaign) => {
  const direct = String(ad.destinationUrl || ad.targetUrl || ad.target_url || '').trim();
  if (direct) return direct;
  if (String(ad.destinationType || '').toLowerCase() === 'messages') return '/messages';
  return '';
};

const openDestination = (destination: string) => {
  if (!destination) return;
  if (/^https?:\/\//i.test(destination)) {
    window.open(destination, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.href = destination.startsWith('/') ? destination : `/${destination}`;
};

type ScrollAdOverlayProps = {
  ad: AdCampaign | null;
  isOpen: boolean;
  muted: boolean;
  videoSkipDelaySeconds?: number;
  staticSkipDelaySeconds?: number;
  onClose: () => void;
};

const ScrollAdOverlay: React.FC<ScrollAdOverlayProps> = ({
  ad,
  isOpen,
  muted,
  videoSkipDelaySeconds = DEFAULT_VIDEO_SKIP_DELAY_SECONDS,
  staticSkipDelaySeconds = DEFAULT_STATIC_SKIP_DELAY_SECONDS,
  onClose
}) => {
  const impressionRecordedRef = useRef('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [adMuted, setAdMuted] = useState(muted);

  const media = useMemo(() => getAdMedia(ad), [ad]);
  const mediaUrl = useMemo(() => resolveAssetUrl(String(media?.url || '')), [media?.url]);
  const videoCreative = useMemo(() => isVideoMedia(media), [media]);
  const skipDelay = Math.max(
    0,
    Math.floor(videoCreative ? videoSkipDelaySeconds : staticSkipDelaySeconds)
  );
  const canSkip = elapsedSeconds >= skipDelay;
  const destination = ad ? resolveDestination(ad) : '';

  useEffect(() => {
    setAdMuted(muted);
  }, [muted]);

  useEffect(() => {
    setElapsedSeconds(0);
    if (!isOpen || !ad?.id) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [ad?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !ad?.id) return;
    const key = `${ad.id}:visible`;
    if (impressionRecordedRef.current === key) return;
    impressionRecordedRef.current = key;
    const timer = window.setTimeout(() => {
      AdService.recordImpression(ad.id).catch(() => undefined);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [ad?.id, isOpen]);

  const handleClose = useCallback(() => {
    if (!canSkip) return;
    onClose();
  }, [canSkip, onClose]);

  const handleCtaClick = useCallback(() => {
    if (!ad?.id || !destination) return;
    AdService.recordClick(ad.id).catch(() => undefined);
    openDestination(destination);
  }, [ad?.id, destination]);

  if (!isOpen || !ad) return null;

  const remaining = Math.max(0, skipDelay - elapsedSeconds);
  const title = String(ad.title || 'Sponsored on Scrolith').trim();
  const body = String(ad.body || 'Discover a sponsored opportunity from the Scrolith community.').trim();
  const ctaText = String(ad.ctaText || (String(ad.destinationType || '').toLowerCase() === 'messages' ? 'Message now' : 'Learn more')).trim();

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/72 px-3 py-[max(1rem,env(safe-area-inset-top))] text-white backdrop-blur-[2px]"
      data-scroll-skip-swipe="true"
      role="dialog"
      aria-label="Sponsored Scroll ad"
    >
      <div className="relative flex h-full max-h-[min(760px,calc(100svh-2rem))] w-full max-w-[min(470px,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-[32px] border border-white/15 bg-slate-950 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="inline-flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300 text-slate-950">
              <Megaphone className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">Sponsored</p>
              <p className="truncate text-sm font-semibold text-white">{title}</p>
            </div>
          </div>
          {canSkip ? (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-3 text-xs font-semibold text-slate-950 transition hover:bg-cyan-100"
              aria-label="Skip ad"
            >
              <>
                Skip <X className="ml-1 h-3.5 w-3.5" />
              </>
            </button>
          ) : (
            <span
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white/10 px-3 text-xs font-semibold text-white/70"
              aria-label={`Skip ad available in ${remaining} seconds`}
            >
              Ad {remaining}s
            </span>
          )}
        </div>

        <div className="relative min-h-0 flex-1 bg-black">
          {mediaUrl ? (
            videoCreative ? (
              <AdVideoPlayer
                src={mediaUrl}
                className="h-full w-full"
                videoClassName="h-full w-full object-contain"
                preload="auto"
                mutedDefault={adMuted}
                muted={adMuted}
                onMutedChange={setAdMuted}
                loop={false}
              />
            ) : (
              <img src={mediaUrl} alt={title} className="h-full w-full object-cover" loading="eager" />
            )
          ) : (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.28),_transparent_35%),linear-gradient(160deg,_#020617,_#111827_48%,_#082f49)] px-8 text-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Sponsored story</p>
                <p className="mt-4 text-3xl font-semibold leading-tight text-white">{title}</p>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 pt-16">
            <p className="line-clamp-3 text-sm leading-relaxed text-white/88">{body}</p>
          </div>
        </div>

        <div className="space-y-3 border-t border-white/10 bg-slate-950/96 p-4">
          <div className="flex items-center justify-between gap-3 text-[11px] text-white/60">
            <span>Ad plays independently from your Scroll video.</span>
            {videoCreative ? (
              <button
                type="button"
                onClick={() => setAdMuted((current) => !current)}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10"
              >
                {adMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {adMuted ? 'Muted' : 'Sound'}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            {destination ? (
              <button
                type="button"
                onClick={handleCtaClick}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                <MousePointerClick className="h-4 w-4" />
                {ctaText}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              disabled={!canSkip}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canSkip ? 'Continue watching' : `Continue in ${remaining}s`}
              {canSkip && destination ? <ExternalLink className="h-4 w-4 opacity-70" /> : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrollAdOverlay;
