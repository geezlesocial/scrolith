import api from './api';
import {
  ForumThread,
  CommunityClub,
  CommunityEvent,
  ContributorProfile,
  CommunityChannel,
  CommunityMessage,
  LeaderboardEntry,
  CommunityAnalytics,
  CommunitySettings,
  ModerationLog,
  CommunityComment,
  UserRole,
  PlatformSettings
} from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const normalizeThread = (thread: any): ForumThread => ({
  id: thread.id,
  category_id: thread.categoryId || thread.category_id || '',
  categoryId: thread.categoryId || thread.category_id || '',
  category_name: thread.categoryName || thread.category_name || 'General',
  categoryName: thread.categoryName || thread.category_name || 'General',
  user_id: thread.userId || thread.user_id || '',
  userId: thread.userId || thread.user_id || '',
  user_name: thread.userName || thread.user_name || 'Anonymous',
  userName: thread.userName || thread.user_name || 'Anonymous',
  user_avatar: thread.userAvatar || thread.user_avatar || 'https://ui-avatars.com/api/?name=Anonymous',
  userAvatar: thread.userAvatar || thread.user_avatar || 'https://ui-avatars.com/api/?name=Anonymous',
  title: thread.title,
  content: thread.content,
  status: thread.status || 'open',
  views: thread.views || 0,
  replies_count: thread.repliesCount || thread.replies_count || 0,
  repliesCount: thread.repliesCount || thread.replies_count || 0,
  upvotes: thread.upvotes || 0,
  is_pinned: thread.isPinned !== undefined ? thread.isPinned : (thread.is_pinned || false),
  isPinned: thread.isPinned !== undefined ? thread.isPinned : (thread.is_pinned || false),
  is_locked: thread.isLocked !== undefined ? thread.isLocked : (thread.is_locked || false),
  isLocked: thread.isLocked !== undefined ? thread.isLocked : (thread.is_locked || false),
  created_at: thread.createdAt || thread.created_at || new Date().toISOString(),
  createdAt: thread.createdAt || thread.created_at || new Date().toISOString(),
  tags: thread.tags || [],
  interactions: thread.interactions || { likes: thread.upvotes || 0, comments: thread.repliesCount || thread.replies_count || 0, reposts: 0, shares: 0 },
  user_state: thread.userState || thread.user_state || { liked: false, reposted: false },
  userState: thread.userState || thread.user_state || { liked: false, reposted: false }
});

const normalizeComment = (comment: any, threadId: string): CommunityComment => ({
  id: comment.id,
  thread_id: comment.thread_id || comment.threadId || threadId,
  parent_id: comment.parent_id || comment.parentId || null,
  user_id: comment.user_id || comment.userId || '',
  user_name: comment.user_name || comment.userName || 'Anonymous',
  user_avatar: comment.user_avatar || comment.userAvatar || 'https://ui-avatars.com/api/?name=Anonymous',
  user_role: comment.user_role || comment.userRole || UserRole.GUEST,
  content: comment.content || '',
  created_at: comment.created_at || comment.createdAt || new Date().toISOString(),
  likes: comment.likes || 0,
  is_liked: comment.is_liked !== undefined ? comment.is_liked : (comment.isLiked || false),
  replies: (comment.replies || []).map((reply: any) => normalizeComment(reply, threadId)),
  mentions: comment.mentions || []
});

const normalizeMessage = (msg: any, channelId: string): CommunityMessage => ({
  id: msg.id,
  channel_id: msg.channel_id || msg.channelId || channelId,
  user_id: msg.user_id || msg.userId || '',
  user_name: msg.user_name || msg.userName || 'Anonymous',
  user_avatar: msg.user_avatar || msg.userAvatar || 'https://ui-avatars.com/api/?name=Anonymous',
  content: msg.content || '',
  timestamp: msg.timestamp || msg.created_at || msg.createdAt || new Date().toISOString(),
  ai_flagged: msg.ai_flagged !== undefined ? msg.ai_flagged : (msg.aiFlagged || false),
  ai_reason: msg.ai_reason || msg.aiReason || undefined
});

const normalizeCommunitySettings = (s: any): any => ({
  ...s,
  requireLoginToView: s.requireLoginToView ?? s.require_login_to_view ?? false,
  allowGuestComments: s.allowGuestComments ?? s.allow_guest_comments ?? true,
  allowMediaUploads: s.allowMediaUploads ?? s.allow_media_uploads ?? true,
  enableReposts: s.enableReposts ?? s.enable_reposts ?? true,
  allowExternalLinks: s.allowExternalLinks ?? s.allow_external_links ?? true,
  autoModerateContent: s.autoModerateContent ?? s.auto_moderate_content ?? false,
  sentimentAnalysis: s.sentimentAnalysis ?? s.sentiment_analysis ?? true,
  enableClubs: s.enableClubs ?? s.enable_clubs ?? true,
  enableEvents: s.enableEvents ?? s.enable_events ?? true
});

const denormalizeCommunitySettings = (settings: any): any => ({
  ...settings,
  require_login_to_view: settings.requireLoginToView ?? settings.require_login_to_view,
  allow_guest_comments: settings.allowGuestComments ?? settings.allow_guest_comments,
  allow_media_uploads: settings.allowMediaUploads ?? settings.allow_media_uploads,
  enable_reposts: settings.enableReposts ?? settings.enable_reposts,
  allow_external_links: settings.allowExternalLinks ?? settings.allow_external_links,
  auto_moderate_content: settings.autoModerateContent ?? settings.auto_moderate_content,
  sentiment_analysis: settings.sentimentAnalysis ?? settings.sentiment_analysis,
  enable_clubs: settings.enableClubs ?? settings.enable_clubs,
  enable_events: settings.enableEvents ?? settings.enable_events
});

class CommunityService {
  static async get(endpoint: string) {
    const response = await api.get(endpoint);
    return extractData<any>(response);
  }

  static async post(endpoint: string, data: any) {
    const response = await api.post(endpoint, data);
    return extractData<any>(response);
  }

  static async toggleSetting(settingName: string, value: boolean): Promise<CommunitySettings> {
    const keyMap: Record<string, string> = {
      requireLoginToView: 'require_login_to_view',
      allowGuestComments: 'allow_guest_comments',
      allowMediaUploads: 'allow_media_uploads',
      enableReposts: 'enable_reposts',
      allowExternalLinks: 'allow_external_links',
      autoModerateContent: 'auto_moderate_content',
      sentimentAnalysis: 'sentiment_analysis',
      enableClubs: 'enable_clubs',
      enableEvents: 'enable_events'
    };

    const normalizedKey = keyMap[settingName] || settingName;
    const response = await this.post('/community/settings/toggle', { settingName: normalizedKey, value });
    return normalizeCommunitySettings(response);
  }

  static async getCommunitySettings(): Promise<CommunitySettings> {
    try {
      const response = await this.get('/community/settings');
      return normalizeCommunitySettings(response);
    } catch (error) {
      console.error('Failed to load community settings:', error);
      return normalizeCommunitySettings({});
    }
  }

  static async updateSettings(settings: Partial<CommunitySettings>): Promise<CommunitySettings> {
    const payload = denormalizeCommunitySettings(settings);
    const response = await this.post('/community/settings', payload);
    return normalizeCommunitySettings(response);
  }

  static async updateSingleSetting(key: keyof CommunitySettings, value: any): Promise<CommunitySettings> {
    return this.updateSettings({ [key]: value });
  }

  static async getCommunityAnalytics(): Promise<CommunityAnalytics> {
    try {
      return await this.get('/community/analytics');
    } catch (error) {
      console.error('Failed to load community analytics:', error);
      return {
        healthScore: 0,
        activeUsers: 0,
        messagesToday: 0,
        aiFlaggedCount: 0,
        engagementTrend: [],
        topChannels: [],
        toxicityScore: 0,
        health_score: 0,
        active_users: 0,
        messages_today: 0,
        ai_flagged_count: 0,
        engagement_trend: [],
        top_channels: [],
        toxicity_score: 0
      };
    }
  }

  static async getThreads(filters?: { category?: string; limit?: number }): Promise<ForumThread[]> {
    let endpoint = '/community/threads';
    if (filters) {
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (params.toString()) endpoint += `?${params.toString()}`;
    }
    const data = await this.get(endpoint);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeThread);
  }

  static async createThread(data: { title: string; content: string; categoryId?: string; tags?: string[] }): Promise<ForumThread> {
    const response = await this.post('/community/threads', data);
    return normalizeThread(response);
  }

  static async moderateContent(content: string): Promise<{ safe: boolean; reason?: string }> {
    const response = await this.post('/community/moderation/check', { content });
    return response;
  }

  static async getThreadById(id: string): Promise<ForumThread | null> {
    const response = await this.get(`/community/threads/${id}`);
    if (!response) return null;
    return normalizeThread(response);
  }

  static async getComments(threadId: string): Promise<CommunityComment[]> {
    const data = await this.get(`/community/comments?threadId=${threadId}`);
    if (!Array.isArray(data)) return [];
    const flattenTree = (comments: any[]): CommunityComment[] => {
      const result: CommunityComment[] = [];
      comments.forEach(comment => {
        result.push(normalizeComment(comment, threadId));
        if (comment.replies && comment.replies.length > 0) {
          result.push(...flattenTree(comment.replies));
        }
      });
      return result;
    };
    return flattenTree(data);
  }

  static async postComment(threadId: string, content: string, user: any, parentId: string | null = null): Promise<CommunityComment> {
    const response = await this.post('/community/comments', {
      threadId,
      content,
      userId: user.id,
      parentId,
      userName: user.name,
      userAvatar: user.avatar,
      userRole: user.role
    });
    return normalizeComment(response, threadId);
  }

  static async toggleLike(id: string, type: 'thread' | 'comment', currentState?: boolean): Promise<boolean> {
    const response = await this.post('/community/like', { id, type, currentState });
    return response?.liked !== undefined ? response.liked : Boolean(response?.success);
  }

  static async repost(id: string, type: string, currentState?: boolean): Promise<boolean> {
    const response = await this.post('/community/repost', { id, type, currentState });
    return response?.reposted !== undefined ? response.reposted : Boolean(response?.success);
  }

  static async toggleThreadPin(threadId: string, isPinned?: boolean): Promise<boolean> {
    const response = await this.post(`/community/threads/${threadId}/pin`, { isPinned });
    return response?.isPinned !== undefined ? response.isPinned : Boolean(response?.success);
  }

  static async toggleThreadLock(threadId: string, isLocked?: boolean): Promise<boolean> {
    const response = await this.post(`/community/threads/${threadId}/lock`, { isLocked });
    return response?.isLocked !== undefined ? response.isLocked : Boolean(response?.success);
  }

  static async deleteThread(threadId: string): Promise<boolean> {
    const response = await this.post(`/community/threads/${threadId}/delete`, {});
    return Boolean(response?.success);
  }

  static async deleteComment(commentId: string): Promise<boolean> {
    const response = await this.post(`/community/comments/${commentId}/delete`, {});
    return Boolean(response?.success);
  }

  static async getClubs(): Promise<CommunityClub[]> {
    const data = await this.get('/community/clubs');
    return Array.isArray(data) ? data : [];
  }

  static async joinClub(clubId: string): Promise<boolean> {
    const response = await this.post('/community/clubs/join', { clubId });
    return Boolean(response?.success);
  }

  static async leaveClub(clubId: string): Promise<boolean> {
    const response = await this.post('/community/clubs/leave', { clubId });
    return Boolean(response?.success);
  }

  static async getEvents(): Promise<CommunityEvent[]> {
    const data = await this.get('/community/events');
    return Array.isArray(data) ? data : [];
  }

  static async registerEvent(eventId: string): Promise<boolean> {
    const response = await this.post('/community/events/register', { eventId });
    return Boolean(response?.success);
  }

  static async unregisterEvent(eventId: string): Promise<boolean> {
    const response = await this.post('/community/events/unregister', { eventId });
    return Boolean(response?.success);
  }

  static async getTopContributors(limit: number = 5): Promise<ContributorProfile[]> {
    const data = await this.get(`/community/contributors?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  }

  static async getLeaderboard(period: 'weekly' | 'monthly' | 'all-time'): Promise<LeaderboardEntry[]> {
    const data = await this.get(`/community/leaderboard?period=${period}`);
    return Array.isArray(data) ? data : [];
  }

  static async getChannels(): Promise<CommunityChannel[]> {
    try {
      const data = await this.get('/community/channels');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Failed to load channels:', error);
      return [];
    }
  }

  static async createChannel(channelData: {
    name: string;
    description?: string;
    isPublic?: boolean;
    type?: string;
    isPaid?: boolean;
    price?: number;
  }): Promise<CommunityChannel> {
    const payload = {
      name: channelData.name,
      description: channelData.description ?? '',
      isPublic: channelData.isPublic ?? channelData.type !== 'private',
      type: channelData.type ?? (channelData.isPublic === false ? 'private' : 'public'),
      isPaid: Boolean(channelData.isPaid),
      price: Number(channelData.price ?? 0)
    };
    const response = await this.post('/community/channels', payload);
    return response as CommunityChannel;
  }

  static async deleteChannel(channelId: string): Promise<boolean> {
    const response = await this.post(`/community/channels/${channelId}/delete`, {});
    return Boolean(response?.success);
  }

  static async joinChannel(channelId: string): Promise<boolean> {
    const response = await this.post(`/community/channels/${channelId}/join`, {});
    return Boolean(response?.success);
  }

  static async leaveChannel(channelId: string): Promise<boolean> {
    const response = await this.post(`/community/channels/${channelId}/leave`, {});
    return Boolean(response?.success);
  }

  static async getMessages(channelId: string): Promise<CommunityMessage[]> {
    const data = await this.get(`/community/channels/${channelId}/messages`);
    if (!Array.isArray(data)) return [];
    return data.map((msg: any) => normalizeMessage(msg, channelId));
  }

  static async sendMessage(channelId: string, content: string, user: any): Promise<CommunityMessage> {
    const response = await this.post(`/community/channels/${channelId}/messages`, {
      content,
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar
    });
    return normalizeMessage(response, channelId);
  }

  static async getModerationLogs(): Promise<ModerationLog[]> {
    try {
      const data = await this.get('/community/moderation/logs');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Failed to load moderation logs:', error);
      return [];
    }
  }

  static getRequireLoginToView(settings: PlatformSettings): boolean {
    return (settings as any).requireLoginToView ?? (settings as any).require_login_to_view ?? false;
  }

  static getAllowGuestComments(settings: PlatformSettings): boolean {
    return (settings as any).allowGuestComments ?? (settings as any).allow_guest_comments ?? true;
  }

  static getAllowMediaUploads(settings: PlatformSettings): boolean {
    return (settings as any).allowMediaUploads ?? (settings as any).allow_media_uploads ?? true;
  }

  static getEnableReposts(settings: PlatformSettings): boolean {
    return (settings as any).enableReposts ?? (settings as any).enable_reposts ?? true;
  }

  static getAllowExternalLinks(settings: PlatformSettings): boolean {
    return (settings as any).allowExternalLinks ?? (settings as any).allow_external_links ?? true;
  }

  static getAutoModerateContent(settings: PlatformSettings): boolean {
    return (settings as any).autoModerateContent ?? (settings as any).auto_moderate_content ?? false;
  }

  static getSentimentAnalysis(settings: PlatformSettings): boolean {
    return (settings as any).sentimentAnalysis ?? (settings as any).sentiment_analysis ?? true;
  }

  static getEnableClubs(settings: PlatformSettings): boolean {
    return (settings as any).enableClubs ?? (settings as any).enable_clubs ?? true;
  }

  static getEnableEvents(settings: PlatformSettings): boolean {
    return (settings as any).enableEvents ?? (settings as any).enable_events ?? true;
  }

  static async getAnalytics(): Promise<CommunityAnalytics> {
    return this.getCommunityAnalytics();
  }

  static async getSettings(): Promise<CommunitySettings> {
    return this.getCommunitySettings();
  }

  static async saveSettings(settings: Partial<CommunitySettings>): Promise<CommunitySettings> {
    return this.updateSettings(settings);
  }
}

export { CommunityService };
