import { createHash, randomBytes } from 'crypto';
import prisma from '../../utils/prismaClient';
import {
  generateChallenge,
  generatePublicToken,
  hashAnswer,
  parseUserAgentBrowser
} from './challengeEngine';
import {
  enabledChallengeTypes,
  isEndpointEnabled,
  normalizeHumanVerificationSettings,
  publicSettingsView
} from './settings';
import type {
  HumanVerificationEndpoint,
  HumanVerificationSettingsData
} from './types';
import { DEFAULT_HUMAN_VERIFICATION_SETTINGS } from './types';

const SETTINGS_SCOPE = 'default';
const APP_SETTING_SCOPE = 'human_verification';

type ClientContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  fingerprint?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  country?: string | null;
};

const memoryLocks = new Map<string, number>();
const progressiveFails = new Map<string, number>();

/** In-process challenge store so login/signup stay available if HV tables lag migrations. */
type MemoryChallenge = {
  id: string;
  challengeToken: string;
  endpoint: string;
  challengeType: string;
  difficulty: string;
  prompt: any;
  options: any[];
  answerHash: string;
  expiresAt: Date;
  status: string;
  attemptCount: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  fingerprint?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  solvedAt?: Date | null;
  verificationTokenHash?: string | null;
  verificationExpiresAt?: Date | null;
  source: 'memory';
};

const memoryChallenges = new Map<string, MemoryChallenge>();
const MEMORY_CHALLENGE_MAX = 5_000;

const pruneMemoryChallenges = () => {
  const now = Date.now();
  for (const [token, row] of memoryChallenges.entries()) {
    if (new Date(row.expiresAt).getTime() < now || row.status === 'solved' || row.status === 'expired') {
      // Keep solved tokens briefly so double-submit can return ALREADY_USED, then drop.
      if (row.status === 'solved' && row.solvedAt && now - row.solvedAt.getTime() < 120_000) continue;
      memoryChallenges.delete(token);
    }
  }
  if (memoryChallenges.size <= MEMORY_CHALLENGE_MAX) return;
  const overflow = memoryChallenges.size - MEMORY_CHALLENGE_MAX;
  let removed = 0;
  for (const token of memoryChallenges.keys()) {
    memoryChallenges.delete(token);
    removed += 1;
    if (removed >= overflow) break;
  }
};

const putMemoryChallenge = (row: MemoryChallenge) => {
  pruneMemoryChallenges();
  memoryChallenges.set(row.challengeToken, row);
};

const getMemoryChallenge = (token: string) => {
  pruneMemoryChallenges();
  return memoryChallenges.get(token) || null;
};

function lockKey(ip: string, endpoint: string) {
  return `${ip || 'unknown'}::${endpoint}`;
}

function isTableMissingError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return (
    err?.code === 'P2021' ||
    err?.code === 'P2010' ||
    /does not exist|HumanVerification/i.test(msg)
  );
}

async function writeAudit(params: {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  endpoint?: string | null;
  challengeId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}) {
  try {
    await (prisma as any).humanVerificationAuditLog.create({
      data: {
        id: randomBytes(12).toString('hex'),
        action: params.action,
        actorId: params.actorId || null,
        actorEmail: params.actorEmail || null,
        endpoint: params.endpoint || null,
        challengeId: params.challengeId || null,
        details: params.details || undefined,
        ipAddress: params.ipAddress || null
      }
    });
  } catch {
    // best-effort
  }
}

async function bumpAnalytics(date: Date, endpoint: string | null, metric: string, delta = 1) {
  try {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const existing = await (prisma as any).humanVerificationAnalytics.findFirst({
      where: { date: day, endpoint, metric }
    });
    if (existing) {
      await (prisma as any).humanVerificationAnalytics.update({
        where: { id: existing.id },
        data: { value: Number(existing.value || 0) + delta }
      });
    } else {
      await (prisma as any).humanVerificationAnalytics.create({
        data: {
          id: randomBytes(12).toString('hex'),
          date: day,
          endpoint,
          metric,
          value: delta
        }
      });
    }
  } catch {
    // best-effort
  }
}

export class HumanVerificationService {
  static async getSettings(): Promise<HumanVerificationSettingsData> {
    try {
      const row = await (prisma as any).humanVerificationSettings.findUnique({
        where: { scope: SETTINGS_SCOPE }
      });
      if (row?.data) return normalizeHumanVerificationSettings(row.data);

      // Fallback to AppSetting for environments without HV tables yet
      const app = await prisma.appSetting.findUnique({ where: { scope: APP_SETTING_SCOPE } });
      if (app?.data) return normalizeHumanVerificationSettings(app.data as any);
    } catch (err) {
      if (!isTableMissingError(err)) {
        console.warn('[human-verification] getSettings failed', (err as any)?.message);
      }
      try {
        const app = await prisma.appSetting.findUnique({ where: { scope: APP_SETTING_SCOPE } });
        if (app?.data) return normalizeHumanVerificationSettings(app.data as any);
      } catch {
        // ignore
      }
    }
    return normalizeHumanVerificationSettings(DEFAULT_HUMAN_VERIFICATION_SETTINGS);
  }

  static async updateSettings(
    patch: Partial<HumanVerificationSettingsData> | Record<string, any>,
    actor?: { id?: string; email?: string }
  ): Promise<HumanVerificationSettingsData> {
    const current = await this.getSettings();
    const merged = normalizeHumanVerificationSettings({
      ...current,
      ...patch,
      endpoints: { ...current.endpoints, ...(patch as any)?.endpoints },
      challengeTypes: { ...current.challengeTypes, ...(patch as any)?.challengeTypes },
      timing: { ...current.timing, ...(patch as any)?.timing },
      behavior: { ...current.behavior, ...(patch as any)?.behavior },
      theme: { ...current.theme, ...(patch as any)?.theme },
      branding: { ...current.branding, ...(patch as any)?.branding },
      rateLimit: { ...current.rateLimit, ...(patch as any)?.rateLimit }
    });

    // Always persist to AppSetting (always available)
    await prisma.appSetting.upsert({
      where: { scope: APP_SETTING_SCOPE },
      create: { scope: APP_SETTING_SCOPE, data: merged as any },
      update: { data: merged as any }
    });

    try {
      await (prisma as any).humanVerificationSettings.upsert({
        where: { scope: SETTINGS_SCOPE },
        create: {
          id: randomBytes(12).toString('hex'),
          scope: SETTINGS_SCOPE,
          data: merged,
          updatedBy: actor?.id || null
        },
        update: {
          data: merged,
          updatedBy: actor?.id || null
        }
      });
    } catch (err) {
      if (!isTableMissingError(err)) {
        console.warn('[human-verification] settings table upsert failed', (err as any)?.message);
      }
    }

    await writeAudit({
      action: 'settings_updated',
      actorId: actor?.id,
      actorEmail: actor?.email,
      details: {
        masterEnabled: merged.masterEnabled,
        emergencyDisabled: merged.emergencyDisabled,
        difficulty: merged.difficulty
      }
    });

    return merged;
  }

  static async isRequired(
    endpoint: HumanVerificationEndpoint,
    ctx: ClientContext = {}
  ): Promise<{ required: boolean; settings: HumanVerificationSettingsData; reason?: string }> {
    const settings = await this.getSettings();
    if (settings.emergencyDisabled) {
      return { required: false, settings, reason: 'emergency_disabled' };
    }
    if (!settings.masterEnabled) {
      return { required: false, settings, reason: 'master_disabled' };
    }
    if (!isEndpointEnabled(settings, endpoint)) {
      return { required: false, settings, reason: 'endpoint_disabled' };
    }
    if (settings.behavior.skipLoggedInUsers && ctx.userId) {
      return { required: false, settings, reason: 'skip_logged_in' };
    }
    // Risk-based: always verify when alwaysVerify; otherwise verify on elevated risk
    if (settings.behavior.riskBased && !settings.behavior.alwaysVerify) {
      const risk = await this.computeRiskScore(endpoint, ctx);
      if (risk < 40) return { required: false, settings, reason: 'low_risk' };
    }
    return { required: true, settings };
  }

  static async computeRiskScore(endpoint: string, ctx: ClientContext): Promise<number> {
    let score = 10;
    const ip = ctx.ipAddress || '';
    if (!ip || ip === '127.0.0.1' || ip === '::1') score += 5;
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const fails = await (prisma as any).humanVerificationAttempt.count({
        where: {
          success: false,
          createdAt: { gte: since },
          ipAddress: ip || undefined
        }
      });
      score += Math.min(50, fails * 8);
    } catch {
      // ignore
    }
    if (endpoint === 'signup' || endpoint === 'api') score += 15;
    return Math.min(100, score);
  }

  static async createChallenge(params: {
    endpoint: HumanVerificationEndpoint;
    ctx?: ClientContext;
  }) {
    const { endpoint, ctx = {} } = params;
    const gate = await this.isRequired(endpoint, ctx);
    if (!gate.required) {
      return {
        required: false,
        reason: gate.reason,
        publicSettings: publicSettingsView(gate.settings)
      };
    }

    const settings = gate.settings;
    const ip = ctx.ipAddress || 'unknown';

    // Temporary lock after too many fails
    const lk = lockKey(ip, endpoint);
    const lockedUntil = memoryLocks.get(lk) || 0;
    if (lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
      return {
        required: true,
        error: {
          code: 'HV_LOCKED',
          message: `Too many failed attempts. Try again in ${retryAfter}s.`,
          retryAfter
        }
      };
    }

    // Rate limit create
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const created = await (prisma as any).humanVerificationChallenge.count({
        where: { ipAddress: ip, createdAt: { gte: since } }
      });
      if (created >= settings.rateLimit.createPerIpPerHour) {
        return {
          required: true,
          error: {
            code: 'HV_RATE_LIMIT',
            message: 'Too many verification challenges. Please wait and try again.'
          }
        };
      }
    } catch (err) {
      if (!isTableMissingError(err)) {
        console.warn('[human-verification] rate check failed', (err as any)?.message);
      }
    }

    const progressiveLevel = progressiveFails.get(lk) || 0;
    const types = enabledChallengeTypes(settings);
    const generated = generateChallenge({
      enabledTypes: types,
      difficulty: settings.difficulty,
      progressiveLevel: settings.behavior.progressiveDifficulty ? progressiveLevel : 0
    });

    const challengeToken = generatePublicToken(24);
    const salt = challengeToken.slice(0, 16);
    const answerHash = hashAnswer(generated.correctValue, salt);
    const expiresAt = new Date(Date.now() + settings.timing.expirationSeconds * 1000);
    const riskScore = await this.computeRiskScore(endpoint, ctx);
    const browser = parseUserAgentBrowser(ctx.userAgent);

    let challengeId = randomBytes(12).toString('hex');
    let persisted = false;
    try {
      const row = await (prisma as any).humanVerificationChallenge.create({
        data: {
          id: challengeId,
          challengeToken,
          endpoint,
          challengeType: generated.challengeType,
          difficulty: generated.difficulty,
          prompt: generated.prompt,
          options: generated.options,
          answerHash,
          expiresAt,
          status: 'pending',
          ipAddress: ctx.ipAddress || null,
          userAgent: ctx.userAgent || null,
          fingerprint: ctx.fingerprint || null,
          sessionId: ctx.sessionId || null,
          userId: ctx.userId || null,
          riskScore,
          browser,
          country: ctx.country || null,
          metadata: { progressiveLevel }
        }
      });
      challengeId = row.id;
      persisted = true;
    } catch (err) {
      // Fail open to in-memory challenges so login/signup never hard-break when
      // HV tables are missing or transient DB errors occur (enterprise continuity).
      console.error(
        '[human-verification] create challenge failed; using memory fallback',
        (err as any)?.message
      );
      putMemoryChallenge({
        id: challengeId,
        challengeToken,
        endpoint,
        challengeType: generated.challengeType,
        difficulty: generated.difficulty,
        prompt: generated.prompt,
        options: generated.options,
        answerHash,
        expiresAt,
        status: 'pending',
        attemptCount: 0,
        ipAddress: ctx.ipAddress || null,
        userAgent: ctx.userAgent || null,
        fingerprint: ctx.fingerprint || null,
        sessionId: ctx.sessionId || null,
        userId: ctx.userId || null,
        source: 'memory'
      });
    }

    await bumpAnalytics(new Date(), endpoint, 'generated');
    await writeAudit({
      action: 'challenge_created',
      endpoint,
      challengeId,
      ipAddress: ctx.ipAddress,
      details: {
        type: generated.challengeType,
        difficulty: generated.difficulty,
        storage: persisted ? 'db' : 'memory'
      }
    });

    return {
      required: true,
      challenge: {
        challengeToken,
        endpoint,
        challengeType: generated.challengeType,
        difficulty: generated.difficulty,
        prompt: generated.prompt,
        options: generated.options.map((o) => ({ id: o.id, label: o.label, value: o.value })),
        expiresAt: expiresAt.toISOString(),
        maxAttempts: settings.timing.maxAttempts
      },
      publicSettings: publicSettingsView(settings)
    };
  }

  static async verifyAnswer(params: {
    challengeToken: string;
    answer: string;
    optionId?: string;
    ctx?: ClientContext;
    startedAt?: number | null;
  }) {
    const { challengeToken, answer, optionId, ctx = {}, startedAt } = params;
    if (!challengeToken || (!answer && !optionId)) {
      return {
        success: false,
        code: 'HV_INVALID_REQUEST',
        message: 'Challenge token and answer are required.'
      };
    }

    const settings = await this.getSettings();
    let challenge: any = null;
    let fromMemory = false;
    try {
      challenge = await (prisma as any).humanVerificationChallenge.findUnique({
        where: { challengeToken }
      });
    } catch (err) {
      console.warn('[human-verification] DB lookup failed; checking memory store', (err as any)?.message);
    }

    if (!challenge) {
      const mem = getMemoryChallenge(challengeToken);
      if (mem) {
        challenge = mem;
        fromMemory = true;
      }
    }

    if (!challenge) {
      return { success: false, code: 'HV_NOT_FOUND', message: 'Challenge not found.' };
    }

    if (challenge.status === 'solved' || challenge.solvedAt) {
      return {
        success: false,
        code: 'HV_ALREADY_USED',
        message: 'This challenge was already solved. Request a new one.'
      };
    }

    if (challenge.status === 'expired' || new Date(challenge.expiresAt).getTime() < Date.now()) {
      if (fromMemory) {
        challenge.status = 'expired';
        putMemoryChallenge(challenge as MemoryChallenge);
      } else {
        try {
          await (prisma as any).humanVerificationChallenge.update({
            where: { id: challenge.id },
            data: { status: 'expired' }
          });
        } catch {
          // ignore
        }
      }
      await bumpAnalytics(new Date(), challenge.endpoint, 'expired');
      return { success: false, code: 'HV_EXPIRED', message: 'Challenge expired. Request a new one.' };
    }

    if (challenge.attemptCount >= settings.timing.maxAttempts) {
      const lk = lockKey(ctx.ipAddress || challenge.ipAddress || 'unknown', challenge.endpoint);
      memoryLocks.set(lk, Date.now() + settings.timing.lockDurationSeconds * 1000);
      return {
        success: false,
        code: 'HV_MAX_ATTEMPTS',
        message: 'Maximum attempts exceeded. Please wait and try again.'
      };
    }

    // Optional binding checks (soft)
    if (challenge.fingerprint && ctx.fingerprint && challenge.fingerprint !== ctx.fingerprint) {
      // elevate risk but still allow (mobile WebView may rotate)
    }

    const options = Array.isArray(challenge.options) ? challenge.options : [];
    let submitted = String(answer || '').trim();
    if (optionId) {
      const match = options.find((o: any) => o.id === optionId || o.value === optionId);
      if (match) submitted = String(match.value);
    }

    const salt = String(challenge.challengeToken).slice(0, 16);
    const submittedHash = hashAnswer(submitted, salt);
    const ok = submittedHash === challenge.answerHash;
    const solveTimeMs =
      typeof startedAt === 'number' && startedAt > 0
        ? Math.max(0, Date.now() - startedAt)
        : null;

    try {
      await (prisma as any).humanVerificationAttempt.create({
        data: {
          id: randomBytes(12).toString('hex'),
          challengeId: challenge.id,
          success: ok,
          selectedValue: submitted.slice(0, 64),
          ipAddress: ctx.ipAddress || challenge.ipAddress || null,
          userAgent: ctx.userAgent || null,
          fingerprint: ctx.fingerprint || null,
          errorCode: ok ? null : 'WRONG_ANSWER',
          solveTimeMs
        }
      });
    } catch {
      // ignore
    }

    if (!ok) {
      const nextAttempts = (challenge.attemptCount || 0) + 1;
      if (fromMemory) {
        challenge.attemptCount = nextAttempts;
        challenge.status = nextAttempts >= settings.timing.maxAttempts ? 'failed' : 'pending';
        putMemoryChallenge(challenge as MemoryChallenge);
      } else {
        try {
          await (prisma as any).humanVerificationChallenge.update({
            where: { id: challenge.id },
            data: {
              attemptCount: nextAttempts,
              status: nextAttempts >= settings.timing.maxAttempts ? 'failed' : 'pending'
            }
          });
        } catch {
          // ignore
        }
      }

      const lk = lockKey(ctx.ipAddress || challenge.ipAddress || 'unknown', challenge.endpoint);
      progressiveFails.set(lk, (progressiveFails.get(lk) || 0) + 1);
      if (nextAttempts >= settings.timing.maxAttempts) {
        memoryLocks.set(lk, Date.now() + settings.timing.lockDurationSeconds * 1000);
      }

      await bumpAnalytics(new Date(), challenge.endpoint, 'failed');
      await writeAudit({
        action: 'challenge_failed',
        endpoint: challenge.endpoint,
        challengeId: challenge.id,
        ipAddress: ctx.ipAddress
      });

      return {
        success: false,
        code: 'HV_WRONG_ANSWER',
        message: settings.branding.failureMessage || 'Incorrect answer. Try again.',
        attemptsRemaining: Math.max(0, settings.timing.maxAttempts - nextAttempts)
      };
    }

    // Success: issue one-time verification token
    const verificationToken = generatePublicToken(32);
    const verificationTokenHash = createHash('sha256').update(verificationToken).digest('hex');
    const verificationExpiresAt = new Date(
      Date.now() + settings.timing.verificationTtlSeconds * 1000
    );

    if (fromMemory) {
      challenge.status = 'solved';
      challenge.solvedAt = new Date();
      challenge.attemptCount = (challenge.attemptCount || 0) + 1;
      challenge.verificationTokenHash = verificationTokenHash;
      challenge.verificationExpiresAt = verificationExpiresAt;
      putMemoryChallenge(challenge as MemoryChallenge);
    } else {
      try {
        await (prisma as any).humanVerificationChallenge.update({
          where: { id: challenge.id },
          data: {
            status: 'solved',
            solvedAt: new Date(),
            usedAt: new Date(),
            solveTimeMs,
            verificationTokenHash,
            verificationExpiresAt,
            attemptCount: (challenge.attemptCount || 0) + 1
          }
        });
      } catch (err) {
        // Last-resort memory finalize so the user is not blocked mid-login.
        putMemoryChallenge({
          id: String(challenge.id),
          challengeToken: String(challenge.challengeToken),
          endpoint: String(challenge.endpoint),
          challengeType: String(challenge.challengeType || 'arithmetic'),
          difficulty: String(challenge.difficulty || 'easy'),
          prompt: challenge.prompt,
          options: Array.isArray(challenge.options) ? challenge.options : [],
          answerHash: String(challenge.answerHash),
          expiresAt: new Date(challenge.expiresAt),
          status: 'solved',
          attemptCount: (challenge.attemptCount || 0) + 1,
          ipAddress: challenge.ipAddress,
          solvedAt: new Date(),
          verificationTokenHash,
          verificationExpiresAt,
          source: 'memory'
        });
      }
    }

    const lk = lockKey(ctx.ipAddress || challenge.ipAddress || 'unknown', challenge.endpoint);
    progressiveFails.set(lk, 0);
    memoryLocks.delete(lk);

    await bumpAnalytics(new Date(), challenge.endpoint, 'solved');
    if (solveTimeMs != null) {
      await bumpAnalytics(new Date(), challenge.endpoint, 'solve_time_sum_ms', solveTimeMs);
      await bumpAnalytics(new Date(), challenge.endpoint, 'solve_time_count', 1);
    }
    await writeAudit({
      action: 'challenge_solved',
      endpoint: challenge.endpoint,
      challengeId: challenge.id,
      ipAddress: ctx.ipAddress,
      details: { solveTimeMs }
    });

    return {
      success: true,
      verificationToken,
      expiresAt: verificationExpiresAt.toISOString(),
      endpoint: challenge.endpoint,
      message: settings.branding.successMessage || 'Verified.'
    };
  }

  /**
   * Consume a one-time verification token for a protected endpoint.
   * Returns success:true, enforced:false when HV not required for endpoint.
   */
  static async consumeVerificationToken(params: {
    endpoint: HumanVerificationEndpoint;
    token?: string | null;
    ctx?: ClientContext;
  }): Promise<{
    enforced: boolean;
    success: boolean;
    code?: string;
    message?: string;
  }> {
    const gate = await this.isRequired(params.endpoint, params.ctx);
    if (!gate.required) {
      return { enforced: false, success: true };
    }

    const token = String(params.token || '').trim();
    if (!token) {
      return {
        enforced: true,
        success: false,
        code: 'HV_TOKEN_REQUIRED',
        message: 'Human verification is required. Please complete the challenge.'
      };
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    let challenge: any = null;
    let fromMemory = false;
    try {
      challenge = await (prisma as any).humanVerificationChallenge.findFirst({
        where: {
          verificationTokenHash: tokenHash,
          status: 'solved',
          verificationConsumedAt: null,
          verificationExpiresAt: { gt: new Date() }
        }
      });
    } catch (err) {
      console.warn('[human-verification] token lookup failed; checking memory', (err as any)?.message);
    }

    if (!challenge) {
      pruneMemoryChallenges();
      for (const row of memoryChallenges.values()) {
        if (
          row.status === 'solved' &&
          row.verificationTokenHash === tokenHash &&
          row.verificationExpiresAt &&
          new Date(row.verificationExpiresAt).getTime() > Date.now()
        ) {
          challenge = row;
          fromMemory = true;
          break;
        }
      }
    }

    if (!challenge) {
      return {
        enforced: true,
        success: false,
        code: 'HV_TOKEN_INVALID',
        message: 'Human verification token is invalid or expired.'
      };
    }

    if (challenge.endpoint !== params.endpoint && params.endpoint !== 'generic') {
      return {
        enforced: true,
        success: false,
        code: 'HV_TOKEN_ENDPOINT_MISMATCH',
        message: 'Human verification token does not match this action.'
      };
    }

    if (fromMemory) {
      challenge.status = 'consumed';
      putMemoryChallenge(challenge as MemoryChallenge);
      memoryChallenges.delete(String(challenge.challengeToken));
    } else {
      try {
        await (prisma as any).humanVerificationChallenge.update({
          where: { id: challenge.id },
          data: { verificationConsumedAt: new Date(), status: 'consumed' }
        });
      } catch {
        return {
          enforced: true,
          success: false,
          code: 'HV_TOKEN_CONSUME_FAILED',
          message: 'Unable to consume verification token.'
        };
      }
    }

    await writeAudit({
      action: 'verification_consumed',
      endpoint: params.endpoint,
      challengeId: challenge.id,
      ipAddress: params.ctx?.ipAddress
    });

    return { enforced: true, success: true };
  }

  static async getAnalytics(rangeDays = 30) {
    const days = Math.min(90, Math.max(1, rangeDays));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let challenges: any[] = [];
    let attempts: any[] = [];
    try {
      challenges = await (prisma as any).humanVerificationChallenge.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          endpoint: true,
          challengeType: true,
          difficulty: true,
          status: true,
          solveTimeMs: true,
          ipAddress: true,
          browser: true,
          country: true,
          createdAt: true,
          solvedAt: true
        },
        take: 5000
      });
      attempts = await (prisma as any).humanVerificationAttempt.findMany({
        where: { createdAt: { gte: since } },
        select: { success: true, createdAt: true, solveTimeMs: true },
        take: 10000
      });
    } catch (err) {
      return {
        rangeDays: days,
        totals: {
          generated: 0,
          solved: 0,
          failed: 0,
          expired: 0,
          blocked: 0,
          successRate: 0,
          failureRate: 0,
          averageSolveTimeMs: 0
        },
        series: [],
        topEndpoints: [],
        topBrowsers: [],
        topIps: [],
        topCountries: [],
        note: 'Analytics unavailable until Phase 30 migration is applied.'
      };
    }

    const generated = challenges.length;
    const solved = challenges.filter((c) => c.status === 'solved' || c.status === 'consumed').length;
    const failed = challenges.filter((c) => c.status === 'failed').length;
    const expired = challenges.filter((c) => c.status === 'expired').length;
    const blocked = attempts.filter((a) => !a.success).length;
    const solveTimes = challenges
      .map((c) => c.solveTimeMs)
      .filter((n: any) => typeof n === 'number' && n > 0) as number[];
    const averageSolveTimeMs = solveTimes.length
      ? Math.round(solveTimes.reduce((a, b) => a + b, 0) / solveTimes.length)
      : 0;

    const byDay = new Map<string, { generated: number; solved: number; failed: number }>();
    for (const c of challenges) {
      const key = new Date(c.createdAt).toISOString().slice(0, 10);
      const row = byDay.get(key) || { generated: 0, solved: 0, failed: 0 };
      row.generated += 1;
      if (c.status === 'solved' || c.status === 'consumed') row.solved += 1;
      if (c.status === 'failed') row.failed += 1;
      byDay.set(key, row);
    }

    const countMap = (items: string[]) => {
      const m = new Map<string, number>();
      for (const i of items) m.set(i, (m.get(i) || 0) + 1);
      return Array.from(m.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    };

    return {
      rangeDays: days,
      totals: {
        generated,
        solved,
        failed,
        expired,
        blocked,
        successRate: generated ? Number(((solved / generated) * 100).toFixed(1)) : 0,
        failureRate: generated ? Number((((failed + expired) / generated) * 100).toFixed(1)) : 0,
        averageSolveTimeMs
      },
      series: Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
      topEndpoints: countMap(challenges.map((c) => c.endpoint || 'unknown')),
      topBrowsers: countMap(challenges.map((c) => c.browser || 'unknown')),
      topIps: countMap(challenges.map((c) => c.ipAddress || 'unknown')),
      topCountries: countMap(challenges.map((c) => c.country || 'unknown')),
      byType: countMap(challenges.map((c) => c.challengeType || 'unknown')),
      byDifficulty: countMap(challenges.map((c) => c.difficulty || 'unknown'))
    };
  }

  static async listAuditLogs(limit = 50) {
    try {
      return await (prisma as any).humanVerificationAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, Math.max(1, limit))
      });
    } catch {
      return [];
    }
  }
}

export default HumanVerificationService;
