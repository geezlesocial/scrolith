/**
 * Phase 22.3 — presence heartbeat, batch lookup, privacy.
 */
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  filterPresenceForViewer,
  presenceStore,
  type PresenceVisibility
} from '../services/messaging/presenceStore';

const resolveUserId = (req: Request) => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length ? id : '';
};

const normalizeVisibility = (value: unknown): PresenceVisibility => {
  const v = String(value || 'EVERYONE').trim().toUpperCase();
  if (v === 'CONTACTS' || v === 'NOBODY' || v === 'EVERYONE') return v;
  return 'EVERYONE';
};

/** POST /presence/heartbeat  body: { state?: 'online'|'away' } */
export const postPresenceHeartbeat = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const now = new Date();
    const record = presenceStore.touchHeartbeat(userId, now);
    // Best-effort durable lastSeen + online (throttled by client ~30s)
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isOnline: true,
          lastSeenAt: now
        }
      });
    } catch {
      /* ignore */
    }
    // Load visibility from DB once
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { presenceVisibility: true } as any
      });
      if ((user as any)?.presenceVisibility) {
        presenceStore.set(userId, {
          userId,
          visibility: normalizeVisibility((user as any).presenceVisibility)
        });
      }
    } catch {
      /* column may not exist yet */
    }
    return res.json({
      success: true,
      data: {
        userId,
        state: record.state,
        isOnline: record.isOnline,
        lastSeenAt: record.lastSeenAt,
        lastHeartbeatAt: record.lastHeartbeatAt,
        version: '22.3'
      }
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Heartbeat failed' });
  }
};

/** GET /presence?ids=a,b,c */
export const getPresenceBatch = async (req: Request, res: Response) => {
  try {
    const viewerId = resolveUserId(req);
    if (!viewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const raw = String(req.query.ids || req.query.userIds || '');
    const ids = Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 50)
      )
    );
    if (!ids.length) return res.json({ success: true, data: [] });

    // Hydrate from DB for users not in memory store
    const missing = ids.filter((id) => !presenceStore.get(id));
    if (missing.length) {
      try {
        const rows = await prisma.user.findMany({
          where: { id: { in: missing } },
          select: {
            id: true,
            isOnline: true,
            lastSeenAt: true,
            presenceVisibility: true
          } as any
        });
        rows.forEach((row: any) => {
          presenceStore.set(row.id, {
            userId: row.id,
            isOnline: Boolean(row.isOnline),
            state: row.isOnline ? 'online' : 'offline',
            lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
            lastHeartbeatAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
            visibility: normalizeVisibility(row.presenceVisibility),
            connectionCount: row.isOnline ? 1 : 0
          });
        });
      } catch {
        /* presenceVisibility column may be missing pre-migration */
        try {
          const rows = await prisma.user.findMany({
            where: { id: { in: missing } },
            select: { id: true, isOnline: true, lastSeenAt: true }
          });
          rows.forEach((row) => {
            presenceStore.set(row.id, {
              userId: row.id,
              isOnline: Boolean(row.isOnline),
              state: row.isOnline ? 'online' : 'offline',
              lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
              lastHeartbeatAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
              visibility: 'EVERYONE',
              connectionCount: row.isOnline ? 1 : 0
            });
          });
        } catch {
          /* ignore */
        }
      }
    }

    const data = ids
      .map((id) => filterPresenceForViewer(presenceStore.get(id), viewerId, true))
      .filter(Boolean);
    return res.json({ success: true, data });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to load presence' });
  }
};

/** PATCH /presence/privacy  body: { visibility: EVERYONE|CONTACTS|NOBODY } */
export const patchPresencePrivacy = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const visibility = normalizeVisibility(req.body?.visibility ?? req.body?.presenceVisibility);
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { presenceVisibility: visibility } as any
      });
    } catch (e: any) {
      return res.status(500).json({
        success: false,
        error: e?.message || 'Failed to update privacy (migration may be pending)'
      });
    }
    presenceStore.set(userId, { userId, visibility });
    return res.json({ success: true, data: { visibility } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update privacy' });
  }
};
