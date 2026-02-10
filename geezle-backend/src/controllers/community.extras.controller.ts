import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

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

export const getEvents = (_req: Request, res: Response) => {
  return res.json([]);
};

export const registerEvent = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
};

export const unregisterEvent = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true });
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

export const getLeaderboard = (_req: Request, res: Response) => {
  return res.json([]);
};

export const toggleRepost = (_req: AuthRequest, res: Response) => {
  return res.json({ success: true, reposted: false });
};
