import React, { useMemo } from 'react';
import { FileText, RefreshCw, X } from 'lucide-react';
import {
  formatComposerBytes,
  inferComposerMediaKind,
  type ComposerAttachmentPreview
} from './composerAttachments';
import { composerAttachmentTile } from './composerClasses';
import OptimizedImage from '../media/OptimizedImage';
import InlineAutoplayVideo from '../media/InlineAutoplayVideo';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { resolvePostAttachmentMediaPair } from '../../utils/postAttachmentMedia';
import ScrolithaMediaEnhanceOffer from '../ai/ScrolithaMediaEnhanceOffer';

type Props = {
  media: ComposerAttachmentPreview[];
  onRemove: (localId: string) => void;
  onRetry?: (localId: string) => void;
  onOpenPreview?: (item: ComposerAttachmentPreview) => void;
  emptyLabel?: string;
  className?: string;
  onEnhance?: (item: ComposerAttachmentPreview, enhancedFile: File) => void | Promise<void>;
};

const resolvePreviewSrc = (item: ComposerAttachmentPreview) => {
  const local = String(item.localPreviewUrl || '').trim();
  if (local.startsWith('blob:') || local.startsWith('data:')) return local;
  const url = String(item.url || '').trim();
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  const pair = resolvePostAttachmentMediaPair(item);
  return resolveAssetUrl(pair.url || url) || pair.url || url;
};

const resolveFallbackSrc = (item: ComposerAttachmentPreview) => {
  const fallback = String(item.fallbackUrl || '').trim();
  if (fallback.startsWith('blob:') || fallback.startsWith('data:')) return fallback;
  const pair = resolvePostAttachmentMediaPair(item);
  const value = pair.fallbackUrl || fallback;
  return value ? resolveAssetUrl(value) || value : '';
};

const resolvePoster = (item: ComposerAttachmentPreview) => {
  const localPoster = String(item.localPosterUrl || '').trim();
  if (localPoster) return localPoster;
  const thumb = String(item.thumbnailUrl || '').trim();
  if (thumb) return resolveAssetUrl(thumb) || thumb;
  return undefined;
};

/**
 * Shared progressive media preview grid for Create Post (desktop + mobile web + WebView).
 */
const ComposerMediaPreviewGrid: React.FC<Props> = ({
  media,
  onRemove,
  onRetry,
  onOpenPreview,
  emptyLabel = 'Add photos, videos, or files — previews appear instantly.',
  className = '',
  onEnhance
}) => {
  const items = useMemo(() => (Array.isArray(media) ? media : []), [media]);

  if (!items.length) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center text-sm text-slate-500 ${className}`}
        data-testid="composer-media-empty"
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${className}`} data-testid="composer-media-grid">
      {items.map((mediaItem) => {
        const type = mediaItem.type || inferComposerMediaKind({ type: mediaItem.mimeType || '', name: mediaItem.name || '' });
        const src = resolvePreviewSrc(mediaItem);
        const fallbackSrc = resolveFallbackSrc(mediaItem);
        const poster = resolvePoster(mediaItem);
        const progress = Math.max(0, Math.min(100, Number(mediaItem.progress) || 0));

        return (
          <div key={mediaItem.localId} className={composerAttachmentTile} data-testid="composer-media-tile">
            <button
              type="button"
              onClick={() => onRemove(mediaItem.localId)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/95 p-1.5 text-slate-500 shadow-sm hover:text-slate-800"
              aria-label={`Remove ${mediaItem.name || 'attachment'}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            {type === 'video' ? (
              <button
                type="button"
                className="relative block h-48 w-full overflow-hidden text-left"
                onClick={() => onOpenPreview?.(mediaItem)}
              >
                {mediaItem.uploading ? (
                  <video
                    src={src || undefined}
                    poster={poster}
                    className="h-48 w-full object-cover"
                    muted
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                  />
                ) : (
                  <InlineAutoplayVideo
                    src={src || ''}
                    fallbackSrc={fallbackSrc || undefined}
                    poster={poster}
                    className="h-48 w-full object-cover"
                    controls={false}
                    loop
                    eagerLoad
                    autoplayEnabled
                    preload="metadata"
                    loadingLabel="Video preview loading"
                  />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent px-3 pb-3 pt-8">
                  <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-900">
                    Video preview
                  </span>
                </div>
              </button>
            ) : type === 'image' ? (
              <button type="button" className="block h-48 w-full" onClick={() => onOpenPreview?.(mediaItem)}>
                <OptimizedImage
                  src={poster || src || ''}
                  fallbackSrc={fallbackSrc || src || ''}
                  alt={mediaItem.name || 'Image attachment'}
                  width={960}
                  height={540}
                  sizes="(max-width: 1280px) 100vw, 420px"
                  className="h-48 w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenPreview?.(mediaItem)}
                className="flex h-36 w-full flex-col items-center justify-center gap-2 p-4 text-xs text-slate-600"
              >
                <FileText className="h-7 w-7 text-slate-400" aria-hidden />
                <span className="max-w-full truncate font-semibold text-slate-800">{mediaItem.name || 'Document'}</span>
                {mediaItem.size ? (
                  <span className="text-[11px] text-slate-500">{formatComposerBytes(mediaItem.size)}</span>
                ) : null}
              </button>
            )}

            {mediaItem.uploading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 px-4 text-center">
                <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-700">Uploading {progress}%</span>
              </div>
            ) : null}

            {mediaItem.error ? (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                <span className="min-w-0 truncate">{mediaItem.error}</span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={() => onRetry(mediaItem.localId)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}

            {!mediaItem.uploading && !mediaItem.error && mediaItem.id ? (
              <div className="absolute bottom-2 left-2 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                Ready
              </div>
            ) : null}
            {!mediaItem.uploading && !mediaItem.error && mediaItem.id && mediaItem.file ? (
              <ScrolithaMediaEnhanceOffer
                file={mediaItem.file}
                kind={type === 'video' ? 'video' : 'image'}
                onAccept={(enhanced) => onEnhance?.(mediaItem, enhanced)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ComposerMediaPreviewGrid;
