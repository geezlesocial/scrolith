/**
 * Phase 33.0 — Quotas, rate limits, cost ceilings.
 */
import prisma from '../../utils/prismaClient';
import type { AICapabilityId, AIProviderId } from './types';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export type QuotaDecision = {
  allowed: boolean;
  reason?: string;
  retryAfter?: number | null;
  remaining?: {
    dailyRequests?: number;
    monthlyTokens?: number;
  };
};

const DEFAULTS = {
  dailyRequestsPerUser: Number(process.env.SCROLITHA_AI_DAILY_REQUESTS || 100),
  monthlyTokensPerUser: Number(process.env.SCROLITHA_AI_MONTHLY_TOKENS || 500_000),
  monthlyBudgetUsdPerUser: Number(process.env.SCROLITHA_AI_MONTHLY_BUDGET_USD || 5),
  globalDailyBudgetUsd: Number(process.env.SCROLITHA_AI_GLOBAL_DAILY_BUDGET_USD || 100),
  concurrencyPerUser: Number(process.env.SCROLITHA_AI_CONCURRENCY || 3),
  ratePerMinute: Number(process.env.SCROLITHA_AI_RATE_PER_MINUTE || 20)
};

// In-memory counters (batch to DB when available)
const dailyCounts = new Map<string, { day: string; count: number; tokens: number; cost: number }>();
const minuteCounts = new Map<string, { window: number; count: number }>();
const inflight = new Map<string, number>();

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function minuteWindow() {
  return Math.floor(Date.now() / 60_000);
}

function userDayKey(userId: string) {
  return `${userId}:${dayKey()}`;
}

export function estimateCostUsd(provider: AIProviderId, totalTokens: number): number {
  // Rough internal estimates — not billing
  const per1k =
    provider === 'OPENAI' ? 0.002 : provider === 'GEMINI' ? 0.001 : provider === 'OLLAMA' ? 0.0001 : 0;
  return (totalTokens / 1000) * per1k;
}

export async function checkQuota(input: {
  userId?: string | null;
  capability: AICapabilityId;
  provider?: AIProviderId;
  estimatedTokens?: number;
}): Promise<QuotaDecision> {
  const uid = input.userId || 'anonymous';
  const day = dayKey();
  const entry = dailyCounts.get(userDayKey(uid));
  const count = entry?.day === day ? entry.count : 0;
  const tokens = entry?.day === day ? entry.tokens : 0;
  const cost = entry?.day === day ? entry.cost : 0;

  if (count >= DEFAULTS.dailyRequestsPerUser) {
    return { allowed: false, reason: 'DAILY_REQUEST_QUOTA_EXCEEDED', retryAfter: 3600 };
  }
  if (tokens + (input.estimatedTokens || 0) > DEFAULTS.monthlyTokensPerUser) {
    return { allowed: false, reason: 'MONTHLY_TOKEN_CEILING_EXCEEDED', retryAfter: null };
  }
  if (cost >= DEFAULTS.monthlyBudgetUsdPerUser) {
    return { allowed: false, reason: 'MONTHLY_AI_BUDGET_EXCEEDED', retryAfter: null };
  }

  const mw = minuteWindow();
  const mKey = `${uid}:rpm`;
  const m = minuteCounts.get(mKey);
  const rpm = m?.window === mw ? m.count : 0;
  if (rpm >= DEFAULTS.ratePerMinute) {
    return { allowed: false, reason: 'RATE_LIMIT_EXCEEDED', retryAfter: 60 };
  }

  const concurrent = inflight.get(uid) || 0;
  if (concurrent >= DEFAULTS.concurrencyPerUser) {
    return { allowed: false, reason: 'CONCURRENCY_LIMIT_EXCEEDED', retryAfter: 5 };
  }

  return {
    allowed: true,
    remaining: {
      dailyRequests: Math.max(0, DEFAULTS.dailyRequestsPerUser - count),
      monthlyTokens: Math.max(0, DEFAULTS.monthlyTokensPerUser - tokens)
    }
  };
}

export function beginRequest(userId?: string | null) {
  const uid = userId || 'anonymous';
  inflight.set(uid, (inflight.get(uid) || 0) + 1);
  const mw = minuteWindow();
  const mKey = `${uid}:rpm`;
  const m = minuteCounts.get(mKey);
  if (!m || m.window !== mw) minuteCounts.set(mKey, { window: mw, count: 1 });
  else m.count += 1;
}

export function endRequest(userId?: string | null) {
  const uid = userId || 'anonymous';
  inflight.set(uid, Math.max(0, (inflight.get(uid) || 1) - 1));
}

export async function recordUsage(input: {
  userId?: string | null;
  capability: AICapabilityId;
  provider: AIProviderId;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  correlationId?: string | null;
  requestId?: string | null;
  status: string;
}): Promise<void> {
  const uid = input.userId || 'anonymous';
  const day = dayKey();
  const key = userDayKey(uid);
  const entry = dailyCounts.get(key);
  const total = input.totalTokens || (input.promptTokens || 0) + (input.completionTokens || 0);
  const cost = input.estimatedCostUsd ?? estimateCostUsd(input.provider, total);
  if (!entry || entry.day !== day) {
    dailyCounts.set(key, { day, count: 1, tokens: total, cost });
  } else {
    entry.count += 1;
    entry.tokens += total;
    entry.cost += cost;
  }

  try {
    await (prisma as any).aIUsageLedger?.create?.({
      data: {
        userId: input.userId || null,
        capability: input.capability,
        provider: input.provider,
        model: input.model,
        promptTokens: input.promptTokens || 0,
        completionTokens: input.completionTokens || 0,
        totalTokens: total,
        estimatedCostUsd: cost,
        status: input.status,
        correlationId: input.correlationId || null,
        requestId: input.requestId || null
      }
    });
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }
}

export async function getUsageSummary(userId: string) {
  const day = dayKey();
  const entry = dailyCounts.get(userDayKey(userId));
  let dbRows: any[] = [];
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    dbRows = (await (prisma as any).aIUsageLedger?.findMany?.({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100
    })) || [];
  } catch {
    dbRows = [];
  }
  const monthTokens = dbRows.reduce((s, r) => s + (r.totalTokens || 0), 0);
  const monthCost = dbRows.reduce((s, r) => s + Number(r.estimatedCostUsd || 0), 0);
  return {
    today: {
      requests: entry?.day === day ? entry.count : 0,
      tokens: entry?.day === day ? entry.tokens : 0,
      estimatedCostUsd: entry?.day === day ? entry.cost : 0
    },
    last30Days: {
      requests: dbRows.length,
      tokens: monthTokens,
      estimatedCostUsd: monthCost
    },
    limits: {
      dailyRequests: DEFAULTS.dailyRequestsPerUser,
      monthlyTokens: DEFAULTS.monthlyTokensPerUser,
      monthlyBudgetUsd: DEFAULTS.monthlyBudgetUsdPerUser,
      ratePerMinute: DEFAULTS.ratePerMinute
    },
    recent: dbRows.slice(0, 20).map((r) => ({
      id: r.id,
      capability: r.capability,
      provider: r.provider,
      model: r.model,
      totalTokens: r.totalTokens,
      status: r.status,
      createdAt: r.createdAt
    }))
  };
}

export default {
  checkQuota,
  beginRequest,
  endRequest,
  recordUsage,
  getUsageSummary,
  estimateCostUsd
};
