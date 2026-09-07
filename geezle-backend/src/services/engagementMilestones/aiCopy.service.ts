import { randomUUID } from 'crypto';
import { ScrolithaAI } from '../scrolithaAi';
import { logAIEvent } from '../scrolithaAi/observability';
import { bumpNotificationMetric, writeNotificationAudit } from '../notificationCenter/analytics';
import type { EngagementNotificationCopy } from '../scrolithaAi/structured';

const CACHE_TTL_MS = 30 * 60_000;
const MAX_CACHE_ENTRIES = 256;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 280;

type CopyInput = {
  ruleId: string;
  eventType: string;
  entityType: string;
  threshold: number;
  locale?: string | null;
};

type CachedCopy = EngagementNotificationCopy & {
  expiresAt: number;
  promptVersion: string;
  model: string;
};

const cache = new Map<string, CachedCopy>();
const inFlight = new Map<string, Promise<EngagementNotificationCopy | null>>();

const normalizeLocale = (value: unknown) => {
  const raw = String(value || 'en').trim().replace('_', '-');
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(raw) ? raw : 'en';
};

const normalizeToken = (value: unknown, max: number) =>
  String(value || '')
    .replace(/[<>`]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const containsSensitiveOutput = (value: string) =>
  /https?:\/\/|bearer\s+|(?:sk|pk)-[a-z0-9_-]{12,}|AIza[a-z0-9_-]{20,}|eyJ[a-z0-9_-]{20,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value);

const validateAndSanitize = (value: unknown): EngagementNotificationCopy | null => {
  const source = value && typeof value === 'object' ? (value as Partial<EngagementNotificationCopy>) : {};
  const title = normalizeToken(source.title, MAX_TITLE_LENGTH);
  const body = normalizeToken(source.body, MAX_BODY_LENGTH);
  if (!title || title.length < 4 || !body || body.length < 12) return null;
  if (!/\{\{\s*count\s*\}\}/i.test(body)) return null;
  if (containsSensitiveOutput(`${title} ${body}`)) return null;
  return { title, body };
};

const cacheKey = (input: CopyInput) =>
  [input.ruleId, input.eventType, normalizeLocale(input.locale)].join(':');

const deleteExpired = () => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.expiresAt <= now) cache.delete(key);
  }
};

const setCached = (key: string, copy: EngagementNotificationCopy, result: any) => {
  deleteExpired();
  while (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, {
    ...copy,
    expiresAt: Date.now() + CACHE_TTL_MS,
    promptVersion: String(result?.disclosure?.promptVersion || 'engagement.notification_copy@1'),
    model: String(result?.disclosure?.model || result?.route?.model || 'ollama')
  });
};

export const getCachedEngagementNotificationCopy = (input: CopyInput) => {
  const key = cacheKey(input);
  const value = cache.get(key);
  if (!value || value.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  void bumpNotificationMetric('engagement_ai_copy_cache_hit', 'engagement', 1);
  return { title: value.title, body: value.body };
};

export const recordEngagementCopyFallback = (reason = 'cache_miss') => {
  void bumpNotificationMetric('engagement_ai_copy_fallback', 'engagement', 1);
  logAIEvent('info', 'engagement_copy_fallback', { reason });
};

/**
 * Warm a generic, non-user-specific template in the background. The caller
 * must not await this from the notification delivery path.
 */
export const warmEngagementNotificationCopy = async (input: CopyInput) => {
  const key = cacheKey(input);
  if (getCachedEngagementNotificationCopy(input)) return { usedAI: true, cacheHit: true };
  const existing = inFlight.get(key);
  if (existing) return existing.then((copy) => ({ usedAI: Boolean(copy), cacheHit: false }));

  const locale = normalizeLocale(input.locale);
  const promise = (async () => {
    const started = Date.now();
    try {
      const result = await ScrolithaAI.execute<EngagementNotificationCopy>({
        capability: 'ENGAGEMENT_NOTIFICATION_COPY',
        userId: null,
        input: {
          eventType: input.eventType,
          entityType: input.entityType,
          threshold: input.threshold,
          locale
        },
        context: {
          eventType: input.eventType,
          entityType: input.entityType,
          threshold: input.threshold,
          locale
        },
        structured: true,
        locale,
        policy: {
          privacyLevel: 'PUBLIC',
          preferInternalProvider: true,
          requireOllama: true,
          allowCache: true,
          maxTokens: 160,
          timeoutMs: 3_500
        },
        correlationId: randomUUID(),
        metadata: { source: 'engagement_milestone_copy' }
      });
      const copy = result.ok ? validateAndSanitize(result.data) : null;
      if (!copy) {
        const reason = String(result.reason || 'invalid_ai_copy').slice(0, 80);
        void bumpNotificationMetric('engagement_ai_copy_failure', 'engagement', 1);
        logAIEvent('warn', 'engagement_copy_failed', { reason, latencyMs: Date.now() - started });
        await writeNotificationAudit({
          action: 'engagement_ai_copy_fallback',
          details: { eventType: input.eventType, locale, reason }
        });
        return null;
      }
      setCached(key, copy, result);
      void bumpNotificationMetric('engagement_ai_copy_success', 'engagement', 1);
      logAIEvent('info', 'engagement_copy_generated', {
        eventType: input.eventType,
        locale,
        cacheKey: key,
        latencyMs: Date.now() - started,
        provider: result.disclosure?.provider || 'OLLAMA'
      });
      await writeNotificationAudit({
        action: 'engagement_ai_copy_generated',
        details: {
          eventType: input.eventType,
          locale,
          promptVersion: result.disclosure?.promptVersion || 'engagement.notification_copy@1',
          provider: result.disclosure?.provider || 'OLLAMA',
          latencyMs: Date.now() - started
        }
      });
      return copy;
    } catch (error: any) {
      const reason = String(error?.message || 'ai_copy_failed').slice(0, 80);
      void bumpNotificationMetric('engagement_ai_copy_failure', 'engagement', 1);
      logAIEvent('warn', 'engagement_copy_failed', { reason, latencyMs: Date.now() - started });
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise.then((copy) => ({ usedAI: Boolean(copy), cacheHit: false }));
};

export const engagementNotificationCopyCacheStats = () => ({
  size: cache.size,
  inFlight: inFlight.size,
  ttlMs: CACHE_TTL_MS
});
