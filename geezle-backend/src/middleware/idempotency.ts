import { Request, Response, NextFunction } from 'express';

type StoredEntry = {
  expires: number;
  status: number;
  headers: Record<string, any>;
  body: any;
};

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Simple in-memory store as a fallback. Production should replace with Redis.
const memoryStore = new Map<string, StoredEntry>();

export const idempotency = (opts?: { ttlMs?: number }) => {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keyHeader = req.header('Idempotency-Key') || req.header('idempotency-key') || req.header('Idempotency-Key'.toLowerCase());
      const key = keyHeader && String(keyHeader).trim();
      try { console.log('[idempotency] received request with key', key); } catch (e) {}
      if (!key) return next();

      // Try Redis if available on global scope (optional)
      const redisClient: any = (global as any).redisClient || null;

      const getEntry = async (): Promise<StoredEntry | null> => {
        if (redisClient && typeof redisClient.get === 'function') {
          try {
            const raw = await redisClient.get(`idem:${key}`);
            if (raw) {
              return JSON.parse(raw) as StoredEntry;
            }
            // if redis returns nothing, fallthrough to memory store
          } catch (e) {
            // Redis failed — fallback to in-memory store
          }
        }
        const e = memoryStore.get(key);
        if (!e) return null;
        if (e.expires < Date.now()) { memoryStore.delete(key); return null; }
        return e;
      };

      const setEntry = async (entry: StoredEntry) => {
        if (redisClient && typeof redisClient.set === 'function') {
          try {
            await redisClient.set(`idem:${key}`, JSON.stringify(entry), 'PX', ttl);
            return;
          } catch (e) {
            // fallback to memory
          }
        }
        memoryStore.set(key, entry);
        const t = setTimeout(() => { memoryStore.delete(key); }, ttl + 1000);
        try { if (typeof (t as any).unref === 'function') (t as any).unref(); } catch (e) {}
      };

      const existing = await getEntry();
      if (existing) {
        // replay stored response
        try { console.log('[idempotency] replaying response for key', key); } catch (e) {}
        res.status(existing.status);
        try { res.set(existing.headers || {}); } catch (e) {}
        return res.json(existing.body);
      }

      // Reserve an in-flight entry to prevent duplicate handlers from running
      try {
        const placeholder: StoredEntry = { expires: Date.now() + ttl, status: 202, headers: {}, body: { inFlight: true } };
        // best-effort: don't await, just set reservation
        try { console.log('[idempotency] setting in-flight placeholder for key', key); } catch (e) {}
        void setEntry(placeholder).catch(() => {});
      } catch (e) {}

      // capture send/json
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      const chunks: any[] = [];

      const captureAndStore = (body: any) => {
        const headers: Record<string, any> = {};
        try {
          // copy selected headers
          ['content-type', 'cache-control', 'etag'].forEach(h => { const v = res.getHeader(h as any); if (v) headers[h] = v; });
        } catch (e) {}

        // If body is a JSON string, parse it so replay returns the original object
        let storedBody = body;
        try {
          const contentType = (headers['content-type'] || '') as string;
          if (typeof body === 'string' && contentType.includes('application/json')) {
            storedBody = JSON.parse(body);
          }
        } catch (e) {
          // leave body as-is on parse error
        }

        const entry: StoredEntry = { expires: Date.now() + ttl, status: res.statusCode || 200, headers, body: storedBody };
        try { console.log('[idempotency] storing response for key', key); } catch (e) {}
        void setEntry(entry).catch(() => {});
      };

      res.json = (body: any) => {
        captureAndStore(body);
        return originalJson(body);
      };

      res.send = (body?: any) => {
        try { captureAndStore(body); } catch (e) {}
        return originalSend(body);
      };

      return next();
    } catch (err) {
      return next();
    }
  };
};

export default idempotency;
