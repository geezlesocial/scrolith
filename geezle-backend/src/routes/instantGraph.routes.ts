import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { getOrchestratedMemberFeed } from '../services/feedOrchestrator.service';
import { NotificationService } from '../services/notificationCenter';
import prisma from '../utils/prismaClient';

const router = express.Router();

const EVENT_NAMES = new Set([
  'cache_hit',
  'cache_miss',
  'prefetch_success',
  'prefetch_error',
  'storage_bytes',
  'hydration_ms',
  'sw_registered'
]);

const metrics = new Map<string, number>();
const startedAt = Date.now();

const parseBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const configured = () => parseBoolean(process.env.SCROLITH_INSTANT_GRAPH_ENABLED, false);
const rolloutPercent = () => Math.max(0, Math.min(100, Number(process.env.SCROLITH_INSTANT_GRAPH_ROLLOUT_PERCENT || 0) || 0));

// Stable assignment keeps a user on one side of a canary boundary without
// persisting identifiers or rollout state in the client.
export const instantGraphAssignmentPercent = (userId: string) => {
  let hash = 2166136261;
  for (const character of String(userId || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
};

const isEnabledFor = (userId?: string | null) => {
  if (!configured() || rolloutPercent() <= 0) return false;
  return instantGraphAssignmentPercent(String(userId || '')) < rolloutPercent();
};

const setNoStore = (res: express.Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
};

const normalizeConversation = (conversation: any, viewerId: string) => ({
  id: String(conversation?.id || ''),
  type: String(conversation?.type || 'DIRECT'),
  title: conversation?.title || null,
  updatedAt: conversation?.updatedAt ? new Date(conversation.updatedAt).toISOString() : null,
  lastMessageAt: conversation?.lastMessageAt ? new Date(conversation.lastMessageAt).toISOString() : null,
  participants: (Array.isArray(conversation?.participants) ? conversation.participants : [])
    .filter((participant: any) => String(participant?.userId || '') !== viewerId)
    .slice(0, 3)
    .map((participant: any) => ({
      id: participant?.user?.id || participant?.userId || null,
      name: participant?.user?.name || null,
      username: participant?.user?.username || null,
      avatar: participant?.user?.avatar || null,
      profilePhotoFileId: participant?.user?.profilePhotoFileId || null
    }))
});

const loadConversationMetadata = async (userId: string) => {
  try {
    const rows = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId, deletedAt: null } }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 8,
      select: {
        id: true,
        type: true,
        title: true,
        updatedAt: true,
        lastMessageAt: true,
        participants: {
          where: { deletedAt: null },
          take: 3,
          select: {
            userId: true,
            user: { select: { id: true, name: true, username: true, avatar: true, profilePhotoFileId: true } }
          }
        }
      }
    });
    return rows.map((row) => normalizeConversation(row, userId));
  } catch (error) {
    // Metadata is an optimization; a schema/provider issue must not affect auth
    // or messaging itself.
    console.warn('[instant-graph] conversation metadata unavailable', error);
    return [];
  }
};

router.get('/config', authMiddleware, (req, res) => {
  setNoStore(res);
  return res.json({
    success: true,
    data: {
      enabled: isEnabledFor(req.user?.id),
      rolloutPercent: rolloutPercent(),
      version: 'phase1.0.0',
      feedTtlMs: 5 * 60 * 1000,
      mediaBudgetBytes: 60 * 1024 * 1024
    }
  });
});

router.get('/bootstrap', authMiddleware, async (req, res) => {
  setNoStore(res);
  const userId = String(req.user?.id || '').trim();
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!isEnabledFor(userId)) return res.status(404).json({ success: false, error: 'Instant Graph disabled' });

  const includeFeed = String(req.query.includeFeed || 'true').toLowerCase() !== 'false';
  const [notificationSummary, conversations, feed] = await Promise.all([
    NotificationService.getSummary(userId).catch(() => ({ unread: 0, total: 0, archived: 0 })),
    loadConversationMetadata(userId),
    includeFeed
      ? getOrchestratedMemberFeed({ viewerId: userId, surface: 'member_home', mode: 'for_you', limit: 12, cursor: null })
          .catch(() => null)
      : Promise.resolve(null)
  ]);

  return res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      notificationSummary,
      conversations,
      feed
    }
  });
});

router.post('/metrics', authMiddleware, (req, res) => {
  setNoStore(res);
  if (!isEnabledFor(req.user?.id)) return res.status(404).json({ success: false, error: 'Instant Graph disabled' });
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
  for (const event of events) {
    const name = String(event?.name || '');
    const value = Number(event?.value || 0);
    if (!EVENT_NAMES.has(name) || !Number.isFinite(value) || value < 0 || value > 1000000) continue;
    metrics.set(name, (metrics.get(name) || 0) + value);
  }
  return res.status(202).json({ success: true });
});

router.get('/admin/metrics', authMiddleware, adminMiddleware, (_req, res) => {
  setNoStore(res);
  return res.json({
    success: true,
    data: {
      version: 'phase1.0.0',
      enabled: configured(),
      rolloutPercent: rolloutPercent(),
      windowStartedAt: new Date(startedAt).toISOString(),
      counters: Object.fromEntries(metrics.entries())
    }
  });
});

export default router;
