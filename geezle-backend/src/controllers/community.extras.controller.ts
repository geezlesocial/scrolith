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

type EventWithRelations = {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  type: string;
  hostId: string;
  location: string | null;
  maxAttendees: number | null;
  image: string | null;
  attendeeCount: number;
  createdAt: Date;
  host?: {
    id: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
  };
  registrations?: Array<{ userId: string }>;
};

const getAppIo = (req: Request) => {
  try {
    const app = req.app as unknown as {
      get?: (k: string) => unknown;
      locals?: Record<string, unknown>;
    } | undefined;
    if (app && typeof app.get === 'function') {
      const community = app.get('communityIo') as { emit?: (...args: unknown[]) => void } | undefined;
      if (community) return community;
      const io = app.get('io') as { emit?: (...args: unknown[]) => void } | undefined;
      if (io) return io;
      if (app.locals?.communityIo) return app.locals.communityIo as { emit?: (...args: unknown[]) => void };
      if (app.locals?.io) return app.locals.io as { emit?: (...args: unknown[]) => void };
    }
  } catch (_error) {}

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

const resolveCommunitySettings = async () => {
  const settings = await prisma.settings.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { enableEvents: true, enableClubs: true, requireLoginToView: true }
  });
  return settings || { enableEvents: true, enableClubs: true, requireLoginToView: false };
};

const normalizeEventType = (value: unknown): 'WORKSHOP' | 'MEETUP' | 'WEBINAR' => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'MEETUP' || normalized === 'WEBINAR' || normalized === 'WORKSHOP') {
    return normalized;
  }
  return 'WORKSHOP';
};

const normalizeEventPayload = (event: EventWithRelations, userId?: string) => {
  const normalizedType = String(event.type || 'WORKSHOP').toLowerCase();
  const startIso = event.startTime instanceof Date ? event.startTime.toISOString() : String(event.startTime || '');
  const endIso = event.endTime instanceof Date ? event.endTime.toISOString() : String(event.endTime || '');
  const registered =
    Boolean(userId) &&
    Array.isArray(event.registrations) &&
    event.registrations.some((registration) => String(registration.userId) === String(userId));
  const hostName = event.host?.name || event.host?.username || 'Community host';
  const attendees = Math.max(0, Number(event.attendeeCount || 0));

  return {
    id: event.id,
    title: event.title,
    description: event.description || '',
    startTime: startIso,
    start_time: startIso,
    endTime: endIso,
    end_time: endIso,
    type: normalizedType,
    hostId: event.hostId,
    hostName,
    host_name: hostName,
    location: event.location || '',
    maxAttendees: event.maxAttendees,
    max_attendees: event.maxAttendees,
    image: event.image || '',
    attendees,
    attendeeCount: attendees,
    attendee_count: attendees,
    isRegistered: registered,
    is_registered: registered,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt || '')
  };
};

const emitStatsUpdate = (req: Request, payload: Record<string, unknown>) => {
  const io = getAppIo(req);
  try {
    io?.emit?.('community:stats_updated', payload);
  } catch (_error) {}
  try {
    realtime.emitToRoom('community:global', 'community:stats_updated', payload);
  } catch (_error) {}
};

type ChannelRecord = {
  id: string;
  name: string;
  type: string;
  description: string;
  isPaid: boolean;
  price: number;
  isPublic: boolean;
  members: number;
  onlineCount: number;
  createdAt: string;
};

type ChannelMessage = {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
  aiFlagged?: boolean;
  aiReason?: string;
};

const nowIso = () => new Date().toISOString();

const channels: ChannelRecord[] = [
  {
    id: 'channel-general',
    name: 'general',
    type: 'public',
    description: 'General community discussion',
    isPaid: false,
    price: 0,
    isPublic: true,
    members: 0,
    onlineCount: 0,
    createdAt: nowIso()
  }
];

const channelMessages: ChannelMessage[] = [];

const moderationLogs = [
  {
    id: 'mod-1',
    userName: 'user-001',
    snippet: 'Suspicious link detected',
    riskLevel: 'High',
    reason: 'Potential phishing',
    actionTaken: 'flagged',
    timestamp: nowIso()
  }
];

const analyticsPayload = () => {
  const payload = {
    healthScore: 78,
    activeUsers: 124,
    messagesToday: 342,
    aiFlaggedCount: 6,
    engagementTrend: [55, 60, 62, 58, 70, 73, 68],
    topChannels: [
      { name: 'general', activity: 84 },
      { name: 'jobs', activity: 66 },
      { name: 'feedback', activity: 45 }
    ],
    toxicityScore: 4,
    health_score: 78,
    active_users: 124,
    messages_today: 342,
    ai_flagged_count: 6,
    engagement_trend: [55, 60, 62, 58, 70, 73, 68],
    top_channels: [
      { name: 'general', activity: 84 },
      { name: 'jobs', activity: 66 },
      { name: 'feedback', activity: 45 }
    ],
    toxicity_score: 4
  };
  return payload;
};

export const getCommunityAnalytics = (_req: Request, res: Response) => {
  res.json(analyticsPayload());
};

export const getModerationLogs = (_req: Request, res: Response) => {
  res.json(moderationLogs);
};

export const moderateContent = (_req: AuthRequest, res: Response) => {
  return res.json({ safe: true });
};

export const getChannels = (_req: Request, res: Response) => {
  const normalized = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
    description: channel.description,
    is_paid: channel.isPaid,
    isPaid: channel.isPaid,
    price: channel.price,
    is_public: channel.isPublic,
    isPublic: channel.isPublic,
    members: channel.members,
    online_count: channel.onlineCount,
    onlineCount: channel.onlineCount,
    unread_count: 0,
    unreadCount: 0,
    created_at: channel.createdAt,
    createdAt: channel.createdAt
  }));
  res.json(normalized);
};

export const createChannel = (req: Request, res: Response) => {
  const { name, description, type, isPublic, isPaid, price } = req.body || {};
  if (!name) {
    return res.status(400).json({ success: false, error: 'Channel name is required' });
  }

  const record: ChannelRecord = {
    id: `channel-${Date.now()}`,
    name,
    type: type || (isPublic === false ? 'private' : 'public'),
    description: description || '',
    isPaid: Boolean(isPaid),
    price: Number(price || 0),
    isPublic: isPublic !== undefined ? Boolean(isPublic) : true,
    members: 0,
    onlineCount: 0,
    createdAt: nowIso()
  };
  channels.unshift(record);
  return res.json({
    id: record.id,
    name: record.name,
    type: record.type,
    description: record.description,
    is_paid: record.isPaid,
    isPaid: record.isPaid,
    price: record.price,
    is_public: record.isPublic,
    isPublic: record.isPublic,
    members: record.members,
    online_count: record.onlineCount,
    onlineCount: record.onlineCount,
    unread_count: 0,
    unreadCount: 0,
    created_at: record.createdAt,
    createdAt: record.createdAt
  });
};

export const deleteChannel = (req: Request, res: Response) => {
  const { id } = req.params;
  const index = channels.findIndex((channel) => channel.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Channel not found' });
  }
  channels.splice(index, 1);
  return res.json({ success: true });
};

export const joinChannel = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
};

export const leaveChannel = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
};

export const getChannelMessages = (req: Request, res: Response) => {
  const { channelId } = req.params;
  const list = channelMessages.filter((msg) => msg.channelId === channelId);
  const normalized = list.map((msg) => ({
    id: msg.id,
    channel_id: msg.channelId,
    channelId: msg.channelId,
    user_id: msg.userId,
    userId: msg.userId,
    user_name: msg.userName,
    userName: msg.userName,
    user_avatar: msg.userAvatar || '',
    userAvatar: msg.userAvatar || '',
    content: msg.content,
    timestamp: msg.timestamp,
    ai_flagged: msg.aiFlagged || false,
    aiFlagged: msg.aiFlagged || false,
    ai_reason: msg.aiReason || null,
    aiReason: msg.aiReason || null
  }));
  return res.json(normalized);
};

export const postChannelMessage = (req: AuthRequest, res: Response) => {
  const { channelId } = req.params;
  const { content, userId, userName, userAvatar } = req.body || {};
  if (!content) {
    return res.status(400).json({ success: false, error: 'Message content is required' });
  }
  const message: ChannelMessage = {
    id: `msg-${Date.now()}`,
    channelId,
    userId: userId || req.user?.id || 'system',
    userName: userName || req.user?.email || 'System',
    userAvatar,
    content,
    timestamp: nowIso()
  };
  channelMessages.push(message);
  return res.json({
    id: message.id,
    channel_id: message.channelId,
    channelId: message.channelId,
    user_id: message.userId,
    userId: message.userId,
    user_name: message.userName,
    userName: message.userName,
    user_avatar: message.userAvatar || '',
    userAvatar: message.userAvatar || '',
    content: message.content,
    timestamp: message.timestamp,
    ai_flagged: false,
    aiFlagged: false
  });
};

export const getClubs = (_req: Request, res: Response) => {
  return res.json([]);
};

export const joinClub = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
};

export const leaveClub = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
};

export const getEvents = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await resolveCommunitySettings();
    if (!settings.enableEvents) {
      return res.json([]);
    }

    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 25;
    const includePastRaw = parseBool(req.query?.includePast);
    const includePast = Boolean(includePastRaw);
    const userId = String(req.user?.id || '').trim();

    const where: Record<string, unknown> = {};
    if (!includePast) {
      where.endTime = { gte: new Date() };
    }

    const events = await prisma.communityEvent.findMany({
      where,
      orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true
          }
        },
        registrations: {
          where: userId ? { userId } : undefined,
          select: { userId: true }
        }
      }
    });

    return res.json(events.map((event) => normalizeEventPayload(event as EventWithRelations, userId || undefined)));
  } catch (error: any) {
    console.error('getEvents error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load events' });
  }
};

export const createEvent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const startTimeRaw = req.body?.startTime || req.body?.start_time;
    const endTimeRaw = req.body?.endTime || req.body?.end_time;
    const startTime = new Date(String(startTimeRaw || ''));
    const endTime = new Date(String(endTimeRaw || ''));
    const location = String(req.body?.location || '').trim();
    const image = String(req.body?.image || '').trim();
    const type = normalizeEventType(req.body?.type);
    const maxAttendeesRaw = req.body?.maxAttendees ?? req.body?.max_attendees;
    const maxAttendeesNumeric = Number(maxAttendeesRaw);
    const maxAttendees =
      Number.isFinite(maxAttendeesNumeric) && maxAttendeesNumeric > 0
        ? Math.max(1, Math.min(100000, Math.trunc(maxAttendeesNumeric)))
        : null;

    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (!description) {
      return res.status(400).json({ success: false, error: 'description is required' });
    }
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
      return res.status(400).json({ success: false, error: 'startTime and endTime must be valid dates' });
    }
    if (endTime <= startTime) {
      return res.status(400).json({ success: false, error: 'endTime must be after startTime' });
    }

    const created = await prisma.communityEvent.create({
      data: {
        title,
        description,
        startTime,
        endTime,
        type,
        hostId: userId,
        location: location || null,
        image: image || null,
        maxAttendees,
        attendeeCount: 0
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true
          }
        },
        registrations: { where: { userId }, select: { userId: true } }
      }
    });

    const payload = normalizeEventPayload(created as EventWithRelations, userId);
    const io = getAppIo(req);
    try {
      io?.emit?.('community:event_created', payload);
    } catch (_error) {}
    try {
      realtime.emitToRoom('community:global', 'community:event_created', payload);
    } catch (_error) {}
    emitStatsUpdate(req, { source: 'event_created', eventId: created.id });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('createEvent error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create event' });
  }
};

export const updateEvent = async (req: AuthRequest, res: Response) => {
  try {
    const eventId = String(req.params?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const existing = await prisma.communityEvent.findUnique({
      where: { id: eventId },
      select: { id: true, startTime: true, endTime: true }
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const data: Record<string, unknown> = {};
    if (typeof req.body?.title === 'string') {
      const title = req.body.title.trim();
      if (!title) return res.status(400).json({ success: false, error: 'title cannot be empty' });
      data.title = title;
    }
    if (typeof req.body?.description === 'string') {
      const description = req.body.description.trim();
      if (!description) return res.status(400).json({ success: false, error: 'description cannot be empty' });
      data.description = description;
    }
    if (typeof req.body?.location === 'string') data.location = req.body.location.trim() || null;
    if (typeof req.body?.image === 'string') data.image = req.body.image.trim() || null;
    if (req.body?.type !== undefined) data.type = normalizeEventType(req.body.type);
    if (req.body?.maxAttendees !== undefined || req.body?.max_attendees !== undefined) {
      const raw = req.body?.maxAttendees ?? req.body?.max_attendees;
      const numeric = Number(raw);
      data.maxAttendees =
        Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.min(100000, Math.trunc(numeric))) : null;
    }

    const startTimeRaw = req.body?.startTime ?? req.body?.start_time;
    const endTimeRaw = req.body?.endTime ?? req.body?.end_time;
    const startTime = startTimeRaw !== undefined ? new Date(String(startTimeRaw || '')) : existing.startTime;
    const endTime = endTimeRaw !== undefined ? new Date(String(endTimeRaw || '')) : existing.endTime;

    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
      return res.status(400).json({ success: false, error: 'startTime and endTime must be valid dates' });
    }
    if (endTime <= startTime) {
      return res.status(400).json({ success: false, error: 'endTime must be after startTime' });
    }
    data.startTime = startTime;
    data.endTime = endTime;

    const updated = await prisma.communityEvent.update({
      where: { id: eventId },
      data,
      include: {
        host: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true
          }
        },
        registrations: {
          where: req.user?.id ? { userId: req.user.id } : undefined,
          select: { userId: true }
        }
      }
    });

    const payload = normalizeEventPayload(updated as EventWithRelations, String(req.user?.id || '').trim() || undefined);
    const io = getAppIo(req);
    try {
      io?.emit?.('community:event_updated', payload);
    } catch (_error) {}
    try {
      realtime.emitToRoom(`community:event:${eventId}`, 'community:event_updated', payload);
    } catch (_error) {}
    emitStatsUpdate(req, { source: 'event_updated', eventId });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('updateEvent error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update event' });
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response) => {
  try {
    const eventId = String(req.params?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const deleted = await prisma.communityEvent.delete({
      where: { id: eventId },
      select: { id: true, title: true }
    });

    const payload = { eventId: deleted.id, title: deleted.title };
    const io = getAppIo(req);
    try {
      io?.emit?.('community:event_deleted', payload);
    } catch (_error) {}
    try {
      realtime.emitToRoom('community:global', 'community:event_deleted', payload);
    } catch (_error) {}
    emitStatsUpdate(req, { source: 'event_deleted', eventId: deleted.id });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    console.error('deleteEvent error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete event' });
  }
};

export const registerEvent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const settings = await resolveCommunitySettings();
    if (!settings.enableEvents) {
      return res.status(403).json({ success: false, error: 'Events are currently disabled by admin settings' });
    }

    const eventId = String(req.body?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const event = await prisma.communityEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        maxAttendees: true,
        attendeeCount: true,
        endTime: true
      }
    });

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    if (event.endTime < new Date()) {
      return res.status(400).json({ success: false, error: 'This event has already ended' });
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true }
    });

    if (existing) {
      return res.json({
        success: true,
        data: {
          eventId,
          attendeeCount: Math.max(0, Number(event.attendeeCount || 0)),
          isRegistered: true
        },
        message: 'Already registered'
      });
    }

    if (event.maxAttendees !== null && Number(event.attendeeCount || 0) >= Number(event.maxAttendees || 0)) {
      return res.status(409).json({ success: false, error: 'Event capacity reached' });
    }

    const [, updatedEvent] = await prisma.$transaction([
      prisma.eventRegistration.create({
        data: {
          eventId,
          userId
        }
      }),
      prisma.communityEvent.update({
        where: { id: eventId },
        data: {
          attendeeCount: { increment: 1 }
        },
        select: {
          id: true,
          title: true,
          attendeeCount: true
        }
      })
    ]);

    const payload = {
      eventId,
      userId,
      attendeeCount: Math.max(0, Number(updatedEvent.attendeeCount || 0)),
      title: updatedEvent.title
    };

    const io = getAppIo(req);
    try {
      io?.emit?.('community:event_registered', payload);
    } catch (_error) {}
    try {
      realtime.emitToRoom(`community:event:${eventId}`, 'community:event_registered', payload);
      realtime.emitToUser(userId, 'community:event_registered', payload);
    } catch (_error) {}
    emitStatsUpdate(req, { source: 'event_registered', eventId });

    return res.json({
      success: true,
      data: {
        eventId,
        attendeeCount: payload.attendeeCount,
        isRegistered: true
      }
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.json({
        success: true,
        data: {
          eventId: String(req.body?.eventId || ''),
          isRegistered: true
        },
        message: 'Already registered'
      });
    }
    console.error('registerEvent error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to register event' });
  }
};

export const unregisterEvent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const eventId = String(req.body?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true }
    });

    if (!existing) {
      return res.json({
        success: true,
        data: {
          eventId,
          isRegistered: false
        }
      });
    }

    const [, updatedEvent] = await prisma.$transaction([
      prisma.eventRegistration.delete({
        where: { eventId_userId: { eventId, userId } }
      }),
      prisma.communityEvent.update({
        where: { id: eventId },
        data: {
          attendeeCount: { decrement: 1 }
        },
        select: {
          id: true,
          title: true,
          attendeeCount: true
        }
      })
    ]);

    let attendeeCount = Number(updatedEvent.attendeeCount || 0);
    if (attendeeCount < 0) {
      const repaired = await prisma.communityEvent.update({
        where: { id: eventId },
        data: { attendeeCount: 0 },
        select: { attendeeCount: true }
      });
      attendeeCount = Number(repaired.attendeeCount || 0);
    }

    const payload = {
      eventId,
      userId,
      attendeeCount: Math.max(0, attendeeCount),
      title: updatedEvent.title
    };

    const io = getAppIo(req);
    try {
      io?.emit?.('community:event_unregistered', payload);
    } catch (_error) {}
    try {
      realtime.emitToRoom(`community:event:${eventId}`, 'community:event_unregistered', payload);
      realtime.emitToUser(userId, 'community:event_unregistered', payload);
    } catch (_error) {}
    emitStatsUpdate(req, { source: 'event_unregistered', eventId });

    return res.json({
      success: true,
      data: {
        eventId,
        attendeeCount: payload.attendeeCount,
        isRegistered: false
      }
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.json({
        success: true,
        data: {
          eventId: String(req.body?.eventId || ''),
          isRegistered: false
        }
      });
    }
    console.error('unregisterEvent error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to unregister event' });
  }
};

export const getTopContributors = async (req: AuthRequest, res: Response) => {
  try {
    const requested = Number(req.query?.limit);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(20, Math.floor(requested))) : 5;
    const requesterId = String(req.user?.id || '').trim();

    let users: Array<{
      id: string;
      name: string | null;
      username: string | null;
      avatar: string | null;
      role: string;
      profile: { title: string | null; bio: string | null } | null;
      _count: { followers: number; communityPosts: number };
    }> = [];

    try {
      users = await prisma.user.findMany({
        where: {
          isActive: true,
          ...(requesterId ? { id: { not: requesterId } } : {})
        },
        orderBy: [
          { followers: { _count: 'desc' } },
          { communityPosts: { _count: 'desc' } },
          { createdAt: 'desc' }
        ],
        take: limit,
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          role: true,
          profile: {
            select: {
              title: true,
              bio: true
            }
          },
          _count: {
            select: {
              followers: true,
              communityPosts: true
            }
          }
        }
      });
    } catch (queryError) {
      // Fallback for environments where relation-count ordering can fail.
      users = await prisma.user.findMany({
        where: {
          isActive: true,
          ...(requesterId ? { id: { not: requesterId } } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          role: true,
          profile: {
            select: {
              title: true,
              bio: true
            }
          },
          _count: {
            select: {
              followers: true,
              communityPosts: true
            }
          }
        }
      });
    }

    const data = users.map((user) => ({
      id: user.id,
      name: user.name || user.username || 'Community member',
      username: user.username || '',
      userName: user.username || '',
      avatar: user.avatar || '',
      userAvatar: user.avatar || '',
      title: user.profile?.title || '',
      bio: user.profile?.bio || '',
      role: user.role,
      followersCount: user._count.followers,
      postsCount: user._count.communityPosts
    }));

    return res.json(data);
  } catch (error: any) {
    console.error('getTopContributors error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load contributors' });
  }
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const period = String(req.query?.period || 'monthly').toLowerCase();
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 25;

    let since: Date | null = null;
    if (period === 'weekly') {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        _count: {
          select: {
            followers: true
          }
        },
        communityPosts: {
          where: since
            ? {
                createdAt: { gte: since },
                status: 'active'
              }
            : { status: 'active' },
          select: { id: true }
        },
        forumThreads: {
          where: since
            ? {
                createdAt: { gte: since }
              }
            : undefined,
          select: { id: true, upvotes: true }
        }
      },
      take: Math.max(limit * 3, 50),
      orderBy: { createdAt: 'desc' }
    });

    const ranked = users
      .map((user) => {
        const postCount = user.communityPosts.length;
        const threadCount = user.forumThreads.length;
        const upvotes = user.forumThreads.reduce((sum, thread) => sum + Number(thread.upvotes || 0), 0);
        const followers = Number(user._count.followers || 0);
        const contributions = postCount + threadCount;
        const score = contributions * 10 + followers * 3 + upvotes;
        return {
          user,
          score,
          contributions,
          postCount,
          threadCount,
          followers
        };
      })
      .filter((entry) => entry.contributions > 0 || entry.followers > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const response = ranked.map((entry, index) => ({
      rank: index + 1,
      userId: entry.user.id,
      user_id: entry.user.id,
      userName: entry.user.name || entry.user.username || `User ${index + 1}`,
      user_name: entry.user.name || entry.user.username || `User ${index + 1}`,
      userAvatar: entry.user.avatar || '',
      user_avatar: entry.user.avatar || '',
      score: entry.score,
      trend: 'stable',
      contributions: entry.contributions,
      category: entry.threadCount >= entry.postCount ? 'Forum' : 'Community'
    }));

    return res.json(response);
  } catch (error: any) {
    console.error('getLeaderboard error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load leaderboard' });
  }
};

export const getCommunityStats = async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const [members, discussions, upcomingEvents, activePosts, activeComments, threadTags, postTags, postAuthors, threadAuthors] =
      await Promise.all([
        prisma.user.count({ where: { isActive: true } }),
        prisma.forumThread.count(),
        prisma.communityEvent.count({ where: { endTime: { gte: now } } }),
        prisma.communityPost.count({ where: { status: 'active' } }),
        prisma.communityPostComment.count({ where: { status: 'active' } }),
        prisma.forumThread.findMany({
          select: { tags: true },
          orderBy: { updatedAt: 'desc' },
          take: 500
        }),
        prisma.communityPost.findMany({
          where: { status: 'active' },
          select: { tags: true },
          orderBy: { updatedAt: 'desc' },
          take: 500
        }),
        prisma.communityPost.findMany({
          where: { status: 'active' },
          select: { authorId: true },
          distinct: ['authorId'],
          take: 5000
        }),
        prisma.forumThread.findMany({
          select: { userId: true },
          distinct: ['userId'],
          take: 5000
        })
      ]);

    const uniqueTags = new Set<string>();
    for (const row of [...threadTags, ...postTags]) {
      for (const rawTag of row.tags || []) {
        const normalized = String(rawTag || '').trim().toLowerCase();
        if (!normalized) continue;
        uniqueTags.add(normalized);
      }
    }

    const contributors = new Set<string>();
    postAuthors.forEach((entry) => contributors.add(String(entry.authorId)));
    threadAuthors.forEach((entry) => contributors.add(String(entry.userId)));

    const payload = {
      members,
      discussions,
      topics: uniqueTags.size,
      events: upcomingEvents,
      posts: activePosts,
      comments: activeComments,
      contributors: contributors.size,
      generatedAt: now.toISOString(),
      members_count: members,
      discussions_count: discussions,
      topics_count: uniqueTags.size,
      events_count: upcomingEvents,
      posts_count: activePosts,
      comments_count: activeComments,
      contributors_count: contributors.size
    };

    return res.json(payload);
  } catch (error: any) {
    console.error('getCommunityStats error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load community stats' });
  }
};

export const toggleRepost = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true, reposted: false });
};
