import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Paperclip, RefreshCw } from 'lucide-react';
import {
  canUseDirectMediaUrl,
  downloadMessageAttachment,
  fetchAuthenticatedMediaObjectUrl,
  formatMediaBytes,
  formatMediaDuration,
  getAttachmentCacheKey,
  getMessageAttachmentIdentityKey,
  isOversizedPrivateBlobPreview,
  MAX_PRIVATE_MEDIA_BLOB_BYTES,
  normalizeMessageAttachment,
  prefersDirectRangeStreaming,
  releaseAuthenticatedMediaUrl,
  retainAuthenticatedMediaUrl,
  shouldAutoPreloadMessagingMedia,
  type NormalizedMessageAttachment
} from '../../services/messagingMedia';
import VoiceNotePlayer from './VoiceNotePlayer';

type MessageAttachmentRendererProps = {
  attachment: any;
  forceVoiceNote?: boolean;
  variant?: 'default' | 'outgoing';
  className?: string;
  autoPreload?: boolean;
};

const mapLoadError = (err: any): string => {
  const code = String(err?.code || '');
  if (code === 'preview_too_large') return 'preview_too_large';
  if (code === 'access_expired') return 'access_expired';
  const status = Number(err?.response?.status || err?.status || 0);
  if (status === 401) return 'auth_required';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 410) return 'access_expired';
  if (status === 416) return 'range_unsatisfiable';
  const message = String(err?.message || '').toLowerCase();
  if (message.includes('abort')) return 'aborted';
  if (message.includes('expired') || message.includes('signature')) return 'access_expired';
  if (message.includes('empty media') || message.includes('invalid media') || message.includes('media unavailable')) {
    return 'corrupt';
  }
  if (message.includes('network') || message.includes('timeout') || message.includes('offline')) {
    return 'network';
  }
  return 'preview_failed';
};

const errorLabel = (code: string | null): string => {
  switch (code) {
    case 'preview_too_large':
      return 'Video too large to preview safely inline';
    case 'auth_required':
      return 'Sign in required to preview';
    case 'forbidden':
      return 'You do not have access to this media';
    case 'not_found':
      return 'File no longer available';
    case 'access_expired':
      return 'Access expired — refresh preview';
    case 'corrupt':
      return 'Media could not be decoded';
    case 'network':
      return 'Network unavailable — retry when connected';
    case 'aborted':
      return 'Preview cancelled';
    case 'decode_failed':
      return 'Image preview unavailable';
    default:
      return 'Preview temporarily unavailable';
  }
};

const MessageAttachmentRenderer: React.FC<MessageAttachmentRendererProps> = ({
  attachment,
  forceVoiceNote = false,
  variant = 'default',
  className = '',
  autoPreload
}) => {
  const normalized = useMemo(
    () => normalizeMessageAttachment(attachment, { forceVoiceNote }),
    // Identity-stable: recompute when content keys change, not every parent object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      forceVoiceNote,
      attachment?.id,
      attachment?.fileId,
      attachment?.file_id,
      attachment?.url,
      attachment?.contentUrl,
      attachment?.mimeType,
      attachment?.mime_type,
      attachment?.type,
      attachment?.name,
      attachment?.filename,
      attachment?.originalName,
      attachment?.size,
      attachment?.durationMs,
      attachment?.duration_ms,
      typeof attachment === 'string' ? attachment : ''
    ]
  );
  const attachmentRef = useRef(attachment);
  attachmentRef.current = attachment;
  const forceVoiceNoteRef = useRef(forceVoiceNote);
  forceVoiceNoteRef.current = forceVoiceNote;

  const [objectUrl, setObjectUrl] = useState<string>('');
  const [directStreamUrl, setDirectStreamUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [blurPlaceholder, setBlurPlaceholder] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState<'idle' | 'direct' | 'blob' | 'download_only'>('idle');
  const [durationLabel, setDurationLabel] = useState(
    formatMediaDuration(normalized?.durationMs)
  );
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const heldKeyRef = useRef<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadGenerationRef = useRef(0);

  const cacheKey = normalized ? getAttachmentCacheKey(normalized) : '';
  /** Stable across parent re-renders that only change object identity. */
  const attachmentIdentity = getMessageAttachmentIdentityKey(normalized);
  const mediaKind = normalized?.type || '';
  const isOutgoing = variant === 'outgoing';
  const saveData = Boolean((navigator as any)?.connection?.saveData);
  const shouldPreload =
    autoPreload ??
    (normalized
      ? shouldAutoPreloadMessagingMedia(normalized.type, {
          saveData,
          size: normalized.size
        })
      : false);

  const oversizedPrivate =
    normalized != null && isOversizedPrivateBlobPreview(normalized, MAX_PRIVATE_MEDIA_BLOB_BYTES);

  const releaseHeldUrl = useCallback(() => {
    if (heldKeyRef.current) {
      releaseAuthenticatedMediaUrl(heldKeyRef.current);
      heldKeyRef.current = '';
    }
  }, []);

  const stopMediaElements = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    } catch {
      // ignore
    }
    try {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    } catch {
      // ignore
    }
  }, []);

  const loadMedia = useCallback(
    async (force = false) => {
      const current = normalizeMessageAttachment(attachmentRef.current, {
        forceVoiceNote: forceVoiceNoteRef.current
      });
      if (!current) return;
      if (!current.canPreview && current.type !== 'document' && current.type !== 'generic_file') {
        return;
      }
      if (!current.fileId && !current.url) return;
      if (current.type === 'document' || current.type === 'generic_file') return;

      const key = getAttachmentCacheKey(current);
      const oversized = isOversizedPrivateBlobPreview(current, MAX_PRIVATE_MEDIA_BLOB_BYTES);

      // Prefer direct Range streaming when auth is not required for native elements.
      if (prefersDirectRangeStreaming(current) && current.url) {
        setDirectStreamUrl(current.url);
        setObjectUrl('');
        setError(null);
        setLoading(false);
        setVideoMode('direct');
        return;
      }

      // Known oversized private videos: never allocate full blob; download-only fallback.
      if (current.type === 'video' && oversized) {
        setVideoMode('download_only');
        setError('preview_too_large');
        setObjectUrl('');
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const generation = ++loadGenerationRef.current;
      setLoading(true);
      setError(null);
      setImageReady(false);
      try {
        // If already cached, retain without re-fetch.
        if (!force && key) {
          const retained = retainAuthenticatedMediaUrl(key);
          if (retained) {
            if (!mountedRef.current || controller.signal.aborted || generation !== loadGenerationRef.current) {
              releaseAuthenticatedMediaUrl(key);
              return;
            }
            releaseHeldUrl();
            heldKeyRef.current = key;
            setObjectUrl(retained);
            setDirectStreamUrl('');
            if (current.type === 'video') setVideoMode('blob');
            return;
          }
        }

        // Release our prior hold before force-replace so the old object URL can be revoked.
        if (force) {
          releaseHeldUrl();
        }

        const url = await fetchAuthenticatedMediaObjectUrl(current, {
          signal: controller.signal,
          force,
          maxBytes: MAX_PRIVATE_MEDIA_BLOB_BYTES
        });
        if (!mountedRef.current || controller.signal.aborted || generation !== loadGenerationRef.current) {
          // Stale response: release the retain performed by fetch.
          if (key) releaseAuthenticatedMediaUrl(key);
          return;
        }
        releaseHeldUrl();
        heldKeyRef.current = key;
        setObjectUrl(url);
        setDirectStreamUrl('');
        setError(null);
        if (current.type === 'video') setVideoMode('blob');
      } catch (err: any) {
        if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
        if (!mountedRef.current) return;
        const code = mapLoadError(err);
        if (code === 'aborted') return;

        if (code === 'preview_too_large' && current.type === 'video') {
          setVideoMode('download_only');
          setError('preview_too_large');
          setObjectUrl('');
          return;
        }

        // Direct public URL fallback when blob path fails and auth is not required.
        if (current.url && canUseDirectMediaUrl(current)) {
          setDirectStreamUrl(current.url);
          setObjectUrl('');
          setError(null);
          if (current.type === 'video') setVideoMode('direct');
          return;
        }

        setError(code);
      } finally {
        if (mountedRef.current && !controller.signal.aborted && generation === loadGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [releaseHeldUrl]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      stopMediaElements();
      releaseHeldUrl();
    };
  }, [releaseHeldUrl, stopMediaElements]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    // Only reset when the attachment *content identity* changes (file id / url),
    // not when the parent re-creates a new attachment object with the same data.
    // Identity thrash previously aborted loads and left inViewport stuck false after
    // IntersectionObserver disconnected — permanent "Image preview unavailable".
    stopMediaElements();
    releaseHeldUrl();
    abortRef.current?.abort();
    setObjectUrl('');
    setDirectStreamUrl('');
    setImageReady(false);
    setBlurPlaceholder('');
    setError(null);
    setDownloadError(null);
    setVideoMode('idle');
    setInViewport(false);
    setDurationLabel(formatMediaDuration(normalized?.durationMs));
    loadGenerationRef.current += 1;

    if (!attachmentIdentity || !normalized) return;

    // Progressive placeholder from disk cache metadata when available.
    if (mediaKind === 'image' && cacheKey) {
      void import('../../services/messagingEngine/mediaDiskCache')
        .then(({ getDiskCacheMeta }) => getDiskCacheMeta(cacheKey))
        .then((meta) => {
          if (meta?.blurDataUrl) setBlurPlaceholder(meta.blurDataUrl);
        })
        .catch(() => undefined);
    }

    if (mediaKind === 'video') {
      if (oversizedPrivate) {
        setVideoMode('download_only');
        setError('preview_too_large');
        return;
      }
      // Direct Range / private videos: explicit Load video only (no auto-blob).
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: identity key only
  }, [attachmentIdentity, cacheKey, mediaKind, oversizedPrivate, releaseHeldUrl, stopMediaElements]);

  // Viewport gate: avoid fetching every historical image/audio row on conversation open.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) {
      setInViewport(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setInViewport(true);
      return;
    }

    // Already visible (common after parent re-render / dock restore): load immediately.
    const rect = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = 160;
    if (rect.bottom >= -margin && rect.top <= viewportHeight + margin && rect.width > 0) {
      setInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInViewport(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: '160px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [attachmentIdentity]);

  useEffect(() => {
    if (!attachmentIdentity || !shouldPreload || !inViewport) return;
    if (mediaKind === 'video') return;
    if (mediaKind !== 'image' && mediaKind !== 'audio' && mediaKind !== 'voice_note') return;
    void loadMedia(false);
  }, [attachmentIdentity, mediaKind, shouldPreload, inViewport, loadMedia]);

  if (!normalized) return null;

  const shellClass = isOutgoing
    ? 'border-white/30 bg-white/15 text-white'
    : 'border-slate-200 bg-white text-slate-700';
  const mutedClass = isOutgoing ? 'text-blue-100' : 'text-slate-500';
  const buttonClass = isOutgoing
    ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  const handleDownload = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadMessageAttachment(normalized);
    } catch (err: any) {
      if (String(err?.code || '') === 'download_in_progress') return;
      const status = Number(err?.status || err?.response?.status || 0);
      if (status === 401) setDownloadError('Sign in required');
      else if (status === 403) setDownloadError('Access denied');
      else setDownloadError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const resolvedSrc =
    objectUrl ||
    directStreamUrl ||
    (canUseDirectMediaUrl(normalized) ? normalized.url : '');

  const showDownloadOnlyVideo = normalized.type === 'video' && (videoMode === 'download_only' || error === 'preview_too_large');

  return (
    <div ref={rootRef} className={`rounded-lg border p-2 text-xs ${shellClass} ${className}`.trim()}>
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="truncate font-semibold" title={normalized.name}>
            {normalized.name}
          </div>
          <div className={`text-[10px] ${mutedClass}`}>
            {[formatMediaBytes(normalized.size), durationLabel].filter(Boolean).join(' · ') ||
              (normalized.type === 'voice_note' ? 'Voice note' : normalized.type)}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => void handleDownload(event)}
          disabled={downloading}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:opacity-50 ${buttonClass}`}
          aria-label={`Download ${normalized.name}`}
          title={`Download ${normalized.name}`}
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
          <span>Download</span>
        </button>
      </div>

      {downloadError ? (
        <div className={`mb-2 rounded-md px-2 py-1 text-[10px] ${isOutgoing ? 'bg-white/10' : 'bg-red-50 text-red-700'}`} role="status">
          {downloadError}
        </div>
      ) : null}

      {error && !showDownloadOnlyVideo ? (
        <div
          className={`mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${isOutgoing ? 'bg-white/10' : 'bg-slate-50'}`}
          role="status"
        >
          <span className={mutedClass}>{errorLabel(error)}</span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void loadMedia(true);
            }}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${buttonClass}`}
            aria-label="Retry media load"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Retry
          </button>
        </div>
      ) : null}

      {normalized.type === 'image' ? (
        <div
          className={`relative overflow-hidden rounded-md ${isOutgoing ? 'bg-white/10' : 'bg-slate-100'}`}
          style={{ minHeight: resolvedSrc || loading || blurPlaceholder ? 112 : undefined }}
        >
          {/* Progressive blur / skeleton placeholder — reserves space, prevents layout shift */}
          {!imageReady || loading ? (
            blurPlaceholder ? (
              <img
                src={blurPlaceholder}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-md"
              />
            ) : (
              <div
                className={`absolute inset-0 animate-pulse ${isOutgoing ? 'bg-white/10' : 'bg-slate-200/80'}`}
                aria-hidden
              />
            )
          ) : null}
          {resolvedSrc ? (
            <a href={resolvedSrc} target="_blank" rel="noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
              <img
                src={resolvedSrc}
                alt={normalized.name || 'Message image attachment'}
                className={[
                  'max-h-56 w-full rounded-md object-contain transition-opacity duration-300',
                  imageReady ? 'opacity-100' : 'opacity-0'
                ].join(' ')}
                loading="lazy"
                decoding="async"
                onLoad={() => {
                  setImageReady(true);
                  setError(null);
                }}
                onError={() => {
                  // Do not mark ready on decode failure — surface retry path.
                  setImageReady(false);
                  setObjectUrl('');
                  setDirectStreamUrl('');
                  setError((prev) => prev || 'decode_failed');
                }}
              />
            </a>
          ) : (
            <div
              className={`flex h-40 flex-col items-center justify-center gap-2 rounded-md px-3 text-center ${mutedClass}`}
              role="status"
              aria-live="polite"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading preview" />
                  <span className="text-[10px]">Loading preview…</span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-medium">
                    {error ? errorLabel(error) : 'Preview temporarily unavailable'}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void loadMedia(true);
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${buttonClass}`}
                    aria-label="Refresh image preview"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Refresh preview
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {normalized.type === 'video' ? (
        showDownloadOnlyVideo ? (
          <div
            className={`flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-md px-3 py-4 text-center ${isOutgoing ? 'bg-white/10' : 'bg-slate-100'} ${mutedClass}`}
            role="status"
          >
            <p className="text-[11px] font-medium text-inherit">
              This video is too large to preview safely in chat.
            </p>
            <p className="text-[10px] opacity-90">
              Use Download to save it, or open the conversation on a larger screen if available.
            </p>
            <button
              type="button"
              onClick={(event) => void handleDownload(event)}
              disabled={downloading}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:opacity-50 ${buttonClass}`}
              aria-label={`Download large video ${normalized.name}`}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
              Download video
            </button>
          </div>
        ) : resolvedSrc ? (
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            src={resolvedSrc}
            className="max-h-56 w-full rounded-md bg-black"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Video attachment ${normalized.name}`}
          />
        ) : (
          <div
            className={`flex h-40 flex-col items-center justify-center gap-2 rounded-md ${isOutgoing ? 'bg-white/10' : 'bg-slate-100'} ${mutedClass}`}
            role="status"
            aria-live="polite"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading video" />
            ) : (
              <>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${buttonClass}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (prefersDirectRangeStreaming(normalized) && normalized.url) {
                      setDirectStreamUrl(normalized.url);
                      setVideoMode('direct');
                      setError(null);
                      return;
                    }
                    void loadMedia(true);
                  }}
                  aria-label={`Load video ${normalized.name}`}
                >
                  Load video
                </button>
                <span className="text-[10px] opacity-80">Preview loads on demand</span>
              </>
            )}
          </div>
        )
      ) : null}

      {normalized.type === 'audio' || normalized.type === 'voice_note' ? (
        resolvedSrc ? (
          <VoiceNotePlayer
            src={resolvedSrc}
            name={normalized.name || (normalized.type === 'voice_note' ? 'Voice note' : 'Audio')}
            outgoing={isOutgoing}
            durationMsHint={
              Number(
                (normalized as any).durationMs ||
                  (normalized as any).duration_ms ||
                  (normalized as any).duration ||
                  0
              ) || 0
            }
            onDownload={() => {
              void downloadMessageAttachment(normalized).catch(() => undefined);
            }}
          />
        ) : (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 ${isOutgoing ? 'bg-white/10' : 'bg-slate-100'} ${mutedClass}`}
            role="status"
            aria-live="polite"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Preparing audio" /> : <Paperclip className="h-4 w-4" aria-hidden />}
            <span>{loading ? 'Preparing audio…' : 'Audio unavailable'}</span>
            {!loading ? (
              <button
                type="button"
                className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${buttonClass}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void loadMedia(true);
                }}
                aria-label="Load audio"
              >
                Load
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {normalized.type === 'document' || normalized.type === 'generic_file' ? (
        <div
          className={`flex max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-3 py-2 ${isOutgoing ? 'border-white/20' : 'border-slate-200'}`}
        >
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium" title={normalized.name}>
            {normalized.name}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export const MessageAttachmentsList: React.FC<{
  attachments: NormalizedMessageAttachment[] | any[];
  outgoing?: boolean;
  className?: string;
}> = ({ attachments, outgoing = false, className = '' }) => {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return null;
  return (
    <div className={`mt-2 space-y-2 ${className}`.trim()}>
      {list.map((attachment, index) => {
        const key =
          (attachment && (attachment.id || attachment.fileId || attachment.url)) || `attachment-${index}`;
        return (
          <MessageAttachmentRenderer
            key={String(key)}
            attachment={attachment}
            forceVoiceNote={attachment?.type === 'voice_note'}
            variant={outgoing ? 'outgoing' : 'default'}
          />
        );
      })}
    </div>
  );
};

export default MessageAttachmentRenderer;
