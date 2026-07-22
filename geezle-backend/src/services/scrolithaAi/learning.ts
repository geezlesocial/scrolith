/**
 * Phase 33.2 — Learning signal ingestion (disclosed behavior only).
 * Updates preference weights without model retraining.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { loadAIFeatureFlags } from './config';
import { getAIConsent } from './consent';
import { applyLearningSignal } from './memory';
import type { LearningSignalType } from './types';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export async function recordLearningSignal(input: {
  userId: string;
  type: LearningSignalType | string;
  topic?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const flags = await loadAIFeatureFlags();
  if (!flags.learningSignalsEnabled) {
    return { ok: false, reason: 'SURFACE_FLAG_DISABLED:learningSignalsEnabled' };
  }
  const consent = await getAIConsent(input.userId);
  if (!consent.aiFeaturesEnabled || !consent.personalizationAllowed) {
    return { ok: false, reason: 'CONSENT_REQUIRED' };
  }

  try {
    await (prisma as any).aILearningSignal?.create?.({
      data: {
        id: randomUUID(),
        userId: input.userId,
        type: String(input.type).slice(0, 32),
        topic: input.topic ? String(input.topic).slice(0, 64) : null,
        entityId: input.entityId ? String(input.entityId).slice(0, 64) : null,
        entityType: input.entityType ? String(input.entityType).slice(0, 32) : null,
        metadata: input.metadata || null
      }
    });
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }

  await applyLearningSignal(input.userId, {
    type: String(input.type),
    topic: input.topic,
    entityId: input.entityId,
    entityType: input.entityType
  });

  return { ok: true };
}

export default { recordLearningSignal };
