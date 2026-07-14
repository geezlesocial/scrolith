/**
 * Phase 3B.3 — video poster + thumbnail generation via ffmpeg.
 * Never updates the database. Injectable runner for tests. No shell.
 */
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { VideoProbeMetadata } from './mediaVideoProbe.service';
import {
  createProbeTempPath,
  safeUnlinkTemp
} from './mediaVideoProbe.service';
import type { GeneratedVariant } from './mediaImageProcessor.service';

export type FfmpegRunner = (
  args: string[],
  options: { timeoutMs: number; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export type VideoPosterErrorCode =
  | 'VIDEO_POSTER_UNAVAILABLE'
  | 'VIDEO_POSTER_FAILED'
  | 'VIDEO_THUMBNAIL_FAILED'
  | 'VIDEO_PROCESSING_TIMEOUT'
  | 'VIDEO_CORRUPT'
  | 'VIDEO_PARTIAL';

export type VideoPosterOutputs = {
  poster: GeneratedVariant;
  thumbnail: GeneratedVariant;
  timestampSeconds: number;
  posterPath: string;
  thumbPath: string;
};

export type VideoPosterResult =
  | { ok: true; outputs: VideoPosterOutputs }
  | { ok: false; errorCode: VideoPosterErrorCode; message?: string };

export const FFMPEG_POSTER_TIMEOUT_MS = Math.max(
  10000,
  Math.min(120000, Number(process.env.MEDIA_VIDEO_FFMPEG_TIMEOUT_MS || 60000) || 60000)
);

export const FFMPEG_MAX_BUFFER = Math.max(
  32 * 1024,
  Math.min(512 * 1024, Number(process.env.MEDIA_VIDEO_FFMPEG_MAX_BUFFER || 256 * 1024) || 256 * 1024)
);

export const POSTER_MAX_WIDTH = 1280;
export const THUMB_WIDTH = 320;
export const POSTER_QUALITY = 80;
export const THUMB_QUALITY = 78;
/** Soft guard — refuse absurd sources (4K+ is ok; above 8K rejected). */
export const MAX_SOURCE_EDGE = 8192;

const DEFAULT_BINARY = String(process.env.MEDIA_FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';

let injectedRunner: FfmpegRunner | null = null;
let injectedBinary: string | null = null;
let availabilityCache: boolean | null = null;

export const setFfmpegRunnerForTests = (runner: FfmpegRunner | null) => {
  injectedRunner = runner;
  availabilityCache = null;
};

export const setFfmpegBinaryForTests = (binary: string | null) => {
  injectedBinary = binary;
  availabilityCache = null;
};

export const __resetFfmpegAvailabilityCacheForTests = () => {
  availabilityCache = null;
};

const resolveBinary = () => injectedBinary || DEFAULT_BINARY;
const getRunner = (): FfmpegRunner => injectedRunner || defaultFfmpegRunner;

export const defaultFfmpegRunner: FfmpegRunner = (args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      resolveBinary(),
      args,
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          const err: any = error;
          err.stdout = String(stdout || '').slice(0, options.maxBuffer);
          err.stderr = String(stderr || '').slice(0, options.maxBuffer);
          reject(err);
          return;
        }
        resolve({
          stdout: String(stdout || '').slice(0, options.maxBuffer),
          stderr: String(stderr || '').slice(0, options.maxBuffer)
        });
      }
    );
  });

export const isFfmpegAvailable = async (): Promise<boolean> => {
  if (injectedRunner) return true;
  if (availabilityCache !== null) return availabilityCache;
  try {
    await getRunner()(['-version'], { timeoutMs: 2500, maxBuffer: 64 * 1024 });
    availabilityCache = true;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
};

/**
 * Deterministic safe frame timestamp (seconds).
 * - duration >= 2: min(1, duration * 0.1)
 * - 0.5 <= duration < 2: duration / 2
 * - else / unknown: 0
 */
export const selectPosterTimestamp = (durationSeconds?: number | null): number => {
  const d = Number(durationSeconds);
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (d >= 2) return Number(Math.min(1, d * 0.1).toFixed(3));
  if (d >= 0.5) return Number((d / 2).toFixed(3));
  return 0;
};

const buildScaleFilter = (maxWidth: number, rotation?: number) => {
  // Auto-orient via transpose when needed, then scale down only.
  const parts: string[] = [];
  const rot = Number(rotation);
  if (rot === 90) parts.push('transpose=1');
  else if (rot === 270) parts.push('transpose=2');
  else if (rot === 180) parts.push('hflip,vflip');
  // scale to maxWidth, never upscale; force even dims for webp
  parts.push(
    `scale='min(${maxWidth}\\,iw)':-2:force_original_aspect_ratio=decrease`
  );
  return parts.join(',');
};

const checksumBuffer = (buf: Buffer) =>
  crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);

/** Validate non-empty WebP container (RIFF....WEBP). */
export const isValidWebpBuffer = (buf: Buffer | null | undefined): boolean => {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 12) return false;
  return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
};

const readImageDimensions = (filePath: string): { width: number; height: number } => {
  // Minimal WebP/PNG/JPEG size parse without Sharp (keeps upload path free of Sharp).
  try {
    const buf = fs.readFileSync(filePath);
    // WebP VP8X / VP8L / VP8 simple
    if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X' && buf.length >= 30) {
        const w = 1 + buf.readUIntLE(24, 3);
        const h = 1 + buf.readUIntLE(27, 3);
        return { width: w, height: h };
      }
      if (chunk === 'VP8 ' && buf.length >= 30) {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        return { width: w, height: h };
      }
      if (chunk === 'VP8L' && buf.length >= 25) {
        const bits = buf.readUInt32LE(21);
        const w = (bits & 0x3fff) + 1;
        const h = ((bits >> 14) & 0x3fff) + 1;
        return { width: w, height: h };
      }
    }
  } catch {
    // ignore
  }
  return { width: 0, height: 0 };
};

const runExtractFrame = async (params: {
  inputPath: string;
  outputPath: string;
  timestamp: number;
  maxWidth: number;
  quality: number;
  rotation?: number;
  timeoutMs?: number;
  runner?: FfmpegRunner;
}): Promise<{ ok: true } | { ok: false; errorCode: VideoPosterErrorCode }> => {
  const runner = params.runner || getRunner();
  const timeoutMs = params.timeoutMs ?? FFMPEG_POSTER_TIMEOUT_MS;
  const vf = buildScaleFilter(params.maxWidth, params.rotation);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(params.timestamp),
    '-i',
    path.resolve(params.inputPath),
    '-frames:v',
    '1',
    '-vf',
    vf,
    '-c:v',
    'libwebp',
    '-quality',
    String(params.quality),
    '-compression_level',
    '4',
    '-an',
    '-y',
    path.resolve(params.outputPath)
  ];

  try {
    await runner(args, { timeoutMs, maxBuffer: FFMPEG_MAX_BUFFER });
    if (!fs.existsSync(params.outputPath) || fs.statSync(params.outputPath).size <= 0) {
      return { ok: false, errorCode: 'VIDEO_POSTER_FAILED' };
    }
    // Require real WebP container before accepting output
    const head = fs.readFileSync(params.outputPath);
    if (!isValidWebpBuffer(head)) {
      safeUnlinkTemp(params.outputPath);
      return { ok: false, errorCode: 'VIDEO_POSTER_FAILED' };
    }
    return { ok: true };
  } catch (error: any) {
    const msg = String(error?.message || error || '');
    const killed =
      error?.killed === true ||
      error?.signal === 'SIGTERM' ||
      /ETIMEDOUT|timeout/i.test(msg);
    if (killed) return { ok: false, errorCode: 'VIDEO_PROCESSING_TIMEOUT' };
    if (/ENOENT|not found|spawn/i.test(msg)) {
      availabilityCache = false;
      return { ok: false, errorCode: 'VIDEO_POSTER_UNAVAILABLE' };
    }
    if (/Invalid data|moov atom|corrupt/i.test(String(error?.stderr || msg))) {
      return { ok: false, errorCode: 'VIDEO_CORRUPT' };
    }
    return { ok: false, errorCode: 'VIDEO_POSTER_FAILED' };
  }
};

/**
 * Generate poster + 320w thumbnail from a local temp video path.
 * Caller owns inputPath lifecycle. This service creates and owns output temps until
 * cleanupVideoPosterTemps is called (or generate returns paths for caller to clean).
 */
export const generateVideoPosterAndThumb = async (params: {
  inputPath: string;
  metadata?: VideoProbeMetadata | null;
  timeoutMs?: number;
  runner?: FfmpegRunner;
}): Promise<VideoPosterResult> => {
  const inputPath = path.resolve(String(params.inputPath || ''));
  if (!inputPath || !fs.existsSync(inputPath)) {
    return { ok: false, errorCode: 'VIDEO_POSTER_FAILED', message: 'input_missing' };
  }

  const available = injectedRunner ? true : await isFfmpegAvailable();
  if (!available) {
    return { ok: false, errorCode: 'VIDEO_POSTER_UNAVAILABLE', message: 'ffmpeg_missing' };
  }

  const meta = params.metadata || null;
  const srcW = Number(meta?.width || 0);
  const srcH = Number(meta?.height || 0);
  if (
    (srcW > 0 && srcW > MAX_SOURCE_EDGE) ||
    (srcH > 0 && srcH > MAX_SOURCE_EDGE)
  ) {
    return { ok: false, errorCode: 'VIDEO_POSTER_FAILED', message: 'source_too_large' };
  }

  let timestamp = selectPosterTimestamp(meta?.durationSeconds);
  const rotation = meta?.rotation;
  const posterPath = createProbeTempPath('.webp');
  const thumbPath = createProbeTempPath('.webp');

  const cleanupOutputs = () => {
    safeUnlinkTemp(posterPath);
    safeUnlinkTemp(thumbPath);
  };

  try {
    let extract = await runExtractFrame({
      inputPath,
      outputPath: posterPath,
      timestamp,
      maxWidth: POSTER_MAX_WIDTH,
      quality: POSTER_QUALITY,
      rotation,
      timeoutMs: params.timeoutMs,
      runner: params.runner
    });

    // Retry once at t=0 if primary timestamp fails
    if (!extract.ok && timestamp > 0) {
      timestamp = 0;
      extract = await runExtractFrame({
        inputPath,
        outputPath: posterPath,
        timestamp: 0,
        maxWidth: POSTER_MAX_WIDTH,
        quality: POSTER_QUALITY,
        rotation,
        timeoutMs: params.timeoutMs,
        runner: params.runner
      });
    }

    if (extract.ok === false) {
      cleanupOutputs();
      return { ok: false, errorCode: extract.errorCode };
    }

    // Thumbnail from poster (re-scale), avoids second video decode when possible.
    // If scale-from-poster fails, fall back to second video extract at same timestamp.
    let thumbOk = false;
    try {
      const runner = params.runner || getRunner();
      await runner(
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          path.resolve(posterPath),
          '-vf',
          `scale='min(${THUMB_WIDTH}\\,iw)':-2:force_original_aspect_ratio=decrease`,
          '-c:v',
          'libwebp',
          '-quality',
          String(THUMB_QUALITY),
          '-y',
          path.resolve(thumbPath)
        ],
        { timeoutMs: Math.min(30000, params.timeoutMs ?? FFMPEG_POSTER_TIMEOUT_MS), maxBuffer: FFMPEG_MAX_BUFFER }
      );
      thumbOk =
        fs.existsSync(thumbPath) &&
        fs.statSync(thumbPath).size > 0 &&
        isValidWebpBuffer(fs.readFileSync(thumbPath));
    } catch {
      thumbOk = false;
    }

    if (!thumbOk) {
      safeUnlinkTemp(thumbPath);
      const thumbExtract = await runExtractFrame({
        inputPath,
        outputPath: thumbPath,
        timestamp,
        maxWidth: THUMB_WIDTH,
        quality: THUMB_QUALITY,
        rotation,
        timeoutMs: params.timeoutMs,
        runner: params.runner
      });
      if (thumbExtract.ok === false) {
        cleanupOutputs();
        return {
          ok: false,
          errorCode:
            thumbExtract.errorCode === 'VIDEO_POSTER_FAILED'
              ? 'VIDEO_THUMBNAIL_FAILED'
              : thumbExtract.errorCode
        };
      }
    }

    const posterBuf = fs.readFileSync(posterPath);
    const thumbBuf = fs.readFileSync(thumbPath);
    if (!isValidWebpBuffer(posterBuf) || !isValidWebpBuffer(thumbBuf)) {
      cleanupOutputs();
      return { ok: false, errorCode: 'VIDEO_POSTER_FAILED', message: 'invalid_webp' };
    }
    if (posterBuf.length > 8 * 1024 * 1024 || thumbBuf.length > 2 * 1024 * 1024) {
      cleanupOutputs();
      return { ok: false, errorCode: 'VIDEO_POSTER_FAILED', message: 'output_too_large' };
    }

    const posterDims = readImageDimensions(posterPath);
    const thumbDims = readImageDimensions(thumbPath);

    // Display dims: if rotation already applied in filter, dims are display-oriented.
    let displayW = Number(meta?.width || posterDims.width || 0);
    let displayH = Number(meta?.height || posterDims.height || 0);
    if (posterDims.width > 0) displayW = posterDims.width;
    if (posterDims.height > 0) displayH = posterDims.height;

    // Never claim poster wider than POSTER_MAX_WIDTH or thumb wider than THUMB_WIDTH
    const posterW = Math.min(POSTER_MAX_WIDTH, Math.max(1, displayW || 1));
    const posterH = Math.max(1, displayH || 1);
    const thumbW = Math.min(THUMB_WIDTH, Math.max(1, thumbDims.width || THUMB_WIDTH));
    const thumbH = Math.max(1, thumbDims.height || 1);

    const poster: GeneratedVariant = {
      kind: 'video_poster',
      label: 'default',
      width: posterW,
      height: posterH,
      format: 'webp',
      mimeType: 'image/webp',
      buffer: posterBuf,
      checksum: checksumBuffer(posterBuf)
    };

    const thumbnail: GeneratedVariant = {
      kind: 'video_thumb',
      label: 'default',
      width: thumbW,
      height: thumbH,
      format: 'webp',
      mimeType: 'image/webp',
      buffer: thumbBuf,
      checksum: checksumBuffer(thumbBuf)
    };

    return {
      ok: true,
      outputs: {
        poster,
        thumbnail,
        timestampSeconds: timestamp,
        posterPath,
        thumbPath
      }
    };
  } catch (error: any) {
    cleanupOutputs();
    return {
      ok: false,
      errorCode: 'VIDEO_POSTER_FAILED',
      message: 'poster_exception'
    };
  }
};

export const cleanupVideoPosterTemps = (outputs?: {
  posterPath?: string | null;
  thumbPath?: string | null;
} | null) => {
  if (!outputs) return;
  safeUnlinkTemp(outputs.posterPath);
  safeUnlinkTemp(outputs.thumbPath);
};

export const MediaVideoPosterService = {
  selectPosterTimestamp,
  generateVideoPosterAndThumb,
  cleanupVideoPosterTemps,
  isFfmpegAvailable,
  setFfmpegRunnerForTests,
  POSTER_MAX_WIDTH,
  THUMB_WIDTH
};
