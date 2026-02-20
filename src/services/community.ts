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

// Admin config normalization helpers (backend uses snake_case keys)
const normalizeAdminConfig = (raw: any): any => {
  if (!raw) return {};
  return {
    // pass-through any other keys
    ...raw,
    communityEnabled: raw.community_enabled ?? raw.communityEnabled ?? false,
    storiesEnabled: raw.stories_enabled ?? raw.storiesEnabled ?? false,
    adsEnabled: raw.ads_enabled ?? raw.adsEnabled ?? false,
    gcoinEnabled: raw.gcoin_enabled ?? raw.gcoinEnabled ?? false,
    requireLoginToView: raw.require_login_to_view ?? raw.requireLoginToView ?? false,
    autoModerateContent: raw.auto_moderate_content ?? raw.autoModerateContent ?? false,
    businessPagesEnabled: raw.business_pages_enabled ?? raw.businessPagesEnabled ?? true,
    businessPageUserCreationEnabled:
      raw.business_page_user_creation_enabled ?? raw.businessPageUserCreationEnabled ?? true,
    businessPagePostingEnabled:
      raw.business_page_posting_enabled ?? raw.businessPagePostingEnabled ?? true,
    businessPageFollowEnabled:
      raw.business_page_follow_enabled ?? raw.businessPageFollowEnabled ?? true,
    maxImagesPerPost: raw.max_images_per_post ?? raw.maxImagesPerPost ?? 4,
    maxVideoSizeMb: raw.max_video_size_mb ?? raw.maxVideoSizeMb ?? 50,
    storyExpiryHours: raw.story_expiry_hours ?? raw.storyExpiryHours ?? 24
  };
};

const denormalizeAdminConfig = (cfg: any): any => ({
  community_enabled: cfg.communityEnabled ?? cfg.community_enabled,
  stories_enabled: cfg.storiesEnabled ?? cfg.stories_enabled,
  ads_enabled: cfg.adsEnabled ?? cfg.ads_enabled,
  gcoin_enabled: cfg.gcoinEnabled ?? cfg.gcoin_enabled,
  require_login_to_view: cfg.requireLoginToView ?? cfg.require_login_to_view,
  auto_moderate_content: cfg.autoModerateContent ?? cfg.auto_moderate_content,
  business_pages_enabled: cfg.businessPagesEnabled ?? cfg.business_pages_enabled,
  business_page_user_creation_enabled:
    cfg.businessPageUserCreationEnabled ?? cfg.business_page_user_creation_enabled,
  business_page_posting_enabled:
    cfg.businessPagePostingEnabled ?? cfg.business_page_posting_enabled,
  business_page_follow_enabled:
    cfg.businessPageFollowEnabled ?? cfg.business_page_follow_enabled,
  max_images_per_post: typeof cfg.maxImagesPerPost !== 'undefined' ? Number(cfg.maxImagesPerPost) : cfg.max_images_per_post,
  max_video_size_mb: typeof cfg.maxVideoSizeMb !== 'undefined' ? Number(cfg.maxVideoSizeMb) : cfg.max_video_size_mb,
  story_expiry_hours: typeof cfg.storyExpiryHours !== 'undefined' ? Number(cfg.storyExpiryHours) : cfg.story_expiry_hours
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
      return ({
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
      }) as unknown as CommunityAnalytics;
    }
  }

  // Helper to read boolean flags supporting camelCase and snake_case
  static readBool(settings: PlatformSettings, camel: string, snake: string, fallback: boolean): boolean {
    const s = settings as unknown as Record<string, any>;
    return s?.[camel] ?? s?.[snake] ?? fallback;
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

  static async deleteClub(clubId: string): Promise<boolean> {
    const response = await this.post(`/community/clubs/${clubId}/delete`, {});
    return Boolean(response?.success);
  }

  static async deleteEvent(eventId: string): Promise<boolean> {
    const response = await this.post(`/community/events/${eventId}/delete`, {});
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

  // Community feed posts (CommunityPost)
  static async getPosts(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    businessPageId?: string;
    businessPageSlug?: string;
  }): Promise<any[]> {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.offset !== undefined) search.set('offset', String(params.offset));
    if (params?.status) search.set('status', params.status);
    if (params?.businessPageId) search.set('businessPageId', String(params.businessPageId));
    if (params?.businessPageSlug) search.set('businessPageSlug', String(params.businessPageSlug));
    const endpoint = `/community/posts${search.toString() ? `?${search.toString()}` : ''}`;
    const data = await this.get(endpoint);
    return Array.isArray(data) ? data : [];
  }

  static async getFeed(params?: { limit?: number; cursor?: string; scope?: string; topic?: string; region?: string }): Promise<any> {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.scope) search.set('scope', params.scope);
    if (params?.topic) search.set('topic', params.topic);
    if (params?.region) search.set('region', params.region);
    const query = search.toString();
    const endpoint = `/community/feed${query ? `?${query}` : ''}`;

    try {
      return await this.get(endpoint);
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      const shouldTryFallback = status === 404 || status === 405 || status === 501;
      if (!shouldTryFallback) {
        throw error;
      }

      const fallbackEndpoints = [
        `/feed${query ? `?${query}` : ''}`,
        `/community/posts${query ? `?${query}` : ''}`
      ];

      for (const fallback of fallbackEndpoints) {
        try {
          const data = await this.get(fallback);
          if (Array.isArray(data)) {
            return { items: data, nextCursor: null };
          }
          if (Array.isArray(data?.items)) {
            return data;
          }
          if (Array.isArray(data?.posts)) {
            return { ...data, items: data.posts, nextCursor: data?.nextCursor || null };
          }
          if (Array.isArray(data?.data)) {
            return { ...data, items: data.data, nextCursor: data?.nextCursor || null };
          }
          return data;
        } catch {
          // Try the next fallback endpoint.
        }
      }

      throw error;
    }
  }

  static async getPostById(postId: string): Promise<any> {
    const id = String(postId || '').trim();
    if (!id) return null;
    return this.get(`/community/posts/${encodeURIComponent(id)}`);
  }

  static async createPost(data: {
    title?: string;
    content: string;
    attachments?: string[];
    attachmentFileIds?: string[];
    status?: string;
    tags?: string[];
    mentions?: string[];
    visibility?: string;
    businessPageId?: string;
    topic?: string;
    location?: string;
    commentPolicy?: string;
    graphicWarning?: boolean;
    aiInsightEnabled?: boolean;
  }): Promise<any> {
    const attachmentFileIds = Array.from(
      new Set([...(data.attachmentFileIds || []), ...(data.attachments || [])].filter(Boolean))
    );
    const payload = {
      title: data.title,
      content: data.content,
      attachmentFileIds,
      attachments: attachmentFileIds,
      status: data.status || 'active',
      tags: data.tags || [],
      mentions: data.mentions || [],
      topic: data.topic,
      location: data.location,
      visibility: data.visibility || 'public',
      graphicWarning: data.graphicWarning === true,
      businessPageId: data.businessPageId,
      commentPolicy: data.commentPolicy,
      aiInsightEnabled: typeof data.aiInsightEnabled === 'boolean' ? data.aiInsightEnabled : undefined
    };
    const response = await this.post('/community/posts', payload);
    return response;
  }

  static async reactToPost(postId: string, type: string): Promise<any> {
    return this.post(`/community/posts/${postId}/reactions`, { type });
  }

  static async removePostReaction(postId: string): Promise<any> {
    const response = await api.delete(`/community/posts/${postId}/reactions`);
    return extractData<any>(response);
  }

  static async commentOnPost(postId: string, payload: { content: string; attachments?: string[]; attachmentFileIds?: string[]; parentId?: string | null }): Promise<any> {
    const attachmentFileIds = Array.from(
      new Set([...(payload.attachmentFileIds || []), ...(payload.attachments || [])].filter(Boolean))
    );
    return this.post(`/community/posts/${postId}/comments`, {
      ...payload,
      attachmentFileIds,
      attachments: attachmentFileIds
    });
  }

  static async getPostComments(postId: string, params?: { limit?: number; cursor?: string }): Promise<any> {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    const endpoint = `/community/posts/${postId}/comments${search.toString() ? `?${search.toString()}` : ''}`;
    return this.get(endpoint);
  }

  static async updatePostComment(commentId: string, payload: { content?: string; attachments?: string[]; attachmentFileIds?: string[] }): Promise<any> {
    const attachmentFileIds = Array.from(
      new Set([...(payload.attachmentFileIds || []), ...(payload.attachments || [])].filter(Boolean))
    );
    const response = await api.put(`/community/comments/${commentId}`, {
      ...payload,
      attachmentFileIds,
      attachments: attachmentFileIds
    });
    return extractData<any>(response);
  }

  static async deletePostComment(commentId: string): Promise<any> {
    const response = await api.delete(`/community/comments/${commentId}`);
    return extractData<any>(response);
  }

  static async togglePostCommentLike(commentId: string): Promise<any> {
    const response = await this.post(`/community/comments/${commentId}/like`, {});
    return response;
  }

  static async updatePost(postId: string, payload: {
    title?: string;
    content?: string;
    attachments?: string[];
    attachmentFileIds?: string[];
    tags?: string[];
    mentions?: string[];
    visibility?: string;
    topic?: string;
    location?: string;
    status?: string;
    commentPolicy?: string;
    repostsEnabled?: boolean;
    isPinned?: boolean;
    isHighlighted?: boolean;
    aiInsightEnabled?: boolean;
    regenerateAiInsight?: boolean;
  }): Promise<any> {
    const attachmentFileIds = Array.from(
      new Set([...(payload.attachmentFileIds || []), ...(payload.attachments || [])].filter(Boolean))
    );
    const response = await api.put(`/community/posts/${postId}`, {
      ...payload,
      attachmentFileIds,
      attachments: attachmentFileIds
    });
    return extractData<any>(response);
  }

  static async deletePost(postId: string): Promise<any> {
    const response = await api.delete(`/community/posts/${postId}`);
    return extractData<any>(response);
  }

  static async postView(postId: string): Promise<boolean> {
    const response = await this.post(`/community/posts/${postId}/view`, {});
    return Boolean(response?.success ?? true);
  }

  static async postShare(postId: string, platform?: string): Promise<boolean> {
    const response = await this.post(`/community/posts/${postId}/share`, { platform });
    return Boolean(response?.success ?? true);
  }

  static async postRepost(
    postId: string,
    payload?: {
      title?: string;
      content?: string;
      visibility?: string;
      createWrapper?: boolean;
      attachments?: string[];
      attachmentFileIds?: string[];
    }
  ): Promise<boolean> {
    const attachmentFileIds = Array.from(
      new Set([...(payload?.attachmentFileIds || []), ...(payload?.attachments || [])].filter(Boolean))
    );
    const body = payload
      ? {
          ...payload,
          attachmentFileIds,
          attachments: attachmentFileIds
        }
      : {};
    const response = await this.post(`/community/posts/${postId}/repost`, body);
    return Boolean(response?.success ?? true);
  }

  static async postLike(postId: string): Promise<boolean> {
    const response = await this.post(`/community/posts/${postId}/like`, {});
    return Boolean(response?.success ?? true);
  }

  static async postUnlike(postId: string): Promise<boolean> {
    const response = await api.delete(`/community/posts/${postId}/like`);
    return Boolean(response?.data?.success ?? true);
  }

  static async getStoriesFeed(): Promise<any[]> {
    const data = await this.get('/community/stories/feed');
    return Array.isArray(data) ? data : [];
  }

  static async createStory(payload: {
    type: string;
    content?: string;
    caption?: string;
    mediaFileId?: string;
    visibility?: string;
    textBackground?: string;
    textColor?: string;
    textFont?: string;
    textAlign?: 'left' | 'center' | 'right';
  }): Promise<any> {
    return this.post('/community/stories', {
      ...payload,
      caption: payload.caption ?? payload.content
    });
  }

  static async updateStory(id: string, payload: {
    content?: string;
    caption?: string;
    visibility?: string;
    textBackground?: string;
    textColor?: string;
    textFont?: string;
    textAlign?: 'left' | 'center' | 'right';
    mediaFileId?: string;
  }): Promise<any> {
    const response = await api.put(`/community/stories/${id}`, {
      ...payload,
      caption: payload.caption ?? payload.content
    });
    return extractData<any>(response);
  }

  static async deleteStory(id: string): Promise<any> {
    const response = await api.delete(`/community/stories/${id}`);
    return extractData<any>(response);
  }

  static async viewStory(id: string): Promise<any> {
    return this.post(`/community/stories/${id}/view`, {});
  }

  static async toggleStoryLike(id: string): Promise<any> {
    const response = await this.post(`/community/stories/${id}/like`, {});
    return response;
  }

  static async getMyBusinessPages(): Promise<any[]> {
    const data = await this.get('/community/business-pages/me');
    return Array.isArray(data) ? data : [];
  }

  static async createBusinessPage(payload: any): Promise<any> {
    return this.post('/community/business-pages', payload);
  }

  static async updateBusinessPage(id: string, payload: any): Promise<any> {
    const response = await api.put(`/community/business-pages/${id}`, payload);
    return extractData<any>(response);
  }

  static async deleteBusinessPage(id: string): Promise<any> {
    const response = await api.delete(`/community/business-pages/${id}`);
    return extractData<any>(response);
  }

  static async getBusinessPageBySlug(slug: string): Promise<any> {
    return this.get(`/community/business-pages/${slug}`);
  }

  static async getBusinessPageFeed(slug: string, params?: { cursor?: string; limit?: number }): Promise<any> {
    const search = new URLSearchParams();
    if (params?.cursor) search.set('cursor', params.cursor);
    if (typeof params?.limit !== 'undefined') search.set('limit', String(params.limit));
    return this.get(`/community/business-pages/${slug}/feed${search.toString() ? `?${search.toString()}` : ''}`);
  }

  static async getRecommendedBusinessPages(limit: number = 6): Promise<any[]> {
    const safeLimit = Math.max(1, Math.min(30, Number(limit || 6)));
    const data = await this.get(`/community/business-pages/recommendations?limit=${safeLimit}`);
    return Array.isArray(data) ? data : [];
  }

  static async getBusinessPagesConfig(): Promise<{
    businessPagesEnabled: boolean;
    businessPageUserCreationEnabled: boolean;
    businessPagePostingEnabled: boolean;
    businessPageFollowEnabled: boolean;
  }> {
    const data = await this.get('/community/business-pages/config');
    return {
      businessPagesEnabled: data?.businessPagesEnabled !== false,
      businessPageUserCreationEnabled: data?.businessPageUserCreationEnabled !== false,
      businessPagePostingEnabled: data?.businessPagePostingEnabled !== false,
      businessPageFollowEnabled: data?.businessPageFollowEnabled !== false
    };
  }

  static async createBusinessPagePost(id: string, payload: any): Promise<any> {
    const attachmentFileIds = Array.from(
      new Set([
        ...((payload?.attachmentFileIds as string[]) || []),
        ...((payload?.attachments as string[]) || [])
      ].filter(Boolean))
    );
    return this.post(`/community/business-pages/${id}/posts`, {
      ...payload,
      attachmentFileIds,
      attachments: attachmentFileIds
    });
  }

  static async listBusinessPageFollowing(id: string): Promise<any> {
    return this.get(`/community/business-pages/${id}/following`);
  }

  static async followFromBusinessPage(
    id: string,
    payload: { targetType: 'user' | 'page'; targetId: string }
  ): Promise<any> {
    return this.post(`/community/business-pages/${id}/follow`, payload);
  }

  static async unfollowFromBusinessPage(
    id: string,
    payload: { targetType: 'user' | 'page'; targetId: string }
  ): Promise<any> {
    return this.post(`/community/business-pages/${id}/unfollow`, payload);
  }

  static async searchPageMentions(q: string): Promise<any[]> {
    if (!q) return [];
    const data = await this.get(`/community/mentions/pages?q=${encodeURIComponent(q)}`);
    return Array.isArray(data) ? data : [];
  }

  static async searchUserMentions(q: string): Promise<any[]> {
    if (!q) return [];
    const query = String(q || '').trim().replace(/^@+/, '');
    if (!query) return [];
    const data = await this.get(`/community/mentions/users?q=${encodeURIComponent(query)}`);
    return Array.isArray(data) ? data : [];
  }

  static async followTarget(payload: { targetType: 'user' | 'page'; targetId: string }): Promise<any> {
    return this.post('/community/follow', payload);
  }

  static async unfollowTarget(id: string): Promise<any> {
    const response = await api.delete(`/community/follow/${id}`);
    return extractData<any>(response);
  }

  static async unfollowUser(targetUserId: string): Promise<any> {
    return this.post('/community/unfollow', { targetUserId });
  }

  static async getFollowStatus(targetUserIds: string[]): Promise<Record<string, boolean>> {
    const ids = Array.from(new Set((targetUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return {};
    const data = await this.post('/community/follow/status', { targetUserIds: ids });
    return data && typeof data === 'object' ? (data as Record<string, boolean>) : {};
  }

  static async listFollowers(targetType: 'user' | 'page', targetId: string): Promise<any[]> {
    const data = await this.get(`/community/followers?targetType=${targetType}&targetId=${targetId}`);
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any)?.items)) return (data as any).items;
    if (Array.isArray((data as any)?.followers)) return (data as any).followers;
    if (Array.isArray((data as any)?.users)) return (data as any).users;
    return [];
  }

  static async listFollowing(userId: string = 'me'): Promise<any> {
    return this.get(`/community/following?userId=${userId}`);
  }

  static async listMyFollowers(params?: { cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor: string | null }> {
    const search = new URLSearchParams();
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    const data = await this.get(`/community/followers/me${search.toString() ? `?${search.toString()}` : ''}`);
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: data?.nextCursor || null
    };
  }

  static async listMyFollowing(params?: { cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor: string | null }> {
    const search = new URLSearchParams();
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    const data = await this.get(`/community/following/me${search.toString() ? `?${search.toString()}` : ''}`);
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: data?.nextCursor || null
    };
  }

  static async blockUser(userId: string): Promise<any> {
    return this.post('/community/blocks', { userId });
  }

  static async unblockUser(userId: string): Promise<any> {
    const response = await api.delete(`/community/blocks/${encodeURIComponent(userId)}`);
    return extractData<any>(response);
  }

  static async listBlockedUsers(params?: { cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor: string | null }> {
    const search = new URLSearchParams();
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    const data = await this.get(`/community/blocks/me${search.toString() ? `?${search.toString()}` : ''}`);
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: data?.nextCursor || null
    };
  }

  static async searchTags(query: string, limit: number = 25): Promise<any[]> {
    const q = String(query || '').trim();
    const data = await this.get(`/community/tags?q=${encodeURIComponent(q)}&limit=${Math.max(1, Math.min(100, limit))}`);
    return Array.isArray(data) ? data : [];
  }

  static async getTrendingTags(limit: number = 12, days: number = 7): Promise<any[]> {
    const data = await this.get(`/community/tags/trending?limit=${Math.max(1, Math.min(50, limit))}&days=${Math.max(1, Math.min(30, days))}`);
    return Array.isArray(data) ? data : [];
  }

  static async getPostsByTag(slug: string, limit: number = 20): Promise<any> {
    return this.get(`/community/tags/${encodeURIComponent(slug)}/posts?limit=${Math.max(1, Math.min(100, limit))}`);
  }

  static async getReactionsConfig(): Promise<any> {
    const response = await api.get('/community/admin/reactions');
    return extractData<any>(response);
  }

  static async getPublicAds(params?: { placement?: string; limit?: number }): Promise<any[]> {
    const search = new URLSearchParams();
    if (params?.placement) search.set('placement', String(params.placement));
    if (typeof params?.limit !== 'undefined') {
      const safeLimit = Math.max(1, Math.min(30, Number(params.limit || 8)));
      search.set('limit', String(safeLimit));
    }
    const endpoint = `/community/ads${search.toString() ? `?${search.toString()}` : ''}`;
    const data = await this.get(endpoint);
    return Array.isArray(data) ? data : [];
  }

  static async recordAdImpression(adId: string): Promise<void> {
    await this.post(`/community/ads/${adId}/impression`, {});
  }

  static async recordAdClick(adId: string): Promise<void> {
    await this.post(`/community/ads/${adId}/click`, {});
  }

  static async updateReactionsConfig(payload: any): Promise<any> {
    const response = await api.put('/community/admin/reactions', payload);
    return extractData<any>(response);
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

  static async getPostReports(params?: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
    postId?: string;
    ownerId?: string;
    reporterId?: string;
  }): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    pendingCount: number;
  }> {
    const query = {
      status: params?.status || undefined,
      page: params?.page || 1,
      limit: params?.limit || 20,
      search: params?.search || undefined,
      postId: params?.postId || undefined,
      ownerId: params?.ownerId || undefined,
      reporterId: params?.reporterId || undefined
    };
    const response = await api.get('/community/admin/reports/posts', { params: query });
    const data = extractData<any>(response) || {};
    return {
      items: Array.isArray(data.items) ? data.items : [],
      total: Number(data.total || 0),
      page: Number(data.page || query.page || 1),
      limit: Number(data.limit || query.limit || 20),
      pendingCount: Number(data.pendingCount || 0)
    };
  }

  static async getPostReportById(reportId: string): Promise<any> {
    const response = await api.get(`/community/admin/reports/posts/${encodeURIComponent(reportId)}`);
    return extractData<any>(response) || null;
  }

  static async replyToPostReport(reportId: string, message: string): Promise<any> {
    const response = await api.post(`/community/admin/reports/posts/${encodeURIComponent(reportId)}/reply`, {
      message
    });
    return extractData<any>(response) || null;
  }

  static async resolvePostReport(
    reportId: string,
    payload: {
      decision: 'violation' | 'no_violation';
      reason?: string;
      complainantMessage?: string;
      ownerMessage?: string;
      severity?: string;
      actions?: {
        flagPost?: boolean;
        removePost?: boolean;
        sanctionAccount?: boolean;
        banAccount?: boolean;
        restrictPostingHours?: number;
        restrictedFeatures?: string[];
        restrictFeaturesHours?: number;
      };
    }
  ): Promise<any> {
    const response = await api.post(
      `/community/admin/reports/posts/${encodeURIComponent(reportId)}/action`,
      payload
    );
    return extractData<any>(response) || null;
  }

  static getRequireLoginToView(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'requireLoginToView', 'require_login_to_view', false);
  }

  static getAllowGuestComments(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'allowGuestComments', 'allow_guest_comments', true);
  }

  static getAllowMediaUploads(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'allowMediaUploads', 'allow_media_uploads', true);
  }

  static getEnableReposts(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'enableReposts', 'enable_reposts', true);
  }

  static getAllowExternalLinks(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'allowExternalLinks', 'allow_external_links', true);
  }

  static getAutoModerateContent(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'autoModerateContent', 'auto_moderate_content', false);
  }

  static getSentimentAnalysis(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'sentimentAnalysis', 'sentiment_analysis', true);
  }

  static getEnableClubs(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'enableClubs', 'enable_clubs', true);
  }

  static getEnableEvents(settings: PlatformSettings): boolean {
    return this.readBool(settings, 'enableEvents', 'enable_events', true);
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

  static async getCommunityHomepage(): Promise<any> {
    const data = await this.get('/community/homepage');
    return data || {};
  }

  static async saveCommunityHomepage(config: any): Promise<any> {
    const response = await api.put('/community/admin/homepage', { data: config });
    return extractData<any>(response);
  }

  // Admin: fetch full admin config for community (used by admin UI)
  static async getAdminConfig(): Promise<any> {
    const response = await api.get('/community/admin/config');
    const raw = extractData<any>(response) || {};
    return normalizeAdminConfig(raw);
  }

  // Admin: update full admin config
  static async updateAdminConfig(config: any): Promise<any> {
    const payload = denormalizeAdminConfig(config);
    const response = await api.put('/community/admin/config', payload);
    const raw = extractData<any>(response) || {};
    return normalizeAdminConfig(raw);
  }

  static async getAdminBusinessPages(): Promise<any[]> {
    const data = await this.get('/community/admin/business-pages');
    return Array.isArray(data) ? data : [];
  }

  static async updateAdminBusinessPage(id: string, payload: any): Promise<any> {
    const response = await api.put(`/community/admin/business-pages/${id}`, payload);
    return extractData<any>(response);
  }

  static async moderateAdminBusinessPage(
    id: string,
    payload: { action: 'activate' | 'restrict' | 'ban' | 'deactivate' | 'delete'; reason?: string }
  ): Promise<any> {
    const response = await api.post(`/community/admin/business-pages/${id}/moderate`, payload);
    return extractData<any>(response);
  }

  static async deleteAdminBusinessPage(id: string): Promise<any> {
    const response = await api.delete(`/community/admin/business-pages/${id}`);
    return extractData<any>(response);
  }
}

export { CommunityService };
