import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, MoreVertical, X } from 'lucide-react';
import { CommunityService } from '../../../services/community';

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

const isVideo = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('video/');
const isImage = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('image/');

export default function FeedAdCard({ ad }: { ad: CommunityAd }) {
  const [dismissed, setDismissed] = useState(false);
  const [impressionRecorded, setImpressionRecorded] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const primaryMedia = useMemo(() => {
    const media = Array.isArray(ad?.media) ? ad.media : [];
    return media[0] || null;
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
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Promoted</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">{ad.title || 'Sponsored'}</div>
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
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          {isVideo(primaryMedia.mimeType) ? (
            <video src={primaryMedia.url} className="h-48 w-full object-cover" controls preload="metadata" />
          ) : isImage(primaryMedia.mimeType) ? (
            <img src={primaryMedia.url} alt={primaryMedia.name || ad.title || 'Ad media'} className="h-48 w-full object-cover" />
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

