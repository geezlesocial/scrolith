import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveDirectMediaUrl, resolveFileBaseUrl } from '../utils/mediaUrl';

const BROADCAST_PURPOSE = 'broadcast';
const MAX_DISCOVER_LIMIT = 12;
const MAX_MESSAGE_PREVIEW_LENGTH = 240;

const getBaseFileUrl = (req?: Request) => resolveFileBaseUrl(req);

const buildFileContentUrl = (fileId: string, req?: Request) =>
  `${getBaseFileUrl(req)}/api/files/content/${encodeURIComponent(fileId)}`;

const parseLimit = (value: unknown, fallback = 4, max = MAX_DISCOVER_LIMIT) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
};

const cleanText = (value: unknown, max = 400) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
};

const isAdminRequest = (req: Request) => String((req as any)?.user?.role || '').toLowerCase().includes('admin');

const buildUserHref = (owner: { id?: string | null; username?: string | null } | null | undefined) => {
  const username = String(owner?.username || '').trim().replace(/^@+/, '');
  if (username) return `/u/${encodeURIComponent(username)}`;
  const id = String(owner?.id || '').trim();
  if (id) return `/profile/${encodeURIComponent(id)}`;
  return '/community';
};

const buildPageHref = (page: { slug?: string | null; handle?: string | null } | null | undefined) => {
  const slug = String(page?.slug || page?.handle || '').trim().replace(/^@+/, '');
  if (!slug) return '/community';
  return `/community?page=${encodeURIComponent(slug)}`;
};

const resolveSourceAvatar = (
  req: Request,
  row: {
    owner?: { avatar?: string | null } | null;
    businessPage?: { logoFileId?: string | null } | null;
  }
) => {
  const logoFileId = String(row.businessPage?.logoFileId || '').trim();
  if (logoFileId) return buildFileContentUrl(logoFileId, req);
  return resolveDirectMediaUrl(row.owner?.avatar, getBaseFileUrl(req)) || row.owner?.avatar || null;
};

const normalizeMessagePreview = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_PREVIEW_LENGTH);

const serializeBroadcastChannel = (req: Request, row: any, viewerId?: string | null) => {
  const owner = row?.owner || null;
  const businessPage = row?.businessPage || null;
  const latestMessage = Array.isArray(row?.messages) ? row.messages[0] || null : row?.latestMessage || null;
  const isFollowing = Boolean(
    viewerId &&
      Array.isArray(row?.memberships) &&
      row.memberships.some((membership: any) => String(membership?.userId || '') === String(viewerId))
  );
  const canManage =
    Boolean(viewerId) &&
    (String(row?.ownerId || '') === String(viewerId) ||
      (businessPage &&
        (String(businessPage?.ownerId || '') === String(viewerId) ||
          (Array.isArray(businessPage?.admins) &&
            businessPage.admins.some((admin: any) => String(admin?.userId || '') === String(viewerId))))));

  const sourceName =
    String(businessPage?.name || owner?.name || owner?.username || row?.name || 'Scrolith channel').trim();
  const sourceHref = businessPage ? buildPageHref(businessPage) : buildUserHref(owner);
  const sourceAvatar = resolveSourceAvatar(req, row);
  const latestContent =
    normalizeMessagePreview(latestMessage?.content) || cleanText(row?.description, MAX_MESSAGE_PREVIEW_LENGTH) || '';
  const latestCreatedAt =
    latestMessage?.createdAt instanceof Date
      ? latestMessage.createdAt.toISOString()
      : latestMessage?.createdAt
        ? String(latestMessage.createdAt)
        : row?.lastActivity instanceof Date
          ? row.lastActivity.toISOString()
          : row?.lastActivity
            ? String(row.lastActivity)
            : row?.updatedAt instanceof Date
              ? row.updatedAt.toISOString()
              : String(row?.updatedAt || '');

  return {
    id: String(row?.id || ''),
    name: String(row?.name || '').trim() || sourceName,
    description: String(row?.description || '').trim(),
    purpose: BROADCAST_PURPOSE,
    isPublic: row?.isPublic !== false,
    is_public: row?.isPublic !== false,
    type: String(row?.type || 'PUBLIC').toLowerCase(),
    memberCount: Math.max(0, Number(row?.memberCount || 0)),
    member_count: Math.max(0, Number(row?.memberCount || 0)),
    updateCount: Math.max(0, Number(row?._count?.messages || 0)),
    update_count: Math.max(0, Number(row?._count?.messages || 0)),
    canManage,
    can_manage: canManage,
    isFollowing,
    is_following: isFollowing,
    sourceType: businessPage ? 'page' : 'creator',
    source_type: businessPage ? 'page' : 'creator',
    source: {
      id: String(businessPage?.id || owner?.id || row?.ownerId || ''),
      name: sourceName,
      username: owner?.username || null,
      slug: businessPage?.slug || null,
      avatar: sourceAvatar,
      href: sourceHref,
      isVerified: Boolean(owner?.isVerified)
    },
    latestUpdate: latestContent
      ? {
          id: String(latestMessage?.id || ''),
          content: latestContent,
          createdAt: latestCreatedAt,
          created_at: latestCreatedAt,
          author: {
            id: String(latestMessage?.user?.id || owner?.id || row?.ownerId || ''),
            name: String(latestMessage?.user?.name || latestMessage?.user?.username || sourceName).trim(),
            avatar:
              resolveDirectMediaUrl(latestMessage?.user?.avatar, getBaseFileUrl(req)) || latestMessage?.user?.avatar || sourceAvatar
          }
        }
      : null,
    createdAt: row?.createdAt instanceof Date ? row.createdAt.toISOString() : String(row?.createdAt || ''),
    created_at: row?.createdAt instanceof Date ? row.createdAt.toISOString() : String(row?.createdAt || ''),
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row?.updatedAt || ''),
    updated_at: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row?.updatedAt || ''),
    lastActivity:
      row?.lastActivity instanceof Date ? row.lastActivity.toISOString() : row?.lastActivity ? String(row.lastActivity) : null,
    last_activity:
      row?.lastActivity instanceof Date ? row.lastActivity.toISOString() : row?.lastActivity ? String(row.lastActivity) : null
  };
};

const getBroadcastChannel = async (channelId: string, viewerId?: string | null) => {
  const prismaAny = prisma as any;
  return prismaAny.communityChannel.findUnique({
    where: { id: channelId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          isVerified: true
        }
      },
      businessPage: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoFileId: true,
          ownerId: true,
          admins: viewerId
            ? {
                where: { userId: String(viewerId) },
                select: { id: true, userId: true }
              }
            : false
        }
      },
      memberships: viewerId
        ? {
            where: { userId: String(viewerId) },
            select: { id: true, userId: true }
          }
        : false,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true
            }
          }
        }
      },
      _count: {
        select: {
          messages: true
        }
      }
    }
  });
};

const resolveManagedBusinessPage = async (pageId: string, userId: string, allowAdmin: boolean) => {
  const page = await prisma.communityBusinessPage.findUnique({
    where: { id: pageId },
    include: {
      admins: {
        where: { userId },
        select: { id: true, userId: true }
      }
    }
  });
  if (!page) {
    throw new Error('Business page not found.');
  }
  const canManage = allowAdmin || String(page.ownerId || '') === String(userId) || page.admins.length > 0;
  if (!canManage) {
    throw new Error('You are not allowed to manage that business page.');
  }
  return page;
};

export const getBroadcastChannelDiscover = async (req: Request, res: Response) => {
  try {
    const viewerId = String((req as any)?.user?.id || '').trim() || null;
    const limit = parseLimit(req.query.limit, 4);
    const prismaAny = prisma as any;
    const rows = await prismaAny.communityChannel.findMany({
      where: {
        purpose: BROADCAST_PURPOSE,
        isPublic: true,
        messages: { some: {} },
        OR: [{ businessPageId: null }, { businessPage: { status: 'active' } }]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            isVerified: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoFileId: true,
            ownerId: true,
            admins: viewerId
              ? {
                  where: { userId: viewerId },
                  select: { id: true, userId: true }
                }
              : false
          }
        },
        memberships: viewerId
          ? {
              where: { userId: viewerId },
              select: { id: true, userId: true }
            }
          : false,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true
              }
            }
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: [{ lastActivity: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    return res.json({
      success: true,
      data: rows.map((row: any) => serializeBroadcastChannel(req, row, viewerId))
    });
  } catch (error: any) {
    console.error('getBroadcastChannelDiscover error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load broadcast channels.' });
  }
};

export const getMyBroadcastChannels = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const prismaAny = prisma as any;
    const rows = await prismaAny.communityChannel.findMany({
      where: {
        purpose: BROADCAST_PURPOSE,
        OR: [{ ownerId: userId }, { businessPage: { ownerId: userId } }, { businessPage: { admins: { some: { userId } } } }]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            isVerified: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoFileId: true,
            ownerId: true,
            admins: {
              where: { userId },
              select: { id: true, userId: true }
            }
          }
        },
        memberships: {
          where: { userId },
          select: { id: true, userId: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true
              }
            }
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });
    return res.json({
      success: true,
      data: rows.map((row: any) => serializeBroadcastChannel(req, row, userId))
    });
  } catch (error: any) {
    console.error('getMyBroadcastChannels error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load your broadcast channels.' });
  }
};

export const createBroadcastChannel = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const name = cleanText(req.body?.name, 120);
    const description = cleanText(req.body?.description, 1000);
    const businessPageId = String(req.body?.businessPageId || '').trim() || null;
    const isPublic = req.body?.isPublic !== false;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Channel name is required.' });
    }

    if (businessPageId) {
      await resolveManagedBusinessPage(businessPageId, userId, isAdminRequest(req));
    }

    const prismaAny = prisma as any;
    const created = await prismaAny.communityChannel.create({
      data: {
        name,
        description,
        ownerId: userId,
        businessPageId,
        isPublic,
        purpose: BROADCAST_PURPOSE,
        type: isPublic ? 'PUBLIC' : 'PRIVATE',
        lastActivity: new Date()
      }
    });

    const row = await getBroadcastChannel(String(created.id), userId);
    return res.status(201).json({ success: true, data: serializeBroadcastChannel(req, row, userId) });
  } catch (error: any) {
    console.error('createBroadcastChannel error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create broadcast channel.' });
  }
};

export const updateBroadcastChannel = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const channelId = String(req.params.id || '').trim();
    if (!channelId) return res.status(400).json({ success: false, error: 'Channel id is required.' });

    const existing = await getBroadcastChannel(channelId, userId);
    if (!existing || String(existing?.purpose || '') !== BROADCAST_PURPOSE) {
      return res.status(404).json({ success: false, error: 'Broadcast channel not found.' });
    }

    const canManage =
      String(existing.ownerId || '') === userId ||
      isAdminRequest(req) ||
      (existing.businessPage &&
        (String(existing.businessPage.ownerId || '') === userId ||
          (Array.isArray(existing.businessPage.admins) &&
            existing.businessPage.admins.some((admin: any) => String(admin?.userId || '') === userId))));
    if (!canManage) {
      return res.status(403).json({ success: false, error: 'You are not allowed to update this channel.' });
    }

    const nextBusinessPageId = req.body?.businessPageId !== undefined ? String(req.body?.businessPageId || '').trim() || null : undefined;
    if (nextBusinessPageId) {
      await resolveManagedBusinessPage(nextBusinessPageId, userId, isAdminRequest(req));
    }

    const prismaAny = prisma as any;
    await prismaAny.communityChannel.update({
      where: { id: channelId },
      data: {
        ...(req.body?.name !== undefined ? { name: cleanText(req.body?.name, 120) || existing.name } : {}),
        ...(req.body?.description !== undefined ? { description: cleanText(req.body?.description, 1000) } : {}),
        ...(req.body?.isPublic !== undefined
          ? {
              isPublic: req.body?.isPublic !== false,
              type: req.body?.isPublic === false ? 'PRIVATE' : 'PUBLIC'
            }
          : {}),
        ...(req.body?.businessPageId !== undefined ? { businessPageId: nextBusinessPageId } : {})
      }
    });

    const row = await getBroadcastChannel(channelId, userId);
    return res.json({ success: true, data: serializeBroadcastChannel(req, row, userId) });
  } catch (error: any) {
    console.error('updateBroadcastChannel error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update broadcast channel.' });
  }
};

export const followBroadcastChannel = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const channelId = String(req.params.id || '').trim();
    if (!channelId) return res.status(400).json({ success: false, error: 'Channel id is required.' });

    const existing = await getBroadcastChannel(channelId, userId);
    if (!existing || String(existing?.purpose || '') !== BROADCAST_PURPOSE) {
      return res.status(404).json({ success: false, error: 'Broadcast channel not found.' });
    }
    if (existing.isPublic !== true) {
      return res.status(403).json({ success: false, error: 'This broadcast channel is private.' });
    }

    const prismaAny = prisma as any;
    await prisma.$transaction(async (tx) => {
      const membership = await tx.channelMembership.findUnique({
        where: { channelId_userId: { channelId, userId } }
      });
      if (!membership) {
        await tx.channelMembership.create({
          data: {
            channelId,
            userId
          }
        });
      }
      const memberCount = await tx.channelMembership.count({ where: { channelId } });
      await tx.communityChannel.update({
        where: { id: channelId },
        data: { memberCount, lastActivity: new Date() }
      });
    });

    const row = await getBroadcastChannel(channelId, userId);
    return res.json({ success: true, data: serializeBroadcastChannel(req, row, userId) });
  } catch (error: any) {
    console.error('followBroadcastChannel error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to follow broadcast channel.' });
  }
};

export const unfollowBroadcastChannel = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const channelId = String(req.params.id || '').trim();
    if (!channelId) return res.status(400).json({ success: false, error: 'Channel id is required.' });

    const existing = await getBroadcastChannel(channelId, userId);
    if (!existing || String(existing?.purpose || '') !== BROADCAST_PURPOSE) {
      return res.status(404).json({ success: false, error: 'Broadcast channel not found.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.channelMembership.deleteMany({
        where: {
          channelId,
          userId
        }
      });
      const memberCount = await tx.channelMembership.count({ where: { channelId } });
      await tx.communityChannel.update({
        where: { id: channelId },
        data: { memberCount, lastActivity: new Date() }
      });
    });

    const row = await getBroadcastChannel(channelId, userId);
    return res.json({ success: true, data: serializeBroadcastChannel(req, row, userId) });
  } catch (error: any) {
    console.error('unfollowBroadcastChannel error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to unfollow broadcast channel.' });
  }
};

export const createBroadcastChannelPost = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const channelId = String(req.params.id || '').trim();
    if (!channelId) return res.status(400).json({ success: false, error: 'Channel id is required.' });

    const existing = await getBroadcastChannel(channelId, userId);
    if (!existing || String(existing?.purpose || '') !== BROADCAST_PURPOSE) {
      return res.status(404).json({ success: false, error: 'Broadcast channel not found.' });
    }

    const canManage =
      String(existing.ownerId || '') === userId ||
      isAdminRequest(req) ||
      (existing.businessPage &&
        (String(existing.businessPage.ownerId || '') === userId ||
          (Array.isArray(existing.businessPage.admins) &&
            existing.businessPage.admins.some((admin: any) => String(admin?.userId || '') === userId))));
    if (!canManage) {
      return res.status(403).json({ success: false, error: 'You are not allowed to post updates in this channel.' });
    }

    const content = cleanText(req.body?.content, 4000);
    if (!content) {
      return res.status(400).json({ success: false, error: 'Update content is required.' });
    }

    const prismaAny = prisma as any;
    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.communityMessage.create({
        data: {
          channelId,
          userId,
          content
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true
            }
          }
        }
      });
      await tx.communityChannel.update({
        where: { id: channelId },
        data: { lastActivity: new Date() }
      });
      return message;
    });

    const row = await getBroadcastChannel(channelId, userId);
    return res.status(201).json({
      success: true,
      data: {
        channel: serializeBroadcastChannel(req, row, userId),
        update: {
          id: created.id,
          content: created.content,
          createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : String(created.createdAt || ''),
          created_at: created.createdAt instanceof Date ? created.createdAt.toISOString() : String(created.createdAt || ''),
          author: {
            id: created.user?.id || userId,
            name: created.user?.name || created.user?.username || 'Community member',
            avatar: resolveDirectMediaUrl(created.user?.avatar, getBaseFileUrl(req)) || created.user?.avatar || null
          }
        }
      }
    });
  } catch (error: any) {
    console.error('createBroadcastChannelPost error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to publish broadcast update.' });
  }
};
