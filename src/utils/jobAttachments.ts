import { UploadedFile } from '../types';
import { resolvePostAttachmentMediaUrl } from './postAttachmentMedia';
import { resolveAssetUrl } from './assetUrl';

const ENCODED_PREFIX = 'scrolith-job-attachment:';

export type JobAttachmentKind = 'image' | 'video' | 'pdf' | 'document';

export type JobAttachmentPreview = {
  raw: string;
  fileId?: string;
  url: string;
  name: string;
  kind: JobAttachmentKind;
  mimeType?: string;
  thumbnailUrl?: string;
  size?: number;
};

const safeJsonParse = (value: string) => {
  let candidate = String(value || '').trim();

  // Older job records persisted the attachment payload as URI-encoded JSON
  // after the custom scheme prefix. Decode at most twice so malformed input
  // cannot cause an unbounded decode loop while preserving normal JSON.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = JSON.parse(candidate);
      return parsed;
    } catch {
      try {
        const decoded = decodeURIComponent(candidate);
        if (decoded === candidate) break;
        candidate = decoded;
      } catch {
        break;
      }
    }
  }

  return null;
};

const extractEncodedPayload = (value: string) => {
  const markerIndex = value.indexOf(ENCODED_PREFIX);
  if (markerIndex < 0) return null;
  return safeJsonParse(value.slice(markerIndex + ENCODED_PREFIX.length));
};

const fileNameFromUrl = (url: string) => {
  const clean = String(url || '').split('?')[0].split('#')[0];
  const last = clean.split('/').filter(Boolean).pop() || '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

const inferKind = (input: { type?: string | null; mimeType?: string | null; name?: string | null; url?: string | null }): JobAttachmentKind => {
  const type = String(input.type || '').toLowerCase();
  const mime = String(input.mimeType || '').toLowerCase();
  const marker = `${input.name || ''} ${input.url || ''}`.toLowerCase().split('?')[0].split('#')[0];

  if (type === 'image' || mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(marker)) return 'image';
  if (type === 'video' || mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/i.test(marker)) return 'video';
  if (mime === 'application/pdf' || /\.pdf$/i.test(marker)) return 'pdf';
  return 'document';
};

export const encodeJobAttachment = (file: UploadedFile): string => {
  const fileId = String(file.fileId || file.id || '').trim();
  const url = String(file.url || '').trim();
  const payload = {
    fileId,
    url,
    name: String(file.name || fileNameFromUrl(url) || fileId || 'Attachment').trim(),
    type: String(file.type || '').trim(),
    mimeType: String(file.mimeType || file.mime_type || '').trim(),
    thumbnailUrl: String(file.thumbnailUrl || file.thumbnail_url || '').trim(),
    size: Number(file.size || 0) || undefined
  };
  return `${ENCODED_PREFIX}${JSON.stringify(payload)}`;
};

export const parseJobAttachment = (value: unknown): JobAttachmentPreview => {
  const raw = typeof value === 'string' ? value : JSON.stringify(value || '');
  const trimmed = String(raw || '').trim();
  const encoded = extractEncodedPayload(trimmed);
  const objectValue = !encoded && trimmed.startsWith('{') ? safeJsonParse(trimmed) : null;
  const source = encoded || objectValue || {};
  const fileId = String(source.fileId || source.file_id || '').trim();
  const directUrl = String(source.url || source.downloadUrl || source.download_url || '').trim();
  const resolvedUrl =
    resolvePostAttachmentMediaUrl(source) ||
    (fileId ? resolvePostAttachmentMediaUrl({ fileId }) : '') ||
    resolveAssetUrl(directUrl) ||
    directUrl ||
    (trimmed && !trimmed.startsWith(ENCODED_PREFIX) ? resolveAssetUrl(trimmed) || trimmed : '');
  const thumbnailUrl = resolveAssetUrl(String(source.thumbnailUrl || source.thumbnail_url || '')) || '';
  const name = String(source.name || fileNameFromUrl(directUrl || resolvedUrl) || fileId || 'Attachment').trim();
  const mimeType = String(source.mimeType || source.mime_type || '').trim();
  return {
    raw: trimmed,
    fileId,
    url: resolvedUrl,
    name,
    kind: inferKind({ type: source.type, mimeType, name, url: directUrl || resolvedUrl }),
    mimeType,
    thumbnailUrl,
    size: Number(source.size || 0) || undefined
  };
};

export const normalizeJobAttachmentPayload = (values: unknown[]): string[] =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean);

export const isSameJobAttachment = (left: unknown, right: unknown) => {
  const a = parseJobAttachment(left);
  const b = parseJobAttachment(right);
  if (a.fileId && b.fileId) return a.fileId === b.fileId;
  if (a.url && b.url) return a.url === b.url;
  return a.raw === b.raw;
};
