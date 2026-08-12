import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { notifyUser } from '../utils/notify';
import { COMMUNITY_CLUB_VISIBILITY } from '../utils/communityPrismaEnums';

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
    reviewNote: string | null;
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
  invites?: Array<{
    id: string;
    inviteeId: string;
    invitedById: string;
    role: string;
    status: string;
    note: string | null;
    invitedAt: Date;
    respondedAt: Date | null;
    invitee?: {
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
    };
    invitedBy?: {
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
    };
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
  const invites = Array.isArray(club.invites) ? club.invites : [];
  const viewerMembership = viewerId
    ? memberships.find((entry) => String(entry.userId) === String(viewerId))
    : null;
  const viewerPendingRequest = viewerId
    ? joinRequests.find((entry) => String(entry.userId) === String(viewerId) && String(entry.status || '').toLowerCase() === 'pending')
    : null;
  const viewerPendingInvite = viewerId
    ? invites.find((entry) => String(entry.inviteeId) === String(viewerId) && String(entry.status || '').toLowerCase() === 'pending')
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
    pendingInvite: viewerPendingInvite
      ? {
          id: viewerPendingInvite.id,
          status: String(viewerPendingInvite.status || '').toLowerCase(),
          role: String(viewerPendingInvite.role || 'member').toLowerCase(),
          note: viewerPendingInvite.note || '',
          invitedAt: new Date(viewerPendingInvite.invitedAt).toISOString(),
          invited_at: new Date(viewerPendingInvite.invitedAt).toISOString(),
          invitedBy: viewerPendingInvite.invitedBy
            ? {
                id: viewerPendingInvite.invitedBy.id,
                name: viewerPendingInvite.invitedBy.name || viewerPendingInvite.invitedBy.username || 'Community member',
                username: viewerPendingInvite.invitedBy.username || '',
                avatar: viewerPendingInvite.invitedBy.avatar || ''
              }
            : null
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
    pendingInviteCount: invites.filter((entry) => String(entry.status || '').toLowerCase() === 'pending').length,
    pending_invite_count: invites.filter((entry) => String(entry.status || '').toLowerCase() === 'pending').length,
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
        select: { id: true, userId: true, status: true, requestedAt: true, reviewedAt: true, note: true, reviewNote: true }
      }
    : false,
  invites: viewerId
    ? {
        where: { inviteeId: viewerId, status: 'pending' },
        select: {
          id: true,
          inviteeId: true,
          invitedById: true,
          role: true,
          status: true,
          note: true,
          invitedAt: true,
          respondedAt: true,
          invitedBy: { select: { id: true, name: true, username: true, avatar: true } }
        }
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

const buildGroupPath = (club: { id: string; slug?: string | null }) =>
  `/community?tab=groups&group=${encodeURIComponent(String(club.slug || club.id || '').trim())}`;

const serializeGroupInvite = (
  row: any,
  options?: {
    includeClub?: boolean;
  }
) => ({
  id: row.id,
  inviteeId: row.inviteeId,
  invitee_id: row.inviteeId,
  invitedById: row.invitedById,
  invited_by_id: row.invitedById,
  role: String(row.role || 'member').toLowerCase(),
  status: String(row.status || 'pending').toLowerCase(),
  note: row.note || '',
  reviewNote: row.reviewNote || '',
  invitedAt: row.invitedAt.toISOString(),
  invited_at: row.invitedAt.toISOString(),
  respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  responded_at: row.respondedAt ? row.respondedAt.toISOString() : null,
  invitee: row.invitee
    ? {
        id: row.invitee.id,
        name: row.invitee.name || row.invitee.username || 'Community member',
        username: row.invitee.username || '',
        avatar: row.invitee.avatar || ''
      }
    : null,
  invitedBy: row.invitedBy
    ? {
        id: row.invitedBy.id,
        name: row.invitedBy.name || row.invitedBy.username || 'Community member',
        username: row.invitedBy.username || '',
        avatar: row.invitedBy.avatar || ''
      }
    : null,
  ...(options?.includeClub
    ? {
        club: row.club
          ? {
              id: row.club.id,
              slug: row.club.slug || '',
              name: row.club.name || 'Scrolith group',
              summary: row.club.summary || '',
              visibility: normalizeVisibility(row.club.visibility),
              coverImage: row.club.coverImage || '',
              avatarImage: row.club.avatarImage || ''
            }
          : null
      }
    : {})
});

const createStoredUserNotification = async (
  userId: string,
  input: {
    actorId?: string | null;
    type: string;
    title: string;
    body: string;
    meta?: Record<string, any>;
  }
) => {
  try {
    const created = await prisma.notification.create({
      data: {
        userId,
        actorId: input.actorId || null,
        type: input.type,
        title: input.title,
        body: input.body,
        meta: input.meta || undefined
      }
    });

    notifyUser(userId, {
      id: created.id,
      type: created.type,
      title: created.title || 'Notification',
      body: created.body || '',
      meta: (created.meta as Record<string, any> | null) || undefined,
      createdAt: created.createdAt.toISOString()
    });
  } catch (error) {
    console.error('createStoredUserNotification error:', error);
  }
};

const canInviteMembersToGroup = async (clubId: string, actorId: string, req: AuthRequest) => {
  const club = await prisma.communityClub.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true, name: true, ownerId: true, membersCanInvite: true }
  });
  if (!club) return { allowed: false, club: null, membership: null as Awaited<ReturnType<typeof requireActiveMembership>> };
  const membership = await requireActiveMembership(clubId, actorId);
  const activeMembership = membership && String(membership.status || '').toLowerCase() === 'active';
  const allowed = viewerCanManageGroup(club, membership, req) || (activeMembership && Boolean(club.membersCanInvite));
  return { allowed, club, membership };
};

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
      where.OR = [
        { visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC },
        ...(viewerId
          ? [
              { memberships: { some: { userId: viewerId, status: 'active' } } },
              { ownerId: viewerId },
              { invites: { some: { inviteeId: viewerId, status: 'pending' } } }
            ]
          : [])
      ];
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
          : false,
        invites: viewerId
          ? {
              where: { OR: [{ inviteeId: viewerId }, { status: 'pending' }] },
              orderBy: { invitedAt: 'desc' },
              take: 25,
              select: {
                id: true,
                inviteeId: true,
                invitedById: true,
                role: true,
                status: true,
                note: true,
                invitedAt: true,
                respondedAt: true,
                invitee: { select: { id: true, name: true, username: true, avatar: true } },
                invitedBy: { select: { id: true, name: true, username: true, avatar: true } }
              }
            }
          : false
      }
    });

    if (!row) return res.status(404).json({ success: false, error: 'Group not found' });
    const viewerMembership = viewerId ? row.memberships.find((entry) => String(entry.userId) === viewerId) : null;
    const viewerInvite =
      viewerId && Array.isArray((row as any).invites)
        ? (row as any).invites.find((entry: any) => String(entry.inviteeId || '') === viewerId && String(entry.status || '').toLowerCase() === 'pending')
        : null;
    if (
      normalizeVisibility(row.visibility) === 'private' &&
      !viewerCanManageGroup(row, viewerMembership, req) &&
      String(viewerMembership?.status || '').toLowerCase() !== 'active' &&
      !viewerInvite
    ) {
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
    const existingInvite = await prisma.clubInvite.findFirst({
      where: { clubId, inviteeId: userId, status: 'pending' },
      select: { id: true, role: true, invitedById: true }
    });
    if (joinMode === 'invite_only' && !isAdmin(req) && club.ownerId !== userId && !existingInvite) {
      return res.status(403).json({ success: false, error: 'This group is invite-only' });
    }

    if ((normalizeVisibility(club.visibility) === 'private' || joinMode === 'request') && !existingInvite) {
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
      await createStoredUserNotification(club.ownerId, {
        actorId: userId,
        type: 'community_group_join_request',
        title: 'New group join request',
        body: `${req.user?.email ? req.user.email : 'A member'} requested to join ${club.name}.`,
        meta: {
          clubId,
          groupId: clubId,
          groupSlug: (club as any).slug || null,
          requestId: requestRow.id,
          entityType: 'community_group_join_request',
          entityId: requestRow.id,
          parentId: clubId,
          actionUrl: buildGroupPath({ id: clubId, slug: (club as any).slug || null })
        }
      });
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
        update: { status: 'active', role: existingInvite?.role || 'member', invitedById: existingInvite?.invitedById || null },
        create: {
          clubId,
          userId,
          status: 'active',
          role: existingInvite?.role || 'member',
          invitedById: existingInvite?.invitedById || null
        }
      });
      await tx.communityClub.update({
        where: { id: clubId },
        data: { memberCount: { increment: existingMembership ? 0 : 1 } }
      });
      await tx.clubJoinRequest.updateMany({
        where: { clubId, userId, status: 'pending' },
        data: { status: 'approved', reviewedAt: new Date(), reviewedById: userId, note: 'Self-joined open group' }
      });
      if (existingInvite?.id) {
        await tx.clubInvite.update({
          where: { id: existingInvite.id },
          data: { status: 'accepted', respondedAt: new Date() }
        });
      }
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

    const club = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, slug: true, name: true, ownerId: true, memberCount: true } });
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
        reviewNote: row.reviewNote || '',
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
          reviewNote: String(req.body?.note || '').trim().slice(0, 1000) || null
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
    await createStoredUserNotification(requestRow.userId, {
      actorId: reviewerId,
      type: approved ? 'community_group_request_approved' : 'community_group_request_rejected',
      title: approved ? 'Group request approved' : 'Group request declined',
      body: approved
        ? `Your request to join ${club.name || 'this group'} was approved.`
        : `Your request to join ${club.name || 'this group'} was declined.`,
      meta: {
        clubId,
        groupId: clubId,
        groupSlug: club.slug || null,
        requestId,
        entityType: 'community_group_join_request',
        entityId: requestId,
        parentId: clubId,
        actionUrl: buildGroupPath(club)
      }
    });
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

export const bulkRespondToGroupJoinRequests = async (req: AuthRequest, res: Response) => {
  try {
    const reviewerId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const requestIds = Array.from(
      new Set(
        (Array.isArray(req.body?.requestIds) ? req.body.requestIds : [])
          .map((value: unknown) => String(value || '').trim())
          .filter(Boolean)
      )
    );
    const note = String(req.body?.note || '').trim().slice(0, 1000) || null;

    if (!reviewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ success: false, error: 'decision must be approve or reject' });
    if (!requestIds.length) return res.status(400).json({ success: false, error: 'At least one requestId is required' });

    const club = await prisma.communityClub.findUnique({
      where: { id: clubId },
      select: { id: true, slug: true, ownerId: true, memberCount: true }
    });
    if (!club) return res.status(404).json({ success: false, error: 'Group not found' });
    const membership = await requireActiveMembership(clubId, reviewerId);
    if (!viewerCanManageGroup(club, membership, req)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage requests for this group' });
    }

    const rows = await prisma.clubJoinRequest.findMany({
      where: { id: { in: requestIds }, clubId, status: 'pending' },
      select: { id: true, userId: true }
    });
    if (!rows.length) return res.status(404).json({ success: false, error: 'No pending join requests matched the supplied ids' });

    const approved = decision === 'approve';
    let memberIncrement = 0;

    await prisma.$transaction(async (tx) => {
      await tx.clubJoinRequest.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: {
          status: approved ? 'approved' : 'rejected',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
          note
        }
      });

      if (approved) {
        for (const row of rows) {
          const existingMembership = await tx.clubMembership.findUnique({
            where: { clubId_userId: { clubId, userId: row.userId } }
          });
          await tx.clubMembership.upsert({
            where: { clubId_userId: { clubId, userId: row.userId } },
            update: { status: 'active', role: existingMembership?.role || 'member' },
            create: { clubId, userId: row.userId, status: 'active', role: 'member' }
          });
          if (!existingMembership) memberIncrement += 1;
        }
        if (memberIncrement > 0) {
          await tx.communityClub.update({
            where: { id: clubId },
            data: { memberCount: { increment: memberIncrement } }
          });
        }
      }
    });

    await Promise.all(
      rows.map(async (row) => {
        try {
          realtime.emitToUser(row.userId, 'community:group_request_updated', {
            clubId,
            requestId: row.id,
            status: approved ? 'approved' : 'rejected'
          });
        } catch {}
        await createStoredUserNotification(row.userId, {
          actorId: reviewerId,
          type: approved ? 'community_group_request_approved' : 'community_group_request_rejected',
          title: approved ? 'Group request approved' : 'Group request declined',
          body: approved
            ? `Your request to join ${club.name || 'this group'} was approved.`
            : `Your request to join ${club.name || 'this group'} was declined.`,
          meta: {
            clubId,
            groupId: clubId,
            groupSlug: club.slug || null,
            requestId: row.id,
            entityType: 'community_group_join_request',
            entityId: row.id,
            parentId: clubId,
            actionUrl: buildGroupPath(club)
          }
        });
      })
    );

    emitGroupEvent(req, 'community:group_request_updated', {
      clubId,
      requestIds: rows.map((row) => row.id),
      status: approved ? 'approved' : 'rejected',
      reviewerId,
      bulk: true
    });

    return res.json({
      success: true,
      status: approved ? 'approved' : 'rejected',
      processed: rows.length
    });
  } catch (error: any) {
    console.error('bulkRespondToGroupJoinRequests error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to bulk review join requests' });
  }
};

export const getGroupInvites = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    if (!viewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });

    const club = await prisma.communityClub.findUnique({ where: { id: clubId }, select: { id: true, ownerId: true } });
    if (!club) return res.status(404).json({ success: false, error: 'Group not found' });

    const membership = await requireActiveMembership(clubId, viewerId);
    const canManage = viewerCanManageGroup(club, membership, req);

    const rows = await prisma.clubInvite.findMany({
      where: canManage ? { clubId } : { clubId, inviteeId: viewerId },
      orderBy: [{ status: 'asc' }, { invitedAt: 'desc' }],
      include: {
        invitee: { select: { id: true, name: true, username: true, avatar: true } },
        invitedBy: { select: { id: true, name: true, username: true, avatar: true } }
      }
    });

    return res.json({
      success: true,
      data: rows.map((row) => serializeGroupInvite(row))
    });
  } catch (error: any) {
    console.error('getGroupInvites error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load group invites' });
  }
};

export const getMyGroupInvites = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    if (!viewerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const rows = await prisma.clubInvite.findMany({
      where: {
        OR: [{ inviteeId: viewerId }, { invitedById: viewerId }]
      },
      orderBy: [{ status: 'asc' }, { invitedAt: 'desc' }],
      include: {
        club: {
          select: {
            id: true,
            slug: true,
            name: true,
            summary: true,
            visibility: true,
            coverImage: true,
            avatarImage: true
          }
        },
        invitee: { select: { id: true, name: true, username: true, avatar: true } },
        invitedBy: { select: { id: true, name: true, username: true, avatar: true } }
      },
      take: 80
    });

    return res.json({
      success: true,
      data: rows.map((row) => serializeGroupInvite(row, { includeClub: true }))
    });
  } catch (error: any) {
    console.error('getMyGroupInvites error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load invite inbox' });
  }
};

export const createGroupInvite = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    const inviteeIds: string[] = Array.from(
      new Set(
        (Array.isArray(req.body?.inviteeIds) ? req.body.inviteeIds : [req.body?.inviteeId])
          .map((value: unknown): string => String(value || '').trim())
          .filter((value): value is string => Boolean(value))
      )
    ).filter((id): id is string => id !== actorId);

    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId is required' });
    if (!inviteeIds.length) return res.status(400).json({ success: false, error: 'At least one invitee is required' });

    const permission = await canInviteMembersToGroup(clubId, actorId, req);
    if (!permission.club) return res.status(404).json({ success: false, error: 'Group not found' });
    if (!permission.allowed) {
      return res.status(403).json({ success: false, error: 'You do not have permission to invite members to this group' });
    }

    const role = ['moderator', 'member'].includes(String(req.body?.role || '').trim().toLowerCase())
      ? String(req.body?.role || '').trim().toLowerCase()
      : 'member';
    const note = String(req.body?.note || '').trim().slice(0, 1000) || null;

    const existingMemberships = await prisma.clubMembership.findMany({
      where: { clubId, userId: { in: inviteeIds }, status: 'active' },
      select: { userId: true }
    });
    const activeMemberIds = new Set(existingMemberships.map((entry) => String(entry.userId)));
    const creatableInviteeIds = inviteeIds.filter((id) => !activeMemberIds.has(id));
    if (!creatableInviteeIds.length) {
      return res.status(400).json({ success: false, error: 'Selected users are already active members of this group' });
    }

    const invites = [];
    for (const inviteeId of creatableInviteeIds) {
      const invite = await prisma.clubInvite.upsert({
        where: { clubId_inviteeId_status: { clubId, inviteeId, status: 'pending' } },
        update: { invitedById: actorId, role, note, invitedAt: new Date(), respondedAt: null },
        create: { clubId, inviteeId, invitedById: actorId, role, note, status: 'pending' },
        include: {
          invitee: { select: { id: true, name: true, username: true, avatar: true } },
          invitedBy: { select: { id: true, name: true, username: true, avatar: true } }
        }
      });
      invites.push(invite);
      try {
        realtime.emitToUser(inviteeId, 'community:group_invite_updated', {
          clubId,
          inviteId: invite.id,
          status: 'pending'
        });
      } catch {}
      await createStoredUserNotification(inviteeId, {
        actorId,
        type: 'community_group_invite_received',
        title: 'You were invited to a group',
        body: `You received an invite to join ${permission.club?.name || 'a Scrolith group'}.`,
        meta: {
          clubId,
          groupId: clubId,
          groupSlug: (permission.club as any)?.slug || null,
          inviteId: invite.id,
          role,
          entityType: 'community_group_invite',
          entityId: invite.id,
          parentId: clubId,
          actionUrl: buildGroupPath(permission.club as { id: string; slug?: string | null })
        }
      });
    }

    emitGroupEvent(req, 'community:group_invite_updated', {
      clubId,
      actorId,
      inviteeIds: creatableInviteeIds,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      data: invites.map((invite) => serializeGroupInvite(invite))
    });
  } catch (error: any) {
    console.error('createGroupInvite error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create group invite' });
  }
};

export const respondToGroupInvite = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = String(req.user?.id || '').trim();
    const clubId = String(req.params?.clubId || '').trim();
    const inviteId = String(req.params?.inviteId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();

    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!clubId || !inviteId) return res.status(400).json({ success: false, error: 'clubId and inviteId are required' });
    if (!['accept', 'decline', 'cancel'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'decision must be accept, decline, or cancel' });
    }

    const invite = await prisma.clubInvite.findFirst({
      where: { id: inviteId, clubId },
      select: { id: true, clubId: true, inviteeId: true, invitedById: true, role: true, status: true }
    });
    if (!invite) return res.status(404).json({ success: false, error: 'Invite not found' });
    if (String(invite.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({ success: false, error: 'This invite is no longer pending' });
    }

    const permission = await canInviteMembersToGroup(clubId, actorId, req);
    const canManage = Boolean(permission.allowed);
    const isInvitee = invite.inviteeId === actorId;

    if (decision === 'cancel' && !canManage) {
      return res.status(403).json({ success: false, error: 'Only group managers can cancel invites' });
    }
    if ((decision === 'accept' || decision === 'decline') && !isInvitee) {
      return res.status(403).json({ success: false, error: 'This invite does not belong to the current user' });
    }

    const accepted = decision === 'accept';
    await prisma.$transaction(async (tx) => {
      await tx.clubInvite.update({
        where: { id: inviteId },
        data: {
          status: accepted ? 'accepted' : decision === 'decline' ? 'declined' : 'cancelled',
          respondedAt: new Date()
        }
      });

      if (accepted) {
        const existingMembership = await tx.clubMembership.findUnique({
          where: { clubId_userId: { clubId, userId: invite.inviteeId } }
        });
        await tx.clubMembership.upsert({
          where: { clubId_userId: { clubId, userId: invite.inviteeId } },
          update: { status: 'active', role: invite.role || existingMembership?.role || 'member', invitedById: invite.invitedById },
          create: {
            clubId,
            userId: invite.inviteeId,
            status: 'active',
            role: invite.role || 'member',
            invitedById: invite.invitedById
          }
        });
        await tx.communityClub.update({
          where: { id: clubId },
          data: { memberCount: { increment: existingMembership ? 0 : 1 } }
        });
      }
    });

    emitGroupEvent(req, 'community:group_invite_updated', {
      clubId,
      inviteId,
      actorId,
      status: accepted ? 'accepted' : decision === 'decline' ? 'declined' : 'cancelled'
    });

    if (decision === 'cancel') {
      await createStoredUserNotification(invite.inviteeId, {
        actorId,
        type: 'community_group_invite_cancelled',
        title: 'Group invite cancelled',
        body: 'A pending group invite was cancelled.',
        meta: {
          clubId,
          groupId: clubId,
          inviteId,
          entityType: 'community_group_invite',
          entityId: inviteId,
          parentId: clubId,
          actionUrl: buildGroupPath(permission.club as { id: string; slug?: string | null })
        }
      });
    } else {
      await createStoredUserNotification(invite.invitedById, {
        actorId,
        type: accepted ? 'community_group_invite_accepted' : 'community_group_invite_declined',
        title: accepted ? 'Group invite accepted' : 'Group invite declined',
        body: accepted
          ? 'A user accepted your group invitation.'
          : 'A user declined your group invitation.',
        meta: {
          clubId,
          groupId: clubId,
          inviteId,
          inviteeId: invite.inviteeId,
          entityType: 'community_group_invite',
          entityId: inviteId,
          parentId: clubId,
          actionUrl: buildGroupPath(permission.club as { id: string; slug?: string | null })
        }
      });
    }

    return res.json({
      success: true,
      status: accepted ? 'accepted' : decision === 'decline' ? 'declined' : 'cancelled'
    });
  } catch (error: any) {
    console.error('respondToGroupInvite error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update group invite' });
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
