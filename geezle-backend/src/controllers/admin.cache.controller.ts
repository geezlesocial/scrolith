import { Request, Response } from 'express';
import { invalidateStripeConfigCache } from '../services/stripeConfig.service';
import { invalidateSystemMessagesConfigCache } from '../services/systemMessaging';
import { invalidateEmailTransportCache } from '../services/email.service';

type CacheClearResult = {
  key: string;
  ok: boolean;
  detail?: string;
};

const normalizeError = (error: unknown) => {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  return String(error);
};

export const clearPlatformRuntimeCache = async (req: Request, res: Response) => {
  const results: CacheClearResult[] = [];

  const run = async (key: string, action: () => void | Promise<void>) => {
    try {
      await action();
      results.push({ key, ok: true });
    } catch (error) {
      results.push({ key, ok: false, detail: normalizeError(error) });
    }
  };

  await run('stripe_config', async () => {
    invalidateStripeConfigCache();
  });

  await run('system_messages', async () => {
    invalidateSystemMessagesConfigCache();
  });

  await run('email_transport', async () => {
    invalidateEmailTransportCache();
  });

  await run('optimization_runtime', async () => {
    const clearOptimizationCaches = req.app.get('runtime:clearOptimizationCaches');
    if (typeof clearOptimizationCaches === 'function') {
      clearOptimizationCaches();
      return;
    }
    throw new Error('Optimization runtime cache hook not configured');
  });

  await run('redis_global', async () => {
    const redisClient: any = (global as any).redisClient;
    if (!redisClient) throw new Error('Redis client not configured');
    if (typeof redisClient.flushdb === 'function') {
      await redisClient.flushdb();
      return;
    }
    if (typeof redisClient.flushall === 'function') {
      await redisClient.flushall();
      return;
    }
    throw new Error('Redis client does not support flush operations');
  });

  const io = req.app.get('io');
  io?.emit?.('cache:cleared', {
    scope: 'platform_runtime',
    at: new Date().toISOString(),
    byUserId: (req as any).user?.id || null,
    results
  });

  const ok = results.every((item) => item.ok || item.key === 'redis_global');
  const message = ok
    ? 'Runtime cache clear completed'
    : 'Runtime cache clear completed with partial failures';

  return res.status(ok ? 200 : 207).json({
    success: ok,
    data: {
      cleared: results.filter((item) => item.ok).map((item) => item.key),
      results
    },
    message
  });
};
