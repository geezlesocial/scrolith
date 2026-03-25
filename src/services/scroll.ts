import api from './api';
import { beginManagedIdempotentRequest, createActionFingerprint } from './idempotency';
import type { ContentOfferTag } from '../types';

export type ScrollVisibility = 'public' | 'network' | 'followers' | 'private';
export type ScrollEngagementType =
  | 'like'
  | 'comment'
  | 'repost'
  | 'dash'
  | 'send'
  | 'impression'
  | 'view_3s'
  | 'view_10s'
  | 'view_25'
  | 'view_50'
  | 'view_95';

export interface ScrollVideo {
  id: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    avatar?: string | null;
    username?: string | null;
    isVerified?: boolean;
  };
  title?: string | null;
  description?: string | null;
  location?: string | null;
  visibility: ScrollVisibility | string;
  graphicWarning?: boolean;
  isAIEnhanced: boolean;
  dashGcoinTotal?: number;
  filterPreset?: string | null;
  filterStrength?: number | null;
  media: {
    id: string;
    url: string;
    mimeType?: string | null;
    thumbnailUrl?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  } | null;
  offerTags?: ContentOfferTag[];
  tags: Array<{ id: string; taggedUserId?: string | null; taggedPageId?: string | null }>;
  status: string;
  metrics: {
    impressions: number;
    views3s: number;
    views10s: number;
    views25pct: number;
    views50pct: number;
    views95pct: number;
    likes: number;
    comments: number;
    reposts: number;
    shares: number;
    sends: number;
    dashGcoinTotal?: number;
  };
  viewer?: {
    liked?: boolean;
    impressed?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ScrollComment {
  id: string;
  scrollId: string;
  parentId: string | null;
  userId?: string;
  userName?: string;
  userUsername?: string | null;
  userAvatar?: string | null;
  content?: string;
  status?: 'active' | 'deleted' | string;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  reactionSummary?: {
    counts: Record<string, number>;
    userReaction: string | null;
  };
  replies?: ScrollComment[];
}

export interface ScrollConfig {
  id: string;
  enabled: boolean;
  maxDurationSeconds: number;
  aiLabelRequired: boolean;
  autoModeration: boolean;
  monetizationEnabled: boolean;
  defaultVisibility: ScrollVisibility | string;
  impressionThresholdSeconds: number;
  allowedFilterPresets: string[];
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
  _schemaMissing?: boolean;
}

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

class ScrollService {
  static async getFeed(params?: { cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', String(params.cursor));
    if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
    const response = await api.get(`/scroll/feed${query.toString() ? `?${query.toString()}` : ''}`);
    return extractData<{ items: ScrollVideo[]; nextCursor?: string | null; config?: ScrollConfig }>(response);
  }

  static async create(payload: {
    fileId: string;
    title?: string;
    description?: string;
    location?: string;
    visibility?: ScrollVisibility | string;
    graphicWarning?: boolean;
    isAIEnhanced?: boolean;
    filterPreset?: string;
    filterStrength?: number;
    tags?: Array<{ taggedUserId?: string; taggedPageId?: string }>;
    offerTags?: Array<{ offerType: 'user_gig' | 'business_package'; offerId: string }>;
  }) {
    const response = await api.post('/scroll/create', payload);
    return extractData<ScrollVideo>(response);
  }

  static async update(
    id: string,
    payload: Partial<{
      fileId: string;
      title: string;
      description: string;
      location: string;
      visibility: ScrollVisibility | string;
      graphicWarning: boolean;
      isAIEnhanced: boolean;
      filterPreset: string;
      filterStrength: number;
      tags: Array<{ taggedUserId?: string; taggedPageId?: string }>;
      offerTags: Array<{ offerType: 'user_gig' | 'business_package'; offerId: string }>;
    }>
  ) {
    const response = await api.put(`/scroll/${encodeURIComponent(id)}`, payload);
    return extractData<ScrollVideo>(response);
  }

  static async remove(id: string) {
    const response = await api.delete(`/scroll/${encodeURIComponent(id)}`);
    return extractData<any>(response);
  }

  static async engage(id: string, payload: { type: ScrollEngagementType; watchedSeconds?: number }) {
    const request = beginManagedIdempotentRequest(
      `scroll-engage:${id}:${payload.type}:${createActionFingerprint(payload.watchedSeconds)}`
    );
    try {
      const response = await api.post(`/scroll/${encodeURIComponent(id)}/engage`, payload, { headers: request.headers });
      request.complete();
      return extractData<any>(response);
    } catch (error) {
      request.retain();
      throw error;
    }
  }

  static async report(id: string, payload: { reason: string }) {
    const response = await api.post(`/scroll/${encodeURIComponent(id)}/report`, payload);
    return extractData<any>(response);
  }

  static async getComments(id: string) {
    const response = await api.get(`/scroll/${encodeURIComponent(id)}/comments`);
    return extractData<{ items: ScrollComment[]; count: number }>(response);
  }

  static async createComment(id: string, payload: { content: string; parentId?: string | null }) {
    const request = beginManagedIdempotentRequest(
      `scroll-comment:${id}:${payload.parentId || 'root'}:${createActionFingerprint(payload.content)}`
    );
    try {
      const response = await api.post(`/scroll/${encodeURIComponent(id)}/comments`, payload, { headers: request.headers });
      request.complete();
      return extractData<{ comment: ScrollComment; metrics?: Partial<ScrollVideo['metrics']> }>(response);
    } catch (error) {
      request.retain();
      throw error;
    }
  }

  static async updateComment(id: string, payload: { content: string }) {
    const response = await api.put(`/scroll/comments/${encodeURIComponent(id)}`, payload);
    return extractData<ScrollComment>(response);
  }

  static async deleteComment(id: string) {
    const response = await api.delete(`/scroll/comments/${encodeURIComponent(id)}`);
    return extractData<any>(response);
  }

  static async getAdminConfig() {
    const response = await api.get('/admin/scroll/config');
    return extractData<ScrollConfig>(response);
  }

  static async saveAdminConfig(payload: Partial<ScrollConfig>) {
    const response = await api.put('/admin/scroll/config', payload);
    return extractData<ScrollConfig>(response);
  }

  static async getAdminVideos(params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', String(params.status));
    if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
    const response = await api.get(`/admin/scroll/videos${query.toString() ? `?${query.toString()}` : ''}`);
    return extractData<ScrollVideo[]>(response);
  }

  static async removeAdminVideo(id: string, reason?: string) {
    const response = await api.post(`/admin/scroll/${encodeURIComponent(id)}/remove`, { reason });
    return extractData<any>(response);
  }

  static async getAdminReports(params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', String(params.status));
    if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
    const response = await api.get(`/admin/scroll/reports${query.toString() ? `?${query.toString()}` : ''}`);
    return extractData<any[]>(response);
  }
}

export { ScrollService };
