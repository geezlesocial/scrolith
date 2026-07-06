import type { Request } from 'express';
import prisma from '../../utils/prismaClient';
import type { ScrolithaActor } from './scrolitha.types';

export const resolveActorFromRequest = (req: Request): ScrolithaActor => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const isAdmin = role.includes('admin');
  return {
    id: String(req.user?.id || ''),
    role: role || 'user',
    scope: isAdmin ? 'admin' : 'user',
    isAdmin,
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')?.[0]?.trim() || req.ip || null,
    userAgent: req.headers['user-agent']?.toString() || null
  };
};

export const writeScrolithaAuditLog = async (input: {
  actor: ScrolithaActor;
  conversationId?: string | null;
  actionPlanId?: string | null;
  eventType: string;
  intent?: string | null;
  toolKey?: string | null;
  requestPayload?: any;
  redactedPayload?: any;
  resultStatus?: string;
  resultSummary?: string | null;
  confirmationStatus?: string | null;
}) => {
  if (!input.actor?.id) return null;
  try {
    return await prisma.scrolithaAuditLog.create({
      data: {
        actorId: input.actor.id,
        actorRole: input.actor.role || 'user',
        actorScope: input.actor.scope,
        conversationId: input.conversationId || null,
        actionPlanId: input.actionPlanId || null,
        eventType: input.eventType,
        intent: input.intent || null,
        toolKey: input.toolKey || null,
        requestPayload: input.requestPayload ?? null,
        redactedPayload: input.redactedPayload ?? null,
        resultStatus: input.resultStatus || 'ok',
        resultSummary: input.resultSummary || null,
        confirmationStatus: input.confirmationStatus || null,
        ipAddress: input.actor.ipAddress || null,
        userAgent: input.actor.userAgent || null
      }
    });
  } catch (error) {
    console.warn('[scrolitha:audit] audit log write skipped', {
      eventType: input.eventType,
      actorId: input.actor.id,
      error: String((error as any)?.message || error || '').slice(0, 220)
    });
    return null;
  }
};

export const listScrolithaAuditLogs = async (params: {
  scope?: string;
  actorId?: string;
  cursor?: string;
  limit?: number;
}) => {
  const limit = Math.max(1, Math.min(200, Math.floor(Number(params.limit || 50))));
  const where: Record<string, any> = {};
  if (params.scope) where.actorScope = String(params.scope || '').trim().toLowerCase();
  if (params.actorId) where.actorId = String(params.actorId || '').trim();

  const rows = await prisma.scrolithaAuditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(params.cursor
      ? {
          cursor: { id: params.cursor },
          skip: 1
        }
      : {}),
    take: limit
  });

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  return { items: rows, nextCursor };
};
