import type Redis from 'ioredis';
import { connectRedisClient, createRedisClient } from '../services/redis/entraRedis';

// Test-mode override: set GCOIN_TEST_WINDOWS=1 to shorten windows for fast CI/local tests
const TEST_MODE = (process.env.GCOIN_TEST_WINDOWS || '') === '1';
const MINUTES = TEST_MODE ? 5 * 1000 : 60 * 1000;
const HOURS = TEST_MODE ? 30 * 1000 : 60 * MINUTES;

export const TRANSFER_LIMIT_PER_MIN = 3;
export const TRANSFER_LIMIT_PER_HOUR = 10;
export const CONVERSION_LIMIT_PER_DAY = 3;

const redisUrl = process.env.REDIS_URL || process.env.REDIS || '';
const protectedRuntime = ['production', 'staging'].includes(String(process.env.NODE_ENV || '').toLowerCase());
const localTestRedis = process.env.NODE_ENV === 'test' && process.env.REDIS_TEST_MODE === 'local';
let redis: Redis | null = null;
let redisReady: Promise<Redis> | null = null;
let stopRedisAuth: (() => void) | undefined;

const safeRedisError = (error: unknown): string => {
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value?.code === 'string' ? value.code.slice(0, 40) : '';
  const message = String(value?.message || 'Redis unavailable')
    .replace(/rediss?:\/\/\S+/gi, '[redacted]')
    .replace(/(?:token|password|secret|credential)\S*/gi, '[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 160);
  return code ? `${code}: ${message}` : message;
};

const reportRedisError = (error: unknown) => {
  console.warn('[gcoin] Redis protection store unavailable:', safeRedisError(error));
};

const getRedis = async (): Promise<Redis> => {
  if (!redisUrl) throw new Error('Gcoin protection store unavailable');
  if (redisReady) return redisReady;

  redisReady = (async () => {
    const clientId = String(process.env.REDIS_ENTRA_CLIENT_ID || '').trim();
    const client = createRedisClient(redisUrl, { clientId, requireManagedIdentity: protectedRuntime && !localTestRedis });
    redis = client;
    if (localTestRedis) {
      stopRedisAuth = await connectRedisClient(client, undefined, false);
      return client;
    }
    const username = String(process.env.REDIS_ENTRA_OBJECT_ID || '').trim();
    if (!clientId || !username) throw new Error('Redis Entra configuration unavailable');
    stopRedisAuth = await connectRedisClient(client, { clientId, username }, protectedRuntime);
    return client;
  })();

  try {
    return await redisReady;
  } catch (error) {
    reportRedisError(error);
    stopRedisAuth?.();
    stopRedisAuth = undefined;
    redis?.disconnect();
    redis = null;
    redisReady = null;
    throw new Error('Gcoin protection store unavailable');
  }
};

const TRANSFER_LUA = `
-- ARGV: now, minWindow, hourWindow, limitMin, limitHour, ttlSeconds
local key = KEYS[1]
local now = tonumber(ARGV[1])
local minWindow = tonumber(ARGV[2])
local hourWindow = tonumber(ARGV[3])
local limitMin = tonumber(ARGV[4])
local limitHour = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])
redis.call('ZREMRANGEBYSCORE', key, 0, hourWindow)
local countHour = redis.call('ZCOUNT', key, '-inf', '+inf')
if tonumber(countHour) >= limitHour then
  return 0
end
local countMin = redis.call('ZCOUNT', key, minWindow, '+inf')
if tonumber(countMin) >= limitMin then
  return 0
end
local member = ARGV[1] .. ':' .. tostring(math.random(100000,999999))
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return 1
`;

export async function tryRecordTransfer(userId: string) {
  const key = `gcoin:transfers:${userId}`;
  const now = Date.now();
  const minWindow = now - MINUTES;
  const hourWindow = now - HOURS;
  const ttl = Math.ceil((HOURS * 2) / 1000);
  try {
    const client = await getRedis();
    const res = await client.eval(TRANSFER_LUA, 1, key, now.toString(), minWindow.toString(), hourWindow.toString(), TRANSFER_LIMIT_PER_MIN.toString(), TRANSFER_LIMIT_PER_HOUR.toString(), ttl.toString());
    return Number(res) === 1;
  } catch (error) {
    reportRedisError(error);
    return false;
  }
}

const CONVERSION_LUA = `
-- ARGV: now, dayWindow, limitDay, ttlSeconds
local key = KEYS[1]
local now = tonumber(ARGV[1])
local dayWindow = tonumber(ARGV[2])
local limitDay = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', key, 0, dayWindow)
local cnt = redis.call('ZCOUNT', key, '-inf', '+inf')
if tonumber(cnt) >= limitDay then
  return 0
end
local member = ARGV[1] .. ':' .. tostring(math.random(100000,999999))
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return 1
`;

export async function tryRecordConversion(userId: string) {
  const key = `gcoin:conversions:${userId}`;
  const now = Date.now();
  const dayWindow = now - 24 * HOURS;
  const ttl = Math.ceil((24 * HOURS) / 1000 + 60);
  try {
    const client = await getRedis();
    const res = await client.eval(CONVERSION_LUA, 1, key, now.toString(), dayWindow.toString(), CONVERSION_LIMIT_PER_DAY.toString(), ttl.toString());
    return Number(res) === 1;
  } catch (error) {
    reportRedisError(error);
    return false;
  }
}

export function resetAll() {
  // Retained for test and call-site compatibility; protection state is Redis-owned.
}

/** Test-runner and graceful-shutdown cleanup for the shared protection client. */
export async function shutdown() {
  stopRedisAuth?.();
  stopRedisAuth = undefined;
  redisReady = null;
  const client = redis;
  redis = null;
  client?.disconnect();
}

export default {};
