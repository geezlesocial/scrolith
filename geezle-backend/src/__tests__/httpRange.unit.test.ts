/**
 * Phase 3B.1 — HTTP Range parsing and serveRangedObject unit tests.
 */
import { Readable } from 'stream';
import {
  parseByteRange,
  rangeContentLength,
  formatContentRange,
  serveRangedObject
} from '../utils/httpRange';

describe('parseByteRange', () => {
  test('no header → full', () => {
    expect(parseByteRange(undefined, 1000)).toEqual({ kind: 'full' });
    expect(parseByteRange('', 1000)).toEqual({ kind: 'full' });
  });

  test('valid closed range', () => {
    expect(parseByteRange('bytes=0-499', 1000)).toEqual({ kind: 'partial', start: 0, end: 499 });
    expect(parseByteRange('bytes=100-199', 1000)).toEqual({ kind: 'partial', start: 100, end: 199 });
  });

  test('open-ended range', () => {
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ kind: 'partial', start: 500, end: 999 });
  });

  test('suffix range', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ kind: 'partial', start: 800, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  test('clamps end to size-1', () => {
    expect(parseByteRange('bytes=0-9999', 1000)).toEqual({ kind: 'partial', start: 0, end: 999 });
  });

  test('invalid / unsatisfiable → 416 cases', () => {
    expect(parseByteRange('bytes=1000-1001', 1000).kind).toBe('unsatisfiable');
    expect(parseByteRange('bytes=500-100', 1000).kind).toBe('unsatisfiable');
    expect(parseByteRange('bytes=abc-def', 1000).kind).toBe('unsatisfiable');
    expect(parseByteRange('items=0-10', 1000).kind).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-10,20-30', 1000).kind).toBe('unsatisfiable');
  });

  test('Content-Range and length helpers', () => {
    expect(rangeContentLength(0, 499)).toBe(500);
    expect(formatContentRange(0, 499, 1000)).toBe('bytes 0-499/1000');
  });
});

describe('serveRangedObject', () => {
  const makeRes = () => {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let ended = false;
    const chunks: Buffer[] = [];
    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      setHeader(name: string, value: string | number) {
        headers[name.toLowerCase()] = String(value);
      },
      end(chunk?: any) {
        ended = true;
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
      get headersSent() {
        return ended || statusCode !== 200;
      },
      // minimal stream target
      on() {
        return res;
      },
      once() {
        return res;
      },
      emit() {
        return false;
      },
      write(chunk: any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      getHeaders: () => headers,
      getStatus: () => statusCode,
      getChunks: () => chunks,
      wasEnded: () => ended
    };
    return res;
  };

  test('no Range → 200 with Accept-Ranges and full Content-Length', () => {
    const res = makeRes();
    const opens: Array<[number, number]> = [];
    const body = Buffer.from('0123456789');
    serveRangedObject({
      req: { headers: {} },
      res,
      size: body.length,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000, immutable',
      openStream: (start, end) => {
        opens.push([start, end]);
        return Readable.from([body.subarray(start, end + 1)]);
      }
    });
    // allow stream to pipe
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(res.getStatus()).toBe(200);
        expect(res.getHeaders()['accept-ranges']).toBe('bytes');
        expect(res.getHeaders()['content-type']).toBe('video/mp4');
        expect(res.getHeaders()['content-length']).toBe(String(body.length));
        expect(res.getHeaders()['content-range']).toBeUndefined();
        expect(opens).toEqual([[0, 9]]);
        resolve();
      });
    });
  });

  test('valid range → 206 with Content-Range and Content-Length', () => {
    const res = makeRes();
    const body = Buffer.from('0123456789');
    let openArgs: [number, number] | null = null;
    serveRangedObject({
      req: { headers: { range: 'bytes=2-5' } },
      res,
      size: body.length,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=1',
      openStream: (start, end) => {
        openArgs = [start, end];
        return Readable.from([body.subarray(start, end + 1)]);
      }
    });
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(res.getStatus()).toBe(206);
        expect(res.getHeaders()['accept-ranges']).toBe('bytes');
        expect(res.getHeaders()['content-range']).toBe('bytes 2-5/10');
        expect(res.getHeaders()['content-length']).toBe('4');
        expect(openArgs).toEqual([2, 5]);
        // only the requested slice was opened — not full buffer load by helper
        resolve();
      });
    });
  });

  test('open-ended range → 206 to EOF', () => {
    const res = makeRes();
    const body = Buffer.alloc(1000, 1);
    let openArgs: [number, number] | null = null;
    serveRangedObject({
      req: { headers: { range: 'bytes=900-' } },
      res,
      size: body.length,
      contentType: 'video/mp4',
      cacheControl: 'private, no-store',
      openStream: (start, end) => {
        openArgs = [start, end];
        return Readable.from([body.subarray(start, end + 1)]);
      }
    });
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(res.getStatus()).toBe(206);
        expect(res.getHeaders()['content-range']).toBe('bytes 900-999/1000');
        expect(res.getHeaders()['content-length']).toBe('100');
        expect(openArgs).toEqual([900, 999]);
        resolve();
      });
    });
  });

  test('invalid range → 416 with Content-Range bytes */size', () => {
    const res = makeRes();
    let opened = false;
    serveRangedObject({
      req: { headers: { range: 'bytes=5000-6000' } },
      res,
      size: 100,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=1',
      openStream: () => {
        opened = true;
        return Readable.from([]);
      }
    });
    expect(res.getStatus()).toBe(416);
    expect(res.getHeaders()['content-range']).toBe('bytes */100');
    expect(res.getHeaders()['accept-ranges']).toBe('bytes');
    expect(opened).toBe(false);
    expect(res.wasEnded()).toBe(true);
  });

  test('suffix range → last N bytes', () => {
    const res = makeRes();
    let openArgs: [number, number] | null = null;
    serveRangedObject({
      req: { headers: { range: 'bytes=-3' } },
      res,
      size: 10,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=1',
      openStream: (start, end) => {
        openArgs = [start, end];
        return Readable.from([Buffer.from('789')]);
      }
    });
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(res.getStatus()).toBe(206);
        expect(res.getHeaders()['content-range']).toBe('bytes 7-9/10');
        expect(res.getHeaders()['content-length']).toBe('3');
        expect(openArgs).toEqual([7, 9]);
        resolve();
      });
    });
  });

  test('preserves cache-control and never sets storage internals', () => {
    const res = makeRes();
    serveRangedObject({
      req: { headers: {} },
      res,
      size: 4,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
      etag: '"abc"',
      openStream: () => Readable.from([Buffer.from('png!')])
    });
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(res.getHeaders()['cache-control']).toBe('public, max-age=31536000, immutable');
        expect(res.getHeaders()['etag']).toBe('"abc"');
        const headerBlob = JSON.stringify(res.getHeaders());
        expect(headerBlob).not.toMatch(/storageKey|scrolith-prod-media|gs:\/\//i);
        resolve();
      });
    });
  });

  test('HEAD does not open storage stream but still returns range headers', () => {
    const res = makeRes();
    let opened = false;
    serveRangedObject({
      req: { method: 'HEAD', headers: { range: 'bytes=0-3' } },
      res,
      size: 10,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=1',
      openStream: () => {
        opened = true;
        return Readable.from([Buffer.from('0123')]);
      }
    });
    expect(opened).toBe(false);
    expect(res.getStatus()).toBe(206);
    expect(res.getHeaders()['content-length']).toBe('4');
    expect(res.getHeaders()['content-range']).toBe('bytes 0-3/10');
    expect(res.getHeaders()['accept-ranges']).toBe('bytes');
    expect(res.wasEnded()).toBe(true);
  });

  test('zero-byte object returns 200 without opening stream', () => {
    const res = makeRes();
    let opened = false;
    serveRangedObject({
      req: { headers: {} },
      res,
      size: 0,
      contentType: 'application/octet-stream',
      cacheControl: 'public, max-age=1',
      openStream: () => {
        opened = true;
        return Readable.from([]);
      }
    });
    expect(opened).toBe(false);
    expect(res.getStatus()).toBe(200);
    expect(res.getHeaders()['content-length']).toBe('0');
    expect(res.getHeaders()['accept-ranges']).toBe('bytes');
  });
});
