import Redis from 'ioredis';

// Test-mode override: set GCOIN_TEST_WINDOWS=1 to shorten windows for fast CI/local tests
const TEST_MODE = (process.env.GCOIN_TEST_WINDOWS || '') === '1';
const MINUTES = TEST_MODE ? 5 * 1000 : 60 * 1000;
const HOURS = TEST_MODE ? 30 * 1000 : 60 * MINUTES;

export const TRANSFER_LIMIT_PER_MIN = 3;
export const TRANSFER_LIMIT_PER_HOUR = 10;
export const CONVERSION_LIMIT_PER_DAY = 3;

const redisUrl = process.env.REDIS_URL || process.env.REDIS || '';
let redis: Redis | null = null;
if (redisUrl) {
  try {
    redis = new Redis(redisUrl);
  } catch (e) {
    console.warn('Failed to init Redis for gcoin limits, falling back to memory', e);
    redis = null as any;
  }
}

// In-memory fallback for environments without Redis (dev/tests)
const transferWindows = new Map<string, number[]>();
const conversionWindows = new Map<string, number[]>();

function prune(arr: number[], spanMs: number) {
  const cutoff = Date.now() - spanMs;
  while (arr.length && arr[0] < cutoff) arr.shift();
}

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
  if (!redis) {
    const arr = transferWindows.get(userId) || [];
    prune(arr, HOURS);
    const arrMin = arr.filter((t) => t > Date.now() - MINUTES);
    if (arr.length >= TRANSFER_LIMIT_PER_HOUR) return false;
    if (arrMin.length >= TRANSFER_LIMIT_PER_MIN) return false;
    arr.push(Date.now());
    transferWindows.set(userId, arr);
    return true;
  }
  const key = `gcoin:transfers:${userId}`;
  const now = Date.now();
  const minWindow = now - MINUTES;
  const hourWindow = now - HOURS;
  const ttl = Math.ceil((HOURS * 2) / 1000);
  try {
    const res = await redis.eval(TRANSFER_LUA, 1, key, now.toString(), minWindow.toString(), hourWindow.toString(), TRANSFER_LIMIT_PER_MIN.toString(), TRANSFER_LIMIT_PER_HOUR.toString(), ttl.toString());
    return Number(res) === 1;
  } catch (e) {
    console.warn('Redis tryRecordTransfer error, allowing by default', e);
    return true;
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
  if (!redis) {
    const arr = conversionWindows.get(userId) || [];
    prune(arr, 24 * HOURS);
    if (arr.length >= CONVERSION_LIMIT_PER_DAY) return false;
    arr.push(Date.now());
    conversionWindows.set(userId, arr);
    return true;
  }
  const key = `gcoin:conversions:${userId}`;
  const now = Date.now();
  const dayWindow = now - 24 * HOURS;
  const ttl = Math.ceil((24 * HOURS) / 1000 + 60);
  try {
    const res = await redis.eval(CONVERSION_LUA, 1, key, now.toString(), dayWindow.toString(), CONVERSION_LIMIT_PER_DAY.toString(), ttl.toString());
    return Number(res) === 1;
  } catch (e) {
    console.warn('Redis tryRecordConversion error, allowing by default', e);
    return true;
  }
}

export function resetAll() {
  transferWindows.clear();
  conversionWindows.clear();
}

export default {};
