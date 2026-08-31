import { parseJobAttachment } from './jobAttachments';

export type JobCardMedia = {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  fileId?: string;
  width?: number;
  height?: number;
  size?: number;
  name?: string;
};

type MediaHint = 'image' | 'video' | undefined;

const imageFields = new Set(['images']);
const videoFields = new Set(['video', 'videos']);
const mediaFields = [
  'media',
  'attachments',
  'images',
  'videos',
  'mediaFiles',
  'media_files',
  'mediaObjects',
  'media_objects',
  'image',
  'video'
] as const;

const asNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const getHint = (field: string): MediaHint => {
  const normalized = field.toLowerCase();
  if (videoFields.has(normalized)) return 'video';
  if (imageFields.has(normalized)) return 'image';
  return undefined;
};

const entriesFor = (value: unknown): unknown[] => (Array.isArray(value) ? value : value ? [value] : []);

const normalizeCandidate = (value: unknown, hint: MediaHint): JobCardMedia | null => {
  const parsed = parseJobAttachment(value);
  const source = value && typeof value === 'object' ? value as any : {};
  const type = parsed.kind === 'image' || parsed.kind === 'video' ? parsed.kind : hint;
  const url = String(parsed.url || '').trim();
  if (!type || !url) return null;

  const thumbnailUrl = String(
    parsed.thumbnailUrl ||
      source.thumbnailUrl ||
      source.thumbnail_url ||
      source.posterUrl ||
      source.poster_url ||
      source.previewUrl ||
      source.preview_url ||
      ''
  ).trim();

  return {
    type,
    url,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(parsed.fileId ? { fileId: parsed.fileId } : {}),
    ...(asNumber(source.width || source.width_px) ? { width: asNumber(source.width || source.width_px) } : {}),
    ...(asNumber(source.height || source.height_px) ? { height: asNumber(source.height || source.height_px) } : {}),
    ...(parsed.size ? { size: parsed.size } : {}),
    ...(parsed.name ? { name: parsed.name } : {})
  };
};

const scoreCandidate = (candidate: JobCardMedia) => {
  const pixels = (candidate.width || 0) * (candidate.height || 0);
  const bytes = candidate.size || 0;
  // Prefer known dimensions, then usable file size. Keep ordering deterministic
  // so feed refreshes do not swap the visible job media unexpectedly.
  return pixels > 0 ? pixels : bytes > 0 ? bytes : 1;
};

/** Select exactly one piece of job-owned image/video media; never uses an avatar. */
export const getJobCardMedia = (job: unknown): JobCardMedia | null => {
  if (!job || typeof job !== 'object') return null;
  const source = job as Record<string, unknown>;
  const candidates: JobCardMedia[] = [];

  for (const field of mediaFields) {
    const hint = getHint(field);
    for (const value of entriesFor(source[field])) {
      const candidate = normalizeCandidate(value, hint);
      if (!candidate) continue;
      const duplicate = candidates.some((existing) =>
        (existing.fileId && candidate.fileId && existing.fileId === candidate.fileId) || existing.url === candidate.url
      );
      if (!duplicate) candidates.push(candidate);
    }
  }

  return candidates.reduce<JobCardMedia | null>((best, candidate) => {
    if (!best || scoreCandidate(candidate) > scoreCandidate(best)) return candidate;
    return best;
  }, null);
};

export default getJobCardMedia;
