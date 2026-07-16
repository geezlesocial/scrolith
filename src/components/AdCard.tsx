
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { AdCampaign } from '../types';
import DonateButton from './DonateButton';
import OptimizedImage from './media/OptimizedImage';
import AdVideoPlayer from './ads/AdVideoPlayer';
import AdDisclosureBadge from './ads/AdDisclosureBadge';
import { AdService } from '../services/ads';
import { resolveAssetUrl } from '../utils/assetUrl';

const resolveFileContentUrl = (fileId?: string | null) => {
    const normalized = String(fileId || '').trim();
    if (!normalized) return '';
    return resolveAssetUrl(`/api/files/content/${encodeURIComponent(normalized)}`);
};

const isVideoMedia = (media: any) => {
    const type = String(media?.mimeType || media?.mime_type || media?.type || '').toLowerCase();
    const url = String(media?.url || '').toLowerCase();
    return type === 'video' || type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};

const openAdDestination = (destination: string) => {
    if (!destination) return;
    if (/^https?:\/\//i.test(destination)) {
        window.open(destination, '_blank', 'noopener,noreferrer');
        return;
    }
    window.location.assign(destination.startsWith('/') ? destination : `/${destination}`);
};

const AdCard = ({
    ad,
    showDonate = false,
    compact = false,
    className = ''
}: {
    ad: AdCampaign;
    showDonate?: boolean;
    compact?: boolean;
    className?: string;
}) => {
    const statusMap: Record<string, { label: string; cls: string }> = {
        draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
        awaiting_payment: { label: 'Awaiting Payment', cls: 'bg-yellow-100 text-yellow-800' },
        awaitingpayment: { label: 'Awaiting Payment', cls: 'bg-yellow-100 text-yellow-800' },
        submitted_for_review: { label: 'Submitted', cls: 'bg-indigo-100 text-indigo-800' },
        submitted: { label: 'Submitted', cls: 'bg-indigo-100 text-indigo-800' },
        approved: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
        active: { label: 'Active', cls: 'bg-green-100 text-green-800' },
        paused: { label: 'Paused', cls: 'bg-gray-50 text-gray-700' },
        rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
        ended: { label: 'Ended', cls: 'bg-gray-50 text-gray-700' }
    };
    const st = String(ad.status || '').toLowerCase();
    const badge = statusMap[st] || { label: String(ad.status || '').toUpperCase(), cls: 'bg-gray-100 text-gray-700' };
    const showStatusBadge = Boolean(st) && !['active', 'approved'].includes(st);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [impressionRecorded, setImpressionRecorded] = useState(false);

    const media = useMemo(() => {
        const primary = Array.isArray(ad.media) && ad.media.length > 0
            ? ad.media[0]
            : ad.creativeUrl
              ? { url: ad.creativeUrl, type: 'image' }
              : null;
        const preferredUrl = resolveFileContentUrl(primary?.id) || resolveAssetUrl(String(primary?.url || '').trim());
        if (!preferredUrl) return null;
        return {
            ...primary,
            url: preferredUrl
        };
    }, [ad.creativeUrl, ad.media]);
    const mediaType = isVideoMedia(media) ? 'video' : 'image';

    const linkUrl = String(ad.targetUrl || ad.destinationUrl || (ad as any).ctaUrl || (ad as any).cta_url || '').trim();
    const bodyText = String((ad as any).description || ad.body || '').trim();
    const clientName = String(ad.clientName || ad.client_name || '').trim();
    const ctaText = String(ad.ctaText || 'Learn more').trim() || 'Learn more';
    const donateRecipientId = String(ad.creatorId || (ad as any).recipientId || '').trim();

    useEffect(() => {
        if (!cardRef.current || impressionRecorded || !ad?.id) return;
        const node = cardRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;
                setImpressionRecorded(true);
                observer.disconnect();
                void AdService.recordImpression(ad.id).catch(() => {});
            },
            { threshold: 0.35 }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [ad?.id, impressionRecorded]);

    const handleOpenDestination = () => {
        if (!linkUrl) return;
        void AdService.recordClick(ad.id).catch(() => {});
        openAdDestination(linkUrl);
    };

    return (
        <div
            ref={cardRef}
            className={`group relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-3' : 'mb-6 p-4'} ${className}`.trim()}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    {!media ? <AdDisclosureBadge label="Sponsored" tone="dark" /> : null}
                    <h4 className={`${media ? '' : 'mt-2'} line-clamp-2 text-sm font-semibold text-slate-900`}>
                        {ad.title || 'Sponsored'}
                    </h4>
                    {clientName ? <p className="mt-1 text-xs text-slate-500">{clientName}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                    {showStatusBadge ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                    ) : null}
                    {showDonate && donateRecipientId && (
                        <DonateButton recipientIdentifier={donateRecipientId} />
                    )}
                </div>
            </div>

            {bodyText ? (
                <p className={`text-slate-600 ${media ? 'mt-3 text-sm line-clamp-3' : 'mt-2 text-sm line-clamp-4'}`}>
                    {bodyText}
                </p>
            ) : null}

            {media?.url ? (
                <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 ${compact ? 'mt-3' : 'mt-4'}`}>
                    <div className="pointer-events-none absolute left-3 top-3 z-10">
                        <AdDisclosureBadge label="Sponsored" tone="light" />
                    </div>
                    {mediaType === 'video' ? (
                        <AdVideoPlayer
                            src={media.url}
                            className={`${compact ? 'h-36 w-full' : 'h-48 w-full'}`}
                            videoClassName="h-full w-full object-cover"
                            preload="auto"
                            soundButtonClassName="right-2 top-2 h-8 min-w-8 px-2"
                            showSoundLabel={false}
                        />
                    ) : (
                        <OptimizedImage
                            src={media.url}
                            alt={ad.title}
                            width={640}
                            height={compact ? 144 : 192}
                            className={`${compact ? 'h-36' : 'h-48'} w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]`}
                        />
                    )}
                </div>
            ) : null}

            {linkUrl ? (
                <div className={`${media || bodyText ? 'mt-4' : 'mt-3'} flex items-center justify-end`}>
                    <button
                        type="button"
                        onClick={handleOpenDestination}
                        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-slate-800"
                    >
                        {ctaText}
                        <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export default AdCard;
