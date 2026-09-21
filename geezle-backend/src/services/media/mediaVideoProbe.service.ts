/**
 * Phase 3B.2 — pure video metadata extraction via ffprobe.
 * Never updates the database. Never uses a shell.
 * Prefer stream-to-temp-file materialization so large videos are never fully held in memory.
 */
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export type VideoProbeMetadata = {
  durationSeconds?: number;
  width?: number;
  height?: number;
  rotation?: number;
  displayAspectRatio?: string;
  codec?: string;
  container?: string;
  bitrate?: number;
  frameRate?: number;
  audioPresent: boolean;
  audioCodec?: string;
  sizeBytes?: number;
};

export type VideoProbeErrorCode =
  | 'VIDEO_METADATA_UNAVAILABLE'
  | 'VIDEO_METADATA_FAILED'
  | 'VIDEO_CORRUPT'
  | 'VIDEO_UNSUPPORTED'
  | 'VIDEO_PROCESSING_TIMEOUT'
  | 'VIDEO_STORAGE_FAILED';

export type VideoProbeResult =
  | { ok: true; metadata: VideoProbeMetadata }
  | { ok: false; errorCode: VideoProbeErrorCode; message?: string };

export type FfprobeRunner = (
  args: string[],
  options: { timeoutMs: number; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

/** Default timeout for ffprobe (seconds → ms). */
export const FFPROBE_TIMEOUT_MS = Math.max(
  5000,
  Math.min(60000, Number(process.env.MEDIA_VIDEO_FFPROBE_TIMEOUT_MS || 25000) || 25000)
);

/** Cap stdout/stderr to avoid memory blowups from malformed output. */
export const FFPROBE_MAX_BUFFER = Math.max(
  32 * 1024,
  Math.min(512 * 1024, Number(process.env.MEDIA_VIDEO_FFPROBE_MAX_BUFFER || 256 * 1024) || 256 * 1024)
);

const DEFAULT_BINARY = String(process.env.MEDIA_FFPROBE_PATH || 'ffprobe').trim() || 'ffprobe';

let injectedRunner: FfprobeRunner | null = null;
let injectedBinary: string | null = null;
let availabilityCache: boolean | null = null;

export const setFfprobeRunnerForTests = (runner: FfprobeRunner | null) => {
  injectedRunner = runner;
  availabilityCache = null;
};

export const setFfprobeBinaryForTests = (binary: string | null) => {
  injectedBinary = binary;
  availabilityCache = null;
};

export const __resetFfprobeAvailabilityCacheForTests = () => {
  availabilityCache = null;
};

const resolveBinary = () => injectedBinary || DEFAULT_BINARY;

/**
 * Default runner: execFile with argument array only (never shell).
 */
export const defaultFfprobeRunner: FfprobeRunner = (args, options) =>
  new Promise((resolve, reject) => {
    const binary = resolveBinary();
    const child = execFile(
      binary,
      args,
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          const err: any = error;
          err.stdout = String(stdout || '');
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
    // Ensure kill on timeout (execFile already kills on timeout, this is belt-and-suspenders).
    child.on('error', () => {
      // handled in callback
    });
  });

const getRunner = (): FfprobeRunner => injectedRunner || defaultFfprobeRunner;

export const isFfprobeAvailable = async (): Promise<boolean> => {
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

export const isEligibleVideoMime = (mimeType?: string | null): boolean => {
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  if (!mime) return false;
  if (mime.startsWith('video/')) return true;
  // Common aliases sometimes present after client sanitization
  return ['application/mp4', 'application/x-mpegurl'].includes(mime);
};

/** Parse "30/1" or "30000/1001" style frame rates. */
export const parseFrameRateFraction = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(3));
  }
  const raw = String(value || '').trim();
  if (!raw || raw === '0/0' || raw === 'N/A') return undefined;
  if (raw.includes('/')) {
    const [a, b] = raw.split('/');
    const num = Number(a);
    const den = Number(b);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
    const rate = num / den;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 240) return undefined;
    return Number(rate.toFixed(3));
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 240) return undefined;
  return Number(n.toFixed(3));
};

const parseRotation = (stream: any, format: any): number | undefined => {
  const candidates = [
    stream?.tags?.rotate,
    stream?.side_data_list?.find?.((s: any) => s?.rotation != null)?.rotation,
    format?.tags?.rotate
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) {
      // Normalize to 0, 90, 180, 270
      const normalized = ((Math.round(n) % 360) + 360) % 360;
      return normalized;
    }
  }
  return undefined;
};

const firstVideoStream = (streams: any[]): any | null => {
  if (!Array.isArray(streams)) return null;
  return streams.find((s) => String(s?.codec_type || '').toLowerCase() === 'video') || null;
};

const firstAudioStream = (streams: any[]): any | null => {
  if (!Array.isArray(streams)) return null;
  return streams.find((s) => String(s?.codec_type || '').toLowerCase() === 'audio') || null;
};

/**
 * Parse ffprobe JSON into typed metadata. Pure — no I/O.
 */
export const parseFfprobeJson = (raw: string): VideoProbeResult => {
  const text = String(raw || '').trim();
  if (!text) {
    return { ok: false, errorCode: 'VIDEO_METADATA_FAILED', message: 'empty_ffprobe_output' };
  }
  let probe: any;
  try {
    probe = JSON.parse(text);
  } catch {
    return { ok: false, errorCode: 'VIDEO_CORRUPT', message: 'invalid_json' };
  }
  if (!probe || typeof probe !== 'object') {
    return { ok: false, errorCode: 'VIDEO_CORRUPT', message: 'invalid_probe_shape' };
  }

  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  // Cap stream inspection to avoid pathological inputs
  const limitedStreams = streams.slice(0, 32);
  const video = firstVideoStream(limitedStreams);
  if (!video) {
    return { ok: false, errorCode: 'VIDEO_UNSUPPORTED', message: 'no_video_stream' };
  }

  const audio = firstAudioStream(limitedStreams);
  const format = probe.format && typeof probe.format === 'object' ? probe.format : {};

  let width = Number(video.width);
  let height = Number(video.height);
  if (!Number.isFinite(width) || width <= 0) width = NaN;
  if (!Number.isFinite(height) || height <= 0) height = NaN;

  const rotation = parseRotation(video, format);
  // For 90/270 rotation, display dimensions are swapped for consumers.
  if (rotation === 90 || rotation === 270) {
    if (Number.isFinite(width) && Number.isFinite(height)) {
      const tmp = width;
      width = height;
      height = tmp;
    }
  }

  let durationSeconds: number | undefined;
  const streamDur = Number(video.duration);
  if (Number.isFinite(streamDur) && streamDur > 0) {
    durationSeconds = Number(streamDur.toFixed(3));
  } else {
    const formatDur = Number(format.duration);
    if (Number.isFinite(formatDur) && formatDur > 0) {
      durationSeconds = Number(formatDur.toFixed(3));
    }
  }

  const frameRate =
    parseFrameRateFraction(video.avg_frame_rate) || parseFrameRateFraction(video.r_frame_rate);

  let bitrate: number | undefined;
  const br = Number(format.bit_rate || video.bit_rate);
  if (Number.isFinite(br) && br > 0) bitrate = Math.round(br);

  let sizeBytes: number | undefined;
  const sz = Number(format.size);
  if (Number.isFinite(sz) && sz > 0) sizeBytes = Math.round(sz);

  const dar =
    String(video.display_aspect_ratio || '').trim() &&
    String(video.display_aspect_ratio).trim() !== '0:1'
      ? String(video.display_aspect_ratio).trim()
      : Number.isFinite(width) && Number.isFinite(height) && height > 0
        ? `${Math.round(width)}:${Math.round(height)}`
        : undefined;

  const metadata: VideoProbeMetadata = {
    durationSeconds,
    width: Number.isFinite(width) ? Math.round(width) : undefined,
    height: Number.isFinite(height) ? Math.round(height) : undefined,
    rotation,
    displayAspectRatio: dar,
    codec: String(video.codec_name || '').trim() || undefined,
    container: String(format.format_name || '')
      .split(',')[0]
      ?.trim() || undefined,
    bitrate,
    frameRate,
    audioPresent: Boolean(audio),
    audioCodec: audio ? String(audio.codec_name || '').trim() || undefined : undefined,
    sizeBytes
  };

  // Require at least one useful geometric or duration field
  if (!metadata.width && !metadata.height && metadata.durationSeconds == null) {
    return { ok: false, errorCode: 'VIDEO_METADATA_FAILED', message: 'insufficient_metadata' };
  }

  return { ok: true, metadata };
};

/**
 * Run ffprobe against a local filesystem path (argument array only).
 */
export const probeVideoFile = async (
  filePath: string,
  opts?: { timeoutMs?: number; maxBuffer?: number; runner?: FfprobeRunner }
): Promise<VideoProbeResult> => {
  const abs = path.resolve(String(filePath || ''));
  if (!abs || !fs.existsSync(abs)) {
    return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'file_missing' };
  }

  const available = injectedRunner ? true : await isFfprobeAvailable();
  if (!available) {
    return { ok: false, errorCode: 'VIDEO_METADATA_UNAVAILABLE', message: 'ffprobe_missing' };
  }

  const runner = opts?.runner || getRunner();
  const timeoutMs = opts?.timeoutMs ?? FFPROBE_TIMEOUT_MS;
  const maxBuffer = opts?.maxBuffer ?? FFPROBE_MAX_BUFFER;

  const args = [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    abs
  ];

  try {
    const { stdout } = await runner(args, { timeoutMs, maxBuffer });
    return parseFfprobeJson(stdout);
  } catch (error: any) {
    const msg = String(error?.message || error || '');
    const killed =
      error?.killed === true ||
      error?.signal === 'SIGTERM' ||
      /ETIMEDOUT|timeout/i.test(msg);
    if (killed) {
      return { ok: false, errorCode: 'VIDEO_PROCESSING_TIMEOUT', message: 'ffprobe_timeout' };
    }
    if (/ENOENT|not found|spawn/i.test(msg)) {
      availabilityCache = false;
      return { ok: false, errorCode: 'VIDEO_METADATA_UNAVAILABLE', message: 'ffprobe_missing' };
    }
    // Non-zero exit with partial stdout may still parse
    if (error?.stdout) {
      const partial = parseFfprobeJson(String(error.stdout));
      if (partial.ok) return partial;
    }
    if (/Invalid data|moov atom|corrupt/i.test(String(error?.stderr || msg))) {
      return { ok: false, errorCode: 'VIDEO_CORRUPT', message: 'ffprobe_corrupt' };
    }
    return { ok: false, errorCode: 'VIDEO_METADATA_FAILED', message: 'ffprobe_failed' };
  }
};

/** Product video soft limit (must match upload validation; do not silently raise). */
export const MAX_VIDEO_PROBE_BYTES = Math.max(
  1,
  Number(process.env.MEDIA_VIDEO_MAX_BYTES || 200 * 1024 * 1024) || 200 * 1024 * 1024
);

export const createProbeTempPath = (suffix?: string) => {
  const baseDir = path.join(os.tmpdir(), 'scrolith-video-probe');
  fs.mkdirSync(baseDir, { recursive: true });
  const cleanSuffix = String(suffix || '.bin').replace(/[^a-z0-9._-]/gi, '') || '.bin';
  const ext = cleanSuffix.startsWith('.') ? cleanSuffix : `.${cleanSuffix}`;
  // mkdtemp creates the directory atomically with cryptographically random
  // suffix material; callers write inside that private directory, avoiding a
  // predictable shared filename and check-then-create collision window.
  const privateDir = fs.mkdtempSync(path.join(baseDir, 'probe-'));
  return path.join(privateDir, `output${ext}`);
};

export const safeUnlinkTemp = (filePath?: string | null) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const probeRoot = path.resolve(path.join(os.tmpdir(), 'scrolith-video-probe'));
    const parent = path.resolve(path.dirname(filePath));
    if (parent !== probeRoot && parent.startsWith(`${probeRoot}${path.sep}`)) {
      try {
        fs.rmdirSync(parent);
      } catch {
        // Directory is non-empty or already gone; leave unrelated files alone.
      }
    }
  } catch {
    // best-effort
  }
};

/**
 * Stream a readable into a temp file with a hard byte ceiling.
 * Aborts and deletes partial files when the limit is exceeded.
 * Does not buffer the full object in application memory.
 */
export const streamToTempFileBounded = async (
  source: NodeJS.ReadableStream,
  destPath: string,
  opts?: { maxBytes?: number; signal?: AbortSignal }
): Promise<{ bytesWritten: number }> => {
  const maxBytes = Math.max(1, Number(opts?.maxBytes || MAX_VIDEO_PROBE_BYTES) || MAX_VIDEO_PROBE_BYTES);
  let bytesWritten = 0;
  const signal = opts?.signal;

  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(destPath);
      let settled = false;
      let limitExceeded = false;

      const cleanupAndReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        try {
          if (typeof (source as any).unpipe === 'function') {
            (source as any).unpipe(out);
          }
        } catch {
          // ignore
        }
        try {
          (source as any).destroy?.();
        } catch {
          // ignore
        }
        const finishReject = () => {
          // Ensure file handle is closed before unlink (important on Windows).
          safeUnlinkTemp(destPath);
          // Retry unlink shortly if FS still holds the path.
          setTimeout(() => safeUnlinkTemp(destPath), 0);
          reject(error);
        };
        if (!out.destroyed && !out.closed) {
          out.once('close', finishReject);
          out.destroy();
        } else {
          finishReject();
        }
      };

      const onAbort = () =>
        cleanupAndReject(Object.assign(new Error('download_aborted'), { code: 'ABORTED' }));

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      source.on('data', (chunk: Buffer | string) => {
        if (settled || limitExceeded) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesWritten += buf.length;
        if (bytesWritten > maxBytes) {
          limitExceeded = true;
          cleanupAndReject(
            Object.assign(new Error('video_size_limit_exceeded'), { code: 'SIZE_LIMIT' })
          );
        }
      });

      source.on('error', (error) =>
        cleanupAndReject(error instanceof Error ? error : new Error(String(error)))
      );
      out.on('error', (error) => {
        if (settled) return;
        // Ignore destroy-induced errors after limit exceed.
        if (limitExceeded) return;
        cleanupAndReject(error instanceof Error ? error : new Error(String(error)));
      });
      out.on('finish', () => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      });

      source.pipe(out);
    });
  } catch (error) {
    safeUnlinkTemp(destPath);
    throw error;
  }

  if (bytesWritten <= 0) {
    safeUnlinkTemp(destPath);
    throw Object.assign(new Error('empty_download'), { code: 'EMPTY' });
  }

  return { bytesWritten };
};

export type MaterializeVideoSourceResult =
  | { ok: true; tempPath: string; bytesWritten: number }
  | { ok: false; errorCode: VideoProbeErrorCode; message?: string };

/**
 * Materialize remote/local media to a job-scoped temp file for ffprobe.
 * Prefers streaming (no full-object Buffer). Bounded by maxBytes.
 */
export const materializeVideoSourceToTemp = async (params: {
  createReadStream?: (() => NodeJS.ReadableStream | null) | null;
  /** Fallback only when stream is unavailable; still size-checked and written once to disk. */
  downloadBuffer?: (() => Promise<Buffer | null>) | null;
  declaredSizeBytes?: number | bigint | null;
  maxBytes?: number;
  suffix?: string;
  signal?: AbortSignal;
}): Promise<MaterializeVideoSourceResult> => {
  const maxBytes = Math.max(1, Number(params.maxBytes || MAX_VIDEO_PROBE_BYTES) || MAX_VIDEO_PROBE_BYTES);
  const declared = Number(params.declaredSizeBytes);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'declared_size_exceeds_limit' };
  }

  const tempPath = createProbeTempPath(params.suffix);
  try {
    let stream: NodeJS.ReadableStream | null = null;
    try {
      stream = params.createReadStream ? params.createReadStream() : null;
    } catch {
      stream = null;
    }

    if (stream) {
      const { bytesWritten } = await streamToTempFileBounded(stream, tempPath, {
        maxBytes,
        signal: params.signal
      });
      return { ok: true, tempPath, bytesWritten };
    }

    // Non-stream providers: single buffer download only when declared size is known and within limit.
    if (!params.downloadBuffer) {
      safeUnlinkTemp(tempPath);
      return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'no_stream_or_download' };
    }
    if (Number.isFinite(declared) && declared > maxBytes) {
      safeUnlinkTemp(tempPath);
      return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'declared_size_exceeds_limit' };
    }

    const buffer = await params.downloadBuffer();
    if (!buffer || !buffer.length) {
      safeUnlinkTemp(tempPath);
      return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'empty_buffer' };
    }
    if (buffer.length > maxBytes) {
      safeUnlinkTemp(tempPath);
      return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'buffer_size_exceeds_limit' };
    }
    // Write once to disk then drop buffer reference (caller should not retain buffer).
    await pipeline(Readable.from(buffer), fs.createWriteStream(tempPath));
    return { ok: true, tempPath, bytesWritten: buffer.length };
  } catch (error: any) {
    safeUnlinkTemp(tempPath);
    const code = String(error?.code || '');
    if (code === 'SIZE_LIMIT' || /size_limit/i.test(String(error?.message || ''))) {
      return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'size_limit_exceeded' };
    }
    if (code === 'ABORTED') {
      return { ok: false, errorCode: 'VIDEO_PROCESSING_TIMEOUT', message: 'download_aborted' };
    }
    return {
      ok: false,
      errorCode: 'VIDEO_STORAGE_FAILED',
      message: 'materialize_failed'
    };
  }
};

/**
 * Probe a Buffer by streaming it to a temp file (single write; no second full copy beyond the input).
 * Prefer materializeVideoSourceToTemp + probeVideoFile for GCS.
 */
export const probeVideoBuffer = async (
  buffer: Buffer,
  opts?: { timeoutMs?: number; runner?: FfprobeRunner; suffix?: string; maxBytes?: number }
): Promise<VideoProbeResult> => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'empty_buffer' };
  }
  const maxBytes = opts?.maxBytes ?? MAX_VIDEO_PROBE_BYTES;
  if (buffer.length > maxBytes) {
    return { ok: false, errorCode: 'VIDEO_STORAGE_FAILED', message: 'buffer_size_exceeds_limit' };
  }

  const materialize = await materializeVideoSourceToTemp({
    createReadStream: () => Readable.from(buffer),
    maxBytes,
    suffix: opts?.suffix
  });
  if (materialize.ok === false) {
    return { ok: false, errorCode: materialize.errorCode, message: materialize.message };
  }
  try {
    return await probeVideoFile(materialize.tempPath, {
      timeoutMs: opts?.timeoutMs,
      runner: opts?.runner
    });
  } finally {
    safeUnlinkTemp(materialize.tempPath);
  }
};

/** Client-safe subset for variantsManifest.video.metadata */
export const toClientSafeVideoMetadata = (meta: VideoProbeMetadata) => ({
  rotation: meta.rotation ?? null,
  displayAspectRatio: meta.displayAspectRatio ?? null,
  codec: meta.codec ?? null,
  container: meta.container ?? null,
  bitrate: meta.bitrate ?? null,
  frameRate: meta.frameRate ?? null,
  audioPresent: Boolean(meta.audioPresent),
  audioCodec: meta.audioCodec ?? null
});
