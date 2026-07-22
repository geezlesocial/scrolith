/**
 * Phase 33.0 — AI audit log (hashes / metadata, not full sensitive prompts).
 */
import { createHash } from 'crypto';
import prisma from '../../utils/prismaClient';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

const memory: Array<Record<string, unknown>> = [];
const MAX_MEMORY = 200;

export function hashContent(text: string): string {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

export async function writeAIAudit(input: {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  capability?: string | null;
  provider?: string | null;
  model?: string | null;
  privacyLevel?: string | null;
  lifecycle?: string | null;
  reason?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  inputHash?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const row = {
    action: input.action,
    actorUserId: input.actorUserId || null,
    targetUserId: input.targetUserId || null,
    capability: input.capability || null,
    provider: input.provider || null,
    model: input.model || null,
    privacyLevel: input.privacyLevel || null,
    lifecycle: input.lifecycle || null,
    reason: input.reason || null,
    correlationId: input.correlationId || null,
    requestId: input.requestId || null,
    inputHash: input.inputHash || null,
    metadata: input.metadata || null,
    createdAt: new Date().toISOString()
  };
  memory.unshift(row);
  if (memory.length > MAX_MEMORY) memory.pop();

  try {
    await (prisma as any).aIAuditLog?.create?.({
      data: {
        action: row.action,
        actorUserId: row.actorUserId,
        targetUserId: row.targetUserId,
        capability: row.capability,
        provider: row.provider,
        model: row.model,
        privacyLevel: row.privacyLevel,
        lifecycle: row.lifecycle,
        reason: row.reason,
        correlationId: row.correlationId,
        requestId: row.requestId,
        inputHash: row.inputHash,
        metadata: row.metadata
      }
    });
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }
}

export async function listAIAudit(limit = 50) {
  try {
    const rows = await (prisma as any).aIAuditLog?.findMany?.({
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit))
    });
    if (rows?.length) return rows;
  } catch {
    /* memory */
  }
  return memory.slice(0, limit);
}

export async function persistRequestRecord(input: {
  id: string;
  userId?: string | null;
  capability: string;
  lifecycle: string;
  privacyLevel: string;
  provider?: string | null;
  model?: string | null;
  inputHash?: string | null;
  correlationId?: string | null;
  reason?: string | null;
  latencyMs?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await (prisma as any).aIRequest?.create?.({
      data: {
        id: input.id,
        userId: input.userId || null,
        capability: input.capability,
        lifecycle: input.lifecycle,
        privacyLevel: input.privacyLevel,
        provider: input.provider || null,
        model: input.model || null,
        inputHash: input.inputHash || null,
        correlationId: input.correlationId || null,
        reason: input.reason || null,
        latencyMs: input.latencyMs || null,
        metadata: input.metadata || null
      }
    });
  } catch {
    /* soft */
  }
}

export async function listUserHistory(userId: string, limit = 50) {
  try {
    const rows = await (prisma as any).aIRequest?.findMany?.({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      select: {
        id: true,
        capability: true,
        lifecycle: true,
        privacyLevel: true,
        provider: true,
        model: true,
        reason: true,
        latencyMs: true,
        createdAt: true,
        correlationId: true
      }
    });
    return rows || [];
  } catch {
    return [];
  }
}

export async function deleteUserHistory(userId: string) {
  try {
    const result = await (prisma as any).aIRequest?.deleteMany?.({ where: { userId } });
    return { deleted: result?.count || 0 };
  } catch {
    return { deleted: 0 };
  }
}

export default { writeAIAudit, listAIAudit, hashContent, persistRequestRecord, listUserHistory, deleteUserHistory };
