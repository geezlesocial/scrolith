import { Readable } from 'stream';
import { serveRangedObject } from '../utils/httpRange';

describe('serveRangedObject async stream openers', () => {
  const makeRes = () => {
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let ended = false;
    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      setHeader(name: string, value: string | number) {
        headers[name.toLowerCase()] = String(value);
      },
      end() {
        ended = true;
      },
      get headersSent() {
        return ended || statusCode !== 200;
      },
      on() {
        return res;
      },
      once() {
        return res;
      },
      emit() {
        return false;
      },
      write() {
        return true;
      },
      getHeaders: () => headers,
      getStatus: () => statusCode
    };
    return res;
  };

  test('valid Range response can open storage stream asynchronously', () => {
    const res = makeRes();
    const body = Buffer.from('0123456789');
    let openArgs: [number, number] | null = null;

    serveRangedObject({
      req: { headers: { range: 'bytes=4-7' } },
      res,
      size: body.length,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=1',
      openStream: async (start, end) => {
        openArgs = [start, end];
        return Readable.from([body.subarray(start, end + 1)]);
      }
    });

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(res.getStatus()).toBe(206);
        expect(res.getHeaders()['accept-ranges']).toBe('bytes');
        expect(res.getHeaders()['content-range']).toBe('bytes 4-7/10');
        expect(res.getHeaders()['content-length']).toBe('4');
        expect(openArgs).toEqual([4, 7]);
        resolve();
      });
    });
  });
});
