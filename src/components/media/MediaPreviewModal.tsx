import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Play, X } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { downloadToDevice } from '../../utils/deviceDownload';

export type PreviewMedia = {
  id?: string;
  url: string;
  name?: string;
  mimeType?: string;
  type?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
};

type MediaPreviewModalProps = {
  open: boolean;
  media: PreviewMedia | null;
  onClose: () => void;
  allowDownload?: boolean;
  allowCopyUrl?: boolean;
};

const inferType = (media: PreviewMedia | null) => {
  if (!media) return 'unknown';
  const explicit = String(media.type || '').toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  const url = String(media.url || '').toLowerCase();
  if (url.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(url)) return 'video';
  return 'document';
};

const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  open,
  media,
  onClose,
  allowDownload = true,
  allowCopyUrl = true
}) => {
  const { showNotification } = useNotification();
  const [playVideo, setPlayVideo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const mediaType = useMemo(() => inferType(media), [media]);

  useEffect(() => {
    setPlayVideo(false);
  }, [media?.id, media?.url, open]);

  if (!open || !media) return null;

  const copyUrl = async () => {
    if (!media.url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(media.url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = media.url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleDownload = async () => {
    if (!media?.url || downloading) return;
    setDownloading(true);
    try {
      const result = await downloadToDevice({
        url: media.url,
        fileName: media.name,
        mimeType: media.mimeType
      });
      showNotification(
        'success',
        'Download',
        result.native ? `Saved to ${result.path || 'your device'}.` : 'Download started.'
      );
    } catch (error: any) {
      console.error('Failed to download media:', error);
      showNotification('error', 'Download', error?.message || 'Unable to download file.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{media.name || 'Media preview'}</p>
            <p className="text-xs text-slate-500">{media.mimeType || media.type || 'file'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto bg-slate-950 p-4">
          {mediaType === 'image' && (
            <img src={media.url} alt={media.name || 'Preview'} className="mx-auto max-h-[64vh] w-auto max-w-full object-contain" />
          )}

          {mediaType === 'video' && (
            <>
              {!playVideo ? (
                <button
                  type="button"
                  onClick={() => setPlayVideo(true)}
                  className="group relative mx-auto block max-h-[64vh] w-full max-w-4xl overflow-hidden rounded-xl"
                >
                  {media.thumbnailUrl ? (
                    <img src={media.thumbnailUrl} alt={media.name || 'Video thumbnail'} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-[50vh] items-center justify-center bg-slate-800 text-slate-100">Video</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900">
                      <Play className="h-4 w-4" />
                      Play
                    </span>
                  </div>
                </button>
              ) : (
                <video
                  src={media.url}
                  poster={media.thumbnailUrl || undefined}
                  controls
                  autoPlay
                  className="mx-auto max-h-[64vh] w-full max-w-4xl rounded-xl"
                />
              )}
            </>
          )}

          {mediaType === 'pdf' && (
            <iframe
              title={media.name || 'PDF preview'}
              src={media.url}
              className="h-[64vh] w-full rounded-xl border border-slate-700 bg-white"
            />
          )}

          {mediaType === 'document' && (
            <div className="flex h-[40vh] items-center justify-center">
              <a
                href={media.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                <ExternalLink className="h-4 w-4" />
                Open document
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {allowCopyUrl && (
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              Copy URL
            </button>
          )}
          <a
            href={media.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </a>
          {allowDownload && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Saving...' : 'Download'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaPreviewModal;
