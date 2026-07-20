import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { compareHashes, Jimp } from 'jimp';
import prisma from '../utils/prismaClient';
import { downloadBlobByName, extractBlobNameFromUrl } from './storage/blobStorage';
import { downloadDatabaseStorageBufferByName } from './storage/databaseStorage';
import { downloadFirebaseStorageBufferByName } from './storage/firebaseStorage';
import { downloadGcsMediaBuffer, GOOGLE_CLOUD_STORAGE_PROVIDER } from './storage/gcsMediaStorage';

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const DEFAULT_STORAGE_PROVIDER = 'local';
const DATABASE_STORAGE_PROVIDER = 'database_storage';
const AZURE_BLOB_STORAGE_PROVIDER = 'azure_blob';
const FIREBASE_STORAGE_PROVIDER = 'firebase_storage';
const GCS_MEDIA_STORAGE_PROVIDER = GOOGLE_CLOUD_STORAGE_PROVIDER;
const DEFAULT_VIDEO_THUMBNAIL_FILENAME = '__video_fallback_thumbnail.svg';
const VIDEO_USAGE_TYPES = ['community_post', 'scroll_video'] as const;
const VIDEO_PERCEPTUAL_HASH_VERSION = 1;
const EXACT_CANDIDATE_LIMIT = 24;
const PERCEPTUAL_CANDIDATE_LIMIT = 40;
const PERCEPTUAL_HASH_DISTANCE_THRESHOLD = 0.1;
const PERCEPTUAL_CONFIDENCE_THRESHOLD = 0.88;
const PERCEPTUAL_DURATION_TOLERANCE_RATIO = 0.08;
const PERCEPTUAL_DURATION_TOLERANCE_MIN_SECONDS = 2.5;
const PERCEPTUAL_DURATION_TOLERANCE_MAX_SECONDS = 6;
const PERCEPTUAL_ASPECT_RATIO_DELTA_MAX = 0.1;

type FileLike = {
  id: string;
  ownerId?: string | null;
  mimeType?: string | null;
  size?: bigint | number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  storageKey?: string | null;
  storageProvider?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  videoPerceptualHash?: string | null;
  videoPerceptualHashVersion?: number | null;
  createdAt?: Date | null;
};

export type VideoIntegrityStatus = 'clear' | 'suspected_duplicate';
export type VideoIntegrityMatchMethod = 'exact_sha256' | 'perceptual_thumbnail';

export type VideoIntegrityAssessment = {
  fingerprint: string | null;
  status: VideoIntegrityStatus;
  monetizationBlocked: boolean;
  matchedContentId: string | null;
  matchedOwnerId: string | null;
  reason: string | null;
  matchMethod: VideoIntegrityMatchMethod | null;
  matchScore: number | null;
};

const videoFileSelect = {
  id: true,
  ownerId: true,
  mimeType: true,
  size: true,
  duration: true,
  width: true,
  height: true,
  storageKey: true,
  storageProvider: true,
  url: true,
  thumbnailUrl: true,
  videoPerceptualHash: true,
  videoPerceptualHashVersion: true,
  createdAt: true
} as const;

const stripUploadsPrefix = (value: string) => String(value || '').replace(/^\/+/, '').replace(/^uploads\/+/i, '');
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundScore = (value: number | null) => (value === null ? null : Number(value.toFixed(4)));

const streamToSha256 = async (stream: NodeJS.ReadableStream) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });

const streamToBuffer = async (stream: NodeJS.ReadableStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });

const bufferToSha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

const resolveLocalUploadPath = (value: string) => {
  const normalized = stripUploadsPrefix(String(value || '').replace(/^https?:\/\/[^/]+/i, ''));
  const localPath = path.resolve(UPLOAD_DIR, normalized);
  const uploadsRoot = path.resolve(UPLOAD_DIR);
  if (!localPath.startsWith(uploadsRoot)) {
    throw new Error('Resolved media path is invalid.');
  }
  return localPath;
};

const normalizeStorageProvider = (value: unknown) => {
  const provider = String(value || DEFAULT_STORAGE_PROVIDER).trim().toLowerCase();
  if (['firebase', 'firebase_storage'].includes(provider)) return FIREBASE_STORAGE_PROVIDER;
  if (['gcs', 'google_cloud_storage', 'google-cloud-storage', GCS_MEDIA_STORAGE_PROVIDER].includes(provider)) {
    return GCS_MEDIA_STORAGE_PROVIDER;
  }
  if (['azure', 'azure_blob', 'blob'].includes(provider)) return AZURE_BLOB_STORAGE_PROVIDER;
  if (['database', 'database_storage', 'db'].includes(provider)) return DATABASE_STORAGE_PROVIDER;
  return provider || DEFAULT_STORAGE_PROVIDER;
};

const computeFileSha256 = async (file: FileLike) => {
  const provider = normalizeStorageProvider(file.storageProvider);
  const errors: string[] = [];

  // Prefer cloud object storage first when a storageKey is present (production Cloud Run has no local uploads disk).
  if (file.storageKey) {
    const key = String(file.storageKey);
    if (provider === DATABASE_STORAGE_PROVIDER || provider === DEFAULT_STORAGE_PROVIDER) {
      try {
        const buffer = await downloadDatabaseStorageBufferByName(key);
        return bufferToSha256(buffer);
      } catch (error: any) {
        errors.push(`database:${error?.message || error}`);
      }
    }

    if (provider === FIREBASE_STORAGE_PROVIDER || provider === DEFAULT_STORAGE_PROVIDER) {
      try {
        const buffer = await downloadFirebaseStorageBufferByName(key);
        return bufferToSha256(buffer);
      } catch (error: any) {
        errors.push(`firebase:${error?.message || error}`);
      }
    }

    // Always attempt GCS when key exists — most production media is in scrolith-prod-media.
    try {
      const buffer = await downloadGcsMediaBuffer(key);
      return bufferToSha256(buffer);
    } catch (error: any) {
      errors.push(`gcs:${error?.message || error}`);
    }

    if (provider === AZURE_BLOB_STORAGE_PROVIDER) {
      try {
        const blobResponse = await downloadBlobByName(key);
        const stream = blobResponse.readableStreamBody;
        if (!stream) throw new Error('Video blob stream is not available.');
        return streamToSha256(stream as NodeJS.ReadableStream);
      } catch (error: any) {
        errors.push(`azure:${error?.message || error}`);
      }
    }
  }

  const storageKeyPath = file.storageKey ? stripUploadsPrefix(String(file.storageKey)) : '';
  const fallbackPath = file.url ? stripUploadsPrefix(String(file.url).replace(/^https?:\/\/[^/]+/i, '')) : '';
  const localPath = path.resolve(UPLOAD_DIR, storageKeyPath || fallbackPath);
  if (localPath.startsWith(path.resolve(UPLOAD_DIR)) && fs.existsSync(localPath)) {
    return streamToSha256(fs.createReadStream(localPath));
  }

  // Do not hard-fail post publish when integrity cannot read bytes (e.g. remote-only media on ephemeral disk).
  const detail = errors.slice(0, 3).join(' | ') || 'no readable storage backend';
  const err = new Error(`Video file not readable for integrity check (${detail}).`);
  (err as any).code = 'VIDEO_INTEGRITY_UNREADABLE';
  throw err;
};

const resolveDurationTolerance = (duration?: number | null) => {
  if (!isFiniteNumber(duration) || duration <= 0) return null;
  return clamp(
    Number(duration) * PERCEPTUAL_DURATION_TOLERANCE_RATIO,
    PERCEPTUAL_DURATION_TOLERANCE_MIN_SECONDS,
    PERCEPTUAL_DURATION_TOLERANCE_MAX_SECONDS
  );
};

const getAspectRatio = (value: Pick<FileLike, 'width' | 'height'>) => {
  if (!isFiniteNumber(value.width) || !isFiniteNumber(value.height) || value.width <= 0 || value.height <= 0) {
    return null;
  }
  return Number(value.width) / Number(value.height);
};

const buildExactCandidateWhere = (source: FileLike, ownerId?: string | null) => {
  if (source.size === null || source.size === undefined) return null;

  const clauses: Record<string, any>[] = [
    { mimeType: { startsWith: 'video/' } },
    { id: { not: String(source.id) } },
    { size: source.size as any }
  ];

  const effectiveOwnerId = String(ownerId || source.ownerId || '').trim();
  if (effectiveOwnerId) {
    clauses.push({ NOT: { ownerId: effectiveOwnerId } });
  }
  if (isFiniteNumber(source.duration)) {
    clauses.push({
      duration: {
        gte: Number(source.duration) - 0.75,
        lte: Number(source.duration) + 0.75
      }
    });
  }
  if (isFiniteNumber(source.width)) {
    clauses.push({ width: Number(source.width) });
  }
  if (isFiniteNumber(source.height)) {
    clauses.push({ height: Number(source.height) });
  }

  return { AND: clauses };
};

const buildPerceptualCandidateWhere = (source: FileLike, ownerId?: string | null) => {
  const clauses: Record<string, any>[] = [
    { mimeType: { startsWith: 'video/' } },
    { id: { not: String(source.id) } },
    { thumbnailUrl: { not: null } }
  ];

  const effectiveOwnerId = String(ownerId || source.ownerId || '').trim();
  if (effectiveOwnerId) {
    clauses.push({ NOT: { ownerId: effectiveOwnerId } });
  }

  const durationTolerance = resolveDurationTolerance(source.duration);
  if (durationTolerance !== null && isFiniteNumber(source.duration)) {
    clauses.push({
      duration: {
        gte: Number(source.duration) - durationTolerance,
        lte: Number(source.duration) + durationTolerance
      }
    });
  } else if (isFiniteNumber(source.width) && isFiniteNumber(source.height)) {
    clauses.push({
      width: {
        gte: Math.max(1, Math.round(Number(source.width) * 0.7)),
        lte: Math.max(1, Math.round(Number(source.width) * 1.4))
      }
    });
    clauses.push({
      height: {
        gte: Math.max(1, Math.round(Number(source.height) * 0.7)),
        lte: Math.max(1, Math.round(Number(source.height) * 1.4))
      }
    });
  } else {
    return null;
  }

  return { AND: clauses };
};

const findMatchedContentUsage = async (fileId: string) => {
  const usages = await prisma.fileUsage.findMany({
    where: {
      fileId,
      usageType: { in: [...VIDEO_USAGE_TYPES] }
    },
    orderBy: { createdAt: 'asc' },
    take: 10
  });

  if (!usages.length) {
    return { matchedContentId: null, matchedOwnerId: null };
  }

  for (const usage of usages) {
    if (usage.usageType === 'community_post') {
      const post = await prisma.communityPost.findUnique({
        where: { id: usage.usageId },
        select: { id: true, authorId: true }
      });
      if (post) {
        return { matchedContentId: post.id, matchedOwnerId: post.authorId };
      }
    }
    if (usage.usageType === 'scroll_video') {
      const scroll = await (prisma as any).scrollVideo.findUnique({
        where: { id: usage.usageId },
        select: { id: true, authorId: true }
      });
      if (scroll) {
        return { matchedContentId: scroll.id, matchedOwnerId: scroll.authorId };
      }
    }
  }

  return { matchedContentId: usages[0]?.usageId || null, matchedOwnerId: null };
};

const emptyAssessment = (fingerprint: string | null = null): VideoIntegrityAssessment => ({
  fingerprint,
  status: 'clear',
  monetizationBlocked: false,
  matchedContentId: null,
  matchedOwnerId: null,
  reason: null,
  matchMethod: null,
  matchScore: null
});

const buildMatchedAssessment = (params: {
  fingerprint: string | null;
  matchedContentId: string | null;
  matchedOwnerId: string | null;
  reason: string;
  matchMethod: VideoIntegrityMatchMethod;
  matchScore: number;
}): VideoIntegrityAssessment => ({
  fingerprint: params.fingerprint,
  status: 'suspected_duplicate',
  monetizationBlocked: true,
  matchedContentId: params.matchedContentId,
  matchedOwnerId: params.matchedOwnerId,
  reason: params.reason,
  matchMethod: params.matchMethod,
  matchScore: roundScore(params.matchScore)
});

const isFallbackThumbnailUrl = (value?: string | null) =>
  String(value || '').toLowerCase().includes(DEFAULT_VIDEO_THUMBNAIL_FILENAME.toLowerCase());

const resolveAzureBlobNameFromThumbnailUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const extracted = extractBlobNameFromUrl(raw);
  if (extracted) return extracted;
  try {
    return decodeURIComponent(new URL(raw).pathname.replace(/^\/+/, '')) || null;
  } catch {
    return null;
  }
};

const resolveManagedObjectNameFromThumbnailUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, '');
  if (withoutOrigin.toLowerCase().includes('/api/files/content/')) return null;
  const objectKey = stripUploadsPrefix(withoutOrigin);
  return objectKey || null;
};

const loadThumbnailBuffer = async (file: FileLike) => {
  const thumbnailUrl = String(file.thumbnailUrl || '').trim();
  if (!thumbnailUrl || isFallbackThumbnailUrl(thumbnailUrl)) return null;

  const provider = String(file.storageProvider || DEFAULT_STORAGE_PROVIDER).trim().toLowerCase();
  if (provider === DATABASE_STORAGE_PROVIDER) {
    const objectName = resolveManagedObjectNameFromThumbnailUrl(thumbnailUrl);
    if (objectName) {
      try {
        return await downloadDatabaseStorageBufferByName(objectName);
      } catch (error) {
        console.error('Failed to load video thumbnail from database storage', {
          fileId: file.id,
          thumbnailUrl,
          error
        });
      }
    }
  }

  if (provider === FIREBASE_STORAGE_PROVIDER) {
    const objectName = resolveManagedObjectNameFromThumbnailUrl(thumbnailUrl);
    if (objectName) {
      try {
        return await downloadFirebaseStorageBufferByName(objectName);
      } catch (error) {
        console.error('Failed to load video thumbnail from Firebase storage', {
          fileId: file.id,
          thumbnailUrl,
          error
        });
      }
    }
  }

  if (provider === AZURE_BLOB_STORAGE_PROVIDER) {
    const blobName = resolveAzureBlobNameFromThumbnailUrl(thumbnailUrl);
    if (!blobName) return null;
    try {
      const blobResponse = await downloadBlobByName(blobName);
      const stream = blobResponse.readableStreamBody;
      if (!stream) return null;
      return streamToBuffer(stream as NodeJS.ReadableStream);
    } catch (error) {
      console.error('Failed to load video thumbnail from blob storage', { fileId: file.id, thumbnailUrl, error });
      return null;
    }
  }

  try {
    const localPath = resolveLocalUploadPath(thumbnailUrl);
    if (!fs.existsSync(localPath)) return null;
    return fs.promises.readFile(localPath);
  } catch (error) {
    console.error('Failed to load local video thumbnail', { fileId: file.id, thumbnailUrl, error });
    return null;
  }
};

const computeThumbnailPerceptualHash = async (thumbnailBuffer: Buffer) => {
  const image = await Jimp.read(thumbnailBuffer);
  image.greyscale();
  return image.pHash();
};

const ensureVideoPerceptualHash = async (file: FileLike) => {
  if (
    file.videoPerceptualHash &&
    Number(file.videoPerceptualHashVersion || 0) === VIDEO_PERCEPTUAL_HASH_VERSION
  ) {
    return String(file.videoPerceptualHash);
  }

  const thumbnailBuffer = await loadThumbnailBuffer(file);
  if (!thumbnailBuffer) return null;

  try {
    const perceptualHash = await computeThumbnailPerceptualHash(thumbnailBuffer);
    await prisma.file.update({
      where: { id: file.id },
      data: {
        videoPerceptualHash: perceptualHash,
        videoPerceptualHashVersion: VIDEO_PERCEPTUAL_HASH_VERSION
      }
    });
    return perceptualHash;
  } catch (error) {
    console.error('Failed to compute perceptual video hash', { fileId: file.id, error });
    return null;
  }
};

const calculateDurationScore = (source: FileLike, candidate: FileLike) => {
  if (!isFiniteNumber(source.duration) || !isFiniteNumber(candidate.duration)) return 0.7;
  const tolerance = resolveDurationTolerance(source.duration);
  if (tolerance === null) return 0.7;
  const diff = Math.abs(Number(source.duration) - Number(candidate.duration));
  if (diff > tolerance) return 0;
  return clamp(1 - diff / tolerance, 0, 1);
};

const calculateAspectRatioScore = (source: FileLike, candidate: FileLike) => {
  const sourceAspect = getAspectRatio(source);
  const candidateAspect = getAspectRatio(candidate);
  if (sourceAspect === null || candidateAspect === null) return 0.75;
  const diff = Math.abs(sourceAspect - candidateAspect);
  if (diff > PERCEPTUAL_ASPECT_RATIO_DELTA_MAX) return 0;
  return clamp(1 - diff / PERCEPTUAL_ASPECT_RATIO_DELTA_MAX, 0, 1);
};

const evaluatePerceptualMatch = (
  source: FileLike,
  candidate: FileLike,
  sourceHash: string,
  candidateHash: string
) => {
  const hashDistance = compareHashes(sourceHash, candidateHash);
  if (!Number.isFinite(hashDistance) || hashDistance > PERCEPTUAL_HASH_DISTANCE_THRESHOLD) {
    return null;
  }

  const durationScore = calculateDurationScore(source, candidate);
  if (durationScore <= 0) return null;

  const aspectRatioScore = calculateAspectRatioScore(source, candidate);
  if (aspectRatioScore <= 0) return null;

  const confidence = clamp(
    (1 - hashDistance) * 0.78 + durationScore * 0.15 + aspectRatioScore * 0.07,
    0,
    1
  );
  if (confidence < PERCEPTUAL_CONFIDENCE_THRESHOLD) {
    return null;
  }

  return {
    confidence: roundScore(confidence) ?? confidence,
    hashDistance: roundScore(hashDistance) ?? hashDistance
  };
};

export const assessVideoIntegrityByFile = async (
  fileId: string,
  ownerId?: string | null
): Promise<VideoIntegrityAssessment> => {
  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) {
    return emptyAssessment();
  }

  const source = await prisma.file.findUnique({
    where: { id: normalizedFileId },
    select: videoFileSelect
  });

  if (!source || !String(source.mimeType || '').startsWith('video/')) {
    return emptyAssessment();
  }

  let fingerprint: string;
  try {
    fingerprint = await computeFileSha256(source);
  } catch (error: any) {
    // Soft-fail: missing/unreadable object storage must not block publishing.
    console.warn('[videoIntegrity] fingerprint skipped — media unreadable', {
      fileId: source.id,
      provider: source.storageProvider,
      storageKey: source.storageKey,
      code: error?.code,
      message: error?.message || error
    });
    return emptyAssessment();
  }
  const exactCandidateWhere = buildExactCandidateWhere(source, ownerId);
  if (exactCandidateWhere) {
    const exactCandidates = await prisma.file.findMany({
      where: exactCandidateWhere,
      select: videoFileSelect,
      orderBy: { createdAt: 'desc' },
      take: EXACT_CANDIDATE_LIMIT
    });

    for (const candidate of exactCandidates) {
      try {
        const candidateFingerprint = await computeFileSha256(candidate);
        if (candidateFingerprint !== fingerprint) continue;
        const matchedUsage = await findMatchedContentUsage(candidate.id);
        return buildMatchedAssessment({
          fingerprint,
          matchedContentId: matchedUsage.matchedContentId,
          matchedOwnerId: matchedUsage.matchedOwnerId || String(candidate.ownerId || '').trim() || null,
          reason: 'Exact video fingerprint matched content already uploaded by another account.',
          matchMethod: 'exact_sha256',
          matchScore: 1
        });
      } catch (error) {
        console.error('Failed to compare exact video fingerprint candidate', { fileId: candidate.id, error });
      }
    }
  }

  const sourcePerceptualHash = await ensureVideoPerceptualHash(source);
  const perceptualCandidateWhere = sourcePerceptualHash ? buildPerceptualCandidateWhere(source, ownerId) : null;
  if (!sourcePerceptualHash || !perceptualCandidateWhere) {
    return emptyAssessment(fingerprint);
  }

  const perceptualCandidates = await prisma.file.findMany({
    where: perceptualCandidateWhere,
    select: videoFileSelect,
    orderBy: { createdAt: 'desc' },
    take: PERCEPTUAL_CANDIDATE_LIMIT
  });

  let bestMatch:
    | {
        candidate: FileLike;
        confidence: number;
      }
    | null = null;

  for (const candidate of perceptualCandidates) {
    try {
      const candidatePerceptualHash = await ensureVideoPerceptualHash(candidate);
      if (!candidatePerceptualHash) continue;

      const match = evaluatePerceptualMatch(source, candidate, sourcePerceptualHash, candidatePerceptualHash);
      if (!match) continue;

      if (!bestMatch || match.confidence > bestMatch.confidence) {
        bestMatch = {
          candidate,
          confidence: match.confidence
        };
      }
    } catch (error) {
      console.error('Failed to compare perceptual video fingerprint candidate', { fileId: candidate.id, error });
    }
  }

  if (!bestMatch) {
    return emptyAssessment(fingerprint);
  }

  const matchedUsage = await findMatchedContentUsage(bestMatch.candidate.id);
  return buildMatchedAssessment({
    fingerprint,
    matchedContentId: matchedUsage.matchedContentId,
    matchedOwnerId: matchedUsage.matchedOwnerId || String(bestMatch.candidate.ownerId || '').trim() || null,
    reason: `Perceptual video signature matched content already uploaded by another account with ${Math.round(bestMatch.confidence * 100)}% confidence.`,
    matchMethod: 'perceptual_thumbnail',
    matchScore: bestMatch.confidence
  });
};

export const assessVideoIntegrityByAttachments = async (
  attachmentFileIds: string[],
  ownerId?: string | null
): Promise<VideoIntegrityAssessment> => {
  const attachmentIds = Array.isArray(attachmentFileIds)
    ? attachmentFileIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (!attachmentIds.length) {
    return emptyAssessment();
  }

  const videoFiles = await prisma.file.findMany({
    where: {
      id: { in: attachmentIds },
      mimeType: { startsWith: 'video/' }
    },
    select: { id: true }
  });

  if (!videoFiles.length) {
    return emptyAssessment();
  }

  let firstClearFingerprint: string | null = null;
  for (const file of videoFiles) {
    const assessment = await assessVideoIntegrityByFile(file.id, ownerId);
    if (assessment.status !== 'clear') return assessment;
    if (!firstClearFingerprint && assessment.fingerprint) {
      firstClearFingerprint = assessment.fingerprint;
    }
  }

  return emptyAssessment(firstClearFingerprint);
};

export const buildVideoIntegrityUpdate = (assessment: VideoIntegrityAssessment) => ({
  videoFingerprint: assessment.fingerprint,
  videoIntegrityStatus: assessment.status,
  videoIntegrityMatchMethod: assessment.matchMethod,
  videoIntegrityMatchScore: assessment.matchScore,
  videoMonetizationBlocked: assessment.monetizationBlocked,
  videoIntegrityMatchedContentId: assessment.matchedContentId,
  videoIntegrityMatchedOwnerId: assessment.matchedOwnerId
});

export const isVideoMonetizationBlocked = (value: {
  videoMonetizationBlocked?: boolean | null;
  videoIntegrityStatus?: string | null;
}) => Boolean(value?.videoMonetizationBlocked) || String(value?.videoIntegrityStatus || '').toLowerCase() !== 'clear';
