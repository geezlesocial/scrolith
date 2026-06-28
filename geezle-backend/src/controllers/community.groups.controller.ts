import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

type GroupClubRecord = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string;
  coverImage: string | null;
  avatarImage: string | null;
  visibility: string;
  category: string | null;
  location: string | null;
  joinMode: string;
  postPermission: string;
  membersCanInvite: boolean;
  faqs: unknown;
  postingGuidelines: string | null;
  status: string;
  ownerId: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
  owner?: {
    id: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
  };
  memberships?: Array<{
    userId: string;
    role: string;
    status: string;
    joinedAt: Date;
    user?: {
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
    };
  }>;
  joinRequests?: Array<{
    id: string;
    userId: string;
    status: string;
    requestedAt: Date;
    reviewedAt: Date | null;
    note: string | null;
    user?: {
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
    };
    reviewedBy?: {
      id: string;
      name: string | null;
      username: string | null;
    } | null;
  }>;
};

const getAppIo = (req: Request) => {
  try {
    const app = req.app as unknown as {
      get?: (k: string) => unknown;
      locals?: Record<string, unknown>;
    } | undefined;
    if (app && typeof app.get === 'function') {
      return (
        (app.get('communityIo') as { emit?: (...args: unknown[]) => void; to?: (room: string) => any } | undefined) ||
        (app.get('io') as { emit?: (...args: unknown[]) => void; to?: (room: string) => any } | undefined) ||
        (app.locals?.communityIo as any) ||
        (app.locals?.io as any)
      );
    }
  } catch {}
  return (global as any).appCommunityIo || (global as any).appIo || undefined;
};

const parseBool = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const normalizeVisibility = (value: unknown): 'public' | 'private' =>
  String(value || '').trim().toLowerCase() === 'private' ? 'private' : 'public';

const normalizeJoinMode = (value: unknown): 'open' | 'request' | 'invite_only' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'request') return 'request';
  if (normalized === 'invite_only' || normalized === 'invite-only' || normalized === 'invite') return 'invite_only';
  return 'open';
};

const normalizePostPermission = (value: unknown): 'admins' | 'members' | 'everyone' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'admins') return 'admins';
  if (normalized === 'everyone') return 'everyone';
  return 'members';
};

const normalizeSlug = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const coerceFaqs = (value: unknown): Array<{ question: string; answer: string }> => {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((entry) => ({
      question: String((entry as any)?.question || '').trim().slice(0, 180),
      answer: String((entry as any)?.answer || '').trim().slice(0, 1000)
    }))
    .filter((entry) => entry.question && entry.answer)
    .slice(0, 12);
};

const resolveCommunitySettings = async () => {
  const settings = await prisma.settings.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { enableClubs: true }
  });
  return settings || { enableClubs: true };
};

const isAdmin = (req: AuthRequest) => String(req.user?.role || '').toLowerCase() === 'admin';

const buildGroupPayload = (club: GroupClubRecord, viewerId?: string) => {
  const memberships = Array.isArray(club.memberships) ? club.memberships : [];
  const joinRequests = Array.isArray(club.joinRequests) ? club.joinRequests : [];
  const viewerMembership = viewerId
    ? memberships.find((entry) => String(entry.userId) === String(viewerId))
    : null;
  const viewerPendingRequest = viewerId
    ? joinRequests.find((entry) => String(entry.userId) === String(viewerId) && String(entry.status || '').toLowerCase() === 'pending')
    : null;

  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
    summary: club.summary || '',
    description: club.description || '',
    coverImage: club.coverImage || '',
    cover_image: club.coverImage || '',
    avatarImage: club.avatarImage || '',
    avatar_image: club.avatarImage || '',
    visibility: normalizeVisibility(club.visibility),
    category: club.category || '',
    location: club.location || '',
    joinMode: normalizeJoinMode(club.joinMode),
    join_mode: normalizeJoinMode(club.joinMode),
    postPermission: normalizePostPermission(club.postPermission),
    post_permission: normalizePostPermission(club.postPermission),
    membersCanInvite: Boolean(club.membersCanInvite),
    members_can_invite: Boolean(club.membersCanInvite),
    faqs: coerceFaqs(club.faqs),
    postingGuidelines: club.postingGuidelines || '',
    posting_guidelines: club.postingGuidelines || '',
    status: String(club.status || 'active').toLowerCase(),
    memberCount: Math.max(0, Number(club.memberCount || 0)),
    member_count: Math.max(0, Number(club.memberCount || 0)),
    ownerId: club.ownerId,
    owner_id: club.ownerId,
    ownerName: club.owner?.name || club.owner?.username || 'Community member',
    owner_name: club.owner?.name || club.owner?.username || 'Community member',
    ownerAvatar: club.owner?.avatar || '',
    owner_avatar: club.owner?.avatar || '',
    isJoined: Boolean(viewerMembership && String(viewerMembership.status || '').toLowerCase() === 'active'),
    is_joined: Boolean(viewerMembership && String(viewerMembership.status || '').toLowerCase() === 'active'),
    membershipRole: viewerMembership ? String(viewerMembership.role || 'member').toLowerCase() : null,
    membership_role: viewerMembership ? String(viewerMembership.role || 'member').toLowerCase() : null,
    joinedAt: viewerMembership?.joinedAt ? new Date(viewerMembership.joinedAt).toISOString() : null,
    joined_at: viewerMembership?.joinedAt ? new Date(viewerMembership.joinedAt).toISOString() : null,
    pendingRequest: viewerPendingRequest
      ? {
          id: viewerPendingRequest.id,
          status: String(viewerPendingRequest.status || '').toLowerCase(),
          requestedAt: new Date(viewerPendingRequest.requestedAt).toISOString(),
          requested_at: new Date(viewerPendingRequest.requestedAt).toISOString()
        }
      : null,
    members: memberships.slice(0, 12).map((entry) => ({
      userId: entry.userId,
      user_id: entry.userId,
      role: String(entry.role || 'member').toLowerCase(),
      status: String(entry.status || 'active').toLowerCase(),
      joinedAt: new Date(entry.joinedAt).toISOString(),
      joined_at: new Date(entry.joinedAt).toISOString(),
      user: entry.user
        ? {
            id: entry.user.id,
            name: entry.user.name || entry.user.username || 'Community member',
            username: entry.user.username || '',
            avatar: entry.user.avatar || ''
          }
        : null
    })),
    pendingRequestCount: joinRequests.filter((entry) => String(entry.status || '').toLowerCase() === 'pending').length,
    pending_request_count: joinRequests.filter((entry) => String(entry.status || '').toLowerCase() === 'pending').length,
    createdAt: new Date(club.createdAt).toISOString(),
    created_at: new Date(club.createdAt).toISOString(),
    updatedAt: new Date(club.updatedAt).toISOString(),
    updated_at: new Date(club.updatedAt).toISOString()
  };
};

const groupIncludeForViewer = (viewerId?: string) => ({
  owner: {
    select: { id: true, name: true, username: true, avatar: true }
  },
  memberships: {
    ...(viewerId ? { where: { OR: [{ userId: viewerId }, { role: { in: ['owner', 'moderator'] } }] } } : { take: 6 }),
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    select: {
      userId: true,
      role: true,
      status: true,
      joinedAt: true,
      user: { select: { id: true, name: true, username: true, avatar: true } }
    }
  },
  joinRequests: viewerId
    ? {
        where: { userId: viewerId, status: 'pending' },
        select: { id: true, userId: true, status: true, requestedAt: true, reviewedAt: true, note: true }
      }
    : false
});

const emitGroupEvent = (req: Request, event: string, payload: Record<string, unknown>) => {
  const io = getAppIo(req);
  try {
    io?.emit?.(event, payload);
  } catch {}
  try {
    realtime.emitToRoom('community:global', event, payload);
  } catch {}
};

const requireActiveMembership = async (clubId: string, userId: string) =>
  prisma.clubMembership.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { userId: true, role: true, status: true, joinedAt: true }
  });

const viewerCanManageGroup = (club: { ownerId: string }, membership: { role?: string | null } | null, req: AuthRequest) =>
  isAdmin(req) || club.ownerId === req.user?.id || ['owner', 'moderator'].includes(String(membership?.role || '').toLowerCase());

export const listGroups = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await resolveCommunitySettings();
    if (!settings.enableClubs) return res.json([]);

    const viewerId = String(req.user?.id || '').trim();
    const joinedOnly = parseBool(req.query?.joinedOnly) === true;
    const mineOnly = parseBool(req.query?.mineOnly) === true;
    const query = String(req.query?.q || '').trim();
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 24;

    const where: any = { status: 'active' };
    if (!joinedOnly) {
      where.OR = [{ visibility: 'PUBLIC' }, ...(viewerId ? [{ memberships: { some: { userId: viewerId, status: 'active' } } }, { ownerId: viewerId }] : [])];
    } else if (viewerId) {
      where.memberships = { some: { userId: viewerId, status: 'active' } };
    }
    if (mineOnly && viewerId) where.ownerId = viewerId;
    if (query) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { summary: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } }
          ]
        }
      ];
    }

    const rows = await prisma.communityClub.findMany({
      where,
      orderBy: [{ memberCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: groupIncludeForViewer(viewerId)
    });

    return res.json(rows.map((row) => buildGroupPayload(row as unknown as GroupClubRecord, viewerId)));
  } catch (error: any) {
    console.error('listGroups error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load groups' });
  }
};

export const getGroup = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    const clubIdOrSlug = String(req.params?.clubId || '').trim();
    if (!clubIdOrSlug) return res.status(400).json({ success: false, error: 'clubId is required' });

    const row = await prisma.communityClub.findFirst({
      where: {
        OR: [{ id: clubIdOrSlug }, { slug: clubIdOrSlug }],
        status: 'active'
      },
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        memberships: {
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
          take: 20,
          select: {
            userId: true,
            role: true,
            status: true,
            joinedAt: true,
            user: { select: { id: true, name: true, username: true, avatar: true } }
          }
        },
        joinRequests: viewerId
          ? {
              where: { OR: [{ userId: viewerId }, { status: 'pending' }] },
              orderBy: { requestedAt: 'desc' },
              take: 25,
              select: {
                id: true,
                userId: true,
                status: true,
                requestedAt: true,
                reviewedAt: true,
                note: true,
                user: { select: { id: true, name: true, username: true, avatar: true } },
                reviewedBy: { select: { id: true, name: true, username: true } }
              }
            }
          : false
      }
    });

    if (!row) return res.status(404).json({ success: false, error: 'Group not found' });
    const viewerMembership = viewerId ? row.memberships.find((entry) => String(entry.userId) === viewerId) : null;
    if (normalizeVisibility(row.visibility) === 'private' && !viewerCanManageGroup(row, viewerMembership, req) && String(viewerMembership?.status || '').toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, error: 'This private group is only visible to members.' });
    }

    const payload = buildGroupPayload(row as unknown as GroupClubRecord, viewerId);
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('getGroup error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load group' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const settings = await resolveCommunitySettings();
    if (!settings.enableClubs) return res.status(403).json({ success: false, error: 'Groups are currently disabled' });

    const name = String(req.body?.name || '').trim().slice(0, 120);
    const description = String(req.body?.description || '').trim().slice(0, 5000);
    if (!name || !description) return res.status(400).json({ success: false, error: 'Group name and description are required' });

    const slug = normalizeSlug(req.body?.slug || name);
    if (!slug) return res.status(400).json({ success: false, error: 'A valid group slug is required' });

    const existing = await prisma.communityClub.findUnique({ where: { slug }, select: { id: true } });
    if (existing) return res.status(409).json({ success: false, error: 'That group address is already in use' });

    const created = await prisma.communityClub.create({
      data: {
        name,
        slug,
        summary: String(req.body?.summary || '').trim().slice(0, 240) || null,
        description,
        coverImage: String(req.body?.coverImage || req.body?.cover_image || '').trim() || null,
        avatarImage: String(req.body?.avatarImage || req.body?.avatar_image || '').trim() || null,
        visibility: normalizeVisibility(req.body?.visibility) === 'private' ? 'PRIVATE' : 'PUBLIC',
        category: String(req.body?.category || '').trim().slice(0, 80) || null,
        location: String(req.body?.location || '').trim().slice(0, 180) || null,
        joinMode: normalizeJoinMode(req.body?.joinMode || req.body?.join_mode),
        postPermission: normalizePostPermission(req.body?.postPermission || req.body?.post_permission),
        membersCanInvite: parseBool(req.body?.membersCanInvite ?? req.body?.members_can_invite) !== false,
        faqs: coerceFaqs(req.body?.faqs),
        postingGuidelines: String(req.body?.postingGuidelines || req.body?.posting_guidelines || '').trim().slice(0, 3000) || null,
        ownerId: userId,
        memberCount: 1,
        memberships: {
          create: {
            userId,
            role: 'owner',
            status: 'active'
          }
        }
      },
      include: groupIncludeForViewer(userId)
    });

    const payload = buildGroupPayload(created as unknown as GroupClubRecord, userId);
    emitGroupEvent(req, 'community:group_created', { group: payload, actorId: userId });
    return res.status(201).json({ success: true, data: payload });
  } catch (error: any) {
    console.error('createGroup error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create group' });
  }
};

export const updateGroup = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    if (!viewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });

    const existing = await prisma.communityClub.findUnique({
      where: { id: clubId },
      select: { id: true, ownerId: true, slug: true }
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Group not found' });

    const membership = await requireActiveMembership(clubId, viewerId);
    if (!viewerCanManageGroup(existing, membership, req)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage this group' });
    }

    const nextSlug = req.body?.slug ? normalizeSlug(req.body.slug) : undefined;
    if (nextSlug && nextSlug !== existing.slug) {
      const duplicate = await prisma.communityClub.findUnique({ where: { slug: nextSlug }, select: { id: true } });
      if (duplicate) return res.status(409).json({ success: false, error: 'That group address is already in use' });
    }

    const updated = await prisma.communityClub.update({
      where: { id: clubId },
      data: {
        ...(req.body?.name !== undefined ? { name: String(req.body.name || '').trim().slice(0, 120) } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(req.body?.summary !== undefined ? { summary: String(req.body.summary || '').trim().slice(0, 240) || null } : {}),
        ...(req.body?.description !== undefined ? { description: String(req.body.description || '').trim().slice(0, 5000) } : {}),
        ...(req.body?.coverImage !== undefined || req.body?.cover_image !== undefined
          ? { coverImage: String(req.body.coverImage || req.body.cover_image || '').trim() || null }
          : {}),
        ...(req.body?.avatarImage !== undefined || req.body?.avatar_image !== undefined
          ? { avatarImage: String(req.body.avatarImage || req.body.avatar_image || '').trim() || null }
          : {}),
        ...(req.body?.visibility !== undefined
          ? { visibility: normalizeVisibility(req.body.visibility) === 'private' ? 'PRIVATE' : 'PUBLIC' }
          : {}),
        ...(req.body?.category !== undefined ? { category: String(req.body.category || '').trim().slice(0, 80) || null } : {}),
        ...(req.body?.location !== undefined ? { location: String(req.body.location || '').trim().slice(0, 180) || null } : {}),
        ...(req.body?.joinMode !== undefined || req.body?.join_mode !== undefined
          ? { joinMode: normalizeJoinMode(req.body.joinMode || req.body.join_mode) }
          : {}),
        ...(req.body?.postPermission !== undefined || req.body?.post_permission !== undefined
          ? { postPermission: normalizePostPermission(req.body.postPermission || req.body.post_permission) }
          : {}),
        ...(req.body?.membersCanInvite !== undefined || req.body?.members_can_invite !== undefined
          ? { membersCanInvite: parseBool(req.body.membersCanInvite ?? req.body.members_can_invite) !== false }
          : {}),
        ...(req.body?.faqs !== undefined ? { faqs: coerceFaqs(req.body.faqs) } : {}),
        ...(req.body?.postingGuidelines !== undefined || req.body?.posting_guidelines !== undefined
          ? { postingGuidelines: String(req.body.postingGuidelines || req.body.posting_guidelines || '').trim().slice(0, 3000) || null }
          : {})
      },
      include: groupIncludeForViewer(viewerId)
    });

    const payload = buildGroupPayload(updated as unknown as GroupClubRecord, viewerId);
    emitGroupEvent(req, 'community:group_updated', { group: payload, actorId: viewerId });
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('updateGroup error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update group' });
  }
};

export const joinGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    const clubId = String(req.body?.clubId || req.body?.club_id || req.params?.clubId || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });

    const club = await prisma.communityClub.findUnique({
      where: { id: clubId },
      include: groupIncludeForViewer(userId)
    });
    if (!club || String(club.status || '').toLowerCase() !== 'active') return res.status(404).json({ success: false, error: 'Group not found' });

    const existingMembership = await requireActiveMembership(clubId, userId);
    if (existingMembership && String(existingMembership.status || '').toLowerCase() === 'active') {
      return res.json({ success: true, joined: true, data: buildGroupPayload(club as unknown as GroupClubRecord, userId) });
    }

    const joinMode = normalizeJoinMode(club.joinMode);
    if (joinMode === 'invite_only' && !isAdmin(req) && club.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'This group is invite-only' });
    }

    if (normalizeVisibility(club.visibility) === 'private' || joinMode === 'request') {
      const requestRow = await prisma.clubJoinRequest.upsert({
        where: { clubId_userId_status: { clubId, userId, status: 'pending' } },
        update: {
          answers: Array.isArray(req.body?.answers) ? req.body.answers : null,
          note: String(req.body?.note || '').trim().slice(0, 1000) || null,
          requestedAt: new Date()
        },
        create: {
          clubId,
          userId,
          answers: Array.isArray(req.body?.answers) ? req.body.answers : null,
          note: String(req.body?.note || '').trim().slice(0, 1000) || null,
          status: 'pending'
        },
        select: { id: true, status: true, requestedAt: true }
      });
      try {
        realtime.emitToUser(club.ownerId, 'community:group_join_request', { clubId, requestId: requestRow.id, userId });
      } catch {}
      emitGroupEvent(req, 'community:group_request_updated', { clubId, requestId: requestRow.id, status: 'pending', userId });
      return res.json({
        success: true,
        joined: false,
        pending: true,
        request: {
          id: requestRow.id,
          status: requestRow.status,
          requestedAt: requestRow.requestedAt.toISOString()
        }
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.clubMembership.upsert({
        where: { clubId_userId: { clubId, userId } },
        update: { status: 'active', role: 'member' },
        create: { clubId, userId, status: 'active', role: 'member' }
      });
      await tx.communityClub.update({
        where: { id: clubId },
        data: { memberCount: { increment: existingMembership ? 0 : 1 } }
      });
      await tx.clubJoinRequest.updateMany({
        where: { clubId, userId, status: 'pending' },
        data: { status: 'approved', reviewedAt: new Date(), reviewedById: userId, note: 'Self-joined open group' }
      });
    });

    const refreshed = await prisma.communityClub.findUnique({ where: { id: clubId }, include: groupIncludeForViewer(userId) });
    const payload = buildGroupPayload(refreshed as unknown as GroupClubRecord, userId);
    emitGroupEvent(req, 'community:group_member_updated', { clubId, userId, joined: true, memberCount: payload.memberCount });
    return res.json({ success: true, joined: true, data: payload });
  } catch (error: any) {
    console.error('joinGroup error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to join group' });
  }
};

export const leaveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    const clubId = String(req.body?.clubId || req.body?.club_id || req.params?.clubId || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });

    const club = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, ownerId: true, memberCount: true } });
    if (!club) return res.status(404).json({ success: false, error: 'Group not found' });
    if (club.ownerId === userId && !isAdmin(req)) {
      return res.status(400).json({ success: false, error: 'Group owners cannot leave without transferring ownership first' });
    }

    const membership = await requireActiveMembership(clubId, userId);
    if (!membership) return res.json({ success: true, left: true });

    await prisma.$transaction(async (tx) => {
      await tx.clubMembership.delete({ where: { clubId_userId: { clubId, userId } } });
      await tx.communityClub.update({
        where: { id: clubId },
        data: { memberCount: { decrement: club.memberCount > 0 ? 1 : 0 } }
      });
    });

    emitGroupEvent(req, 'community:group_member_updated', { clubId, userId, joined: false });
    return res.json({ success: true, left: true });
  } catch (error: any) {
    console.error('leaveGroup error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to leave group' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    if (!viewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });

    const existing = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, ownerId: true, name: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Group not found' });

    const membership = await requireActiveMembership(clubId, viewerId);
    if (!viewerCanManageGroup(existing, membership, req)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to delete this group' });
    }

    await prisma.communityClub.delete({ where: { id: clubId } });
    emitGroupEvent(req, 'community:group_deleted', { clubId, actorId: viewerId });
    return res.json({ success: true, id: clubId, name: existing.name });
  } catch (error: any) {
    console.error('deleteGroup error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete group' });
  }
};

export const getGroupJoinRequests = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    if (!viewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });

    const club = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, ownerId: true } });
    if (!club) return res.status(404).json({ success: false, error: 'Group not found' });
    const membership = await requireActiveMembership(clubId, viewerId);
    if (!viewerCanManageGroup(club, membership, req)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to review requests for this group' });
    }

    const rows = await prisma.clubJoinRequest.findMany({
      where: { clubId },
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true, username: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true, username: true } }
      }
    });

    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        user_id: row.userId,
        status: String(row.status || '').toLowerCase(),
        note: row.note || '',
        answers: Array.isArray(row.answers) ? row.answers : [],
        requestedAt: row.requestedAt.toISOString(),
        requested_at: row.requestedAt.toISOString(),
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        user: row.user
          ? {
              id: row.user.id,
              name: row.user.name || row.user.username || 'Community member',
              username: row.user.username || '',
              avatar: row.user.avatar || ''
            }
          : null,
        reviewedBy: row.reviewedBy
          ? {
              id: row.reviewedBy.id,
              name: row.reviewedBy.name || row.reviewedBy.username || 'Moderator',
              username: row.reviewedBy.username || ''
            }
          : null
      }))
    });
  } catch (error: any) {
    console.error('getGroupJoinRequests error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load join requests' });
  }
};

export const respondToGroupJoinRequest = async (req: AuthRequest, res: Response) => {
  try {
    const reviewerId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    const requestId = String(req.params?.requestId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!reviewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId || !requestId) return res.status(400).json({ success: false, error: 'clubId and requestId are required' });
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ success: false, error: 'decision must be approve or reject' });

    const club = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, ownerId: true, memberCount: true } });
    if (!club) return res.status(404).json({ success: false, error: 'Group not found' });
    const membership = await requireActiveMembership(clubId, reviewerId);
    if (!viewerCanManageGroup(club, membership, req)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage requests for this group' });
    }

    const requestRow = await prisma.clubJoinRequest.findFirst({
      where: { id: requestId, clubId },
      select: { id: true, userId: true, status: true }
    });
    if (!requestRow) return res.status(404).json({ success: false, error: 'Join request not found' });

    const approved = decision === 'approve';
    await prisma.$transaction(async (tx) => {
      await tx.clubJoinRequest.update({
        where: { id: requestId },
        data: {
          status: approved ? 'approved' : 'rejected',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
          note: String(req.body?.note || '').trim().slice(0, 1000) || null
        }
      });

      if (approved) {
        const existingMembership = await tx.clubMembership.findUnique({
          where: { clubId_userId: { clubId, userId: requestRow.userId } }
        });
        await tx.clubMembership.upsert({
          where: { clubId_userId: { clubId, userId: requestRow.userId } },
          update: { status: 'active', role: existingMembership?.role || 'member' },
          create: { clubId, userId: requestRow.userId, status: 'active', role: 'member' }
        });
        await tx.communityClub.update({
          where: { id: clubId },
          data: { memberCount: { increment: existingMembership ? 0 : 1 } }
        });
      }
    });

    try {
      realtime.emitToUser(requestRow.userId, 'community:group_request_updated', {
        clubId,
        requestId,
        status: approved ? 'approved' : 'rejected'
      });
    } catch {}
    emitGroupEvent(req, 'community:group_request_updated', {
      clubId,
      requestId,
      status: approved ? 'approved' : 'rejected',
      reviewerId
    });

    return res.json({ success: true, status: approved ? 'approved' : 'rejected' });
  } catch (error: any) {
    console.error('respondToGroupJoinRequest error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to review join request' });
  }
};

export const updateGroupMember = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    const memberUserId = String(req.params?.memberUserId || '').trim();
    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const club = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, ownerId: true, memberCount: true } });
    if (!club) return res.status(404).json({ success: false, error: 'Group not found' });
    const actorMembership = await requireActiveMembership(clubId, actorId);
    if (!viewerCanManageGroup(club, actorMembership, req)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage members for this group' });
    }

    const action = String(req.body?.action || '').trim().toLowerCase();
    const nextRole = String(req.body?.role || '').trim().toLowerCase();
    const targetMembership = await prisma.clubMembership.findUnique({
      where: { clubId_userId: { clubId, userId: memberUserId } },
      select: { clubId: true, userId: true, role: true, status: true }
    });
    if (!targetMembership) return res.status(404).json({ success: false, error: 'Member not found' });
    if (club.ownerId === memberUserId && !isAdmin(req)) return res.status(400).json({ success: false, error: 'The group owner cannot be changed here' });

    if (action === 'remove') {
      await prisma.$transaction(async (tx) => {
        await tx.clubMembership.delete({ where: { clubId_userId: { clubId, userId: memberUserId } } });
        await tx.communityClub.update({
          where: { id: clubId },
          data: { memberCount: { decrement: club.memberCount > 0 ? 1 : 0 } }
        });
      });
      emitGroupEvent(req, 'community:group_member_updated', { clubId, userId: memberUserId, removed: true });
      return res.json({ success: true, removed: true });
    }

    if (!['member', 'moderator'].includes(nextRole)) {
      return res.status(400).json({ success: false, error: 'role must be member or moderator' });
    }

    await prisma.clubMembership.update({
      where: { clubId_userId: { clubId, userId: memberUserId } },
      data: { role: nextRole }
    });
    emitGroupEvent(req, 'community:group_member_updated', { clubId, userId: memberUserId, role: nextRole });
    return res.json({ success: true, role: nextRole });
  } catch (error: any) {
    console.error('updateGroupMember error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update group member' });
  }
};
