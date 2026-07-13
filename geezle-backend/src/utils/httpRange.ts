/**
 * HTTP Range (RFC 7233) helpers for streaming object storage.
 * Single-range only; multi-range requests are treated as unsatisfiable (416).
 */

export type ParsedByteRange =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable'; reason: string };

/**
 * Parse a single Range header against a known object size.
 * Supports: bytes=start-end, bytes=start-, bytes=-suffix
 */
export const parseByteRange = (rangeHeader: unknown, size: number): ParsedByteRange => {
  const raw = String(rangeHeader || '').trim();
  if (!raw) return { kind: 'full' };
  if (!Number.isFinite(size) || size < 0) {
    return { kind: 'unsatisfiable', reason: 'invalid_size' };
  }
  if (size === 0) {
    // Empty object: only full response is sensible
    return { kind: 'full' };
  }

  // Only accept single unit=bytes range (no multi-range)
  const match = /^bytes\s*=\s*([^\s,]+)\s*$/i.exec(raw);
  if (!match) {
    return { kind: 'unsatisfiable', reason: 'invalid_unit_or_multi' };
  }
  const spec = match[1];

  // suffix: bytes=-N
  if (spec.startsWith('-')) {
    const suffix = Number(spec.slice(1));
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return { kind: 'unsatisfiable', reason: 'invalid_suffix' };
    }
    const length = Math.min(suffix, size);
    const start = size - length;
    const end = size - 1;
    return { kind: 'partial', start, end };
  }

  // start-end or start-
  const parts = spec.split('-');
  if (parts.length !== 2) {
    return { kind: 'unsatisfiable', reason: 'invalid_spec' };
  }
  const startRaw = parts[0];
  const endRaw = parts[1];
  if (startRaw === '') {
    return { kind: 'unsatisfiable', reason: 'missing_start' };
  }
  const start = Number(startRaw);
  if (!Number.isInteger(start) || start < 0) {
    return { kind: 'unsatisfiable', reason: 'invalid_start' };
  }
  if (start >= size) {
    return { kind: 'unsatisfiable', reason: 'start_past_end' };
  }

  if (endRaw === '') {
    return { kind: 'partial', start, end: size - 1 };
  }
  const end = Number(endRaw);
  if (!Number.isInteger(end) || end < 0) {
    return { kind: 'unsatisfiable', reason: 'invalid_end' };
  }
  if (end < start) {
    return { kind: 'unsatisfiable', reason: 'end_before_start' };
  }
  return { kind: 'partial', start, end: Math.min(end, size - 1) };
};

export const rangeContentLength = (start: number, end: number) => end - start + 1;

export const formatContentRange = (start: number, end: number, size: number) =>
  `bytes ${start}-${end}/${size}`;

export type ServeRangedObjectOptions = {
  req: {
    method?: string;
    headers: { range?: string | string[] };
    on?: (event: string, listener: (...args: any[]) => void) => any;
  };
  res: {
    status: (code: number) => any;
    setHeader: (name: string, value: string | number) => void;
    headersSent?: boolean;
    end: (...args: any[]) => void;
    on?: (event: string, listener: (...args: any[]) => void) => any;
  };
  size: number;
  contentType: string;
  cacheControl: string;
  etag?: string | null;
  /** Open a readable stream for inclusive byte window [start, end]. For full body, start=0 end=size-1. */
  openStream: (start: number, end: number) => NodeJS.ReadableStream;
};

const safeDestroyStream = (stream: NodeJS.ReadableStream | null | undefined) => {
  if (!stream) return;
  const anyStream = stream as NodeJS.ReadableStream & {
    destroyed?: boolean;
    destroy?: (err?: Error) => void;
  };
  if (anyStream.destroyed) return;
  if (typeof anyStream.destroy === 'function') {
    try {
      anyStream.destroy();
    } catch {
      // ignore destroy races
    }
  } else if (typeof (anyStream as any).unpipe === 'function') {
    try {
      (anyStream as any).unpipe();
    } catch {
      // ignore
    }
  }
};

/**
 * Apply headers and pipe a ranged or full object stream.
 * Caller must authorize before invoking.
 * Never buffers the full object.
 * HEAD: headers only — openStream is not called.
 */
export const serveRangedObject = (options: ServeRangedObjectOptions): void => {
  const { req, res, size, contentType, cacheControl, etag, openStream } = options;
  const method = String(req.method || 'GET').toUpperCase();
  const isHead = method === 'HEAD';
  const rangeHeader = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range;
  const parsed = parseByteRange(rangeHeader, size);

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Content-Type', contentType);
  if (etag) {
    res.setHeader('ETag', etag);
  }

  if (parsed.kind === 'unsatisfiable') {
    res.setHeader('Content-Range', `bytes */${Math.max(0, size)}`);
    // 416: never open a storage stream
    res.status(416).end();
    return;
  }

  let start = 0;
  let end = Math.max(0, size - 1);
  let status = 200;

  if (parsed.kind === 'partial') {
    start = parsed.start;
    end = parsed.end;
    status = 206;
    res.setHeader('Content-Range', formatContentRange(start, end, size));
  }

  const contentLength = size === 0 ? 0 : rangeContentLength(start, end);
  res.setHeader('Content-Length', String(contentLength));
  res.status(status);

  // HEAD or empty body: headers only, no storage stream.
  if (isHead || size === 0 || contentLength === 0) {
    res.end();
    return;
  }

  const stream = openStream(start, end);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    safeDestroyStream(stream);
  };

  stream.on('error', (streamError: any) => {
    cleanup();
    const code = Number(streamError?.code || 0);
    if (code === 404 || String(streamError?.code || '').toLowerCase() === 'notfound') {
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
      return;
    }
    // Do not log storage keys, buckets, or signed URLs.
    console.error('Ranged object stream error:', {
      code: streamError?.code,
      message: String(streamError?.message || streamError)
    });
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
  });

  // Client abort / response close: destroy upstream GCS stream to avoid leaks.
  if (typeof req.on === 'function') {
    req.on('close', cleanup);
    req.on('aborted', cleanup);
  }
  if (typeof res.on === 'function') {
    res.on('close', cleanup);
    res.on('finish', cleanup);
  }

  stream.pipe(res as any);
};
