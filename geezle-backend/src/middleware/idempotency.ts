import { Request, Response, NextFunction } from 'express';

type StoredEntry = {
  expires: number;
  status: number;
  headers: Record<string, any>;
  body: any;
};

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
const IN_FLIGHT_STATUS = 202;
const IN_FLIGHT_BODY = { inFlight: true };
const IN_FLIGHT_WAIT_MS = 5000;
const IN_FLIGHT_POLL_MS = 100;

// Simple in-memory store as a fallback. Production should replace with Redis.
const memoryStore = new Map<string, StoredEntry>();

export const idempotency = (opts?: { ttlMs?: number }) => {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keyHeader = req.header('Idempotency-Key') || req.header('idempotency-key') || req.header('Idempotency-Key'.toLowerCase());
      const key = keyHeader && String(keyHeader).trim();
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

      const waitForSettledEntry = async (timeoutMs: number): Promise<StoredEntry | null> => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_POLL_MS));
          const entry = await getEntry();
          if (!entry) return null;
          const isInFlight =
            entry.status === IN_FLIGHT_STATUS &&
            entry.body &&
            typeof entry.body === 'object' &&
            entry.body.inFlight === true;
          if (!isInFlight) return entry;
        }
        return await getEntry();
      };

      const existing = await getEntry();
      if (existing) {
        const isInFlight =
          existing.status === IN_FLIGHT_STATUS &&
          existing.body &&
          typeof existing.body === 'object' &&
          existing.body.inFlight === true;
        const replayable = isInFlight ? await waitForSettledEntry(IN_FLIGHT_WAIT_MS) : existing;
        if (!replayable) return next();
        // replay stored response
        res.status(replayable.status);
        try { res.set(replayable.headers || {}); } catch (e) {}
        return res.json(replayable.body);
      }

      // Reserve an in-flight entry to prevent duplicate handlers from running
      try {
        const placeholder: StoredEntry = { expires: Date.now() + ttl, status: IN_FLIGHT_STATUS, headers: {}, body: IN_FLIGHT_BODY };
        // best-effort: don't await, just set reservation
        void setEntry(placeholder).catch(() => {});
      } catch (e) {}

      // capture send/json
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

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
