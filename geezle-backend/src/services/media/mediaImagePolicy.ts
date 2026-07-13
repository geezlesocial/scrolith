/**
 * Pure image policy helpers (no Sharp / no native deps).
 * Safe to import from the upload path without loading native modules.
 */

export type ImageCategory =
  | 'avatar'
  | 'cover'
  | 'post'
  | 'marketplace'
  | 'story'
  | 'ads_cms'
  | 'chat'
  | 'default';

const IMAGE_MIME_PREFIX = 'image/';
const ELIGIBLE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff'
]);

export const isEligibleImageMime = (mimeType?: string | null) => {
  const m = String(mimeType || '')
    .trim()
    .toLowerCase();
  if (!m.startsWith(IMAGE_MIME_PREFIX)) return false;
  return ELIGIBLE_MIME.has(m);
};

export const inferImageCategory = (params: {
  category?: string | null;
  usageTypes?: string[] | null;
  originalName?: string | null;
}): ImageCategory => {
  const cat = String(params.category || '')
    .trim()
    .toLowerCase();
  const usages = (params.usageTypes || []).map((u) => String(u || '').toLowerCase());
  const joined = `${cat} ${usages.join(' ')}`;

  if (/avatar|profile.?photo|profile.?image/.test(joined)) return 'avatar';
  if (/cover|banner|page.?cover|user.?cover/.test(joined)) return 'cover';
  if (/marketplace|listing|product/.test(joined)) return 'marketplace';
  if (/story/.test(joined)) return 'story';
  if (/ad|campaign|cms|admin/.test(joined)) return 'ads_cms';
  if (/chat|message|messenger|dm/.test(joined)) return 'chat';
  if (/post|feed|community|attachment/.test(joined)) return 'post';
  if (cat === 'image' || cat === 'images' || cat === 'general') return 'default';
  return 'default';
};

const CATEGORY_WIDTHS: Record<ImageCategory, number[]> = {
  avatar: [64, 128, 256, 512],
  cover: [640, 1280, 1920, 2560],
  post: [320, 640, 960, 1280, 1920],
  marketplace: [320, 640, 960, 1280],
  story: [320, 640, 1080],
  ads_cms: [320, 640, 1280, 1920],
  chat: [160, 320, 640, 1280],
  default: [320, 640, 1280]
};

const THUMB_WIDTHS = [160, 320];

export const planVariantWidths = (category: ImageCategory, sourceWidth: number): number[] => {
  const planned = CATEGORY_WIDTHS[category] || CATEGORY_WIDTHS.default;
  const maxW = Math.max(1, Math.floor(sourceWidth || 1));
  const filtered = planned.filter((w) => w <= maxW);
  if (!filtered.length) return [Math.min(maxW, planned[0] || 320)];
  return Array.from(new Set(filtered)).sort((a, b) => a - b);
};

export const planThumbWidths = (sourceWidth: number): number[] => {
  const maxW = Math.max(1, Math.floor(sourceWidth || 1));
  return THUMB_WIDTHS.filter((w) => w <= maxW);
};
