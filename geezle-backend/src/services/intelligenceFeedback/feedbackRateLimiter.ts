type Bucket = {
  windowStart: number;
  count: number;
};

export type FeedbackRateLimiterOptions = {
  windowMs?: number;
  maxEvents?: number;
  now?: () => number;
};

export class FeedbackRateLimiter {
  private readonly windowMs: number;
  private readonly maxEvents: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: FeedbackRateLimiterOptions = {}) {
    this.windowMs = Math.max(1000, Number(options.windowMs || 60_000));
    this.maxEvents = Math.max(1, Number(options.maxEvents || 180));
    this.now = options.now || Date.now;
  }

  check(viewerId: string, cost = 1) {
    const key = String(viewerId || '').trim();
    const currentTime = this.now();
    const existing = this.buckets.get(key);
    const bucket =
      existing && currentTime - existing.windowStart < this.windowMs
        ? existing
        : { windowStart: currentTime, count: 0 };
    if (bucket.count + cost > this.maxEvents) {
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: Math.max(0, this.maxEvents - bucket.count),
        resetAt: bucket.windowStart + this.windowMs
      };
    }
    bucket.count += cost;
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxEvents - bucket.count),
      resetAt: bucket.windowStart + this.windowMs
    };
  }

  resetForTests() {
    this.buckets.clear();
  }
}
