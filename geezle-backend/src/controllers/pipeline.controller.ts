import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { recordFeedIntentSignal } from '../services/opportunityGraph.service';

const ok = (res: Response, data: any) => res.json({ success: true, data });
const fail = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error });

const normalizeEntityType = (value: unknown) => String(value || '').trim().toUpperCase();
const normalizeEntityId = (value: unknown) => String(value || '').trim();

export const listSavedPipelineItems = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50) || 50));
    const entityType = normalizeEntityType(req.query.entityType);

    const items = await prisma.savedPipelineItem.findMany({
      where: {
        userId,
        ...(entityType ? { entityType } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return ok(res, { items });
  } catch (error: any) {
    console.error('[pipeline.listSavedPipelineItems] error:', error);
    return fail(res, 500, error?.message || 'Failed to load pipeline items');
  }
};

export const savePipelineItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const entityType = normalizeEntityType(req.body?.entityType);
    const entityId = normalizeEntityId(req.body?.entityId);
    const sourceSurface = String(req.body?.sourceSurface || 'member_home').trim() || 'member_home';
    const note = String(req.body?.note || '').trim() || undefined;
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : undefined;

    if (!entityType || !entityId) {
      return fail(res, 400, 'entityType and entityId are required');
    }

    const item = await prisma.savedPipelineItem.upsert({
      where: {
        userId_entityType_entityId: {
          userId,
          entityType,
          entityId
        }
      },
      update: {
        sourceSurface,
        note,
        meta
      },
      create: {
        userId,
        entityType,
        entityId,
        sourceSurface,
        note,
        meta
      }
    });

    await recordFeedIntentSignal({
      userId,
      entityType,
      entityId,
      signal: 'SAVE',
      surface: sourceSurface,
      meta
    }).catch(() => null);

    return ok(res, { saved: true, item });
  } catch (error: any) {
    console.error('[pipeline.savePipelineItem] error:', error);
    return fail(res, 500, error?.message || 'Failed to save pipeline item');
  }
};

export const removePipelineItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const entityType = normalizeEntityType(req.params.entityType);
    const entityId = normalizeEntityId(req.params.entityId);
    if (!entityType || !entityId) return fail(res, 400, 'entityType and entityId are required');

    await prisma.savedPipelineItem.deleteMany({
      where: { userId, entityType, entityId }
    });

    return ok(res, { saved: false, entityType, entityId });
  } catch (error: any) {
    console.error('[pipeline.removePipelineItem] error:', error);
    return fail(res, 500, error?.message || 'Failed to remove pipeline item');
  }
};
