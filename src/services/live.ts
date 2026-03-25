import api from './api';
import { beginManagedIdempotentRequest, createActionFingerprint } from './idempotency';

export type LiveVisibility = 'public' | 'network' | 'followers' | 'private';
export type LiveReactionType = 'like' | 'love';
export type LiveFilterPreset = 'none' | 'vibrant' | 'cinematic' | 'bw' | 'sepia' | 'warm' | 'cool' | 'contrast';

export const DEFAULT_LIVE_SAFETY_NOTICE_TEXT =
  'Warning: Illegal activity, nudity/explicit content, and illegal product promotion are prohibited. All livestreams must follow Scrolith Terms and Community Guidelines.';

export interface LiveExperienceConfig {
  enableReactions: boolean;
  enableShare: boolean;
  enableRepost: boolean;
  enableDashQuickAction: boolean;
  enableGiftShoutouts: boolean;
  showFeaturedRailInScrollFeed: boolean;
  showFeaturedRailInCommunityHome: boolean;
  showFeaturedRailInMemberHome: boolean;
  enableStandbyRecovery: boolean;
  keepViewerLayoutStable: boolean;
  enableSafetyNotice: boolean;
  safetyNoticeDelayMinutes: number;
  safetyNoticeRepeatMinutes: number;
  safetyNoticeVisibleSeconds: number;
  safetyNoticeText: string;
}

export const DEFAULT_LIVE_EXPERIENCE_CONFIG: LiveExperienceConfig = {
  enableReactions: true,
  enableShare: true,
  enableRepost: true,
  enableDashQuickAction: true,
  enableGiftShoutouts: true,
  showFeaturedRailInScrollFeed: true,
  showFeaturedRailInCommunityHome: true,
  showFeaturedRailInMemberHome: true,
  enableStandbyRecovery: true,
  keepViewerLayoutStable: true,
  enableSafetyNotice: true,
  safetyNoticeDelayMinutes: 15,
  safetyNoticeRepeatMinutes: 15,
  safetyNoticeVisibleSeconds: 15,
  safetyNoticeText: DEFAULT_LIVE_SAFETY_NOTICE_TEXT
};

export const DEFAULT_LIVE_DIAGNOSTICS_CONFIG: LiveDiagnosticsConfig = {
  enabled: true,
  sessionDiagnosticsAccess: true,
  retentionDays: 14,
  maxEventsPerSession: 120,
  alertThresholds: {
    viewerRetryCount: 3,
    roundTripTimeMs: 1200,
    signalFailures: 3,
    socketDisconnects: 2,
    fallbackTransitions: 1
  }
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const normalizeExperienceText = (value: unknown, fallback: string) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 500) : fallback;
};

const normalizeDiagnosticsBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

export const normalizeLiveExperienceConfig = (
  input: Partial<LiveExperienceConfig> | null | undefined
): LiveExperienceConfig => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enableReactions: source.enableReactions !== false,
    enableShare: source.enableShare !== false,
    enableRepost: source.enableRepost !== false,
    enableDashQuickAction: source.enableDashQuickAction !== false,
    enableGiftShoutouts: source.enableGiftShoutouts !== false,
    showFeaturedRailInScrollFeed: source.showFeaturedRailInScrollFeed !== false,
    showFeaturedRailInCommunityHome: source.showFeaturedRailInCommunityHome !== false,
    showFeaturedRailInMemberHome: source.showFeaturedRailInMemberHome !== false,
    enableStandbyRecovery: source.enableStandbyRecovery !== false,
    keepViewerLayoutStable: source.keepViewerLayoutStable !== false,
    enableSafetyNotice: source.enableSafetyNotice !== false,
    safetyNoticeDelayMinutes: clampNumber(
      source.safetyNoticeDelayMinutes,
      DEFAULT_LIVE_EXPERIENCE_CONFIG.safetyNoticeDelayMinutes,
      0,
      240
    ),
    safetyNoticeRepeatMinutes: clampNumber(
      source.safetyNoticeRepeatMinutes,
      DEFAULT_LIVE_EXPERIENCE_CONFIG.safetyNoticeRepeatMinutes,
      1,
      240
    ),
    safetyNoticeVisibleSeconds: clampNumber(
      source.safetyNoticeVisibleSeconds,
      DEFAULT_LIVE_EXPERIENCE_CONFIG.safetyNoticeVisibleSeconds,
      3,
      120
    ),
    safetyNoticeText: normalizeExperienceText(
      source.safetyNoticeText,
      DEFAULT_LIVE_EXPERIENCE_CONFIG.safetyNoticeText
    )
  };
};

export const normalizeLiveDiagnosticsConfig = (
  input: Partial<LiveDiagnosticsConfig> | null | undefined
): LiveDiagnosticsConfig => {
  const source = input && typeof input === 'object' ? input : {};
  const thresholds =
    source.alertThresholds && typeof source.alertThresholds === 'object' ? source.alertThresholds : {};
  return {
    enabled: normalizeDiagnosticsBoolean(source.enabled, DEFAULT_LIVE_DIAGNOSTICS_CONFIG.enabled),
    sessionDiagnosticsAccess: normalizeDiagnosticsBoolean(
      source.sessionDiagnosticsAccess,
      DEFAULT_LIVE_DIAGNOSTICS_CONFIG.sessionDiagnosticsAccess
    ),
    retentionDays: clampNumber(
      source.retentionDays,
      DEFAULT_LIVE_DIAGNOSTICS_CONFIG.retentionDays,
      1,
      90
    ),
    maxEventsPerSession: clampNumber(
      source.maxEventsPerSession,
      DEFAULT_LIVE_DIAGNOSTICS_CONFIG.maxEventsPerSession,
      20,
      500
    ),
    alertThresholds: {
      viewerRetryCount: clampNumber(
        thresholds.viewerRetryCount,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.viewerRetryCount,
        1,
        20
      ),
      roundTripTimeMs: clampNumber(
        thresholds.roundTripTimeMs,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.roundTripTimeMs,
        100,
        10000
      ),
      signalFailures: clampNumber(
        thresholds.signalFailures,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.signalFailures,
        1,
        50
      ),
      socketDisconnects: clampNumber(
        thresholds.socketDisconnects,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.socketDisconnects,
        1,
        50
      ),
      fallbackTransitions: clampNumber(
        thresholds.fallbackTransitions,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.fallbackTransitions,
        1,
        20
      )
    }
  };
};

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
  shoutoutText?: string | null;
  createdAt: string;
  fromUser?: LiveUserPreview;
  toUser?: LiveUserPreview;
}

export interface LiveRealtimeIceServer {
  urls: string[];
  username?: string | null;
  credential?: string | null;
}

export interface LiveRealtimeConfig {
  signalMode: 'socket-webrtc';
  iceServers: LiveRealtimeIceServer[];
  iceTransportPolicy: 'all' | 'relay';
  relayConfigured: boolean;
  relayRecommended: boolean;
  connectionTimeoutMs: number;
  viewerRetryIntervalMs: number;
  viewerRetryLimit: number;
  diagnosticsEnabled: boolean;
}

export interface LiveDiagnosticsThresholds {
  viewerRetryCount: number;
  roundTripTimeMs: number;
  signalFailures: number;
  socketDisconnects: number;
  fallbackTransitions: number;
}

export interface LiveDiagnosticsConfig {
  enabled: boolean;
  sessionDiagnosticsAccess: boolean;
  retentionDays: number;
  maxEventsPerSession: number;
  alertThresholds: LiveDiagnosticsThresholds;
}

export interface LiveDiagnosticsEvent {
  id: string;
  at: string;
  source: 'client' | 'backend' | 'server' | string;
  stage: string;
  severity: 'info' | 'warn' | 'error' | string;
  sessionId?: string | null;
  userId?: string | null;
  socketId?: string | null;
  role?: string | null;
  signalKind?: string | null;
  transportMode?: string | null;
  retryCount?: number | null;
  roundTripTimeMs?: number | null;
  reason?: string | null;
  message?: string | null;
  details?: Record<string, any>;
}

export interface LiveDiagnosticsSummary {
  totalEvents: number;
  signalFailures: number;
  socketDisconnects: number;
  fallbackTransitions: number;
  peakRetryCount: number;
  latestTransportMode?: string | null;
  latestRoundTripTimeMs?: number | null;
  failureReasons: Array<{ reason: string; count: number }>;
  alerts: string[];
  lastEventAt?: string | null;
}

export interface LiveFeatureStatus {
  enabled: boolean;
  enableConference: boolean;
  enableGifts: boolean;
  enableRecording: boolean;
  minGiftGcoin?: number;
  maxGiftGcoin?: number;
  rateLimitReactionsPerMinute?: number;
  rateLimitChatPerMinute?: number;
  experienceConfig?: LiveExperienceConfig;
  realtimeConfig?: LiveRealtimeConfig;
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
  realtimeConfig?: LiveRealtimeConfig;
  diagnosticsSummary?: LiveDiagnosticsSummary | null;
  diagnosticsEvents?: LiveDiagnosticsEvent[];
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
  experienceConfig?: LiveExperienceConfig;
  realtimeConfig?: LiveRealtimeConfig;
  diagnosticsConfig?: LiveDiagnosticsConfig;
  endedSessionCount?: number;
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

  static async setFilter(
    sessionId: string,
    payload: {
      preset: LiveFilterPreset | string;
      strength?: number;
    }
  ) {
    const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/filter`, payload);
    return extractData<any>(response);
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
    const request = beginManagedIdempotentRequest(`live-reaction:${sessionId}:${type}`);
    try {
      const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/reactions`, { type }, { headers: request.headers });
      request.complete();
      return extractData<any>(response);
    } catch (error) {
      request.retain();
      throw error;
    }
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
    const request = beginManagedIdempotentRequest(
      `live-comment:${sessionId}:${createActionFingerprint(message)}`
    );
    try {
      const response = await api.post(`/live/sessions/${encodeURIComponent(sessionId)}/comments`, { message }, { headers: request.headers });
      request.complete();
      return extractData<{ comment: LiveComment; commentsCount: number }>(response);
    } catch (error) {
      request.retain();
      throw error;
    }
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

  static async getRuntimeConfig() {
    const response = await api.get('/live/runtime-config');
    return extractData<LiveRealtimeConfig>(response);
  }

  static async getFeatureStatus() {
    const response = await api.get('/live/feature-status');
    return extractData<LiveFeatureStatus>(response);
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
