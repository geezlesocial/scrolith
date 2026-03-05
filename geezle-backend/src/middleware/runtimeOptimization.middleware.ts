import type { Request, RequestHandler, Response } from 'express';
import compression from 'compression';
import type { RuntimeOptimizationConfig } from '../services/runtimeOptimization.service';

type ConfigResolver = () => RuntimeOptimizationConfig;

type CachedApiResponse = {
  statusCode: number;
  body: Buffer | string;
  contentType?: string;
  cachedAt: number;
  expiresAt: number;
};

const isLikelyJsonContent = (contentType: string) => contentType.includes('application/json');

const minifyJsonResponseString = (input: string): string => {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed);
  } catch {
    return input;
  }
};

const minifyHtmlResponse = (
  html: string,
  cfg: Pick<RuntimeOptimizationConfig, 'htmlCollapseWhitespace' | 'htmlRemoveComments'>
): string => {
  let output = html;
  if (cfg.htmlRemoveComments) {
    output = output.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  }
  if (cfg.htmlCollapseWhitespace) {
    output = output.replace(/>\s+</g, '><');
    output = output.replace(/\s{2,}/g, ' ');
  }
  return output.trim();
};

const isCacheableApiRequest = (req: Request, cfg: RuntimeOptimizationConfig): boolean => {
  if (!(cfg.enabled && cfg.apiResponseCachingEnabled)) return false;
  if (req.method.toUpperCase() !== 'GET') return false;
  if (!req.path.startsWith('/api/')) return false;
  if (req.headers.authorization || req.headers.cookie || req.headers['x-user-id']) return false;
  if (req.query && (req.query.nocache !== undefined || req.query._t !== undefined)) return false;

  const normalizedPath = req.path.toLowerCase();
  for (const excluded of cfg.apiCacheExcludePaths) {
    const normalizedExcluded = String(excluded || '').trim().toLowerCase();
    if (!normalizedExcluded) continue;
    if (normalizedPath.startsWith(normalizedExcluded)) return false;
  }

  return true;
};

const getContentType = (res: Response): string => {
  const raw = res.getHeader('Content-Type');
  if (Array.isArray(raw)) return raw.join(';').toLowerCase();
  return String(raw || '').toLowerCase();
};

const normalizeBodyForCache = (body: unknown): Buffer | string | null => {
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    try {
      return JSON.stringify(body);
    } catch {
      return null;
    }
  }
  return String(body);
};

export const resolveStaticAssetCacheControl = (
  cfg: RuntimeOptimizationConfig,
  fallbackSeconds: number,
  fileName = ''
): string => {
  const fallbackTtl = Math.max(0, Math.trunc(fallbackSeconds));
  const fallbackSwr = Math.min(Math.max(0, Math.trunc(fallbackTtl / 2)), 86400);

  if (!cfg.enabled) {
    return `public, max-age=${fallbackTtl}, stale-while-revalidate=${fallbackSwr}`;
  }
  if (!cfg.staticAssetCachingEnabled) {
    return 'public, max-age=0, must-revalidate';
  }

  const isFavicon = /favicon/i.test(fileName);
  const ttl = isFavicon
    ? Math.min(Math.max(60, cfg.staticAssetCacheSeconds), 3600)
    : Math.max(60, cfg.staticAssetCacheSeconds);
  if (isFavicon) {
    const swr = Math.min(Math.max(0, Math.trunc(ttl / 2)), 86400);
    return `public, max-age=${ttl}, stale-while-revalidate=${swr}`;
  }
  return `public, max-age=${ttl}, immutable`;
};

export interface RuntimeOptimizationMiddlewareBundle {
  middlewares: RequestHandler[];
  clearRuntimeCaches: () => void;
}

export const createRuntimeOptimizationMiddlewareBundle = (
  getConfig: ConfigResolver
): RuntimeOptimizationMiddlewareBundle => {
  const apiCacheStore = new Map<string, CachedApiResponse>();
  let compressionSignature = '';
  let compressionMiddleware: RequestHandler | null = null;
  let lastCacheSignature = '';

  const clearRuntimeCaches = () => {
    apiCacheStore.clear();
  };

  const getCompressionMiddleware = (cfg: RuntimeOptimizationConfig): RequestHandler | null => {
    if (!(cfg.enabled && cfg.compressionEnabled)) return null;
    const signature = `${cfg.compressionLevel}:${cfg.compressionThresholdKb}`;
    if (compressionMiddleware && signature === compressionSignature) return compressionMiddleware;

    compressionSignature = signature;
    compressionMiddleware = compression({
      level: cfg.compressionLevel,
      threshold: cfg.compressionThresholdKb * 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      }
    });
    return compressionMiddleware;
  };

  const speedAndMinifyMiddleware: RequestHandler = (req, res, next) => {
    const cfg = getConfig();
    if (!(cfg.enabled && (cfg.speedHintsEnabled || cfg.htmlMinifyEnabled || cfg.jsonMinifyEnabled))) {
      return next();
    }

    if (cfg.speedHintsEnabled) {
      res.setHeader('X-DNS-Prefetch-Control', 'on');
      res.setHeader('X-Optimization-Profile', 'runtime-enterprise');
      if (cfg.preconnectOrigins.length > 0) {
        const links = cfg.preconnectOrigins
          .map((origin) => `<${origin}>; rel=preconnect`)
          .join(', ');
        const existing = res.getHeader('Link');
        const existingValue = Array.isArray(existing) ? existing.join(', ') : String(existing || '').trim();
        res.setHeader('Link', existingValue ? `${existingValue}, ${links}` : links);
      }
    }

    const originalSend = res.send.bind(res);
    res.send = ((body: any) => {
      const contentType = getContentType(res);
      let output = body;

      if (cfg.htmlMinifyEnabled && typeof output === 'string' && contentType.includes('text/html')) {
        output = minifyHtmlResponse(output, cfg);
      } else if (cfg.jsonMinifyEnabled && typeof output === 'string' && isLikelyJsonContent(contentType)) {
        output = minifyJsonResponseString(output);
      }

      return originalSend(output);
    }) as Response['send'];

    return next();
  };

  const dynamicCompressionMiddleware: RequestHandler = (req, res, next) => {
    const cfg = getConfig();
    const runtimeCompression = getCompressionMiddleware(cfg);
    if (!runtimeCompression) return next();
    return runtimeCompression(req, res, next);
  };

  const apiCacheMiddleware: RequestHandler = (req, res, next) => {
    const cfg = getConfig();
    const cacheSignature = `${cfg.enabled}:${cfg.apiResponseCachingEnabled}:${cfg.apiResponseCacheSeconds}:${cfg.apiResponseCacheMaxEntries}:${cfg.apiCacheExcludePaths.join('|')}`;
    if (cacheSignature !== lastCacheSignature) {
      apiCacheStore.clear();
      lastCacheSignature = cacheSignature;
    }

    if (!isCacheableApiRequest(req, cfg)) return next();

    const key = `${req.method.toUpperCase()} ${req.originalUrl}`;
    const now = Date.now();
    const existing = apiCacheStore.get(key);

    if (existing && existing.expiresAt > now) {
      const remaining = Math.max(0, Math.trunc((existing.expiresAt - now) / 1000));
      res.setHeader('X-Scrolith-Api-Cache', 'HIT');
      if (existing.contentType) res.setHeader('Content-Type', existing.contentType);
      res.setHeader('Cache-Control', `public, max-age=${remaining}, stale-while-revalidate=30`);
      return res.status(existing.statusCode).send(existing.body);
    }

    if (existing) apiCacheStore.delete(key);
    res.setHeader('X-Scrolith-Api-Cache', 'MISS');

    const originalSend = res.send.bind(res);
    res.send = ((body: any) => {
      const normalizedBody = normalizeBodyForCache(body);
      if (normalizedBody !== null && res.statusCode >= 200 && res.statusCode < 300) {
        const contentType = getContentType(res);
        apiCacheStore.set(key, {
          statusCode: res.statusCode,
          body: normalizedBody,
          contentType: contentType || undefined,
          cachedAt: now,
          expiresAt: now + cfg.apiResponseCacheSeconds * 1000
        });

        while (apiCacheStore.size > cfg.apiResponseCacheMaxEntries) {
          const oldestKey = apiCacheStore.keys().next().value;
          if (!oldestKey) break;
          apiCacheStore.delete(oldestKey);
        }
      }
      return originalSend(body);
    }) as Response['send'];

    return next();
  };

  return {
    middlewares: [speedAndMinifyMiddleware, dynamicCompressionMiddleware, apiCacheMiddleware],
    clearRuntimeCaches
  };
};
