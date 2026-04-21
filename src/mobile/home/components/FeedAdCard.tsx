import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLinkIcon as ExternalLink,
  MoreVerticalIcon as MoreVertical,
  XIcon as X
} from '../../../components/icons/ShellIcons';
import OptimizedImage from '../../../components/media/OptimizedImage';
import AdVideoPlayer from '../../../components/ads/AdVideoPlayer';
import AdDisclosureBadge from '../../../components/ads/AdDisclosureBadge';
import { CommunityService } from '../../../services/community';
import { resolveAssetUrl } from '../../../utils/assetUrl';

type AdMedia = { id: string; url: string; mimeType: string | null; name: string | null };

type CommunityAd = {
  id: string;
  title?: string | null;
  body?: string | null;
  destinationUrl?: string | null;
  destinationType?: string | null;
  media?: AdMedia[];
  placement?: string | null;
};

const isVideoMedia = (media?: AdMedia | null) => {
  const mime = String(media?.mimeType || '').toLowerCase();
  const url = String(media?.url || '').toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};
const isImage = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('image/');

export default function FeedAdCard({ ad }: { ad: CommunityAd }) {
  const [dismissed, setDismissed] = useState(false);
  const [impressionRecorded, setImpressionRecorded] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const primaryMedia = useMemo(() => {
    const media = Array.isArray(ad?.media) ? ad.media : [];
    const candidate = media[0] || null;
    if (!candidate?.url) return null;
    return {
      ...candidate,
      url: resolveAssetUrl(String(candidate.url || '').trim())
    };
  }, [ad?.media]);

  useEffect(() => {
    if (!ref.current || impressionRecorded || dismissed) return;
    const node = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setImpressionRecorded(true);
        obs.disconnect();
        void CommunityService.recordAdImpression(ad.id).catch(() => {});
      },
      { threshold: 0.25 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [ad.id, dismissed, impressionRecorded]);

  if (dismissed) return null;

  const destination = String((ad as any)?.destinationUrl || (ad as any)?.destination_url || '').trim();

  return (
    <div ref={ref} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          {!primaryMedia ? <AdDisclosureBadge label="Sponsored" tone="dark" /> : null}
          <div className={`${primaryMedia ? '' : 'mt-2'} text-sm font-semibold text-slate-900 line-clamp-2`}>
            {ad.title || 'Sponsored'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Ad options"
            onClick={() => {
              // Placeholder for future report/hide actions
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Hide ad"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {ad.body ? <div className="text-sm text-slate-600 line-clamp-3">{ad.body}</div> : null}

      {primaryMedia ? (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="pointer-events-none absolute left-3 top-3 z-10">
            <AdDisclosureBadge label="Sponsored" tone="light" />
          </div>
          {isVideoMedia(primaryMedia) ? (
            <AdVideoPlayer
              src={primaryMedia.url}
              className="h-48 w-full"
              videoClassName="h-full w-full object-cover"
              loop
              preload="auto"
              soundButtonClassName="right-2 top-2 h-8 min-w-8 px-2"
              showSoundLabel={false}
            />
          ) : isImage(primaryMedia.mimeType) ? (
            <OptimizedImage
              src={primaryMedia.url}
              alt={primaryMedia.name || ad.title || 'Ad media'}
              width={640}
              height={192}
              className="h-48 w-full object-cover"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center p-4 text-xs text-slate-500">
              {primaryMedia.name || 'Attachment'}
            </div>
          )}
        </div>
      ) : null}

      {destination ? (
        <button
          type="button"
          onClick={() => {
            void CommunityService.recordAdClick(ad.id).catch(() => {});
            window.open(destination, '_blank', 'noopener,noreferrer');
          }}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <ExternalLink className="h-4 w-4" />
          Visit
        </button>
      ) : null}
    </div>
  );
}
