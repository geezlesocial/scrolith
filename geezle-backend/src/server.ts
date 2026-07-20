import 'dotenv/config';
// C:\Projects\Scrolith-backend\src\server.ts
import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import { createHash, randomUUID } from 'crypto';
import prisma, { ensurePrismaReady, getPrismaConnectionState } from './utils/prismaClient';
import fs from 'fs';
import jwt from 'jsonwebtoken'; // Ensure jwt import exists
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import validateEnv from './utils/validateEnv';
import { resolveDirectMediaUrl, resolveFileBaseUrl } from './utils/mediaUrl';

// Import routes
import cmsRoutes from './routes/cms';
import cmsAuthPagesRoutes from './routes/cms.auth-pages.routes';
import i18nRoutes from './routes/i18n';
import homepageRoutes from './routes/homepage.routes';
import adminRoutes from './routes/admin';
import appsRoutes from './routes/apps.routes';
import authRoutes from './routes/auth.routes';
import devRoutes from './routes/dev.routes';
import oauthDevRoutes from './routes/oauth.dev.routes';
import userRoutes from './routes/user';
import profileRoutes from './routes/profile.routes';
import locationRoutes from './routes/location.routes';
import settingsRoutes from './routes/settings.routes';
import commerceRoutes from './routes/commerce';
import searchRoutes from './routes/search';
import enterpriseSearchRoutes from './routes/enterpriseSearch.routes';
import discoveryV2Routes from './routes/discovery.v2.routes';
import discoveryEngineRoutes from './routes/discoveryEngine.routes';
import feedRoutes from './routes/feed';
import topicsRoutes from './routes/topics.routes';
import pipelineRoutes from './routes/pipeline.routes';
import aiRoutes from './routes/ai';
import gigRoutes from './routes/gigs';
import jobsRoutes from './routes/jobs.routes';
import freelancerRoutes from './routes/freelancer.routes';
import employerRoutes from './routes/employer.routes';
import categoriesRoutes from './routes/categories.routes';
import adminGigsJobsRoutes from './routes/admin/gigs-jobs.routes';
import walletRoutes from './routes/wallet.routes';
import escrowRoutes from './routes/escrow.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import communityRoutes from './routes/community';
import scrollRoutes from './routes/scroll.routes';
import liveRoutes from './routes/live.routes';
import postsRoutes from './routes/posts.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import contractsRoutes from './routes/contracts.routes';
import messagesRoutes from './routes/messages.routes';
import collaborationRoutes from './routes/collaboration.routes';
import trustRoutes from './routes/trust.routes';
import moderationChatRoutes from './routes/moderation.chat.routes';
import moderationAccountsRoutes from './routes/moderation.accounts.routes';
import filesRoutes from './routes/files.routes';
import { serveLegacyUploadAsset } from './controllers/filesController';
import favoritesRoutes from './routes/favorites.routes';
import cartRoutes from './routes/cart.routes';
import ordersRoutes from './routes/orders.routes';
import proposalsRoutes from './routes/proposals.routes';
import kycRoutes from './routes/kyc.routes';
import supportRoutes from './routes/support.routes';
import gcoinRoutes from './routes/gcoin.routes';
import reviewsRoutes from './routes/reviews.routes';
import paymentRoutes from './routes/payment.routes';
import currenciesRoutes from './routes/currencies.routes';
import briefsRoutes from './routes/briefs.routes';
import notificationsRoutes from './routes/notifications.routes';
import { isPushEnabled } from './services/pushNotifications';
import { dispatchMessageReceiptNotifications } from './services/messageNotifications';
import plansRoutes from './routes/plans.routes';
import formsRoutes from './routes/forms.routes';
import marketingPublicRoutes from './routes/marketing.routes';
import reactionsRoutes from './routes/reactions.routes';
import monetizationRoutes from './routes/monetization.routes';
import payoutsStripeRoutes from './routes/payouts.stripe.routes';
import preloaderRoutes from './routes/preloader.routes';
import publicDeveloperRoutes from './routes/public.developer.routes';
import publicV1Routes from './routes/public.v1.routes';
import adminPreloadersRoutes from './routes/admin/preloaders.routes';
import recoRoutes from './routes/reco.routes';
import professionalDiscoveryRoutes from './routes/professionalDiscovery.routes';
import intelligenceFeedbackRoutes from './routes/intelligenceFeedback.routes';
import scrolithaRoutes from './routes/scrolitha.routes';
import phase3Routes from './routes/phase3.routes';
import procurementRoutes from './routes/procurement.routes';
import ecosystemRoutes from './routes/ecosystem.routes';
import integrationsRoutes from './routes/integrations.routes';
import insightsRoutes from './routes/insights.routes';
import { dispatchQueuedWebhookDeliveries, getTalentCloudSettings } from './services/talentCloud.service';
import { authMiddleware } from './middleware/auth.middleware';
import { adminMiddleware } from './middleware/admin.middleware';
import { maintenanceModeMiddleware } from './middleware/maintenance.middleware';
import {
  createRuntimeOptimizationMiddlewareBundle,
  resolveStaticAssetCacheControl
} from './middleware/runtimeOptimization.middleware';
import {
  DEFAULT_RUNTIME_OPTIMIZATION_CONFIG,
  normalizeRuntimeOptimizationConfig,
  RuntimeOptimizationConfig
} from './services/runtimeOptimization.service';
// Import community admin controllers so we can mount explicit admin config endpoints
import { getAdminConfig, updateAdminConfig } from './controllers/community.admin.controller';
import { handleStripeWalletWebhook } from './controllers/walletFunding.controller';
import cron from 'node-cron';
import { reconcileAdPayments } from './scripts/reconcileAdPayments';
import { registerInsightsJobs } from './modules/insights/jobs/insights.jobs';
import { registerFxJobs } from './services/fx.service';
import { startDemoAutomationScheduler } from './services/systemDemoAccounts.service';
import { clientResumeReviewRoutes, freelancerResumeRoutes, resumePublicRoutes } from './modules/resume/resume.routes';
import fxAdminRoutes from './routes/admin/fx.routes';
import { insightsActionTrackerMiddleware } from './modules/insights/realtime/insights.tracker.middleware';
import {
  getOrCreateMessengerVoiceConfig,
  isMessengerVoiceSchemaMissingError,
  isVoiceBlockedForUser,
  MAX_MESSENGER_VOICE_PARTICIPANTS
} from './services/messengerVoice.service';
import { appendLiveDiagnosticsEvent } from './services/liveDiagnostics.service';
import {
  recordPresenceLease,
  recordRealtimeEventDelivery,
  recordRealtimeIncident,
  recordRealtimeSocketConnected,
  recordRealtimeSocketDisconnected,
  touchRealtimeSocketRooms,
  releasePresenceLease
} from './services/realtimeOps.service';
// Restart trigger comment (no-op) to force ts-node-dev reload when modified during debugging


// Validate environment early and warn about missing values
validateEnv();
// Initialize Firebase Admin (if configured) so push is ready at boot.
isPushEnabled();

const isDevelopment = process.env.NODE_ENV !== 'production';
const apiRequestLoggingEnabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.API_REQUEST_LOGGING ?? (isDevelopment ? 'true' : 'false')).toLowerCase()
);
const apiRateLimitWindowMs = Math.max(
  60_000,
  Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
);
const apiRateLimitMaxAnonymous = Math.max(
  100,
  Number(process.env.API_RATE_LIMIT_MAX_ANON || (isDevelopment ? 10_000 : 1_000))
);
const apiRateLimitMaxAuthenticated = Math.max(
  apiRateLimitMaxAnonymous,
  Number(process.env.API_RATE_LIMIT_MAX_AUTH || (isDevelopment ? 10_000 : 4_000))
);
const corsMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const corsMaxAgeSeconds = Math.max(
  300,
  Number(process.env.CORS_MAX_AGE_SECONDS || 86400)
);
const normalizeOrigin = (value: string | undefined | null): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '').toLowerCase();
};
const parseAllowedOrigins = (raw: string | undefined | null): string[] =>
  String(raw || '')
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
const allowedOrigins = new Set<string>(
  [
    process.env.FRONTEND_URL,
    process.env.PUBLIC_APP_URL,
    ...parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
    'https://scrolith-frontend-ui2ik4yg6q-uc.a.run.app',
    'https://scrolitha-ui-8f10d0bf-fix1---scrolith-frontend-ui2ik4yg6q-uc.a.run.app',
    'https://scrolith.com',
    'https://www.scrolith.com',
    'https://m.scrolith.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1',
    'capacitor://localhost',
    'ionic://localhost'
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
);
const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (isDevelopment) return true;
  return allowedOrigins.has(normalizeOrigin(origin));
};
const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  try {
    if (isAllowedOrigin(origin)) return callback(null, true);
    // Do not throw an error for disallowed origins; signal disallowed by returning false.
    // Returning an Error here caused Express to treat CORS rejections as server errors (500).
    return callback(null, false);
  } catch (error) {
    console.warn('[CORS] Origin validation error:', error);
    return callback(null, false);
  }
};
const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: corsMethods,
  maxAge: corsMaxAgeSeconds,
  optionsSuccessStatus: 204
};

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('etag', 'strong');

const OPTIMIZATION_CONFIG_REFRESH_MS = 15_000;
let runtimeOptimizationConfig: RuntimeOptimizationConfig = {
  ...DEFAULT_RUNTIME_OPTIMIZATION_CONFIG
};
let optimizationConfigLoadedAt = 0;
let optimizationConfigLoadPromise: Promise<void> | null = null;
let lastRuntimeSystemSettingsVersion = 0;

const applyOptimizationFromSystemSettings = (systemSettings: Record<string, any> | null | undefined) => {
  const normalized = normalizeRuntimeOptimizationConfig(systemSettings?.optimization);
  runtimeOptimizationConfig = normalized;
  optimizationConfigLoadedAt = Date.now();
  app.set('runtime:optimizationConfig', normalized);
};

const syncOptimizationFromRuntimeSettings = () => {
  const versionRaw = app.get('runtime:systemSettingsVersion');
  const version = Number(versionRaw || 0);
  if (!Number.isFinite(version) || version <= 0 || version === lastRuntimeSystemSettingsVersion) return false;
  lastRuntimeSystemSettingsVersion = version;
  const runtimeSystem = app.get('runtime:systemSettings') as Record<string, any> | undefined;
  if (runtimeSystem && typeof runtimeSystem === 'object') {
    applyOptimizationFromSystemSettings(runtimeSystem);
    return true;
  }
  return false;
};

const loadOptimizationConfigFromDatabase = async () => {
  try {
    const row = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data = (row?.data || {}) as Record<string, any>;
    applyOptimizationFromSystemSettings(data);
    if (row?.data) {
      app.set('runtime:systemSettings', data);
      app.set('runtime:systemSettingsVersion', Date.now());
    }
  } catch (error) {
    console.warn('[optimization] Failed to load optimization config from DB:', error);
  }
};

const refreshOptimizationConfigIfNeeded = (force = false) => {
  if (!force && syncOptimizationFromRuntimeSettings()) return;
  if (!force && Date.now() - optimizationConfigLoadedAt < OPTIMIZATION_CONFIG_REFRESH_MS) return;
  if (optimizationConfigLoadPromise) return;
  optimizationConfigLoadPromise = loadOptimizationConfigFromDatabase()
    .catch((error) => {
      console.warn('[optimization] refresh failed:', error);
    })
    .finally(() => {
      optimizationConfigLoadPromise = null;
    });
};

const getRuntimeOptimizationConfig = (): RuntimeOptimizationConfig => {
  syncOptimizationFromRuntimeSettings();
  refreshOptimizationConfigIfNeeded(false);
  return runtimeOptimizationConfig;
};

refreshOptimizationConfigIfNeeded(true);

// IMPORTANT: Enhanced Socket.io configuration
const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  serveClient: false,
  connectTimeout: 45000,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true, // For compatibility with older clients
  maxHttpBufferSize: 1e8,
  httpCompression: false,
  perMessageDeflate: false,
  cleanupEmptyChildNamespaces: true,
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: false,
    sameSite: 'lax'
  }
});

const releaseSocketRequest = (socket: any) => {
  try {
    if (socket?.conn && 'request' in socket.conn) {
      socket.conn.request = null;
    }
  } catch {}
  try {
    if (socket && 'request' in socket) {
      socket.request = undefined;
    }
  } catch {}
};

// Create a community-specific namespace so frontend and backend can subscribe to community events
const communityNs = io.of('/community');
const presenceCounts = new Map<string, number>();
const communityUserSockets = new Map<string, Set<string>>();
const MESSAGE_TYPING_EVENT_DEBOUNCE_MS = Math.max(
  250,
  Number(process.env.MESSAGE_TYPING_EVENT_DEBOUNCE_MS || 600)
);
const MESSAGE_TYPING_PARTICIPANT_CACHE_MS = Math.max(
  2_000,
  Number(process.env.MESSAGE_TYPING_PARTICIPANT_CACHE_MS || 15_000)
);
const typingConversationParticipantCache = new Map<
  string,
  { participantIds: string[]; expiresAt: number }
>();
const typingEventDedupCache = new Map<string, number>();
const isMessagesTraceEnabled = () =>
  ['1', 'true', 'yes', 'on'].includes(String(process.env.MESSAGES_TRACE_DEBUG || '').toLowerCase());
const traceMessages = (event: string, payload?: Record<string, any>) => {
  if (!isMessagesTraceEnabled()) return;
  try {
    console.log('[messages-trace]', JSON.stringify({ event, timestamp: new Date().toISOString(), ...(payload || {}) }));
  } catch {
    console.log('[messages-trace]', event, payload || {});
  }
};

const pruneTypingConversationParticipantCache = (now = Date.now()) => {
  if (typingConversationParticipantCache.size < 500) return;
  for (const [key, entry] of typingConversationParticipantCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      typingConversationParticipantCache.delete(key);
    }
  }
};

const pruneTypingEventDedupCache = (now = Date.now()) => {
  if (typingEventDedupCache.size < 2000) return;
  for (const [key, timestamp] of typingEventDedupCache.entries()) {
    if (now - timestamp > MESSAGE_TYPING_EVENT_DEBOUNCE_MS * 6) {
      typingEventDedupCache.delete(key);
    }
  }
};

const resolveTypingConversationParticipantIds = async (conversationId: string) => {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) return [] as string[];

  const now = Date.now();
  const cached = typingConversationParticipantCache.get(normalizedConversationId);
  if (cached && cached.expiresAt > now) {
    return cached.participantIds;
  }

  pruneTypingConversationParticipantCache(now);

  const conversation = await prisma.conversation.findUnique({
    where: { id: normalizedConversationId },
    select: {
      participants: {
        select: {
          userId: true,
          deletedAt: true
        }
      }
    }
  });

  const participantIds = Array.isArray(conversation?.participants)
    ? conversation.participants
        .filter((entry) => !entry.deletedAt)
        .map((entry) => String(entry.userId || '').trim())
        .filter(Boolean)
    : [];

  typingConversationParticipantCache.set(normalizedConversationId, {
    participantIds,
    expiresAt: now + MESSAGE_TYPING_PARTICIPANT_CACHE_MS
  });

  return participantIds;
};

const shouldEmitTypingEvent = (conversationId: string, userId: string, isTyping: boolean) => {
  const normalizedConversationId = String(conversationId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedConversationId || !normalizedUserId) return false;

  const now = Date.now();
  pruneTypingEventDedupCache(now);

  const eventKey = `${normalizedConversationId}:${normalizedUserId}:${isTyping ? '1' : '0'}`;
  const previous = typingEventDedupCache.get(eventKey) || 0;
  if (now - previous < MESSAGE_TYPING_EVENT_DEBOUNCE_MS) {
    return false;
  }

  typingEventDedupCache.set(eventKey, now);
  typingEventDedupCache.delete(
    `${normalizedConversationId}:${normalizedUserId}:${isTyping ? '0' : '1'}`
  );
  return true;
};

const emitPresenceUpdate = (userId: string, isOnline: boolean, lastSeenAt?: Date) => {
  const run = async () => {
    try {
      const payload = {
        userId,
        isOnline,
        lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : undefined
      };
      // Always deliver authoritative self presence to the owner.
      communityNs.to(`community:user:${userId}`).emit('presence:update', payload);
      communityNs.to(`community:user:${userId}`).emit('presence:updated', payload);

      // Phase 22.3B — global fan-out only when online visibility is EVERYONE.
      // CONTACTS/NOBODY: peers resolve via privacy-aware batch APIs (no live leak).
      let onlineAudience = 'EVERYONE';
      let lastSeenAudience = 'EVERYONE';
      try {
        const { getMessagingPrivacySettings } = require('./services/messaging/messagingPrivacyPolicy');
        const privacy = await getMessagingPrivacySettings(userId);
        onlineAudience = privacy.onlineStatusVisibility || 'EVERYONE';
        lastSeenAudience = privacy.lastSeenVisibility || 'EVERYONE';
      } catch {
        /* defaults */
      }

      if (onlineAudience === 'EVERYONE') {
        const publicPayload = {
          ...payload,
          lastSeenAt:
            lastSeenAudience === 'EVERYONE' ? payload.lastSeenAt : undefined
        };
        ['community:global', 'community:admin'].forEach((room) => {
          communityNs.to(room).emit('presence:update', publicPayload);
          communityNs.to(room).emit('presence:updated', publicPayload);
        });
      } else {
        // Privacy-safe stub so clients clear stale "online" without disclosing real state
        const hidden = {
          userId,
          isOnline: false,
          state: 'offline',
          lastSeenAt: null,
          presenceHidden: true
        };
        communityNs.to('community:global').emit('presence:updated', hidden);
      }

      void recordRealtimeEventDelivery({
        namespace: 'community',
        roomKey: 'presence:broadcast',
        eventName: 'presence:updated',
        targetCount: onlineAudience === 'EVERYONE' ? 3 : 2,
        payload:
          onlineAudience === 'EVERYONE'
            ? payload
            : { userId, presenceHidden: true },
        triggeredBy: 'runtime'
      });
    } catch (e) {
      console.warn('Failed to emit presence update', e);
    }
  };
  void run();
};

const registerCommunityUserSocket = (userId: string, socketId: string) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedSocketId = String(socketId || '').trim();
  if (!normalizedUserId || !normalizedSocketId) return;
  const sockets = communityUserSockets.get(normalizedUserId) || new Set<string>();
  sockets.add(normalizedSocketId);
  communityUserSockets.set(normalizedUserId, sockets);
};

const unregisterCommunityUserSocket = (userId: string, socketId: string) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedSocketId = String(socketId || '').trim();
  if (!normalizedUserId || !normalizedSocketId) return;
  const sockets = communityUserSockets.get(normalizedUserId);
  if (!sockets) return;
  sockets.delete(normalizedSocketId);
  if (!sockets.size) {
    communityUserSockets.delete(normalizedUserId);
  }
};

const emitToCommunityUserSockets = (userId: string, event: string, payload: Record<string, any>) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return 0;
  const socketIds = Array.from(communityUserSockets.get(normalizedUserId) || []);
  if (!socketIds.length) return 0;
  socketIds.forEach((socketId) => {
    communityNs.to(socketId).emit(event, payload);
  });
  return socketIds.length;
};

const markPresenceOnline = async (userId: string) => {
  if (!userId) return;
  const count = (presenceCounts.get(userId) || 0) + 1;
  presenceCounts.set(userId, count);
  // Phase 22.3 — dual-write to Redis-ready presence store
  try {
    const { presenceStore } = require('./services/messaging/presenceStore');
    presenceStore.markConnect(userId, new Date());
  } catch {
    /* optional module */
  }
  if (count === 1) {
    const lastSeenAt = new Date();
    try {
      await prisma.user.update({ where: { id: userId }, data: { isOnline: true, lastSeenAt } });
    } catch (e) {
      console.warn('Failed to mark user online', e);
    }
    emitPresenceUpdate(userId, true, lastSeenAt);
  }
};

const markPresenceOffline = async (userId: string) => {
  if (!userId) return;
  const current = presenceCounts.get(userId) || 0;
  try {
    const { presenceStore } = require('./services/messaging/presenceStore');
    presenceStore.markDisconnect(userId, new Date());
  } catch {
    /* optional */
  }
  if (current <= 1) {
    presenceCounts.delete(userId);
    const lastSeenAt = new Date();
    try {
      await prisma.user.update({ where: { id: userId }, data: { isOnline: false, lastSeenAt } });
    } catch (e) {
      console.warn('Failed to mark user offline', e);
    }
    emitPresenceUpdate(userId, false, lastSeenAt);
  } else {
    presenceCounts.set(userId, current - 1);
  }
};

const VOICE_CALL_INITIATE_LIMIT = 8;
const VOICE_CALL_INITIATE_WINDOW_MS = 60_000;
const voiceCallInitiationBuckets = new Map<string, number[]>();
const VOICE_CALL_RING_TIMEOUT_MS = Math.max(15_000, Number(process.env.VOICE_CALL_RING_TIMEOUT_MS || 30_000));
const VOICE_CALL_RING_SWEEP_MS = Math.max(5_000, Number(process.env.VOICE_CALL_RING_SWEEP_MS || 10_000));
const VOICE_CALL_ACTIVE_STATUSES = ['INITIATED', 'RINGING', 'ACTIVE'];
const VOICE_CALL_BUSY_PARTICIPANT_STATUSES = ['INVITED', 'JOINED'];
let voiceCallSweepBusy = false;
let voiceCallSchemaMissingWarned = false;

const isVoiceCallInitiationRateLimited = (userId: string) => {
  const now = Date.now();
  const key = String(userId || '').trim();
  if (!key) return true;
  const bucket = Array.isArray(voiceCallInitiationBuckets.get(key))
    ? [...(voiceCallInitiationBuckets.get(key) as number[])]
    : [];
  const active = bucket.filter((timestamp) => now - timestamp <= VOICE_CALL_INITIATE_WINDOW_MS);
  if (active.length >= VOICE_CALL_INITIATE_LIMIT) {
    voiceCallInitiationBuckets.set(key, active);
    return true;
  }
  active.push(now);
  voiceCallInitiationBuckets.set(key, active);
  return false;
};

const toUniqueIds = (input: any): string[] => {
  const source = Array.isArray(input)
    ? input
    : Array.isArray(input?.participants)
      ? input.participants
      : [];
  return Array.from(
    new Set(
      source
        .map((entry: any) => {
          if (typeof entry === 'string') return entry.trim();
          if (entry && typeof entry === 'object') return String(entry.id || entry.userId || '').trim();
          return '';
        })
        .filter(Boolean)
    )
  );
};

const emitVoiceEventToUsers = (userIds: string[], event: string, payload: Record<string, any>) => {
  userIds.forEach((id) => {
    communityNs.to(`community:user:${id}`).emit(event, payload);
  });
};

const resolveSocketUserId = (socket: any) => String(socket?.data?.user?.id || '').trim();
const resolveSocketRole = (socket: any) => String(socket?.data?.user?.role || '').trim().toLowerCase();
const isAdminRoleValue = (role: string) =>
  role.includes('admin') || role.includes('moderator') || role.includes('superadmin');

const authenticateSocketFromHandshake = async (socket: any) => {
  const hs = socket.handshake as any;
  const tokenRaw = (hs.auth && hs.auth.token) || (hs.query && hs.query.token) || '';
  const token = tokenRaw && tokenRaw.toString().startsWith('Bearer ')
    ? tokenRaw.toString().slice('Bearer '.length)
    : tokenRaw;
  if (!token) return null;

  const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
  const decoded = jwt.verify(token, secret) as any;
  if (!decoded || !decoded.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: { id: true, email: true, role: true, isActive: true }
  });
  if (!user || !user.isActive) return null;

  (socket as any).data = (socket as any).data || {};
  (socket as any).data.user = { id: user.id, role: user.role, email: user.email };
  return (socket as any).data.user;
};
const toVoiceSocketError = (error: any, fallbackMessage: string) => {
  if (isMessengerVoiceSchemaMissingError(error)) {
    return {
      success: false,
      error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
      code: 'MESSENGER_VOICE_SCHEMA_MISSING'
    };
  }
  return {
    success: false,
    error: String(error?.message || fallbackMessage)
  };
};

const resolveVoiceParticipantLimit = (config: any) => {
  const configured = Number(config?.maxParticipants || MAX_MESSENGER_VOICE_PARTICIPANTS);
  if (!Number.isFinite(configured)) return MAX_MESSENGER_VOICE_PARTICIPANTS;
  return Math.max(2, Math.min(MAX_MESSENGER_VOICE_PARTICIPANTS, Math.trunc(configured)));
};

const formatCallDuration = (durationMs: number) => {
  const normalized = Math.max(0, Math.trunc(Number(durationMs || 0)));
  if (!normalized) return '0s';
  const totalSeconds = Math.max(1, Math.round(normalized / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && !minutes) parts.push(`${seconds}s`);
  if (hours && seconds) parts.push(`${seconds}s`);
  return parts.join(' ');
};

const resolveVoiceCallDurationMs = (call: any, endedAt?: Date | null) => {
  const start = call?.startedAt || call?.createdAt;
  const end = endedAt || call?.endedAt || new Date();
  if (!start || !end) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.max(0, endMs - startMs);
};

const buildCallSummaryText = (status: string, details?: { durationMs?: number; participantCount?: number; userName?: string }) => {
  const normalized = String(status || '').trim().toLowerCase();
  const durationMs = Math.max(0, Math.trunc(Number(details?.durationMs || 0)));
  const participantCount = Math.max(0, Math.trunc(Number(details?.participantCount || 0)));
  if (normalized === 'ended') {
    const durationLabel = formatCallDuration(durationMs);
    const participantLabel = participantCount > 1 ? ` · ${participantCount} participants` : '';
    return `Call ended · ${durationLabel}${participantLabel}`;
  }
  if (normalized === 'missed') return 'Missed call';
  if (normalized === 'rejected') return `${details?.userName || 'Participant'} declined the call`;
  if (normalized === 'failed') return 'Call failed';
  if (normalized === 'cancelled') return 'Call cancelled';
  return 'Voice call update';
};

const emitMessagePayloadToUsers = (
  conversation: any,
  senderId: string,
  payload: Record<string, any>
) => {
  const receiverIds = Array.isArray(conversation?.participants)
    ? conversation.participants
        .map((entry: any) => String(entry?.userId || '').trim())
        .filter((id: string) => Boolean(id) && id !== senderId)
    : [];
  receiverIds.forEach((id: string) => emitVoiceEventToUsers([id], 'messages:new', payload));
  emitVoiceEventToUsers([senderId], 'messages:sent', payload);
  void dispatchMessageReceiptNotifications({
    receiverIds,
    senderId,
    conversationId: String(payload?.conversationId || payload?.conversation_id || conversation?.id || '').trim(),
    messageId: String(payload?.id || payload?.messageId || '').trim(),
    preview: payload?.text,
    fallbackPreview: 'Voice call update',
    messageType: payload?.messageType || payload?.message_type || 'system'
  }).catch((notifyError) => {
    console.warn('[voice-calls] failed to send message notifications', notifyError);
  });
};

const persistVoiceCallSummaryMessage = async (params: {
  conversationId: string;
  senderId: string;
  callId: string;
  status: string;
  text: string;
  durationMs?: number;
  participantCount?: number;
  metadata?: Record<string, any>;
}) => {
  const conversationId = String(params.conversationId || '').trim();
  const senderId = String(params.senderId || '').trim();
  if (!conversationId || !senderId) return;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true }
  });
  if (!conversation) return;

  const participantIds = Array.isArray(conversation.participants)
    ? conversation.participants.map((entry: any) => String(entry?.userId || '').trim()).filter(Boolean)
    : [];
  if (!participantIds.includes(senderId)) return;

  const metadata = {
    voiceCall: {
      callId: String(params.callId || '').trim() || null,
      status: String(params.status || '').trim().toLowerCase() || 'ended',
      durationMs: Math.max(0, Math.trunc(Number(params.durationMs || 0))),
      participantCount: Math.max(0, Math.trunc(Number(params.participantCount || 0))),
      ...(params.metadata || {})
    }
  };

  const message = await prisma.directMessage.create({
    data: {
      conversationId,
      senderId,
      text: String(params.text || '').trim() || 'Voice call update',
      messageType: 'SYSTEM' as any,
      isSystem: true,
      metadata,
      attachments: []
    },
    include: { reactions: true }
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: message.text,
      lastMessageAt: message.createdAt,
      lastMessageSenderId: senderId
    }
  });

  const receiverId =
    String(conversation?.type || '').toUpperCase() === 'DIRECT'
      ? participantIds.find((id: string) => id !== senderId) || ''
      : '';

  const payload = {
    id: message.id,
    conversation_id: conversationId,
    conversationId,
    sender_id: senderId,
    senderId,
    receiver_id: receiverId,
    receiverId,
    text: message.text,
    timestamp: message.createdAt ? message.createdAt.toISOString() : new Date().toISOString(),
    is_read: false,
    isRead: false,
    message_type: 'system',
    messageType: 'system',
    metadata,
    voice_note: null,
    voiceNote: null,
    attachments: [],
    attachment_ids: [],
    reactions: []
  };

  emitMessagePayloadToUsers(conversation, senderId, payload);
};

const findBusyCallParticipant = async (userIds: string[], excludeCallId?: string) => {
  const ids = Array.from(new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return null;
  return (prisma as any).voiceCallParticipant.findFirst({
    where: {
      userId: { in: ids },
      status: { in: VOICE_CALL_BUSY_PARTICIPANT_STATUSES },
      call: {
        status: { in: ['RINGING', 'ACTIVE'] },
        ...(excludeCallId ? { id: { not: excludeCallId } } : {})
      }
    },
    include: {
      call: {
        select: {
          id: true,
          conversationId: true,
          status: true,
          callType: true
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          username: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });
};

const resolveParticipantOptionsByIds = async (userIds: string[]) => {
  const ids = Array.from(new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return [] as Array<{ id: string; name: string; username?: string | null; avatar?: string | null }>;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true
    }
  });
  return users.map((entry) => ({
    id: String(entry.id || ''),
    name: String(entry.name || entry.username || 'Participant'),
    username: entry.username || null,
    avatar: entry.avatar || null
  }));
};

const loadConversationForVoice = async (conversationId: string, userId: string) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true }
  });
  if (!conversation) return { conversation: null, participantIds: [] as string[] };
  const participantIds = Array.isArray(conversation.participants)
    ? conversation.participants.map((entry: any) => String(entry.userId || '').trim()).filter(Boolean)
    : [];
  if (!participantIds.includes(userId)) return { conversation: null, participantIds: [] as string[] };
  return { conversation, participantIds };
};

const loadVoiceCallForUser = async (callId: string, userId: string) => {
  const call = await (prisma as any).voiceCall.findUnique({
    where: { id: callId },
    include: {
      participants: true
    }
  });
  if (!call) return null;
  const participantIds = Array.isArray(call.participants)
    ? call.participants.map((entry: any) => String(entry.userId || '').trim()).filter(Boolean)
    : [];
  if (!participantIds.includes(userId)) return null;
  return call;
};

const markExpiredRingingCallsAsMissed = async () => {
  if (voiceCallSweepBusy) return;
  voiceCallSweepBusy = true;
  try {
    const threshold = new Date(Date.now() - VOICE_CALL_RING_TIMEOUT_MS);
    const expiredCalls = await (prisma as any).voiceCall.findMany({
      where: {
        status: 'RINGING',
        createdAt: { lte: threshold }
      },
      include: {
        participants: true
      },
      take: 100
    });

    for (const call of expiredCalls || []) {
      const endedAt = new Date();
      const finalizeResult = await (prisma as any).voiceCall.updateMany({
        where: { id: call.id, status: 'RINGING' },
        data: {
          status: 'MISSED',
          endedAt
        }
      });
      if (!Number(finalizeResult?.count || 0)) continue;

      await (prisma as any).voiceCallParticipant.updateMany({
        where: { callId: call.id, status: 'INVITED' },
        data: {
          status: 'MISSED',
          leftAt: endedAt
        }
      });

      await (prisma as any).voiceCallParticipant.updateMany({
        where: { callId: call.id, status: 'JOINED' },
        data: {
          status: 'LEFT',
          leftAt: endedAt
        }
      });

      const participantIds = Array.isArray(call?.participants)
        ? call.participants.map((entry: any) => String(entry?.userId || '').trim()).filter(Boolean)
        : [];
      if (!participantIds.length) continue;

      const payload = {
        callId: String(call.id || ''),
        conversationId: String(call.conversationId || ''),
        initiatorId: String(call.initiatorId || ''),
        status: 'missed',
        durationMs: 0,
        endedAt: endedAt.toISOString()
      };

      communityNs.to(`call:${call.id}`).emit('call:end', payload);
      emitVoiceEventToUsers(participantIds, 'call:end', payload);
      emitVoiceEventToUsers(participantIds, 'messenger:call_missed', payload);
      emitVoiceEventToUsers(participantIds, 'messenger:call_ended', payload);
      await persistVoiceCallSummaryMessage({
        conversationId: String(call.conversationId || ''),
        senderId: String(call.initiatorId || ''),
        callId: String(call.id || ''),
        status: 'missed',
        text: buildCallSummaryText('missed'),
        durationMs: 0,
        participantCount: participantIds.length
      });
    }
    voiceCallSchemaMissingWarned = false;
  } catch (error) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      if (!voiceCallSchemaMissingWarned) {
        console.warn('[messenger-voice] voice call sweep skipped because schema is missing');
        voiceCallSchemaMissingWarned = true;
      }
    } else {
      console.error('voice call sweep error', error);
    }
  } finally {
    voiceCallSweepBusy = false;
  }
};

communityNs.use(async (socket, next) => {
  try {
    await authenticateSocketFromHandshake(socket);
    return next();
  } catch (error) {
    console.warn('communityNs JWT verify failed:', (error as any)?.message ?? String(error));
    return next(new Error('unauthorized'));
  }
});

communityNs.on('connection', (socket) => {
  console.log('Client connected to /community namespace', { id: socket.id, handshake: socket.handshake.query });
  traceMessages('socket.connected', {
    socketId: socket.id,
    userId: (socket as any).data?.user?.id || null,
    role: (socket as any).data?.user?.role || null
  });
  const normalizeRole = (value: any) => String(value || '').toLowerCase();
  const syncRealtimeRooms = () => {
    const rooms = Array.from(socket.rooms.values()).filter((room) => room !== socket.id);
    void touchRealtimeSocketRooms(socket.id, rooms);
    const presenceUserId = String((socket as any).data?.presenceUserId || '').trim();
    if (presenceUserId) {
      void recordPresenceLease({
        socketId: socket.id,
        userId: presenceUserId,
        namespace: 'community',
        rooms,
        metadata: {
          role: (socket as any).data?.user?.role || null,
          transport: socket.conn?.transport?.name || null
        }
      });
    }
  };
  const joinCommunityRooms = (requested: string, isAdmin: boolean) => {
    socket.join(`community:user:${requested}`);
    socket.join('community:global');
    socket.join('community:ads');
    socket.join(`wallet:${requested}`);
    socket.join(requested);
    if (isAdmin) socket.join('community:admin');
  };

  const identity = String((socket as any).data?.user?.id || '').trim();
  if (identity) {
    registerCommunityUserSocket(identity, socket.id);
  }

  // Auto-join stable per-user rooms to avoid race conditions when clients emit join events
  // immediately after connect.
  try {
    const requested = String((socket.handshake as any)?.query?.userId || '').trim();
    const identity = String((socket as any).data?.user?.id || '').trim();
    const tokenRole = normalizeRole((socket as any).data?.user?.role);
    const roleHint = normalizeRole((socket.handshake as any)?.query?.role);
    const isAdmin = tokenRole.includes('admin') || roleHint.includes('admin');
    const allowDevJoin = process.env.NODE_ENV === 'development' && !identity;
    if (requested && (identity === requested || allowDevJoin)) {
      joinCommunityRooms(requested, isAdmin);
      socket.emit('joined', {
        auto: true,
        rooms: ['community:global', 'community:ads', `community:user:${requested}`, `wallet:${requested}`, requested]
      });
      if (identity && !(socket as any).data?.presenceMarked) {
        (socket as any).data.presenceUserId = identity;
        (socket as any).data.presenceMarked = true;
        void markPresenceOnline(identity);
      }
    }
  } catch (e) {
    console.warn('communityNs auto-join failed:', e);
  }

  void recordRealtimeSocketConnected({
    socketId: socket.id,
    namespace: 'community',
    userId: (socket as any).data?.user?.id || null,
    role: (socket as any).data?.user?.role || null,
    transport: socket.conn?.transport?.name || null,
    authSource: 'jwt',
    isAuthenticated: Boolean((socket as any).data?.user?.id),
    rooms: Array.from(socket.rooms.values()).filter((room) => room !== socket.id),
    handshakeQuery: socket.handshake.query,
    metadata: {
      address: socket.handshake.address || null,
      userAgent: String(socket.handshake.headers?.['user-agent'] || '')
    }
  });
  syncRealtimeRooms();
  communityNs.to('community:admin').emit('realtime:session_changed', {
    action: 'connected',
    namespace: 'community',
    socketId: socket.id,
    userId: (socket as any).data?.user?.id || null,
    role: (socket as any).data?.user?.role || null
  });

  releaseSocketRequest(socket);

  socket.on('handshake', (data) => {
    console.log('Community handshake:', data);
  });
  socket.on('messages:debug_trace', (payload: any) => {
    traceMessages('client.trace', {
      socketId: socket.id,
      userId: (socket as any).data?.user?.id || null,
      role: (socket as any).data?.user?.role || null,
      trace: payload || {}
    });
    const sessionId = String(payload?.sessionId || '').trim();
    if (String(payload?.channel || '').trim().toLowerCase() === 'live' && sessionId) {
      void appendLiveDiagnosticsEvent(sessionId, {
        ...(payload || {}),
        source: 'client',
        socketId: socket.id,
        userId: (socket as any).data?.user?.id || null,
        role: (socket as any).data?.user?.role || null
      }).catch(() => null);
    }
  });
  socket.on('messages:typing', (payload: any) => {
    const handleMessagesTyping = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const conversationId = String(payload?.conversationId || '').trim();
        const isTyping = Boolean(payload?.isTyping);
        if (!userId || !conversationId || !shouldEmitTypingEvent(conversationId, userId, isTyping)) return;

        const participantIds = await resolveTypingConversationParticipantIds(conversationId);
        if (!participantIds.length) return;

        const isParticipant = participantIds.includes(userId);
        if (!isParticipant) return;

        // Phase 22.3B — actor may disable sharing typing indicators
        try {
          const { getMessagingPrivacySettings } = require('./services/messaging/messagingPrivacyPolicy');
          const privacy = await getMessagingPrivacySettings(userId);
          if (privacy.typingIndicatorsEnabled === false) {
            if (isTyping) return;
          }
        } catch {
          /* optional */
        }

        let targets = participantIds.filter((participantId) => participantId !== userId);
        if (!targets.length) return;

        // Filter recipients who may receive typing events from this actor
        try {
          const { canViewerReceiveTypingEvent } = require('./services/messaging/messagingPrivacyPolicy');
          const allowed: string[] = [];
          for (const targetUserId of targets) {
            if (await canViewerReceiveTypingEvent(targetUserId, userId, conversationId)) {
              allowed.push(targetUserId);
            }
          }
          targets = allowed;
        } catch {
          /* optional */
        }
        if (!targets.length) return;

        const providedName = String(payload?.name || '').trim();
        const fallbackName = String((socket as any).data?.user?.email || 'Someone')
          .split('@')[0]
          .trim();
        const typingPayload = {
          conversationId,
          userId,
          name: providedName || fallbackName || 'Someone',
          isTyping,
          at: new Date().toISOString()
        };

        targets.forEach((targetUserId) => {
          communityNs.to(`community:user:${targetUserId}`).emit('messages:typing', typingPayload);
        });
        void recordRealtimeEventDelivery({
          namespace: 'community',
          roomKey: `conversation:${conversationId}`,
          eventName: 'messages:typing',
          targetCount: targets.length,
          payload: {
            ...typingPayload,
            targets
          },
          triggeredBy: 'runtime',
          persist: false
        });
        traceMessages('socket.messages_typing', {
          socketId: socket.id,
          userId,
          conversationId,
          isTyping: typingPayload.isTyping,
          targets
        });
      } catch (error) {
        console.error('messages:typing error (community ns):', error);
      }
    };
    void handleMessagesTyping();
  });

  // Phase 22.3 — presence heartbeat (ephemeral; throttled client-side)
  socket.on('presence:heartbeat', (payload: any) => {
    const handleHeartbeat = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        if (!userId) return;
        const { presenceStore } = require('./services/messaging/presenceStore');
        const record = presenceStore.touchHeartbeat(userId, new Date());
        const state = String(payload?.state || record.state || 'online');
        const out = {
          userId,
          isOnline: state !== 'offline',
          state,
          lastSeenAt: record.lastSeenAt,
          lastHeartbeatAt: record.lastHeartbeatAt
        };
        // Owner always receives self heartbeat
        communityNs.to(`community:user:${userId}`).emit('presence:updated', out);

        // Phase 22.3B — restrict global heartbeat fan-out by privacy
        let allowGlobal = true;
        try {
          const { getMessagingPrivacySettings } = require('./services/messaging/messagingPrivacyPolicy');
          const privacy = await getMessagingPrivacySettings(userId);
          if (
            privacy.onlineStatusVisibility === 'NOBODY' ||
            privacy.onlineStatusVisibility === 'CONTACTS'
          ) {
            allowGlobal = false;
          }
        } catch {
          allowGlobal = true;
        }
        if (allowGlobal) {
          communityNs.to('community:global').emit('presence:updated', out);
        }
      } catch (error) {
        console.error('presence:heartbeat error:', error);
      }
    };
    void handleHeartbeat();
  });

  // Phase 22.3 — recording indicator (voice note), reuses typing fan-out path
  socket.on('messages:recording', (payload: any) => {
    const handleRecording = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const conversationId = String(payload?.conversationId || '').trim();
        const isRecording = Boolean(payload?.isRecording);
        if (!userId || !conversationId) return;
        if (!shouldEmitTypingEvent(conversationId, userId, isRecording)) return;
        const participantIds = await resolveTypingConversationParticipantIds(conversationId);
        if (!participantIds.includes(userId)) return;
        try {
          const { getMessagingPrivacySettings } = require('./services/messaging/messagingPrivacyPolicy');
          const privacy = await getMessagingPrivacySettings(userId);
          if (privacy.recordingIndicatorsEnabled === false && isRecording) return;
        } catch {
          /* optional */
        }
        let targets = participantIds.filter((id) => id !== userId);
        try {
          const { canViewerReceiveRecordingEvent } = require('./services/messaging/messagingPrivacyPolicy');
          const allowed: string[] = [];
          for (const targetUserId of targets) {
            if (await canViewerReceiveRecordingEvent(targetUserId, userId, conversationId)) {
              allowed.push(targetUserId);
            }
          }
          targets = allowed;
        } catch {
          /* optional */
        }
        const providedName = String(payload?.name || '').trim();
        const fallbackName = String((socket as any).data?.user?.email || 'Someone')
          .split('@')[0]
          .trim();
        const recordingPayload = {
          conversationId,
          userId,
          name: providedName || fallbackName || 'Someone',
          isRecording,
          at: new Date().toISOString()
        };
        targets.forEach((targetUserId) => {
          communityNs.to(`community:user:${targetUserId}`).emit('messages:recording', recordingPayload);
        });
      } catch (error) {
        console.error('messages:recording error:', error);
      }
    };
    void handleRecording();
  });

  socket.on('community:join', (payload: { userId: string }) => {
    const handleJoin = () => {
      try {
        const requested = payload?.userId;
        const identity = (socket as any).data?.user?.id || null;
        const role = normalizeRole((socket as any).data?.user?.role);
        const roleHint = normalizeRole((socket.handshake as any)?.query?.role);
        const isAdmin = role.includes('admin') || roleHint.includes('admin');
        if (!requested) { socket.emit('error', { code: 'MISSING_USERID', message: 'userId required' }); return; }
        const allowDevJoin = process.env.NODE_ENV === 'development' && !identity;
        if (identity !== requested && !isAdmin && !allowDevJoin) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join user room' });
          return;
        }
        joinCommunityRooms(requested, isAdmin);
        socket.emit('joined', {
          rooms: ['community:global', 'community:ads', `community:user:${requested}`, `wallet:${requested}`, requested]
        });
        if (identity && identity === requested && !(socket as any).data?.presenceMarked) {
          (socket as any).data.presenceUserId = identity;
          (socket as any).data.presenceMarked = true;
          void markPresenceOnline(identity);
        }
        syncRealtimeRooms();
      } catch (e) {
        console.error('community:join error (community ns):', e);
      }
    };
    handleJoin();
  });
  // Also allow listening sockets in /community to perform room joins so they receive targeted emits
  socket.on('join:wallet', (payload: { userId: string }) => {
    const handleJoinWallet = async (pl: { userId: string }): Promise<void> => {
      try {
        console.log(`communityNs join:wallet invoked for socket ${socket.id}`, { payload: pl, user: (socket as any).data?.user });
        const requested = pl?.userId;
        const identity = (socket as any).data?.user?.id || null;
        if (!requested) { socket.emit('error', { code: 'MISSING_USERID', message: 'userId required' }); return; }
        const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
        if (identity === requested || process.env.NODE_ENV === 'development' || allowTestJoins) {
          socket.join(`wallet:${requested}`);
          socket.join(requested);
          socket.emit('joined', { room: `wallet:${requested}` });
          console.log(`Socket ${socket.id} joined wallet:${requested}`);
          syncRealtimeRooms();
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join wallet room' });
        }
      } catch (e) {
        console.error('join:wallet error (community ns):', e);
      }
      return;
    };
    void handleJoinWallet(payload);
  });

  socket.on('join:post', (payload: { postId: string }) => {
    const handleJoinPost = async (pl: { postId: string }): Promise<void> => {
      try {
        console.log(`communityNs join:post invoked for socket ${socket.id}`, { payload: pl, user: (socket as any).data?.user });
        const postId = pl?.postId;
        if (!postId) { socket.emit('error', { code: 'MISSING_POSTID', message: 'postId required' }); return; }
        const identity = (socket as any).data?.user?.id || null;
        const post = await prisma.communityPost.findUnique({
          where: { id: postId },
          select: { authorId: true, status: true }
        });
        if (!post) { socket.emit('error', { code: 'NOT_FOUND', message: 'Post not found' }); return; }
        const isOwner = identity && post.authorId === identity;
        const isPublic = (post.status || 'active') === 'active';
        const role = (socket as any).data?.user?.role || '';
        const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
        const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development' || allowTestJoins;
        if (isOwner || isPublic || isAdmin) {
          socket.join(`post:${postId}`);
          socket.emit('joined', { room: `post:${postId}` });
          console.log(`Socket ${socket.id} joined post:${postId}`);
          syncRealtimeRooms();
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join post room' });
        }
      } catch (e) {
        console.error('join:post error (community ns):', e);
      }
      return;
    };
    void handleJoinPost(payload);
  });

  socket.on('join:ad', (payload: { adId: string }) => {
    const handleJoinAd = async (pl: { adId: string }): Promise<void> => {
      try {
        console.log(`communityNs join:ad invoked for socket ${socket.id}`, { payload: pl, user: (socket as any).data?.user });
        const adId = pl?.adId;
        if (!adId) { socket.emit('error', { code: 'MISSING_ADID', message: 'AdId required' }); return; }
        const identity = (socket as any).data?.user?.id || null;
        const ad = await prisma.communityAd.findUnique({
          where: { id: adId },
          select: { creatorId: true, status: true }
        });
        if (!ad) { socket.emit('error', { code: 'NOT_FOUND', message: 'Ad not found' }); return; }
        const isOwner = identity && ad.creatorId === identity;
        const isActive = (ad.status || '').toString().toUpperCase() === 'ACTIVE';
        const role = (socket as any).data?.user?.role || '';
        const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development';
        if (isOwner || isActive || isAdmin) {
          socket.join(`ad:${adId}`);
          socket.emit('joined', { room: `ad:${adId}` });
          console.log(`Socket ${socket.id} joined ad:${adId}`);
          syncRealtimeRooms();
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join ad room' });
        }
      } catch (e) {
        console.error('join:ad error (community ns):', e);
      }
      return;
    };
    void handleJoinAd(payload);
  });

  socket.on('collaboration:join', (payload: { roomId: string }, ack?: (result: any) => void) => {
    const handleJoinCollaborationRoom = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const roomId = String(payload?.roomId || '').trim();
        if (!userId || !roomId) {
          const result = { success: false, error: 'roomId is required.' };
          if (ack) ack(result);
          else socket.emit('error', { code: 'MISSING_ROOMID', message: result.error });
          return;
        }

        const membership = await prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId: roomId,
              userId
            }
          },
          select: { id: true, deletedAt: true, conversation: { select: { type: true } } }
        });

        if (!membership?.id || membership.deletedAt || membership.conversation?.type !== 'GROUP') {
          const result = { success: false, error: 'Collaboration room not found.' };
          if (ack) ack(result);
          else socket.emit('error', { code: 'FORBIDDEN', message: result.error });
          return;
        }

        const roomName = `collaboration:room:${roomId}`;
        socket.join(roomName);
        syncRealtimeRooms();
        const result = { success: true, data: { room: roomName, roomId, userId } };
        socket.emit('joined', result.data);
        communityNs.to(roomName).emit('collaboration:presence', {
          roomId,
          userId,
          status: 'joined',
          at: new Date().toISOString()
        });
        if (ack) ack(result);
      } catch (error: any) {
        console.error('collaboration:join error', error);
        if (ack) ack({ success: false, error: error?.message || 'Unable to join collaboration room.' });
      }
    };
    void handleJoinCollaborationRoom();
  });

  socket.on('live:join', (payload: any, ack?: (result: any) => void) => {
    const handleLiveJoin = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const role = String((socket as any)?.data?.user?.role || '').toLowerCase();
        const sessionId = String(payload?.sessionId || '').trim();
        if (!userId || !sessionId) {
          if (ack) ack({ success: false, error: 'sessionId is required.' });
          return;
        }
        const session = await (prisma as any).liveSession.findUnique({
          where: { id: sessionId },
          include: {
            participants: true,
            invites: true
          }
        });
        if (!session) {
          if (ack) ack({ success: false, error: 'Livestream session not found.' });
          return;
        }
        const isAdmin = role.includes('admin') || role.includes('moderator');
        const isHost = String(session.hostUserId || '') === userId;
        const isParticipant = Array.isArray(session.participants)
          ? session.participants.some((entry: any) => String(entry.userId || '') === userId)
          : false;
        const isInvited = Array.isArray(session.invites)
          ? session.invites.some(
              (entry: any) =>
                String(entry.inviteeId || '') === userId &&
                ['PENDING', 'ACCEPTED'].includes(String(entry.status || '').toUpperCase())
            )
          : false;
        const isPrivate = String(session.visibility || 'public').toLowerCase() === 'private';
        if (isPrivate && !isAdmin && !isHost && !isParticipant && !isInvited) {
          if (ack) ack({ success: false, error: 'Session is private.' });
          return;
        }

        socket.join(`live:session:${sessionId}`);
        await (prisma as any).liveParticipant.upsert({
          where: {
            sessionId_userId: {
              sessionId,
              userId
            }
          },
          update: {
            status: 'JOINED',
            leftAt: null,
            joinedAt: new Date()
          },
          create: {
            sessionId,
            userId,
            role: isHost ? 'HOST' : 'VIEWER',
            status: 'JOINED',
            micState: true,
            cameraState: true,
            joinedAt: new Date()
          }
        });

        const activeViewerCount = await (prisma as any).liveParticipant.count({
          where: {
            sessionId,
            status: 'JOINED',
            leftAt: null
          }
        });
        const updated = await (prisma as any).liveSession.update({
          where: { id: sessionId },
          data: {
            viewerCount: activeViewerCount,
            peakViewerCount: Math.max(Number(session.peakViewerCount || 0), Number(activeViewerCount || 0))
          },
          select: {
            id: true,
            viewerCount: true,
            peakViewerCount: true
          }
        });

        const updatePayload = {
          sessionId,
          userId,
          socketId: socket.id,
          role: isHost ? 'host' : 'viewer',
          status: 'joined',
          viewerCount: Number(updated.viewerCount || 0),
          peakViewerCount: Number(updated.peakViewerCount || 0),
          emittedAt: new Date().toISOString()
        };
        traceMessages('live.join', {
          socketId: socket.id,
          sessionId,
          userId,
          role: updatePayload.role,
          viewerCount: updatePayload.viewerCount,
          peakViewerCount: updatePayload.peakViewerCount
        });
        void appendLiveDiagnosticsEvent(sessionId, {
          source: 'backend',
          stage: 'socket:join',
          severity: 'info',
          userId,
          socketId: socket.id,
          role: updatePayload.role,
          retryCount: payload?.retryCount,
          message: 'Socket joined livestream session.'
        }).catch(() => null);
        communityNs.to(`live:session:${sessionId}`).emit('live:participant_joined', updatePayload);
        communityNs.to(`live:session:${sessionId}`).emit('live:viewer_count_updated', updatePayload);
        if (ack) ack({ success: true, data: { room: `live:session:${sessionId}`, ...updatePayload } });
      } catch (error: any) {
        console.error('live:join error', error);
        if (ack) ack({ success: false, error: error?.message || 'Failed to join livestream.' });
      }
    };
    void handleLiveJoin();
  });

  socket.on('live:leave', (payload: any, ack?: (result: any) => void) => {
    const handleLiveLeave = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const sessionId = String(payload?.sessionId || '').trim();
        if (!userId || !sessionId) {
          if (ack) ack({ success: false, error: 'sessionId is required.' });
          return;
        }

        socket.leave(`live:session:${sessionId}`);
        await (prisma as any).liveParticipant.updateMany({
          where: {
            sessionId,
            userId
          },
          data: {
            status: 'LEFT',
            leftAt: new Date()
          }
        });

        const activeViewerCount = await (prisma as any).liveParticipant.count({
          where: {
            sessionId,
            status: 'JOINED',
            leftAt: null
          }
        });
        await (prisma as any).liveSession.update({
          where: { id: sessionId },
          data: { viewerCount: activeViewerCount }
        });
        const updatePayload = {
          sessionId,
          userId,
          viewerCount: Number(activeViewerCount || 0),
          emittedAt: new Date().toISOString()
        };
        void appendLiveDiagnosticsEvent(sessionId, {
          source: 'backend',
          stage: 'socket:leave',
          severity: 'info',
          userId,
          socketId: socket.id,
          message: 'Socket left livestream session.'
        }).catch(() => null);
        communityNs.to(`live:session:${sessionId}`).emit('live:participant_left', updatePayload);
        communityNs.to(`live:session:${sessionId}`).emit('live:viewer_count_updated', updatePayload);
        if (ack) ack({ success: true, data: updatePayload });
      } catch (error: any) {
        console.error('live:leave error', error);
        if (ack) ack({ success: false, error: error?.message || 'Failed to leave livestream.' });
      }
    };
    void handleLiveLeave();
  });

  socket.on('live:signal', (payload: any, ack?: (result: any) => void) => {
    const handleLiveSignal = async () => {
      try {
        const fromUserId = resolveSocketUserId(socket);
        const sessionId = String(payload?.sessionId || '').trim();
        const toUserId = String(payload?.toUserId || '').trim();
        const toSocketId = String(payload?.toSocketId || '').trim();
        const signal = payload?.signal;
        if (!fromUserId || !sessionId || (!toUserId && !toSocketId) || !signal) {
          if (ack) ack({ success: false, error: 'sessionId, signal, and a target user/socket are required.' });
          return;
        }
        const relayPayload = {
          signalId: createHash('sha256')
            .update(`${sessionId}:${fromUserId}:${toUserId || toSocketId}:${Date.now()}:${Math.random()}`)
            .digest('hex')
            .slice(0, 20),
          sessionId,
          fromUserId,
          fromSocketId: socket.id,
          toUserId: toUserId || null,
          toSocketId: toSocketId || null,
          signal,
          emittedAt: new Date().toISOString()
        };
        let directDeliveries = 0;
        if (toSocketId) {
          communityNs.to(toSocketId).emit('live:signal', relayPayload);
          directDeliveries = 1;
        } else if (toUserId) {
          directDeliveries = emitToCommunityUserSockets(toUserId, 'live:signal', relayPayload);
          if (!directDeliveries) {
            communityNs.to(`community:user:${toUserId}`).emit('live:signal', relayPayload);
          }
        }
        traceMessages('live.signal', {
          socketId: socket.id,
          sessionId,
          fromUserId,
          toUserId,
          toSocketId,
          signalKind: String(signal?.kind || '').trim().toLowerCase(),
          directDeliveries
        });
        void appendLiveDiagnosticsEvent(sessionId, {
          source: 'backend',
          stage: directDeliveries ? 'signal:relay' : 'signal:fallback',
          severity: directDeliveries ? 'info' : 'warn',
          userId: fromUserId,
          socketId: socket.id,
          signalKind: String(signal?.kind || '').trim().toLowerCase() || null,
          reason: directDeliveries ? null : 'room_fallback',
          message: directDeliveries
            ? 'Signal relayed to target socket.'
            : 'Signal fell back to user room delivery.',
          details: {
            directDeliveries,
            toUserId: toUserId || null,
            toSocketId: toSocketId || null
          }
        }).catch(() => null);
        if (ack) {
          ack({
            success: true,
            data: {
              deliveredTo: directDeliveries
                ? [`direct-sockets:${directDeliveries}`]
                : [`community:user:${toUserId}`]
            }
          });
        }
      } catch (error: any) {
        console.error('live:signal error', error);
        if (ack) ack({ success: false, error: error?.message || 'Failed to relay signal.' });
      }
    };
    void handleLiveSignal();
  });

  socket.on('call:initiate', (payload: any, ack?: (result: any) => void) => {
    const handleInitiate = async () => {
      const callerUserId = resolveSocketUserId(socket);
      try {
        const userId = callerUserId;
        if (!userId) {
          const error = { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
          socket.emit('error', error);
          if (ack) ack(error);
          return;
        }
        if (isVoiceCallInitiationRateLimited(userId)) {
          if (ack) {
            ack({
              success: false,
              error: 'Too many call attempts. Please wait before starting another call.',
              code: 'CALL_RATE_LIMITED'
            });
          }
          return;
        }

        const config = await getOrCreateMessengerVoiceConfig();
        if ((config as any)?._schemaMissing) {
          const error = {
            success: false,
            error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
            code: 'MESSENGER_VOICE_SCHEMA_MISSING'
          };
          if (ack) ack(error);
          return;
        }
        if (!config.enabledVoiceCalls) {
          const error = { success: false, error: 'Voice calls are disabled by admin.', code: 'VOICE_CALLS_DISABLED' };
          if (ack) ack(error);
          return;
        }
        if (isVoiceBlockedForUser(config, userId)) {
          const error = { success: false, error: 'Voice features are blocked for this account.', code: 'VOICE_BLOCKED' };
          if (ack) ack(error);
          return;
        }

        const conversationId = String(payload?.conversationId || '').trim();
        if (!conversationId) {
          const error = { success: false, error: 'conversationId is required.', code: 'CONVERSATION_REQUIRED' };
          if (ack) ack(error);
          return;
        }

        const convo = await loadConversationForVoice(conversationId, userId);
        if (!convo.conversation) {
          const error = { success: false, error: 'Conversation not found or access denied.', code: 'CONVERSATION_ACCESS_DENIED' };
          if (ack) ack(error);
          return;
        }

        const requestedIds = toUniqueIds(payload?.participantIds ?? payload?.participants).filter((id) =>
          convo.participantIds.includes(id) && id !== userId
        );
        const conversationType = String((convo.conversation as any)?.type || '').trim().toUpperCase();
        const isDirectConversation = conversationType === 'DIRECT';
        const defaultTargetIds = convo.participantIds.filter((id) => id && id !== userId);
        const targetIds = isDirectConversation
          ? (requestedIds.length ? requestedIds.slice(0, 1) : defaultTargetIds.slice(0, 1))
          : Array.from(new Set([...requestedIds, ...defaultTargetIds].filter(Boolean)));

        if (!targetIds.length) {
          const error = {
            success: false,
            error: 'No valid participant available for this call.',
            code: 'PARTICIPANT_REQUIRED'
          };
          if (ack) ack(error);
          return;
        }

        const participantLimit = resolveVoiceParticipantLimit(config);
        const totalParticipants = new Set([userId, ...targetIds]).size;
        if (totalParticipants > participantLimit) {
          const error = {
            success: false,
            error: `Maximum ${participantLimit} participants allowed.`,
            code: 'MAX_PARTICIPANTS_EXCEEDED'
          };
          if (ack) ack(error);
          return;
        }

        const busyEntry = await findBusyCallParticipant([userId, ...targetIds]);
        if (busyEntry) {
          const busyUserId = String(busyEntry?.userId || '').trim();
          const busyUserName =
            String(busyEntry?.user?.name || busyEntry?.user?.username || '').trim() ||
            (busyUserId === userId ? 'You are' : 'This user is');
          const busyError =
            busyUserId === userId
              ? 'You are already on another call.'
              : `${busyUserName} is currently on another call.`;
          const busyPayload = {
            callId: null,
            conversationId,
            busyUserId,
            busyUserName,
            status: 'failed',
            code: 'VOICE_USER_BUSY',
            error: busyError,
            failedAt: new Date().toISOString()
          };
          communityNs.to(`community:user:${userId}`).emit('call:busy', busyPayload);
          emitVoiceEventToUsers([userId], 'messenger:call_failed', busyPayload);
          await persistVoiceCallSummaryMessage({
            conversationId,
            senderId: userId,
            callId: '',
            status: 'failed',
            text: `Call failed · ${busyError}`,
            durationMs: 0,
            participantCount: totalParticipants,
            metadata: {
              code: 'VOICE_USER_BUSY',
              busyUserId,
              busyUserName,
              reason: 'user_busy'
            }
          });
          if (ack) {
            ack({
              success: false,
              error: busyError,
              code: 'VOICE_USER_BUSY',
              data: busyPayload
            });
          }
          return;
        }

        const isConferenceRequested =
          !isDirectConversation &&
          (String(payload?.callType || '').toLowerCase() === 'conference' || totalParticipants > 2);
        if (isConferenceRequested && !config.enabledConferenceCalls) {
          const error = {
            success: false,
            error: 'Conference calls are disabled by admin.',
            code: 'CONFERENCE_DISABLED'
          };
          if (ack) ack(error);
          return;
        }

        const call = await (prisma as any).voiceCall.create({
          data: {
            conversationId,
            initiatorId: userId,
            status: 'RINGING',
            callType: isConferenceRequested ? 'CONFERENCE' : 'DIRECT',
            metadata: {
              initiatedVia: 'socket',
              requestedParticipantIds: targetIds
            }
          }
        });

        const participantRows = Array.from(new Set([userId, ...targetIds])).map((id) => ({
          callId: call.id,
          userId: id,
          status: id === userId ? 'JOINED' : 'INVITED',
          invitedAt: new Date(),
          joinedAt: id === userId ? new Date() : null
        }));

        await (prisma as any).voiceCallParticipant.createMany({
          data: participantRows,
          skipDuplicates: true
        });

        socket.join(`call:${call.id}`);
        const participantUsers = await resolveParticipantOptionsByIds(
          participantRows.map((entry) => String(entry.userId || ''))
        );

        const eventPayload = {
          callId: call.id,
          conversationId,
          initiatorId: userId,
          participantIds: participantRows.map((entry) => entry.userId),
          participants: participantUsers,
          callType: isConferenceRequested ? 'conference' : 'direct',
          status: 'ringing',
          createdAt: new Date().toISOString()
        };

        emitVoiceEventToUsers(targetIds, 'call:ringing', eventPayload);
        emitVoiceEventToUsers([userId], 'call:initiate', eventPayload);
        emitVoiceEventToUsers(participantRows.map((entry) => entry.userId), 'messenger:call_started', eventPayload);

        if (ack) ack({ success: true, data: eventPayload });
      } catch (error: any) {
        console.error('call:initiate error', error);
        if (callerUserId) {
          const failedPayload = {
            conversationId: String(payload?.conversationId || ''),
            status: 'failed',
            error: String(error?.message || 'Failed to initiate call.'),
            failedAt: new Date().toISOString()
          };
          emitVoiceEventToUsers([callerUserId], 'messenger:call_failed', failedPayload);
          const fallbackConversationId = String(payload?.conversationId || '').trim();
          if (fallbackConversationId) {
            await persistVoiceCallSummaryMessage({
              conversationId: fallbackConversationId,
              senderId: callerUserId,
              callId: '',
              status: 'failed',
              text: `Call failed · ${String(error?.message || 'Unable to start call.')}`,
              durationMs: 0,
              participantCount: 0,
              metadata: {
                reason: 'initiate_error',
                error: String(error?.message || 'Failed to initiate call.')
              }
            });
          }
        }
        if (ack) ack(toVoiceSocketError(error, 'Failed to initiate call.'));
      }
    };
    void handleInitiate();
  });

  socket.on('call:accept', (payload: any, ack?: (result: any) => void) => {
    const handleAccept = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        if (!userId || !callId) {
          if (ack) ack({ success: false, error: 'callId is required.' });
          return;
        }

        const call = await loadVoiceCallForUser(callId, userId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }
        if (!VOICE_CALL_ACTIVE_STATUSES.includes(String(call.status || '').toUpperCase())) {
          if (ack) ack({ success: false, error: 'This call is no longer active.' });
          return;
        }

        const busyEntry = await findBusyCallParticipant([userId], callId);
        if (busyEntry) {
          const busyPayload = {
            callId,
            conversationId: call.conversationId,
            busyUserId: userId,
            status: 'failed',
            code: 'VOICE_USER_BUSY',
            error: 'You are already on another call.',
            failedAt: new Date().toISOString()
          };
          communityNs.to(`community:user:${userId}`).emit('call:busy', busyPayload);
          emitVoiceEventToUsers([userId], 'messenger:call_failed', busyPayload);
          if (ack) ack({ success: false, error: busyPayload.error, code: 'VOICE_USER_BUSY' });
          return;
        }

        await (prisma as any).voiceCallParticipant.updateMany({
          where: { callId, userId },
          data: { status: 'JOINED', joinedAt: new Date(), leftAt: null }
        });

        await (prisma as any).voiceCall.update({
          where: { id: callId },
          data: {
            status: 'ACTIVE',
            startedAt: call.startedAt || new Date()
          }
        });

        socket.join(`call:${callId}`);

        const participantIds = Array.isArray(call.participants)
          ? call.participants.map((entry: any) => String(entry.userId || '')).filter(Boolean)
          : [];
        const eventPayload = {
          callId,
          conversationId: call.conversationId,
          userId,
          status: 'active',
          joinedAt: new Date().toISOString()
        };

        communityNs.to(`call:${callId}`).emit('call:participant:joined', eventPayload);
        emitVoiceEventToUsers(participantIds, 'messenger:call_joined', eventPayload);
        if (ack) ack({ success: true, data: eventPayload });
      } catch (error: any) {
        console.error('call:accept error', error);
        if (ack) ack(toVoiceSocketError(error, 'Failed to accept call.'));
      }
    };
    void handleAccept();
  });

  socket.on('call:reject', (payload: any, ack?: (result: any) => void) => {
    const handleReject = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        if (!userId || !callId) {
          if (ack) ack({ success: false, error: 'callId is required.' });
          return;
        }

        const call = await loadVoiceCallForUser(callId, userId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }

        const rejectedAt = new Date();
        const transitionResult = await (prisma as any).voiceCall.updateMany({
          where: {
            id: callId,
            status: { in: VOICE_CALL_ACTIVE_STATUSES }
          },
          data: {
            status: 'REJECTED',
            endedAt: rejectedAt
          }
        });
        if (!Number(transitionResult?.count || 0)) {
          if (ack) ack({ success: true, data: { callId, status: String(call.status || '').toLowerCase() } });
          return;
        }

        await (prisma as any).voiceCallParticipant.updateMany({
          where: { callId, userId },
          data: { status: 'REJECTED', leftAt: rejectedAt }
        });

        await (prisma as any).voiceCallParticipant.updateMany({
          where: {
            callId,
            userId: { not: userId },
            status: { in: ['INVITED', 'JOINED'] }
          },
          data: { status: 'LEFT', leftAt: rejectedAt }
        });

        const participantIds = Array.isArray(call.participants)
          ? call.participants.map((entry: any) => String(entry.userId || '')).filter(Boolean)
          : [];
        const durationMs = resolveVoiceCallDurationMs(call, rejectedAt);
        const rejectedByName = await prisma.user
          .findUnique({ where: { id: userId }, select: { name: true, username: true } })
          .then((profile) => String(profile?.name || profile?.username || '').trim())
          .catch(() => '');
        const eventPayload = {
          callId,
          conversationId: call.conversationId,
          userId,
          status: 'rejected',
          durationMs,
          rejectedAt: rejectedAt.toISOString(),
          endedAt: rejectedAt.toISOString()
        };

        communityNs.to(`call:${callId}`).emit('call:reject', eventPayload);
        communityNs.to(`call:${callId}`).emit('call:end', eventPayload);
        if (call.initiatorId && call.initiatorId !== userId) {
          emitVoiceEventToUsers([call.initiatorId], 'call:reject', eventPayload);
        }
        emitVoiceEventToUsers(participantIds, 'call:reject', eventPayload);
        emitVoiceEventToUsers(participantIds, 'call:end', eventPayload);
        emitVoiceEventToUsers(participantIds, 'messenger:call_ended', eventPayload);
        await persistVoiceCallSummaryMessage({
          conversationId: call.conversationId,
          senderId: call.initiatorId || userId,
          callId,
          status: 'rejected',
          text: buildCallSummaryText('rejected', {
            userName: rejectedByName || 'Participant',
            durationMs,
            participantCount: participantIds.length
          }),
          durationMs,
          participantCount: participantIds.length,
          metadata: {
            rejectedById: userId
          }
        });
        if (ack) ack({ success: true, data: eventPayload });
      } catch (error: any) {
        console.error('call:reject error', error);
        const callerUserId = resolveSocketUserId(socket);
        if (callerUserId) {
          emitVoiceEventToUsers([callerUserId], 'messenger:call_failed', {
            callId: String(payload?.callId || ''),
            status: 'failed',
            error: String(error?.message || 'Failed to reject call.'),
            failedAt: new Date().toISOString()
          });
        }
        if (ack) ack(toVoiceSocketError(error, 'Failed to reject call.'));
      }
    };
    void handleReject();
  });

  socket.on('call:end', (payload: any, ack?: (result: any) => void) => {
    const handleEnd = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        if (!userId || !callId) {
          if (ack) ack({ success: false, error: 'callId is required.' });
          return;
        }

        const call = await loadVoiceCallForUser(callId, userId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }

        const role = resolveSocketRole(socket);
        const isAdmin = isAdminRoleValue(role);
        const isParticipant = Array.isArray(call.participants)
          ? call.participants.some((entry: any) => String(entry.userId || '') === userId)
          : false;
        if (!isParticipant && !isAdmin) {
          if (ack) ack({ success: false, error: 'Not authorized to end call.' });
          return;
        }

        const endedAt = new Date();
        const transitionResult = await (prisma as any).voiceCall.updateMany({
          where: {
            id: callId,
            status: { in: VOICE_CALL_ACTIVE_STATUSES }
          },
          data: {
            status: 'ENDED',
            endedAt
          }
        });
        if (!Number(transitionResult?.count || 0)) {
          if (ack) ack({ success: true, data: { callId, status: String(call.status || '').toLowerCase() } });
          return;
        }

        await (prisma as any).voiceCallParticipant.updateMany({
          where: {
            callId,
            status: { in: ['INVITED', 'JOINED'] }
          },
          data: {
            status: 'LEFT',
            leftAt: endedAt
          }
        });

        const participantIds = Array.isArray(call.participants)
          ? call.participants.map((entry: any) => String(entry.userId || '')).filter(Boolean)
          : [];
        const durationMs = resolveVoiceCallDurationMs(call, endedAt);
        const eventPayload = {
          callId,
          conversationId: call.conversationId,
          endedBy: userId,
          status: 'ended',
          durationMs,
          endedAt: endedAt.toISOString()
        };

        communityNs.to(`call:${callId}`).emit('call:end', eventPayload);
        emitVoiceEventToUsers(participantIds, 'call:end', eventPayload);
        emitVoiceEventToUsers(participantIds, 'messenger:call_ended', eventPayload);
        await persistVoiceCallSummaryMessage({
          conversationId: call.conversationId,
          senderId: call.initiatorId || userId,
          callId,
          status: 'ended',
          text: buildCallSummaryText('ended', {
            durationMs,
            participantCount: participantIds.length
          }),
          durationMs,
          participantCount: participantIds.length,
          metadata: {
            endedBy: userId
          }
        });
        if (ack) ack({ success: true, data: eventPayload });
      } catch (error: any) {
        console.error('call:end error', error);
        if (ack) ack(toVoiceSocketError(error, 'Failed to end call.'));
      }
    };
    void handleEnd();
  });

  socket.on('call:participant:add', (payload: any, ack?: (result: any) => void) => {
    const handleAddParticipant = async () => {
      try {
        const callerId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        const targetUserId = String(payload?.userId || payload?.participantId || '').trim();
        if (!callerId || !callId || !targetUserId) {
          if (ack) ack({ success: false, error: 'callId and userId are required.' });
          return;
        }

        const config = await getOrCreateMessengerVoiceConfig();
        if ((config as any)?._schemaMissing) {
          if (ack) {
            ack({
              success: false,
              error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
              code: 'MESSENGER_VOICE_SCHEMA_MISSING'
            });
          }
          return;
        }
        if (!config.enabledConferenceCalls) {
          if (ack) ack({ success: false, error: 'Conference calls are disabled by admin.' });
          return;
        }

        const call = await loadVoiceCallForUser(callId, callerId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }
        if (!VOICE_CALL_ACTIVE_STATUSES.includes(String(call.status || '').toUpperCase())) {
          if (ack) ack({ success: false, error: 'This call is no longer active.' });
          return;
        }

        const conversation = await prisma.conversation.findUnique({
          where: { id: call.conversationId },
          include: { participants: true }
        });
        if (!conversation) {
          if (ack) ack({ success: false, error: 'Conversation not found for this call.' });
          return;
        }

        let conversationParticipantIds = Array.isArray(conversation?.participants)
          ? conversation!.participants.map((entry: any) => String(entry.userId || '')).filter(Boolean)
          : [];

        if (!conversationParticipantIds.includes(targetUserId)) {
          await prisma.conversationParticipant.upsert({
            where: {
              conversationId_userId: {
                conversationId: call.conversationId,
                userId: targetUserId
              }
            },
            update: {
              deletedAt: null,
              isArchived: false
            },
            create: {
              conversationId: call.conversationId,
              userId: targetUserId
            }
          });
          conversationParticipantIds = Array.from(new Set([...conversationParticipantIds, targetUserId]));
          if (conversationParticipantIds.length > 2 && String(conversation.type || '').toUpperCase() === 'DIRECT') {
            await prisma.conversation.update({
              where: { id: call.conversationId },
              data: { type: 'GROUP' as any }
            });
          }
        }

        const existingParticipants = Array.isArray(call.participants) ? call.participants : [];
        const activeCount = existingParticipants.filter((entry: any) =>
          ['INVITED', 'JOINED'].includes(String(entry.status || '').toUpperCase())
        ).length;
        const participantLimit = resolveVoiceParticipantLimit(config);
        if (activeCount >= participantLimit) {
          if (ack) ack({ success: false, error: `Maximum ${participantLimit} participants allowed.` });
          return;
        }

        const busyEntry = await findBusyCallParticipant([targetUserId], callId);
        if (busyEntry) {
          const busyUserName =
            String(busyEntry?.user?.name || busyEntry?.user?.username || '').trim() || 'This user';
          const busyPayload = {
            callId,
            conversationId: call.conversationId,
            busyUserId: targetUserId,
            busyUserName,
            status: 'failed',
            code: 'VOICE_USER_BUSY',
            error: `${busyUserName} is currently on another call.`,
            failedAt: new Date().toISOString()
          };
          communityNs.to(`community:user:${callerId}`).emit('call:busy', busyPayload);
          emitVoiceEventToUsers([callerId], 'messenger:call_failed', busyPayload);
          if (ack) ack({ success: false, error: busyPayload.error, code: 'VOICE_USER_BUSY', data: busyPayload });
          return;
        }

        await (prisma as any).voiceCallParticipant.upsert({
          where: { callId_userId: { callId, userId: targetUserId } },
          update: { status: 'INVITED', invitedAt: new Date(), leftAt: null },
          create: { callId, userId: targetUserId, status: 'INVITED', invitedAt: new Date() }
        });

        const nextActiveParticipantIds = Array.from(
          new Set(
            [
              ...existingParticipants
                .filter((entry: any) => ['INVITED', 'JOINED'].includes(String(entry.status || '').toUpperCase()))
                .map((entry: any) => String(entry.userId || '').trim())
                .filter(Boolean),
              targetUserId
            ].filter(Boolean)
          )
        );
        const shouldConference = nextActiveParticipantIds.length > 2;
        if (shouldConference && String(call.callType || '').toUpperCase() !== 'CONFERENCE') {
          await (prisma as any).voiceCall.update({
            where: { id: callId },
            data: { callType: 'CONFERENCE' }
          });
        }

        const targetProfile = await prisma.user
          .findUnique({
            where: { id: targetUserId },
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true
            }
          })
          .catch(() => null);

        const eventPayload = {
          callId,
          conversationId: call.conversationId,
          addedBy: callerId,
          userId: targetUserId,
          participantIds: Array.from(new Set([...conversationParticipantIds, callerId])),
          participant: targetProfile
            ? {
                id: targetProfile.id,
                name: targetProfile.name || targetProfile.username || 'Participant',
                username: targetProfile.username || null,
                avatar: targetProfile.avatar || null
              }
            : null,
          status: 'invited',
          invitedAt: new Date().toISOString()
        };

        const participantUsers = await resolveParticipantOptionsByIds(eventPayload.participantIds);

        communityNs.to(`call:${callId}`).emit('call:participant:add', eventPayload);
        emitVoiceEventToUsers([targetUserId], 'call:ringing', {
          callId,
          conversationId: call.conversationId,
          initiatorId: call.initiatorId,
          participantIds: eventPayload.participantIds,
          participants: participantUsers,
          callType: shouldConference ? 'conference' : String(call.callType || 'direct').toLowerCase(),
          status: 'ringing',
          invitedBy: callerId
        });

        if (ack) ack({ success: true, data: eventPayload });
      } catch (error: any) {
        console.error('call:participant:add error', error);
        if (ack) ack(toVoiceSocketError(error, 'Failed to add participant.'));
      }
    };
    void handleAddParticipant();
  });

  socket.on('call:participant:left', (payload: any, ack?: (result: any) => void) => {
    const handleParticipantLeft = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        if (!userId || !callId) {
          if (ack) ack({ success: false, error: 'callId is required.' });
          return;
        }

        const call = await loadVoiceCallForUser(callId, userId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }

        await (prisma as any).voiceCallParticipant.updateMany({
          where: { callId, userId },
          data: { status: 'LEFT', leftAt: new Date() }
        });

        socket.leave(`call:${callId}`);
        const eventPayload = {
          callId,
          conversationId: call.conversationId,
          userId,
          leftAt: new Date().toISOString()
        };
        communityNs.to(`call:${callId}`).emit('call:participant:left', eventPayload);
        if (ack) ack({ success: true, data: eventPayload });
      } catch (error: any) {
        console.error('call:participant:left error', error);
        if (ack) ack(toVoiceSocketError(error, 'Failed to leave call.'));
      }
    };
    void handleParticipantLeft();
  });

  socket.on('call:join', (payload: any, ack?: (result: any) => void) => {
    const handleCallJoin = async () => {
      try {
        const userId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        if (!userId || !callId) {
          if (ack) ack({ success: false, error: 'callId is required.' });
          return;
        }
        const call = await loadVoiceCallForUser(callId, userId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }
        socket.join(`call:${callId}`);
        if (ack) ack({ success: true, data: { callId, room: `call:${callId}` } });
      } catch (error: any) {
        if (ack) ack(toVoiceSocketError(error, 'Failed to join call room.'));
      }
    };
    void handleCallJoin();
  });

  socket.on('call:signal', (payload: any, ack?: (result: any) => void) => {
    const handleSignal = async () => {
      try {
        const fromUserId = resolveSocketUserId(socket);
        const callId = String(payload?.callId || '').trim();
        const toUserId = String(payload?.toUserId || '').trim();
        const signal = payload?.signal;

        if (!fromUserId || !callId || !toUserId || !signal) {
          if (ack) ack({ success: false, error: 'callId, toUserId and signal are required.' });
          return;
        }

        const call = await loadVoiceCallForUser(callId, fromUserId);
        if (!call) {
          if (ack) ack({ success: false, error: 'Call not found or access denied.' });
          return;
        }

        const participantIds = Array.isArray(call.participants)
          ? call.participants.map((entry: any) => String(entry.userId || '')).filter(Boolean)
          : [];
        if (!participantIds.includes(toUserId)) {
          if (ack) ack({ success: false, error: 'Target user is not in this call.' });
          return;
        }

        const relayPayload = {
          callId,
          fromUserId,
          toUserId,
          signal,
          emittedAt: new Date().toISOString()
        };
        emitVoiceEventToUsers([toUserId], 'call:signal', relayPayload);
        if (ack) ack({ success: true });
      } catch (error: any) {
        console.error('call:signal error', error);
        if (ack) ack(toVoiceSocketError(error, 'Failed to relay call signal.'));
      }
    };
    void handleSignal();
  });

  socket.on('disconnect', (reason) => {
    traceMessages('socket.disconnected', {
      socketId: socket.id,
      userId: (socket as any).data?.presenceUserId || (socket as any).data?.user?.id || null
    });
    const joinedRooms = Array.from(socket.rooms.values()).filter((room) => room.startsWith('live:session:'));
    const disconnectedUserId =
      (socket as any).data?.presenceUserId || (socket as any).data?.user?.id || null;
    joinedRooms.forEach((room) => {
      const sessionId = room.replace('live:session:', '').trim();
      if (!sessionId) return;
      void appendLiveDiagnosticsEvent(sessionId, {
        source: 'server',
        stage: 'socket:disconnect',
        severity: 'warn',
        userId: disconnectedUserId,
        socketId: socket.id,
        reason: String(reason || '').trim() || 'disconnect',
        message: 'Socket disconnected while attached to livestream session.'
      }).catch(() => null);
    });
    const presenceUserId = (socket as any).data?.presenceUserId || (socket as any).data?.user?.id;
    if (presenceUserId) {
      unregisterCommunityUserSocket(presenceUserId, socket.id);
    }
    if (presenceUserId) {
      void markPresenceOffline(presenceUserId);
      void releasePresenceLease(socket.id, {
        reason: String(reason || '').trim() || 'disconnect'
      });
    }
    void recordRealtimeSocketDisconnected(socket.id, String(reason || '').trim() || 'disconnect');
    communityNs.to('community:admin').emit('realtime:session_changed', {
      action: 'disconnected',
      namespace: 'community',
      socketId: socket.id,
      userId: presenceUserId || null,
      reason: String(reason || '').trim() || 'disconnect'
    });
  });
});

setInterval(() => {
  void markExpiredRingingCallsAsMissed();
}, VOICE_CALL_RING_SWEEP_MS);

// Socket auth: verify JWT if provided, attach user to socket.data.user
io.use(async (socket, next) => {
  try {
    await authenticateSocketFromHandshake(socket);
    return next();
  } catch (err) {
    console.error('Socket auth error:', err);
    return next(new Error('unauthorized'));
  }
});

app.set('io', io);
try {
  // Phase 8.1 — discovery realtime invalidation (no new socket stack)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { bindDiscoveryRealtimeApp } = require('./services/discoveryEngine/discoveryEngine.realtime');
  bindDiscoveryRealtimeApp(app);
} catch {
  // optional if module unavailable
}
try {
  // Phase 9.4 — enterprise search realtime invalidation (same Socket.IO)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { bindSearchRealtimeApp } = require('./services/enterpriseSearch/realtime/realtime');
  bindSearchRealtimeApp(app);
} catch {
  // optional if module unavailable
}
app.set('communityIo', communityNs);
app.set('communityNs', communityNs);
// Expose io and community namespace globally for webhook handlers that don't have app context
(global as any).appIo = io;
(global as any).appCommunityIo = communityNs;

io.engine.on('connection_error', (err) => {
  console.log('Socket.io connection error:', {
    code: err.code,
    message: err.message,
    context: err.context,
    timestamp: new Date().toISOString()
  });
  void recordRealtimeIncident({
    code: String(err.code || 'SOCKET_IO_CONNECTION_ERROR'),
    severity: 'ERROR',
    source: 'socket.io',
    message: String(err.message || 'Socket.io connection error'),
    details: err.context || null
  }).then((incident) => {
    io.emit('realtime:incident_opened', {
      action: 'opened',
      incidentId: incident.id,
      code: incident.code,
      severity: incident.severity,
      source: incident.source
    });
    communityNs.to('community:admin').emit('realtime:incident_opened', {
      action: 'opened',
      incidentId: incident.id,
      code: incident.code,
      severity: incident.severity,
      source: incident.source
    });
  }).catch((error) => {
    console.warn('Failed to persist realtime incident', error);
  });
});

io.engine.on('initial_headers', (headers, req) => {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return;
  if (!isAllowedOrigin(origin)) return;
  headers['Access-Control-Allow-Origin'] = origin;
  headers['Vary'] = 'Origin';
  headers['Access-Control-Allow-Credentials'] = 'true';
});

io.engine.on('headers', (headers, req) => {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return;
  if (!isAllowedOrigin(origin)) return;
  headers['Access-Control-Allow-Origin'] = origin;
  headers['Vary'] = 'Origin';
  headers['Access-Control-Allow-Credentials'] = 'true';
});

const runtimeOptimizationBundle = createRuntimeOptimizationMiddlewareBundle(getRuntimeOptimizationConfig);
app.set('runtime:clearOptimizationCaches', runtimeOptimizationBundle.clearRuntimeCaches);

io.on('settings:updated', (payload: any) => {
  if (!payload || payload.scope !== 'system' || !payload.settings) return;
  app.set('runtime:systemSettings', payload.settings);
  app.set('runtime:systemSettingsVersion', Date.now());
  applyOptimizationFromSystemSettings(payload.settings as Record<string, any>);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws://localhost:3000", "ws://localhost:5000", "http://localhost:3000", "http://localhost:5000"]
    }
  }
}));

// Request correlation id (additive; accepts client x-request-id or generates one)
app.use((req, res, next) => {
  const incoming = String(req.headers['x-request-id'] || req.headers['x-correlation-id'] || '').trim();
  const requestId = incoming || randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

  // Rate limiting
const limiter = rateLimit({
  windowMs: apiRateLimitWindowMs,
  max: (req) => {
    const auth = String(req.headers.authorization || '').trim();
    const baseLimit = auth ? apiRateLimitMaxAuthenticated : apiRateLimitMaxAnonymous;
    const path = String(req.path || '').toLowerCase();
    const originalUrl = String(req.originalUrl || '').toLowerCase();
    const mountedPath = String(`${req.baseUrl || ''}${req.path || ''}`).toLowerCase();
    const isSearchRead =
      req.method === 'GET' &&
      (
        path === '/search' ||
        path.startsWith('/search/') ||
        originalUrl.startsWith('/api/search') ||
        mountedPath.startsWith('/api/search')
      );
    if (isSearchRead) {
      return Math.max(baseLimit, auth ? 1200 : 360);
    }
    return baseLimit;
  },
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = String(req.headers.authorization || '').trim();
    if (auth) {
      const hash = createHash('sha256').update(auth).digest('hex').slice(0, 24);
      return `auth:${hash}`;
    }
    const conn = req.connection as unknown as { remoteAddress?: string } | undefined;
    const rawIp = (req.ip || (conn && conn.remoteAddress) || '').toString();
    if (!rawIp) return 'unknown';
    return ipKeyGenerator(rawIp);
  },
  // Skip rate limiting for socket.io and local/dev requests to make local testing reliable.
  skip: (req) => {
    try {
      if (req.path.includes('/socket.io/')) return true;
      // Allow bypass when running in development mode
      if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') return true;
      // Allow requests that carry a developer override header
      if (req.headers['x-dev-role'] || req.headers['x-skip-ratelimit']) return true;
      // Allow local requests
      const conn = req.connection as unknown as { remoteAddress?: string } | undefined;
      const ip = (req.ip || (conn && conn.remoteAddress) || '').toString();
      if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.0.0.1')) return true;
    } catch (e) {
      // If anything goes wrong, do not skip by default
    }
    return false;
  }
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (!apiRequestLoggingEnabled && res.statusCode < 400) return;
    const duration = Date.now() - start;
    const user = req.user;
    console.log(
      `[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms) ` +
      `${user?.id ? `user=${user.id}` : ''} ${user?.role ? `role=${user.role}` : ''}`.trim()
    );
  });
  next();
});

// Stripe webhook for wallet top-ups (must be raw body)
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWalletWebhook);
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWalletWebhook);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
runtimeOptimizationBundle.middlewares.forEach((middleware) => app.use(middleware));

const assetCorsPolicyOverride: express.RequestHandler = (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};

app.use('/api/files/content', assetCorsPolicyOverride);
app.use('/uploads', assetCorsPolicyOverride);

// Static uploads - allow cross-origin usage from frontend
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    etag: true,
    lastModified: true,
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const lowerName = path.basename(filePath || '').toLowerCase();
      const fallbackSeconds = lowerName.includes('favicon') ? 300 : 604800;
      const cacheControl = resolveStaticAssetCacheControl(
        getRuntimeOptimizationConfig(),
        fallbackSeconds,
        lowerName
      );
      res.setHeader('Cache-Control', cacheControl);
    }
  })
);
app.get('/uploads/*', serveLegacyUploadAsset);

const getConfiguredFaviconUrl = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
    const data = (record?.data || {}) as Record<string, any>;
    const header = (data?.header || {}) as Record<string, any>;
    const homepage = (data?.homepage || {}) as Record<string, any>;
    const homepageHeader = (homepage?.header || {}) as Record<string, any>;
    const candidates = [
      data?.faviconUrl,
      data?.favicon_url,
      header?.faviconUrl,
      header?.favicon_url,
      homepageHeader?.faviconUrl,
      homepageHeader?.favicon_url
    ];
    const resolved = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return resolved ? String(resolved).trim() : null;
  } catch (error) {
    console.warn('[favicon] failed to read platform settings:', error);
    return null;
  }
};

const BRAND_FAVICON_ASSETS_DIR = path.join(__dirname, '..', 'assets', 'brand');

const serveFaviconFromUploads = (res: Response) => {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) return false;
  const files = fs.readdirSync(uploadsDir);
  const candidate = files.find((f) => /(^favicon\.|favicon\.|favicon_)/i.test(f) || /favicon/i.test(f));
  if (!candidate) return false;
  const filePath = path.join(uploadsDir, candidate);
  res.sendFile(filePath);
  return true;
};

const serveBundledFaviconAsset = (requestPath: string, res: Response) => {
  const normalizedPath = String(requestPath || '').trim().toLowerCase();
  const candidates =
    normalizedPath === '/apple-touch-icon.png'
      ? ['apple-touch-icon.png', 'favicon.png']
      : normalizedPath === '/favicon.ico'
        ? ['favicon.ico', 'favicon.png']
        : ['favicon.png', 'favicon.ico'];

  for (const assetName of candidates) {
    const assetPath = path.join(BRAND_FAVICON_ASSETS_DIR, assetName);
    if (fs.existsSync(assetPath)) {
      res.sendFile(assetPath);
      return true;
    }
  }

  return false;
};

const normalizeFaviconAliasPath = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('/')) return '';
  return trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
};

const faviconHandler = async (req: Request, res: Response) => {
  try {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader(
      'Cache-Control',
      resolveStaticAssetCacheControl(getRuntimeOptimizationConfig(), 300, 'favicon.ico')
    );
    const configured = await getConfiguredFaviconUrl();
    const requestedAlias = normalizeFaviconAliasPath(req.path);

    if (configured) {
      if (configured.startsWith('http://') || configured.startsWith('https://')) {
        return res.redirect(302, configured);
      }
      if (configured.startsWith('/uploads/')) {
        const localPath = path.join(__dirname, '..', configured.replace(/^\/+/, ''));
        if (fs.existsSync(localPath)) return res.sendFile(localPath);
      }
      if (configured.startsWith('/')) {
        const configuredAlias = normalizeFaviconAliasPath(configured);
        if (configuredAlias && configuredAlias !== requestedAlias) {
          return res.redirect(302, configured);
        }
      }
    }

    if (serveFaviconFromUploads(res)) return;
    if (serveBundledFaviconAsset(req.path, res)) return;
    return res.status(404).end();
  } catch (e) {
    console.error('Failed to serve favicon', e);
    return res.status(500).end();
  }
};

// Serve platform favicon aliases consistently across browser/icon rel variants.
app.get('/favicon.ico', faviconHandler);
app.get('/favicon.png', faviconHandler);
app.get('/apple-touch-icon.png', faviconHandler);

const trimTrailingSlashes = (value: string) => String(value || '').replace(/\/+$/, '');
const stripHtml = (value: unknown) =>
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const truncateText = (value: unknown, maxLength: number) => {
  const normalized = stripHtml(value);
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};
const escapeHtml = (value: unknown) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const getFrontendPublicOrigin = () =>
  trimTrailingSlashes(
    process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      'https://scrolith.com'
  );
const buildFrontendPostUrl = (postId: string) =>
  `${getFrontendPublicOrigin()}/post/${encodeURIComponent(String(postId || '').trim())}`;
const buildBackendAbsoluteUrl = (req: Request, pathname: string) => {
  const base = trimTrailingSlashes(resolveFileBaseUrl(req));
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${normalizedPath}`;
};
const buildFileContentUrl = (req: Request, fileId: string) =>
  `${trimTrailingSlashes(resolveFileBaseUrl(req))}/api/files/content/${encodeURIComponent(fileId)}`;

app.get('/share/posts/:id', async (req: Request, res: Response) => {
  try {
    const postId = String(req.params?.id || '').trim();
    if (!postId) {
      return res.status(400).send('Missing post id.');
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        content: true,
        attachments: true,
        createdAt: true,
        status: true,
        author: {
          select: {
            name: true,
            username: true,
            avatar: true
          }
        },
        businessPage: {
          select: {
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        }
      }
    });

    if (!post || String(post.status || '').toLowerCase() === 'deleted') {
      return res.status(404).send('Post not found.');
    }

    const frontendPostUrl = buildFrontendPostUrl(post.id);
    const sharePageUrl = buildBackendAbsoluteUrl(req, `/share/posts/${encodeURIComponent(post.id)}`);
    const fileBaseUrl = trimTrailingSlashes(resolveFileBaseUrl(req));
    const attachmentIds = Array.isArray(post.attachments) ? post.attachments.filter(Boolean) : [];
    const attachmentFiles = attachmentIds.length
      ? await prisma.file.findMany({
          where: { id: { in: attachmentIds } },
          select: {
            id: true,
            url: true,
            mimeType: true,
            thumbnailUrl: true
          }
        })
      : [];

    const previewImage =
      attachmentFiles
        .map((file) => {
          const mimeType = String(file.mimeType || '').toLowerCase();
          if (mimeType.startsWith('image/')) {
            return buildFileContentUrl(req, file.id);
          }
          if (mimeType.startsWith('video/')) {
            return (
              resolveDirectMediaUrl(file.thumbnailUrl, fileBaseUrl) ||
              resolveDirectMediaUrl(file.url, fileBaseUrl) ||
              buildFileContentUrl(req, file.id)
            );
          }
          return resolveDirectMediaUrl(file.thumbnailUrl, fileBaseUrl) || null;
        })
        .find(Boolean) ||
      (post.businessPage?.logoFileId ? buildFileContentUrl(req, post.businessPage.logoFileId) : null) ||
      resolveDirectMediaUrl(post.author?.avatar, fileBaseUrl) ||
      `${getFrontendPublicOrigin()}/logo.png`;

    const authorName =
      String(post.businessPage?.name || post.author?.name || post.author?.username || 'Scrolith member').trim() ||
      'Scrolith member';
    const title =
      truncateText(post.title, 140) ||
      truncateText(post.content, 140) ||
      `Post by ${authorName} on Scrolith`;
    const description =
      truncateText(post.content, 260) ||
      `View ${authorName}'s post on Scrolith.`;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Scrolith" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(frontendPostUrl)}" />
    <meta property="og:image" content="${escapeHtml(previewImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(previewImage)}" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(frontendPostUrl)}" />
    <link rel="canonical" href="${escapeHtml(frontendPostUrl)}" />
  </head>
  <body>
    <p>Opening <a href="${escapeHtml(frontendPostUrl)}">${escapeHtml(title)}</a> on Scrolith...</p>
    <script>window.location.replace(${JSON.stringify(frontendPostUrl)});</script>
  </body>
</html>`;

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Failed to render post share preview:', error);
    return res.status(500).send('Failed to load share preview.');
  }
});

const buildHealthPayload = () => ({
  status: getPrismaConnectionState() === 'degraded' ? 'DEGRADED' : 'OK',
  timestamp: new Date().toISOString(),
  uptimeSeconds: Math.round(process.uptime()),
  environment: process.env.NODE_ENV || 'development',
  services: {
    cms: '/api/cms/test',
    admin: '/api/admin/test',
    auth: '/api/auth/health',
    users: '/api/users/health',
    commerce: '/api/commerce/health',
    search: '/api/search/health',
    ai: '/api/ai/health',
    'gigs-jobs': '/api/admin/gigs-jobs/test',
    homepage: '/api/cms/homepage'
  },
  socket: {
    status: io.engine?.clientsCount ? 'active' : 'inactive',
    connected: io.engine?.clientsCount || 0
  },
  database: {
    client: 'prisma',
    status: getPrismaConnectionState()
  },
  foundation: {
    realtime: {
      namespace: '/community',
      adminOps: '/api/admin/realtime/summary'
    },
    search: {
      health: '/api/search/health',
      unified: '/api/search/unified',
      suggestions: '/api/search/suggestions',
      discoveryV2: '/api/discovery/v2',
      enterpriseV2: '/api/search/v2/health'
    },
    phase2: {
      discovery: '/api/discovery/v2/feed',
      trustGraph: '/api/trust/graph/me',
      scrolithaWorkOs: '/api/scrolitha/work-os/plan',
      collaborationRooms: '/api/collaboration/rooms'
    },
    phase3: {
      briefing: '/api/phase3/briefing',
      enterpriseWorkspaces: '/api/phase3/workspaces',
      creatorCommerce: '/api/phase3/creator-commerce/campaigns',
      payoutOrchestration: '/api/phase3/payouts/orchestration',
      globalLocalization: '/api/phase3/localization/global'
    },
    phase4: {
      publicApiCatalog: '/api/public/v1/catalog',
      publicSearch: '/api/public/v1/search',
      ecosystemManifest: '/api/ecosystem/public/apis',
      developerDashboard: '/api/ecosystem/developer/dashboard',
      webhooks: '/api/ecosystem/developer/webhooks',
      widgets: '/api/ecosystem/developer/widgets'
    },
    rollback: {
      config: '/api/admin/config/snapshots'
    },
    backup: {
      catalog: '/api/admin/system-backups/catalog'
    },
    observability: {
      metrics: '/metrics',
      health: '/api/health'
    }
  }
});

const healthHandler = (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.json(buildHealthPayload());
  } catch (error) {
    console.error('Health check error:', error);
    if (req.method === 'HEAD') {
      res.status(500).end();
      return;
    }
    res.status(500).json({
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

// Health check endpoint
app.head('/api/health', healthHandler);
app.get('/api/health', healthHandler);

// Readiness probe (additive; does not change /api/health status codes)
const readinessHandler = (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const dbState = getPrismaConnectionState();
    const ready = dbState !== 'degraded';
    const payload = {
      status: ready ? 'READY' : 'NOT_READY',
      database: { status: dbState },
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || null
    };
    if (req.method === 'HEAD') {
      res.status(ready ? 200 : 503).end();
      return;
    }
    res.status(ready ? 200 : 503).json(payload);
  } catch (error) {
    console.error('Readiness check error:', error);
    if (req.method === 'HEAD') {
      res.status(503).end();
      return;
    }
    res.status(503).json({
      status: 'NOT_READY',
      error: 'Readiness check failed',
      timestamp: new Date().toISOString()
    });
  }
};
app.head('/api/readyz', readinessHandler);
app.get('/api/readyz', readinessHandler);
app.head('/api/health/ready', readinessHandler);
app.get('/api/health/ready', readinessHandler);

// Prometheus metrics endpoint (optional)
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    // Optional security: IP allowlist and basic auth
    const allowListRaw = process.env.METRICS_ALLOW_IPS || '';
    const allowList = allowListRaw.split(',').map(s => s.trim()).filter(Boolean);
    const metricsUser = process.env.METRICS_USERNAME;
    const metricsPass = process.env.METRICS_PASSWORD;

    const clientIpRaw = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').toString();
    const clientIp = clientIpRaw.replace(/^::ffff:/, '').split(',')[0].trim();

    // support CIDR entries in allow list (e.g. 10.0.0.0/8)
    const isValidIpv4 = (ip: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);
    const ipv4ToInt = (ip: string) => {
      const p = ip.split('.').map(n => Number(n) & 0xff);
      return ((p[0] << 24) >>> 0) + ((p[1] << 16) >>> 0) + ((p[2] << 8) >>> 0) + (p[3] >>> 0);
    };
    const cidrMatch = (ip: string, cidr: string) => {
      try {
        if (!cidr.includes('/')) return ip === cidr;
        const [base, prefixRaw] = cidr.split('/');
        const prefix = Number(prefixRaw);
        if (!isValidIpv4(ip) || !isValidIpv4(base) || isNaN(prefix) || prefix < 0 || prefix > 32) return false;
        const ipInt = ipv4ToInt(ip);
        const baseInt = ipv4ToInt(base);
        const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1) >>> 0);
        return (ipInt & mask) === (baseInt & mask);
      } catch (e) {
        return false;
      }
    };

    const ipAllowed = allowList.length === 0 ? false : allowList.some(entry => cidrMatch(clientIp, entry));
    const requireAuth = Boolean(metricsUser && metricsPass) || allowList.length > 0;

    if (requireAuth) {
      // allow if IP is allowlisted
      if (ipAllowed) {
        // proceed
      } else if (metricsUser && metricsPass) {
        const auth = (req.headers.authorization || '').toString();
        if (!auth.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = auth.slice('Basic '.length).trim();
        let cred = '';
        try { cred = Buffer.from(token, 'base64').toString('utf8'); } catch (e) { cred = ''; }
        const [u, p] = cred.split(':');
        if (u !== metricsUser || p !== metricsPass) {
          res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const metrics = await import('./utils/metrics');
    const registry = metrics.getPromRegistry && metrics.getPromRegistry();
    if (!registry) return res.status(404).json({ error: 'Metrics not enabled' });
    const body = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType || 'text/plain; version=0.0.4');
    return res.send(body);
  } catch (e) {
    console.error('Metrics endpoint error:', e);
    return res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

// Test homepage endpoint directly (for debugging)
app.get('/api/test-homepage', async (req: Request, res: Response) => {
  try {
    const { getHomepage } = await import('./controllers/cmsController');
    return getHomepage(req, res);
  } catch (error) {
    console.error('Test homepage error:', error);
    res.status(500).json({ 
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint for socket.io
app.get('/api/socket-test', (req: Request, res: Response) => {
  res.json({ 
    message: 'Socket.io test endpoint',
    socketAvailable: true,
    timestamp: new Date().toISOString()
  });
});

// WebSocket test endpoint (non-API route)
app.get('/ws-test', (req: Request, res: Response) => {
  res.json({
    message: 'WebSocket test endpoint',
    socket: {
      enabled: true,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timestamp: new Date().toISOString()
    }
  });
});

// Socket test endpoint (non-API route)
app.get('/socket-test', (req: Request, res: Response) => {
  res.json({
    message: 'Socket.io test endpoint',
    proxyWorking: true,
    timestamp: new Date().toISOString()
  });
});

// Enforce system maintenance mode for non-admin traffic while keeping admin/auth/CMS
// access paths available for management and status pages.
app.use('/api', maintenanceModeMiddleware);
app.use('/api', insightsActionTrackerMiddleware);

// API routes
app.use('/api/cms', cmsRoutes);
app.use('/api/cms', cmsAuthPagesRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/admin/fx', authMiddleware, adminMiddleware, fxAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dev', devRoutes);
app.use('/api/oauth', oauthDevRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/marketing', marketingPublicRoutes);
app.use('/api/commerce', commerceRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/topics', topicsRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/search', searchRoutes);
/** Enterprise Search v2 — foundation only; flags default OFF (Phase 9.2) */
app.use('/api/search/v2', enterpriseSearchRoutes);
app.use('/api/discovery', discoveryV2Routes);
app.use('/api/discovery-engine', discoveryEngineRoutes);
app.use('/api/professional-discovery', professionalDiscoveryRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/freelancer', freelancerRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/freelancer/resumes', freelancerResumeRoutes);
app.use('/api/client/resume-reviews', clientResumeReviewRoutes);
app.use('/api/resume', resumePublicRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/admin/gigs-jobs', adminGigsJobsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/scroll', scrollRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/marketplace', marketplaceRoutes);

// Explicit admin config endpoints (ensure runtime availability even when nested routers vary)
app.get('/api/community/admin/config', (req: Request, res: Response, next) => {
  // require auth
  const run = async () => {
    try {
      // Reuse auth middleware flow
      await new Promise<void>((resolve, reject) => {
        (authMiddleware as any)(req, res, (err?: any) => err ? reject(err) : resolve());
      });
      const role = (req as any).user?.role || '';
      if (!role || !role.toString().toLowerCase().includes('admin')) {
        return res.status(403).json({ success: false, error: 'Admin role required' });
      }
      return getAdminConfig(req, res);
    } catch (e) {
      return next(e);
    }
  };
  void run();
});

app.put('/api/community/admin/config', (req: Request, res: Response, next) => {
  const run = async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        (authMiddleware as any)(req, res, (err?: any) => err ? reject(err) : resolve());
      });
      const role = (req as any).user?.role || '';
      if (!role || !role.toString().toLowerCase().includes('admin')) {
        return res.status(403).json({ success: false, error: 'Admin role required' });
      }
      return updateAdminConfig(req, res);
    } catch (e) {
      return next(e);
    }
  };
  void run();
});
app.use('/api/contracts', contractsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/moderation/chat', moderationChatRoutes);
app.use('/api/moderation/accounts', moderationAccountsRoutes);
app.use('/api/reactions', reactionsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/gcoin', gcoinRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/currencies', currenciesRoutes);
app.use('/api/briefs', briefsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/monetization', monetizationRoutes);
app.use('/api/payouts/stripe', payoutsStripeRoutes);
app.use('/api/public/preloader', preloaderRoutes);
app.use('/api/public/v1', publicV1Routes);
app.use('/api/public/developer', publicDeveloperRoutes);
app.use('/api/reco', recoRoutes);
app.use('/api/intelligence/feedback', intelligenceFeedbackRoutes);
app.use('/api/scrolitha', scrolithaRoutes);
app.use('/api/phase3', phase3Routes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/ecosystem', ecosystemRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/admin/preloaders', adminPreloadersRoutes);

// Temporary debug: list mounted API routes (for local debugging only)
app.get('/api/_routes', (req: Request, res: Response) => {
  try {
    const routes: string[] = [];
    const stack = (app as any)._router && (app as any)._router.stack;
    if (Array.isArray(stack)) {
      stack.forEach((layer: any) => {
        try {
          if (layer && layer.route && layer.route.path) {
            const methods = layer.route.methods ? Object.keys(layer.route.methods).join(',') : '';
            routes.push(`${methods} ${layer.route.path}`);
          } else if (layer && layer.name === 'router' && layer.regexp) {
            // top-level mounted router
            const mount = String(layer.regexp);
            routes.push(`router ${mount}`);
            // attempt to expand child routes
            const childStack = layer.handle && layer.handle.stack;
            if (Array.isArray(childStack)) {
              childStack.forEach((child: any) => {
                if (child && child.route && child.route.path) {
                  const methods = child.route.methods ? Object.keys(child.route.methods).join(',') : '';
                  routes.push(`  ${methods} ${mount} -> ${child.route.path}`);
                }
                // deeper nested routers (like /admin) may be under child.handle.stack
                if (child && child.name === 'router' && child.handle && Array.isArray(child.handle.stack)) {
                  child.handle.stack.forEach((grand: any) => {
                    if (grand && grand.route && grand.route.path) {
                      const methods = grand.route.methods ? Object.keys(grand.route.methods).join(',') : '';
                      routes.push(`    ${methods} ${mount} -> ${child.regexp} -> ${grand.route.path}`);
                    }
                  });
                }
              });
            }
          }
        } catch (e) {
          // ignore per-layer errors
        }
      });
    }
    return res.json({ success: true, routes });
  } catch (e) {
    console.error('Failed to list routes', e);
    return res.status(500).json({ success: false, error: 'Failed to list routes' });
  }
});

// Socket.io connection with enhanced logging and error handling
io.on('connection', (socket) => {
  try {
    console.log(`Socket connected: ${socket.id} - Transport: ${socket.conn.transport.name}`);
    console.log(`Total connections: ${io.engine.clientsCount}`);
    const syncRootRealtimeRooms = () => {
      const rooms = Array.from(socket.rooms.values()).filter((room) => room !== socket.id);
      void touchRealtimeSocketRooms(socket.id, rooms);
    };

    socket.emit('connected', { 
      id: socket.id,
      serverTime: new Date().toISOString(),
      transport: socket.conn.transport.name
    });

    socket.emit('welcome', { 
      message: 'Connected to Scrolith Socket.io server',
      id: socket.id,
      timestamp: new Date().toISOString()
    });

    releaseSocketRequest(socket);

    void recordRealtimeSocketConnected({
      socketId: socket.id,
      namespace: 'root',
      userId: (socket as any).data?.user?.id || null,
      role: (socket as any).data?.user?.role || null,
      transport: socket.conn.transport.name,
      authSource: (socket as any).data?.user?.id ? 'jwt' : 'guest',
      isAuthenticated: Boolean((socket as any).data?.user?.id),
      rooms: Array.from(socket.rooms.values()).filter((room) => room !== socket.id),
      handshakeQuery: socket.handshake.query,
      metadata: {
        address: socket.handshake.address || null,
        userAgent: String(socket.handshake.headers?.['user-agent'] || '')
      }
    });
    io.emit('realtime:session_changed', {
      action: 'connected',
      namespace: 'root',
      socketId: socket.id,
      userId: (socket as any).data?.user?.id || null,
      role: (socket as any).data?.user?.role || null
    });
    communityNs.to('community:admin').emit('realtime:session_changed', {
      action: 'connected',
      namespace: 'root',
      socketId: socket.id,
      userId: (socket as any).data?.user?.id || null,
      role: (socket as any).data?.user?.role || null
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { time: new Date().toISOString() });
      }
    }, 15000);

    socket.on('handshake', (data: any) => {
      console.log(`Handshake from ${socket.id}:`, data);
      socket.emit('handshake-ack', {
        id: socket.id,
        status: 'connected',
        timestamp: new Date().toISOString()
      });
    });
    socket.on('community:join', (payload: { userId: string }) => {
      try {
        const requested = payload?.userId;
        const identity = (socket as any).data?.user?.id || null;
        const role = ((socket as any).data?.user?.role || '').toString().toLowerCase();
        const isAdmin = role.includes('admin');
        if (!requested) { socket.emit('error', { code: 'MISSING_USERID', message: 'userId required' }); return; }
        if (identity !== requested && !isAdmin) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join user room' });
          return;
        }
        socket.join(`community:user:${requested}`);
        socket.join('community:global');
        socket.join('community:ads');
        if (isAdmin) socket.join('community:admin');
        socket.emit('joined', { rooms: ['community:global', 'community:ads', `community:user:${requested}`] });
        syncRootRealtimeRooms();
      } catch (e) {
        console.error('community:join error (root ns):', e);
      }
    });

    socket.on('join-room', (roomId: string) => {
      try {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        syncRootRealtimeRooms();
      } catch (error) {
        console.error(`Error joining room ${roomId}:`, error);
      }
    });

    // Authenticated, typed room joins
    socket.on('join:wallet', (payload: { userId: string }) => {
      const handleJoinWallet = async (pl: { userId: string }): Promise<void> => {
        try {
          const requested = pl?.userId;
          const identity = (socket as any).data?.user?.id || null;
          if (!requested) { socket.emit('error', { code: 'MISSING_USERID', message: 'userId required' }); return; }
          // Allow join if identity matches requested userId or in development mode
          const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
          if (identity === requested || process.env.NODE_ENV === 'development' || allowTestJoins) {
            socket.join(`wallet:${requested}`);
            socket.join(requested); // legacy user room
            socket.emit('joined', { room: `wallet:${requested}` });
            console.log(`Socket ${socket.id} joined wallet:${requested}`);
            syncRootRealtimeRooms();
          } else {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join wallet room' });
          }
        } catch (e) {
          console.error('join:wallet error:', e);
        }
        return;
      };
      void handleJoinWallet(payload);
    });

    socket.on('join:post', (payload: { postId: string }) => {
      const handleJoinPost = async (pl: { postId: string }): Promise<void> => {
        try {
          const postId = pl?.postId;
          if (!postId) { socket.emit('error', { code: 'MISSING_POSTID', message: 'postId required' }); return; }
          const identity = (socket as any).data?.user?.id || null;
          // fetch post and verify visibility/ownership
          const post = await prisma.communityPost.findUnique({
            where: { id: postId },
            select: { authorId: true, status: true }
          });
          if (!post) { socket.emit('error', { code: 'NOT_FOUND', message: 'Post not found' }); return; }
          const isOwner = identity && post.authorId === identity;
          const isPublic = (post.status || 'active') === 'active';
          const role = (socket as any).data?.user?.role || '';
          const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
          const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development' || allowTestJoins;
          if (isOwner || isPublic || isAdmin) {
            socket.join(`post:${postId}`);
            socket.emit('joined', { room: `post:${postId}` });
            console.log(`Socket ${socket.id} joined post:${postId}`);
            syncRootRealtimeRooms();
          } else {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join post room' });
          }
        } catch (e) {
          console.error('join:post error:', e);
        }
        return;
      };
      void handleJoinPost(payload);
    });

    socket.on('join:ad', (payload: { adId: string }) => {
      const handleJoinAd = async (pl: { adId: string }): Promise<void> => {
        try {
          const adId = pl?.adId;
          if (!adId) { socket.emit('error', { code: 'MISSING_ADID', message: 'adId required' }); return; }
          const identity = (socket as any).data?.user?.id || null;
          const ad = await prisma.communityAd.findUnique({
            where: { id: adId },
            select: { creatorId: true, status: true }
          });
          if (!ad) { socket.emit('error', { code: 'NOT_FOUND', message: 'Ad not found' }); return; }
          const isOwner = identity && ad.creatorId === identity;
          const isActive = (ad.status || '').toString().toUpperCase() === 'ACTIVE';
          const role = (socket as any).data?.user?.role || '';
          const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
          if (isOwner || isActive || isAdmin) {
            socket.join(`ad:${adId}`);
            socket.emit('joined', { room: `ad:${adId}` });
            console.log(`Socket ${socket.id} joined ad:${adId}`);
            syncRootRealtimeRooms();
          } else {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join ad room' });
          }
        } catch (e) {
          console.error('join:ad error:', e);
        }
        return;
      };
      void handleJoinAd(payload);
    });

    socket.on('leave-room', (roomId: string) => {
      try {
        socket.leave(roomId);
        socket.emit('left', { room: roomId });
        console.log(`Socket ${socket.id} left room ${roomId}`);
        syncRootRealtimeRooms();
      } catch (e) {
        console.error('leave-room error:', e);
      }
    });

    socket.on('message', (data: any) => {
      try {
        console.log(`Message from ${socket.id}:`, data);
        if (data.roomId) {
          io.to(data.roomId).emit('message', data);
          void recordRealtimeEventDelivery({
            namespace: 'root',
            roomKey: String(data.roomId || '').trim() || null,
            eventName: 'message',
            targetCount: 1,
            payload: data,
            triggeredBy: 'runtime',
            persist: false
          });
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    socket.on('ping', (data) => {
      try {
        socket.emit('pong', { 
          ...data,
          serverTime: new Date().toISOString(),
          id: socket.id
        });
      } catch (error) {
        console.error('Error handling ping:', error);
      }
    });

    socket.conn.on('upgrade', (transport) => {
      console.log(`Transport upgraded for ${socket.id}: ${transport.name}`);
    });

    socket.conn.on('close', (reason) => {
      console.log(`Connection closed for ${socket.id}: ${reason}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
      clearInterval(heartbeatInterval);
      console.log('Disconnect details:', {
        socketId: socket.id,
        reason,
        connected: socket.connected,
        time: new Date().toISOString(),
        remainingConnections: io.engine.clientsCount
      });
      console.log(`Remaining connections: ${io.engine.clientsCount}`);
      void recordRealtimeSocketDisconnected(socket.id, String(reason || '').trim() || 'disconnect');
      io.emit('realtime:session_changed', {
        action: 'disconnected',
        namespace: 'root',
        socketId: socket.id,
        userId: (socket as any).data?.user?.id || null,
        reason: String(reason || '').trim() || 'disconnect'
      });
      communityNs.to('community:admin').emit('realtime:session_changed', {
        action: 'disconnected',
        namespace: 'root',
        socketId: socket.id,
        userId: (socket as any).data?.user?.id || null,
        reason: String(reason || '').trim() || 'disconnect'
      });
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
      void recordRealtimeIncident({
        code: 'SOCKET_RUNTIME_ERROR',
        severity: 'ERROR',
        source: 'socket',
        message: String((error as any)?.message || error || 'Socket runtime error'),
        details: {
          socketId: socket.id,
          namespace: 'root'
        }
      }).catch(() => null);
    });
  } catch (error) {
    console.error('Connection handler error:', error);
  }
});

// 404 handler for API routes
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'API route not found',
    requestedPath: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      '/api/health',
      '/api/socket-test',
      '/api/cms/*',
      '/api/admin/*',
      '/api/auth/*',
      '/api/users/*',
      '/api/commerce/*',
      '/api/search/*',
      '/api/ai/*',
      '/api/gigs/*',
      '/api/admin/gigs-jobs/*'
    ]
  });
});

// 404 handler for all other routes
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);
  console.error('Error stack:', err.stack);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  res.status(500).json({ 
    success: false,
    error: 'Internal Server Error',
    code: 'ERR_INTERNAL',
    timestamp: new Date().toISOString()
  });
});

// Start server (skip auto-listen during test runs to avoid port conflicts)
const PORT = parseInt(process.env.PORT!) || 5000;
if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
  registerInsightsJobs(app);
  registerFxJobs(app).catch((error) => {
    console.error('[fx] Failed to register FX jobs:', error);
  });
  startDemoAutomationScheduler();
  server.listen(PORT, async () => {
    try {
      await ensurePrismaReady();
      console.log(`[prisma] connection state: ${getPrismaConnectionState()}`);
    } catch (error) {
      console.error('[prisma] initial connect failed; continuing in degraded mode', error);
    }
    console.log(`========================================`);
    console.log(`🚀 Scrolith Marketplace Backend Started`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Frontend URL: http://localhost:3000`);
    console.log(`📊 Health: http://localhost:${PORT}/api/health`);
    console.log(`📡 Socket.io: ws://localhost:${PORT}/socket.io`);
    console.log(`========================================`);
    console.log('\n📡 Mounted Routes:');
    console.log('  /api/cms       - CMS Management');
    console.log('  /api/admin     - Admin Dashboard');
    console.log('  /api/auth      - Authentication');
    console.log('  /api/users     - User Management');
    console.log('  /api/commerce  - Commerce & Listings');
    console.log('  /api/search    - Search Functionality');
    console.log('  /api/ai        - AI Services');
    console.log('  /api/gigs      - Gigs Management');
    console.log('  /api/admin/gigs-jobs - Admin Gigs & Jobs');
    console.log('  /api/wallet    - Wallet & Transactions');
    console.log('  /api/escrow    - Escrow Management');
    console.log('  /api/withdrawal - Withdrawal Requests');
    console.log('  /api/community - Community Forum');
    console.log('  /socket.io/*   - Socket.io WebSocket');
    console.log('========================================');

    // Initialize AdPayment reconciliation: run once and schedule periodically
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        // Run an initial reconciliation on startup
        reconcileAdPayments().catch(err => console.error('Initial reconcileAdPayments failed:', err));

        // Schedule reconciliation every 5 minutes
        const reconcileTask = cron.schedule('*/5 * * * *', async () => {
          console.log(`[cron] Running reconcileAdPayments at ${new Date().toISOString()}`);
          try {
            await reconcileAdPayments();
          } catch (err) {
            console.error('[cron] reconcileAdPayments error:', err);
          }
        }, {
          scheduled: true,
          timezone: process.env.SCHEDULE_TIMEZONE || 'UTC'
        });

        reconcileTask.start();
      } else {
        console.warn('STRIPE_SECRET_KEY not set; skipping AdPayment reconciliation on startup.');
      }
    } catch (err) {
      console.error('Failed to initialize reconcileAdPayments cron job:', err);
    }

    try {
      const talentCloudSettings = await getTalentCloudSettings();
      if (talentCloudSettings.enabled && talentCloudSettings.webhooksEnabled) {
        setInterval(() => {
          dispatchQueuedWebhookDeliveries(10).catch((error) => {
            console.error('[webhooks] failed to dispatch queued deliveries', error);
          });
        }, 30 * 1000);
      } else {
        console.log('[webhooks] Talent cloud webhooks disabled; dispatcher not started.');
      }
    } catch (error) {
      console.error('[webhooks] Failed to initialize webhook dispatcher', error);
    }
  });
} else {
  console.log('Server auto-start skipped (test environment detected).');
}

export default app;
export { server, io, communityNs };
