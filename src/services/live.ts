import api from './api';

export type LiveVisibility = 'public' | 'network' | 'followers' | 'private';
export type LiveReactionType = 'like' | 'love';

export interface LiveRecordingState {
  fileId?: string | null;
  title?: string | null;
  description?: string | null;
  thumbnailFileId?: string | null;
  published?: boolean;
  publishTarget?: 'post' | 'scroll' | string | null;
  postId?: string | null;
  scrollId?: string | null;
  downloadUrl?: string | null;
}

export interface LiveComment {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  user?: LiveUserPreview;
}

export interface LiveRestriction {
  id?: string;
  userId: string;
  type: 'LIVE_BAN' | 'LIVE_SUSPEND' | string;
  reason?: string | null;
  expiresAt?: string | null;
  resolvedAt?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, any>;
  user?: LiveUserPreview;
}

export interface LiveUserPreview {
  id: string;
  name: string;
  username?: string | null;
  avatar?: string | null;
  isVerified?: boolean;
}

export interface LiveParticipant {
  id: string;
  userId: string;
  role: string;
  micState: boolean;
  cameraState: boolean;
  status: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  user?: LiveUserPreview;
}

export interface LiveGift {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountGcoin: number;
  message?: string | null;
  createdAt: string;
  fromUser?: LiveUserPreview;
  toUser?: LiveUserPreview;
}

export interface LiveSession {
  id: string;
  hostUserId: string;
  host: LiveUserPreview;
  title?: string | null;
  description?: string | null;
  visibility: LiveVisibility | string;
  status: string;
  roomName?: string | null;
  streamUrl?: string | null;
  hlsUrl?: string | null;
  recordingFileId?: string | null;
  viewerCount: number;
  peakViewerCount: number;
  likesCount: number;
  lovesCount: number;
  startedAt?: string | null;
  endedAt?: string | null;
  metadata?: Record<string, any>;
  recording?: LiveRecordingState;
  commentsCount?: number;
  participants: LiveParticipant[];
  invites?: Array<{
    id: string;
    inviterId: string;
    inviteeId: string;
    status: string;
    createdAt: string;
    respondedAt?: string | null;
    inviter?: LiveUserPreview;
    invitee?: LiveUserPreview;
  }>;
  gifts?: LiveGift[];
  viewer?: {
    userId?: string | null;
    role?: string | null;
    status?: string | null;
    isHost?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LiveConfig {
  id: string;
  enabled: boolean;
  enableConference: boolean;
  maxParticipants: number;
  maxGuests: number;
  enableGifts: boolean;
  minGiftGcoin: number;
  maxGiftGcoin: number;
  enableRecording: boolean;
  defaultVisibility: LiveVisibility | string;
  rateLimitReactionsPerMinute: number;
  rateLimitChatPerMinute: number;
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

export class LiveService {
  static async createSession(payload: {
    title?: string;
    description?: string;
    visibility?: LiveVisibility | string;
    streamUrl?: string;
    hlsUrl?: string;
    roomName?: string;
    metadata?: Record<string, any>;
  }) {
    const response = await api.post('/live/sessions', payload);
    return extractData<LiveSession>(response);
  }

  static async startSession(sessionId: string) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/start`);
    return extractData<LiveSession>(response);
  }

  static async endSession(sessionId: string) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/end`);
    return extractData<LiveSession>(response);
  }

  static async leaveSession(sessionId: string) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/leave`);
    return extractData<LiveSession>(response);
  }

  static async invite(sessionId: string, inviteeIds: string[]) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/invite`, { inviteeIds });
    return extractData<any>(response);
  }

  static async acceptInvite(inviteId: string) {
    const response = await api.post(`/live/invites/${encodeURIComponent(inviteId)}/accept`);
    return extractData<LiveSession>(response);
  }

  static async react(sessionId: string, type: LiveReactionType) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/reactions`, { type });
    return extractData<any>(response);
  }

  static async sendGift(sessionId: string, payload: { amountGcoin: number; message?: string; toUserId?: string }) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/gifts`, payload);
    return extractData<any>(response);
  }

  static async reportSession(sessionId: string, reason: string) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/report`, { reason });
    return extractData<any>(response);
  }

  static async getActiveSessions(limit = 20) {
    const query = new URLSearchParams();
    query.set('limit', String(Math.max(1, Math.min(60, Number(limit) || 20))));
    const response = await api.get(`/live/sessions/active?${query.toString()}`);
    return extractData<{ items: LiveSession[]; count: number; limit: number }>(response);
  }

  static async getComments(sessionId: string) {
    const response = await api.get(`/live/sessions/${encodeURIComponent(sessionId)}/comments`);
    return extractData<LiveComment[]>(response);
  }

  static async addComment(sessionId: string, message: string) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/comments`, { message });
    return extractData<{ comment: LiveComment; commentsCount: number }>(response);
  }

  static async getRecording(sessionId: string) {
    const response = await api.get(`/live/sessions/${encodeURIComponent(sessionId)}/recording`);
    return extractData<LiveRecordingState | null>(response);
  }

  static async saveRecording(
    sessionId: string,
    payload: { recordingFileId: string; title?: string; description?: string; thumbnailFileId?: string }
  ) {
    const response = await api.put(`/live/sessions/${encodeURIComponent(sessionId)}/recording`, payload);
    return extractData<LiveSession>(response);
  }

  static async publishRecording(
    sessionId: string,
    payload?: { target?: 'post' | 'scroll'; visibility?: LiveVisibility | string; title?: string; description?: string }
  ) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/recording/publish`, payload || {});
    return extractData<LiveSession>(response);
  }

  static async unpublishRecording(sessionId: string, payload?: { target?: 'post' | 'scroll'; postId?: string; scrollId?: string }) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/recording/unpublish`, payload || {});
    return extractData<LiveSession>(response);
  }

  static async deleteRecording(sessionId: string) {
    const response = await api.delete(`/live/sessions/${encodeURIComponent(sessionId)}/recording`);
    return extractData<LiveSession>(response);
  }

  static async getSession(sessionId: string) {
    const response = await api.get(`/live/sessions/${encodeURIComponent(sessionId)}`);
    return extractData<LiveSession>(response);
  }

  static async getMyLive() {
    const response = await api.get('/live/me');
    return extractData<{
      hosted: LiveSession[];
      participating: LiveSession[];
      invites: Array<{
        id: string;
        sessionId: string;
        inviterId: string;
        inviteeId: string;
        status: string;
        createdAt: string;
      }>;
    }>(response);
  }

  static async getAdminConfig() {
    const response = await api.get('/admin/live/config');
    return extractData<LiveConfig>(response);
  }

  static async saveAdminConfig(payload: Partial<LiveConfig>) {
    const response = await api.put('/admin/live/config', payload);
    return extractData<LiveConfig>(response);
  }

  static async getAdminSessions(params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', String(params.status));
    if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
    const response = await api.get(`/admin/live/sessions${query.toString() ? `?${query.toString()}` : ''}`);
    return extractData<LiveSession[]>(response);
  }

  static async endAdminSession(sessionId: string) {
    const response = await api.post(`/admin/live/sessions/${encodeURIComponent(sessionId)}/end`);
    return extractData<LiveSession>(response);
  }

  static async getAdminReports(params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', String(params.status));
    if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
    const response = await api.get(`/admin/live/reports${query.toString() ? `?${query.toString()}` : ''}`);
    return extractData<any[]>(response);
  }

  static async resolveAdminReport(reportId: string, payload?: { status?: string; note?: string }) {
    const response = await api.post(`/admin/live/reports/${encodeURIComponent(reportId)}/resolve`, payload || {});
    return extractData<any>(response);
  }

  static async getAdminRestrictions(params?: { status?: 'active' | 'resolved' | 'all'; type?: 'LIVE_BAN' | 'LIVE_SUSPEND'; userId?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.userId) query.set('userId', params.userId);
    if (typeof params?.limit !== 'undefined') query.set('limit', String(params.limit));
    const response = await api.get(`/admin/live/restrictions${query.toString() ? `?${query.toString()}` : ''}`);
    return extractData<LiveRestriction[]>(response);
  }

  static async restrictAdminUser(userId: string, payload?: { reason?: string; minutes?: number }) {
    const response = await api.post(`/admin/live/users/${encodeURIComponent(userId)}/restrict`, payload || {});
    return extractData<LiveRestriction>(response);
  }

  static async banAdminUser(userId: string, payload?: { reason?: string }) {
    const response = await api.post(`/admin/live/users/${encodeURIComponent(userId)}/ban`, payload || {});
    return extractData<LiveRestriction>(response);
  }

  static async restoreAdminUser(userId: string, payload?: { type?: 'LIVE_BAN' | 'LIVE_SUSPEND' }) {
    const response = await api.post(`/admin/live/users/${encodeURIComponent(userId)}/restore`, payload || {});
    return extractData<any>(response);
  }
}
