/**
 * Phase 29.5 — Search, discovery, health, analytics endpoints (user + shared).
 */
import { Request, Response } from 'express';
import {
  searchMessagingGroupsEnterprise,
  pushRecentSearch,
  listRecentSearches,
  saveSearch,
  listSavedSearches
} from '../services/messaging/groupSearch.service';
import { discoverPublicMessagingGroups } from '../services/messaging/groupDiscovery.service';
import {
  computeGroupHealthScore,
  buildPlatformGroupAnalytics
} from '../services/messaging/groupAnalytics.service';
import { assertGroupMemberAccess } from '../services/messaging/groupSecurity.service';
import { groupAdminMetrics } from '../services/messaging/groupAdminMetrics';

const resolveUserId = (req: Request) => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length ? id : '';
};

const isPlatformAdmin = (req: Request) =>
  Boolean(
    String(req.user?.role || '')
      .toLowerCase()
      .match(/admin|superadmin|super_admin|platform/)
  );

/** GET /messages/groups/search?q=&category=&conversationId=&cursor= */
export const searchGroupsEnterprise = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const q = String(req.query.q || req.query.query || '').trim();
    const result = await searchMessagingGroupsEnterprise({
      userId,
      q,
      category: String(req.query.category || 'all') as any,
      conversationId: String(req.query.conversationId || '').trim() || undefined,
      visibility: String(req.query.visibility || '').trim() || undefined,
      senderId: String(req.query.senderId || '').trim() || undefined,
      dateFrom: String(req.query.dateFrom || '').trim() || undefined,
      dateTo: String(req.query.dateTo || '').trim() || undefined,
      cursor: String(req.query.cursor || '') || null,
      limit: Number(req.query.limit || 20),
      isAdmin: isPlatformAdmin(req)
    });
    if (q) pushRecentSearch(userId, q, String(req.query.category || 'all'));
    return res.json({
      success: true,
      data: {
        hits: result.hits,
        nextCursor: result.nextCursor,
        categories: result.categories,
        tookMs: result.tookMs,
        recent: listRecentSearches(userId),
        saved: listSavedSearches(userId)
      }
    });
  } catch (e: any) {
    console.error('searchGroupsEnterprise', e);
    return res.status(500).json({ success: false, error: e?.message || 'Search failed' });
  }
};

/** POST /messages/groups/search/saved { q, category?, name? } */
export const saveGroupSearch = async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const q = String(req.body?.q || '').trim();
  if (!q) return res.status(400).json({ success: false, error: 'q required' });
  const id = saveSearch(userId, q, req.body?.category, req.body?.name);
  return res.json({ success: true, data: { id, saved: listSavedSearches(userId) } });
};

/** GET /messages/groups/discover?mode=&language=&category= */
export const discoverGroups = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const data = await discoverPublicMessagingGroups({
      mode: String(req.query.mode || 'active') as any,
      language: String(req.query.language || '').trim() || undefined,
      category: String(req.query.category || '').trim() || undefined,
      limit: Number(req.query.limit || 20),
      userId: userId || undefined
    });
    return res.json({ success: true, data });
  } catch (e: any) {
    console.error('discoverGroups', e);
    return res.status(500).json({ success: false, error: e?.message || 'Discovery failed' });
  }
};

/** GET /messages/groups/:id/health */
export const getGroupHealth = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const access = await assertGroupMemberAccess(conversationId, userId, {
      allowAdmin: true,
      isAdmin: isPlatformAdmin(req)
    });
    if (!access.allowed) {
      // SECRET isolation: no metadata
      return res.status(403).json({ success: false, error: 'Not a member', code: 'GROUP_NOT_MEMBER' });
    }
    const health = await computeGroupHealthScore(conversationId);
    return res.json({ success: true, data: health });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Health failed' });
  }
};

/** Admin: GET /admin/messaging-groups/search */
export const adminSearchMessagingGroups = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.views();
    const userId = resolveUserId(req);
    const result = await searchMessagingGroupsEnterprise({
      userId: userId || 'admin',
      q: String(req.query.q || '').trim(),
      category: String(req.query.category || 'all') as any,
      conversationId: String(req.query.conversationId || '').trim() || undefined,
      cursor: String(req.query.cursor || '') || null,
      limit: Number(req.query.limit || 30),
      isAdmin: true
    });
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Admin search failed' });
  }
};

/** Admin: GET /admin/messaging-groups/analytics?days=14 */
export const adminMessagingGroupsAnalytics = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.views();
    const days = Number(req.query.days || 14);
    const data = await buildPlatformGroupAnalytics(days);
    // optional top health samples
    const sample = await (await import('../utils/prismaClient')).default.conversation.findMany({
      where: { type: 'GROUP' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true }
    });
    const health = await Promise.all(sample.map((g) => computeGroupHealthScore(g.id)));
    return res.json({
      success: true,
      data: {
        ...data,
        sampleHealth: health.map((h, i) => ({
          ...h,
          title: sample[i]?.title || null
        }))
      }
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Analytics failed' });
  }
};

/** Admin: GET /admin/messaging-groups/:id/health */
export const adminGroupHealth = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const health = await computeGroupHealthScore(id);
    return res.json({ success: true, data: health });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Health failed' });
  }
};
