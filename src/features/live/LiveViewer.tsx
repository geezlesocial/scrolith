import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Download,
  Gift,
  Heart,
  LogOut,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Repeat2,
  SendHorizontal,
  Signal,
  Sparkles,
  Square,
  ThumbsUp,
  Users,
  Video,
  VideoOff,
  Wand2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import {
  DEFAULT_LIVE_SAFETY_NOTICE_TEXT,
  DEFAULT_LIVE_EXPERIENCE_CONFIG,
  LiveService,
  normalizeLiveExperienceConfig,
  type LiveGift,
  type LiveExperienceConfig,
  type LiveRealtimeConfig,
  type LiveSession,
  type LiveUserPreview
} from '../../services/live';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import { useLiveFeature } from '../../context/LiveFeatureContext';
import { CommunityService } from '../../services/community';
import { GcoinService } from '../../services/gcoin';
import RepostModal from '../../community/components/RepostModal';
import ContentOfferTags from '../../components/commerce/ContentOfferTags';
import ParticipantGrid from './components/ParticipantGrid';
import GiftPanel from './components/GiftPanel';
import LiveShareSheet from './components/LiveShareSheet';
import ReactionOverlay from './components/ReactionOverlay';
import { normalizeContentOfferTags } from '../../utils/contentOffers';
import { consumePrimedLiveMediaStream, requestLiveMediaStream, stopStreamTracks } from './liveMedia';
import {
  DEFAULT_LIVE_REALTIME_CONFIG,
  getCandidateTypeLabel,
  getTransportModeLabel,
  normalizeLiveRealtimeConfig,
  toLiveRtcConfiguration
} from './liveRealtimeConfig';
import { buildPublicAppUrl } from '../../utils/siteUrl';

type FloatingReaction = {
  id: string;
  emoji: string;
};

type LiveGiftShoutout = LiveGift & {
  shoutoutText?: string | null;
  fromUser?: LiveUserPreview;
  toUser?: LiveUserPreview;
};

type LiveChatEntry =
  | { kind: 'comment'; id: string; createdAt: string; comment: any }
  | { kind: 'gift'; id: string; createdAt: string; gift: LiveGiftShoutout };

type SignalPayload = {
  kind: 'viewer-ready' | 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

type LiveSignalTarget = {
  userId?: string | null;
  socketId?: string | null;
};

type LiveTransportMode = 'webrtc-direct' | 'webrtc-relay' | 'hls-fallback' | 'unknown';

type LiveConnectionDiagnostics = {
  socketReady: boolean;
  localMediaReady: boolean;
  relayConfigured: boolean;
  relayRecommended: boolean;
  peerConnectionState: string;
  iceConnectionState: string;
  signalingState: string;
  transportMode: LiveTransportMode;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  currentRoundTripTimeMs: number | null;
  retryCount: number;
  lastSignalAt: string | null;
};

type LiveConsoleTab = 'overview' | 'chat' | 'support' | 'tools' | 'recording';

type LiveFilterPreset = 'none' | 'vibrant' | 'cinematic' | 'bw' | 'sepia' | 'warm' | 'cool' | 'contrast';

const LIVE_FILTER_PRESETS: Array<{ value: LiveFilterPreset; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'vibrant', label: 'Vibrant' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'bw', label: 'B&W' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'contrast', label: 'High Contrast' }
];

const toCompactErrorMessage = (error: any) => {
  const code = String(error?.name || '').toLowerCase();
  if (code.includes('notallowed') || code.includes('permission')) {
    return 'Camera or microphone permission was denied. Allow access in app settings and retry.';
  }
  if (code.includes('notfound') || code.includes('devicesnotfound')) {
    return 'No camera/microphone device was found on this device.';
  }
  if (code.includes('notreadable') || code.includes('trackstart')) {
    return 'Camera is already in use by another app. Close other camera apps and retry.';
  }
  return String(error?.message || 'Unable to access camera and microphone.');
};

const clampFilterStrength = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 70;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const normalizeFilterPreset = (value: any): LiveFilterPreset => {
  const normalized = String(value || '').trim().toLowerCase();
  if (LIVE_FILTER_PRESETS.some((entry) => entry.value === normalized)) return normalized as LiveFilterPreset;
  return 'none';
};

const parseLiveFilter = (metadata: Record<string, any> | null | undefined) => {
  const source =
    (metadata?.liveFilter && typeof metadata.liveFilter === 'object' ? metadata.liveFilter : null) ||
    (metadata?.filter && typeof metadata.filter === 'object' ? metadata.filter : null) ||
    {};
  return {
    preset: normalizeFilterPreset((source as any)?.preset),
    strength: clampFilterStrength((source as any)?.strength ?? 70)
  };
};

const toCssFilter = (preset: LiveFilterPreset, strength: number) => {
  const s = Math.max(0, Math.min(100, Number(strength || 0))) / 100;
  if (preset === 'none') return 'none';
  if (preset === 'vibrant') return `saturate(${1 + 0.8 * s}) contrast(${1 + 0.18 * s})`;
  if (preset === 'cinematic') return `contrast(${1 + 0.28 * s}) saturate(${1 + 0.12 * s}) brightness(${1 - 0.05 * s})`;
  if (preset === 'bw') return `grayscale(${0.5 + 0.5 * s}) contrast(${1 + 0.12 * s})`;
  if (preset === 'sepia') return `sepia(${0.45 + 0.55 * s}) saturate(${1 + 0.18 * s})`;
  if (preset === 'warm') return `sepia(${0.2 + 0.22 * s}) saturate(${1 + 0.14 * s}) hue-rotate(-8deg)`;
  if (preset === 'cool') return `saturate(${1 + 0.08 * s}) hue-rotate(10deg)`;
  return `contrast(${1 + 0.35 * s})`;
};

const formatMetric = (value: number) => {
  const safe = Math.max(0, Number(value || 0));
  if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe >= 10000000 ? 0 : 1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(safe >= 10000 ? 0 : 1)}K`;
  return String(safe);
};

const buildLiveUrl = (sessionId: string) => {
  return buildPublicAppUrl(`/live/${encodeURIComponent(String(sessionId || '').trim())}`);
};

const getStatusTone = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'live') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'ended') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const getConnectionTone = (state: 'idle' | 'connecting' | 'connected' | 'failed') => {
  if (state === 'connected') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'connecting') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (state === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
};

const getDiagnosticsTone = (state: 'ready' | 'warning' | 'critical') => {
  if (state === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (state === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
};

const ensureTrackSenders = (pc: RTCPeerConnection, stream: MediaStream) => {
  stream.getTracks().forEach((track) => {
    const hasSender = pc
      .getSenders()
      .some((sender) => Boolean(sender.track) && sender.track?.kind === track.kind);
    if (!hasSender) {
      pc.addTrack(track, stream);
    }
  });
};

const syncPeerSenders = async (pc: RTCPeerConnection, stream: MediaStream) => {
  for (const track of stream.getTracks()) {
    const sender = pc
      .getSenders()
      .find((entry) => Boolean(entry.track) && entry.track?.kind === track.kind);
    if (!sender) {
      pc.addTrack(track, stream);
      continue;
    }
    if (sender.track?.id !== track.id) {
      await sender.replaceTrack(track);
    }
  }
};

const hasUsableLocalStream = (stream: MediaStream | null | undefined) => {
  if (!stream) return false;
  return stream.getTracks().some((track) => track.readyState === 'live');
};

const DEFAULT_DIAGNOSTICS: LiveConnectionDiagnostics = {
  socketReady: false,
  localMediaReady: false,
  relayConfigured: DEFAULT_LIVE_REALTIME_CONFIG.relayConfigured,
  relayRecommended: DEFAULT_LIVE_REALTIME_CONFIG.relayRecommended,
  peerConnectionState: 'new',
  iceConnectionState: 'new',
  signalingState: 'stable',
  transportMode: 'unknown',
  localCandidateType: null,
  remoteCandidateType: null,
  currentRoundTripTimeMs: null,
  retryCount: 0,
  lastSignalAt: null
};

const normalizeSignalTarget = (target: string | LiveSignalTarget | null | undefined): LiveSignalTarget => {
  if (typeof target === 'string') {
    const userId = String(target || '').trim();
    return userId ? { userId, socketId: null } : { userId: null, socketId: null };
  }
  return {
    userId: String(target?.userId || '').trim() || null,
    socketId: String(target?.socketId || '').trim() || null
  };
};

const getSignalConnectionKey = (target: string | LiveSignalTarget | null | undefined) => {
  const normalized = normalizeSignalTarget(target);
  return String(normalized.socketId || normalized.userId || '').trim();
};

const LiveViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const sessionId = String(id || '').trim();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();
  const { socket, isConnected } = useSocket();
  const { user } = useUser();
  const { status: liveFeatureStatus } = useLiveFeature();
  const previewMode = searchParams.get('preview') === '1';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hostPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const hostPeerTargetsRef = useRef<Map<string, LiveSignalTarget>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const pendingHostCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingViewerCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const connectionTimeoutRef = useRef<number | null>(null);
  const peerStatsTimerRef = useRef<number | null>(null);
  const viewerRetryCountRef = useRef(0);
  const viewerBootstrapSignatureRef = useRef('');
  const processedSignalIdsRef = useRef<string[]>([]);
  const giftShoutoutTimerRef = useRef<number | null>(null);
  const realtimeConfigRef = useRef<LiveRealtimeConfig>(DEFAULT_LIVE_REALTIME_CONFIG);
  const remoteTrackCountRef = useRef(0);
  const remoteInboundStreamRef = useRef<MediaStream | null>(null);
  const hostOfferPendingRef = useRef<Set<string>>(new Set());
  const hostPublishSignatureRef = useRef('');
  const viewerHostTargetRef = useRef<LiveSignalTarget>({ userId: null, socketId: null });

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [giftSending, setGiftSending] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [mediaInitBusy, setMediaInitBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [realtimeConfig, setRealtimeConfig] = useState<LiveRealtimeConfig>(DEFAULT_LIVE_REALTIME_CONFIG);
  const [connectionDiagnostics, setConnectionDiagnostics] = useState<LiveConnectionDiagnostics>(DEFAULT_DIAGNOSTICS);
  const [viewerMuted, setViewerMuted] = useState(true);
  const [activeFilterPreset, setActiveFilterPreset] = useState<LiveFilterPreset>('none');
  const [activeFilterStrength, setActiveFilterStrength] = useState(70);
  const [filterBusy, setFilterBusy] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [giftFeed, setGiftFeed] = useState<LiveGiftShoutout[]>([]);
  const [giftShoutout, setGiftShoutout] = useState<LiveGiftShoutout | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [showSafetyNotice, setShowSafetyNotice] = useState(false);
  const [recordingFileIdDraft, setRecordingFileIdDraft] = useState('');
  const [recordingTitleDraft, setRecordingTitleDraft] = useState('');
  const [recordingDescriptionDraft, setRecordingDescriptionDraft] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [sessionRoomReady, setSessionRoomReady] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<LiveConsoleTab>('overview');
  const [viewerSupportExpanded, setViewerSupportExpanded] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [reactionTrayOpen, setReactionTrayOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [giftBalance, setGiftBalance] = useState<number | null>(null);
  const [giftBalanceLoading, setGiftBalanceLoading] = useState(false);
  const remoteTrackCount = useMemo(
    () => remoteStream?.getTracks().filter((track) => track.readyState !== 'ended').length || 0,
    [remoteStream, remoteStreamVersion]
  );

  const status = String(session?.status || '').toLowerCase();
  const canPlayVideo = useMemo(() => Boolean(session?.hlsUrl || session?.streamUrl), [session?.hlsUrl, session?.streamUrl]);
  const isHost = useMemo(() => {
    if (!session) return false;
    if (session?.viewer?.isHost) return true;
    return String(session.hostUserId || '') === String(user?.id || '');
  }, [session, user?.id]);
  const isHostPreview = isHost && previewMode && status !== 'live' && status !== 'ended';

  const hostUserId = String(session?.hostUserId || '').trim();
  const liveExperienceConfig: LiveExperienceConfig = useMemo(
    () => normalizeLiveExperienceConfig(liveFeatureStatus.experienceConfig || DEFAULT_LIVE_EXPERIENCE_CONFIG),
    [liveFeatureStatus.experienceConfig]
  );
  const safetyNoticeText = useMemo(
    () => String(liveExperienceConfig.safetyNoticeText || DEFAULT_LIVE_SAFETY_NOTICE_TEXT).trim() || DEFAULT_LIVE_SAFETY_NOTICE_TEXT,
    [liveExperienceConfig.safetyNoticeText]
  );
  const safetyNoticeDelayMs = useMemo(
    () => Math.max(0, Number(liveExperienceConfig.safetyNoticeDelayMinutes || 0)) * 60_000,
    [liveExperienceConfig.safetyNoticeDelayMinutes]
  );
  const safetyNoticeRepeatMs = useMemo(
    () => Math.max(60_000, Number(liveExperienceConfig.safetyNoticeRepeatMinutes || 1) * 60_000),
    [liveExperienceConfig.safetyNoticeRepeatMinutes]
  );
  const safetyNoticeVisibleMs = useMemo(
    () => Math.max(3_000, Number(liveExperienceConfig.safetyNoticeVisibleSeconds || 15) * 1_000),
    [liveExperienceConfig.safetyNoticeVisibleSeconds]
  );
  const canManageRecording = isHost || String(user?.role || '').toLowerCase().includes('admin');
  const sessionMetadata = useMemo(() => {
    const raw = session?.metadata;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  }, [session?.metadata]);
  const activeVideoFilter = useMemo(
    () => toCssFilter(activeFilterPreset, activeFilterStrength),
    [activeFilterPreset, activeFilterStrength]
  );
  const hostName = String(session?.host?.name || session?.host?.username || 'Host');
  const sessionStartedAtMs = useMemo(() => {
    const raw = String(session?.startedAt || session?.createdAt || '').trim();
    const parsed = raw ? Date.parse(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [session?.createdAt, session?.startedAt]);
  const hasRenderableLocalVideo = Boolean(isHost && localStream);
  const hasRenderableRemoteVideo = Boolean(!isHost && (remoteTrackCount > 0 || canPlayVideo));
  const shouldMountViewerVideoSurface = Boolean(!isHost && (remoteStream || canPlayVideo));
  const shouldRenderVideoSurface = hasRenderableLocalVideo || shouldMountViewerVideoSurface;
  const shouldShowVideoPlaceholder = !hasRenderableLocalVideo && !hasRenderableRemoteVideo;
  const activeFilterLabel =
    LIVE_FILTER_PRESETS.find((entry) => entry.value === activeFilterPreset)?.label || activeFilterPreset;
  const activeParticipantsCount = useMemo(
    () =>
      Array.isArray(session?.participants)
        ? session.participants.filter((entry) => String(entry.status || '').toLowerCase() === 'joined').length
        : 0,
    [session?.participants]
  );
  const streamAgeLabel = useMemo(() => {
    if (!session?.startedAt || status !== 'live') return status === 'ended' ? 'Stream ended' : 'Ready to broadcast';
    const diffMs = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
    const totalMinutes = Math.floor(diffMs / 60000);
    if (totalMinutes < 1) return 'Live just now';
    if (totalMinutes < 60) return `Live for ${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `Live for ${hours}h ${minutes}m`;
  }, [session?.startedAt, status]);
  const liveUrl = useMemo(() => buildLiveUrl(sessionId), [sessionId]);
  const liveShareText = useMemo(() => {
    const title = String(session?.title || '').trim() || `${hostName} is live on Scrolith`;
    return `${title}\n${liveUrl}`;
  }, [hostName, liveUrl, session?.title]);
  const mentionedUsers = useMemo(() => {
    const rows = Array.isArray(sessionMetadata?.mentionedUsers) ? sessionMetadata.mentionedUsers : [];
    return rows
      .map((entry: any) => ({
        id: String(entry?.id || entry?.userId || '').trim(),
        username: String(entry?.username || '').trim(),
        name: String(entry?.name || '').trim() || String(entry?.username || '').trim()
      }))
      .filter((entry: any) => entry.id || entry.username || entry.name)
      .slice(0, 8);
  }, [sessionMetadata]);
  const taggedPages = useMemo(() => {
    const rows = Array.isArray(sessionMetadata?.taggedPages) ? sessionMetadata.taggedPages : [];
    return rows
      .map((entry: any) => ({
        id: String(entry?.id || entry?.pageId || '').trim(),
        name: String(entry?.name || '').trim(),
        slug: String(entry?.slug || '').trim(),
        handle: String(entry?.handle || '').trim()
      }))
      .filter((entry: any) => entry.id || entry.name || entry.slug || entry.handle)
      .slice(0, 8);
  }, [sessionMetadata]);
  const contentOfferTags = useMemo(
    () => normalizeContentOfferTags(sessionMetadata?.offerTags ?? sessionMetadata?.offer_tags),
    [sessionMetadata]
  );

  useEffect(() => {
    realtimeConfigRef.current = realtimeConfig;
  }, [realtimeConfig]);

  useEffect(() => {
    setConnectionDiagnostics((prev) => ({ ...prev, socketReady: isConnected }));
  }, [isConnected]);

  useEffect(() => {
    setConnectionDiagnostics((prev) => ({ ...prev, localMediaReady: Boolean(localStream) }));
  }, [localStream]);

  useEffect(() => {
    remoteTrackCountRef.current = remoteTrackCount;
  }, [remoteTrackCount]);

  const updateConnectionDiagnostics = useCallback((patch: Partial<LiveConnectionDiagnostics>) => {
    setConnectionDiagnostics((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const clearPeerStatsTimer = useCallback(() => {
    if (peerStatsTimerRef.current) {
      window.clearInterval(peerStatsTimerRef.current);
      peerStatsTimerRef.current = null;
    }
  }, []);

  const refreshRemoteStreamState = useCallback((stream: MediaStream | null) => {
    remoteInboundStreamRef.current = stream;
    setRemoteStream(stream);
    setRemoteStreamVersion((current) => current + 1);
  }, []);

  const attachInboundTracks = useCallback(
    (inboundStream: MediaStream, tracks: MediaStreamTrack[]) => {
      let changed = false;
      tracks.forEach((track) => {
        if (!track || track.readyState === 'ended') return;
        const exists = inboundStream.getTracks().some((entry) => entry.id === track.id);
        if (!exists) {
          inboundStream.addTrack(track);
          changed = true;
        }
      });
      if (!changed && inboundStream.getTracks().length === 0) return false;
      refreshRemoteStreamState(inboundStream);
      const activeVideo = videoRef.current;
      if (activeVideo) {
        activeVideo.srcObject = inboundStream;
        activeVideo.muted = viewerMuted;
        activeVideo.autoplay = true;
        activeVideo.playsInline = true;
        void activeVideo.play().catch(() => {});
      }
      setConnectionState('connected');
      setMediaError(null);
      clearConnectionTimeout();
      updateConnectionDiagnostics({ transportMode: 'webrtc-direct' });
      return true;
    },
    [clearConnectionTimeout, refreshRemoteStreamState, updateConnectionDiagnostics, viewerMuted]
  );

  const syncRemoteReceiversToStream = useCallback(
    (pc: RTCPeerConnection, inboundStream?: MediaStream | null) => {
      const targetStream = inboundStream || remoteInboundStreamRef.current;
      if (!pc || !targetStream) return false;
      const tracks = pc
        .getReceivers()
        .map((receiver) => receiver.track)
        .filter((track): track is MediaStreamTrack => Boolean(track) && track.readyState !== 'ended');
      if (!tracks.length) return false;
      return attachInboundTracks(targetStream, tracks);
    },
    [attachInboundTracks]
  );

  const sendSignal = useCallback(
    (target: string | LiveSignalTarget, signal: SignalPayload) => {
      if (!socket || !sessionId) return;
      const normalizedTarget = normalizeSignalTarget(target);
      if (!normalizedTarget.userId && !normalizedTarget.socketId) return;
      if (!socket.connected) {
        console.warn('Live signal skipped because socket is not connected', {
          sessionId,
          target: normalizedTarget,
          kind: signal?.kind
        });
        return;
      }
      updateConnectionDiagnostics({ lastSignalAt: new Date().toISOString() });
      socket.timeout(8000).emit(
        'live:signal',
        {
          sessionId,
          toUserId: normalizedTarget.userId || undefined,
          toSocketId: normalizedTarget.socketId || undefined,
          signal
        },
        (error: any, response: any) => {
          if (!error && response?.success !== false) return;
          console.warn('Live signal delivery reported an issue', error || response);
        }
      );
    },
    [sessionId, socket, updateConnectionDiagnostics]
  );

  const emitLiveTrace = useCallback(
    (trace: Record<string, any>) => {
      if (!socket || !socket.connected || !sessionId) return;
      try {
        socket.emit('messages:debug_trace', {
          channel: 'live',
          sessionId,
          ...trace
        });
      } catch {}
    },
    [sessionId, socket]
  );

  const inspectPeerStats = useCallback(
    async (pc: RTCPeerConnection | null) => {
      if (!pc || typeof pc.getStats !== 'function') return;
      try {
        const stats = await pc.getStats();
        let selectedPair: any = null;
        stats.forEach((report: any) => {
          if (!selectedPair && report?.type === 'transport' && report.selectedCandidatePairId) {
            selectedPair = stats.get(report.selectedCandidatePairId) || null;
          }
        });
        if (!selectedPair) {
          stats.forEach((report: any) => {
            if (!selectedPair && report?.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
              selectedPair = report;
            }
          });
        }
        const localCandidate = selectedPair?.localCandidateId ? stats.get(selectedPair.localCandidateId) : null;
        const remoteCandidate = selectedPair?.remoteCandidateId ? stats.get(selectedPair.remoteCandidateId) : null;
        const localCandidateType = String(localCandidate?.candidateType || '').trim().toLowerCase() || null;
        const remoteCandidateType = String(remoteCandidate?.candidateType || '').trim().toLowerCase() || null;
        const isRelay = localCandidateType === 'relay' || remoteCandidateType === 'relay';
        updateConnectionDiagnostics({
          localCandidateType,
          remoteCandidateType,
          currentRoundTripTimeMs: Number.isFinite(selectedPair?.currentRoundTripTime)
            ? Math.round(Number(selectedPair.currentRoundTripTime) * 1000)
            : null,
          transportMode: isRelay ? 'webrtc-relay' : selectedPair ? 'webrtc-direct' : remoteTrackCount > 0 ? 'webrtc-direct' : 'unknown'
        });
      } catch (error) {
        console.warn('Failed to inspect live peer stats', error);
      }
    },
    [remoteTrackCount, updateConnectionDiagnostics]
  );

  const publishHostOffer = useCallback(
    async (connectionKey: string, pc: RTCPeerConnection | null) => {
      const normalizedConnectionKey = String(connectionKey || '').trim();
      if (!normalizedConnectionKey || !pc) return;
      const target = normalizeSignalTarget(hostPeerTargetsRef.current.get(normalizedConnectionKey));
      if (!target.userId && !target.socketId) return;
      const signalingState = String(pc.signalingState || '').toLowerCase();
      if (signalingState !== 'stable') {
        const localOffer =
          String(pc.localDescription?.type || '').toLowerCase() === 'offer' && String(pc.localDescription?.sdp || '').trim()
            ? String(pc.localDescription?.sdp || '')
            : '';
        if (signalingState === 'have-local-offer' && localOffer) {
          sendSignal(target, {
            kind: 'offer',
            sdp: localOffer
          });
          emitLiveTrace({
            liveStage: 'host-offer:resent',
            connectionKey: normalizedConnectionKey,
            targetUserId: target.userId || null,
            targetSocketId: target.socketId || null,
            signalingState,
            connectionState: String(pc.connectionState || 'new').toLowerCase() || 'new'
          });
        } else {
          emitLiveTrace({
            liveStage: 'host-offer:skipped',
            connectionKey: normalizedConnectionKey,
            targetUserId: target.userId || null,
            targetSocketId: target.socketId || null,
            signalingState,
            connectionState: String(pc.connectionState || 'new').toLowerCase() || 'new'
          });
        }
        return;
      }
      if (hostOfferPendingRef.current.has(normalizedConnectionKey)) return;
      hostOfferPendingRef.current.add(normalizedConnectionKey);
      try {
        const stream = hasUsableLocalStream(localStreamRef.current) ? (localStreamRef.current as MediaStream) : null;
        if (stream) {
          await syncPeerSenders(pc, stream);
        }
        emitLiveTrace({
          liveStage: 'host-offer:create',
          connectionKey: normalizedConnectionKey,
          targetUserId: target.userId || null,
          targetSocketId: target.socketId || null,
          localTracks: stream?.getTracks().map((track) => `${track.kind}:${track.readyState}`) || []
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(target, {
          kind: 'offer',
          sdp: offer.sdp || ''
        });
        emitLiveTrace({
          liveStage: 'host-offer:sent',
          connectionKey: normalizedConnectionKey,
          targetUserId: target.userId || null,
          targetSocketId: target.socketId || null
        });
      } catch (error: any) {
        emitLiveTrace({
          liveStage: 'host-offer:error',
          connectionKey: normalizedConnectionKey,
          targetUserId: target.userId || null,
          targetSocketId: target.socketId || null,
          message: String(error?.message || error || 'unknown')
        });
        throw error;
      } finally {
        hostOfferPendingRef.current.delete(normalizedConnectionKey);
      }
    },
    [emitLiveTrace, sendSignal]
  );

  const applyPeerStateSnapshot = useCallback(
    (pc: RTCPeerConnection | null) => {
      if (!pc) return;
      updateConnectionDiagnostics({
        peerConnectionState: String(pc.connectionState || 'new').toLowerCase() || 'new',
        iceConnectionState: String(pc.iceConnectionState || 'new').toLowerCase() || 'new',
        signalingState: String(pc.signalingState || 'stable').toLowerCase() || 'stable'
      });
      void inspectPeerStats(pc);
    },
    [inspectPeerStats, updateConnectionDiagnostics]
  );

  const closeHostPeer = useCallback((connectionKey: string) => {
    const normalizedConnectionKey = String(connectionKey || '').trim();
    if (!normalizedConnectionKey) return;
    hostOfferPendingRef.current.delete(normalizedConnectionKey);
    const existing = hostPeersRef.current.get(normalizedConnectionKey);
    if (existing) {
      try {
        existing.close();
      } catch {}
    }
    hostPeersRef.current.delete(normalizedConnectionKey);
    hostPeerTargetsRef.current.delete(normalizedConnectionKey);
    pendingHostCandidatesRef.current.delete(normalizedConnectionKey);
  }, []);

  const closeViewerPeer = useCallback(
    (options?: { preserveRemote?: boolean }) => {
      if (viewerPeerRef.current) {
        try {
          viewerPeerRef.current.close();
        } catch {}
        viewerPeerRef.current = null;
      }
      pendingViewerCandidatesRef.current = [];
      clearPeerStatsTimer();
      clearConnectionTimeout();
      if (!options?.preserveRemote) {
        refreshRemoteStreamState(null);
      }
      updateConnectionDiagnostics({
        peerConnectionState: 'closed',
        iceConnectionState: 'closed',
        signalingState: 'closed',
        transportMode: canPlayVideo ? 'hls-fallback' : 'unknown',
        currentRoundTripTimeMs: null,
        localCandidateType: null,
        remoteCandidateType: null
      });
    },
    [canPlayVideo, clearConnectionTimeout, clearPeerStatsTimer, refreshRemoteStreamState, updateConnectionDiagnostics]
  );

  const scheduleViewerConnectionTimeout = useCallback(() => {
    clearConnectionTimeout();
    if (isHost || !hostUserId || !sessionRoomReady || status !== 'live') return;
    const timeoutMs = realtimeConfigRef.current.connectionTimeoutMs;
    connectionTimeoutRef.current = window.setTimeout(() => {
      const hasRemoteTrack = remoteTrackCountRef.current > 0;
      const activePeer = viewerPeerRef.current;
      const peerState = String(activePeer?.connectionState || '').toLowerCase();
      const iceState = String(activePeer?.iceConnectionState || '').toLowerCase();
      if (hasRemoteTrack || peerState === 'connected' || iceState === 'connected' || iceState === 'completed') return;
      setConnectionState('failed');
      setMediaError((current) =>
        current ||
        (realtimeConfigRef.current.relayConfigured
          ? 'Live link is taking longer than expected. Re-negotiating the stream now.'
          : 'Direct live connection could not be established. Configure TURN relay for stronger cross-network delivery.')
      );
      if (liveExperienceConfig.enableStandbyRecovery && viewerRetryCountRef.current < realtimeConfigRef.current.viewerRetryLimit) {
        viewerRetryCountRef.current += 1;
        updateConnectionDiagnostics({ retryCount: viewerRetryCountRef.current, lastSignalAt: new Date().toISOString() });
        closeViewerPeer();
        sendSignal(hostUserId, { kind: 'viewer-ready' });
        setConnectionState('connecting');
      }
    }, timeoutMs);
  }, [
    clearConnectionTimeout,
    closeViewerPeer,
    hostUserId,
    isHost,
    liveExperienceConfig.enableStandbyRecovery,
    sendSignal,
    sessionRoomReady,
    status,
    updateConnectionDiagnostics
  ]);

  const requestViewerOffer = useCallback(
    (options?: { resetPeer?: boolean; incrementRetry?: boolean }) => {
      if (isHost || !hostUserId || !sessionRoomReady || status !== 'live') return;
      if (options?.resetPeer) {
        closeViewerPeer();
      }
      if (options?.incrementRetry) {
        viewerRetryCountRef.current += 1;
        updateConnectionDiagnostics({ retryCount: viewerRetryCountRef.current });
      }
      setMediaError(null);
      setConnectionState('connecting');
      updateConnectionDiagnostics({ lastSignalAt: new Date().toISOString() });
      sendSignal(hostUserId, { kind: 'viewer-ready' });
      scheduleViewerConnectionTimeout();
    },
    [
      closeViewerPeer,
      hostUserId,
      isHost,
      scheduleViewerConnectionTimeout,
      sendSignal,
      sessionRoomReady,
      status,
      updateConnectionDiagnostics
    ]
  );

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const data = await LiveService.getSession(sessionId);
      if (data?.realtimeConfig) {
        const normalizedConfig = normalizeLiveRealtimeConfig(data.realtimeConfig);
        realtimeConfigRef.current = normalizedConfig;
        setRealtimeConfig(normalizedConfig);
        setConnectionDiagnostics((prev) => ({
          ...prev,
          relayConfigured: normalizedConfig.relayConfigured,
          relayRecommended: normalizedConfig.relayRecommended
        }));
      }
      setSession(data);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to load livestream.';
      showNotification('error', 'Livestream', message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, showNotification]);

  const loadComments = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await LiveService.getComments(sessionId);
      setComments(Array.isArray(data) ? data : []);
    } catch (error: any) {
      const statusCode = Number(error?.response?.status || 0);
      if (statusCode !== 403 && statusCode !== 404) {
        const message = error?.response?.data?.error || error?.message || 'Failed to load live chat.';
        showNotification('warning', 'Livestream', message);
      }
    }
  }, [sessionId, showNotification]);

  const buildGiftShoutout = useCallback((gift: any): LiveGiftShoutout | null => {
    const giftId = String(gift?.id || '').trim();
    if (!giftId) return null;
    const amountGcoin = Number(gift?.amountGcoin || 0);
    const fromUser = gift?.fromUser && typeof gift.fromUser === 'object'
      ? {
          id: String(gift.fromUser.id || gift.fromUser.userId || '').trim(),
          name: String(gift.fromUser.name || gift.fromUser.username || 'Someone').trim() || 'Someone',
          username: String(gift.fromUser.username || '').trim() || null,
          avatar: String(gift.fromUser.avatar || '').trim() || null,
          isVerified: Boolean(gift.fromUser.isVerified)
        }
      : undefined;
    const toUser = gift?.toUser && typeof gift.toUser === 'object'
      ? {
          id: String(gift.toUser.id || gift.toUser.userId || '').trim(),
          name: String(gift.toUser.name || gift.toUser.username || 'Scrolith creator').trim() || 'Scrolith creator',
          username: String(gift.toUser.username || '').trim() || null,
          avatar: String(gift.toUser.avatar || '').trim() || null,
          isVerified: Boolean(gift.toUser.isVerified)
        }
      : undefined;
    const senderName = String(fromUser?.name || fromUser?.username || 'Someone').trim() || 'Someone';
    const message = String(gift?.message || '').trim() || null;
    return {
      id: giftId,
      fromUserId: String(gift?.fromUserId || '').trim(),
      toUserId: String(gift?.toUserId || '').trim(),
      amountGcoin,
      message,
      createdAt: String(gift?.createdAt || new Date().toISOString()),
      fromUser,
      toUser,
      shoutoutText:
        String(gift?.shoutoutText || '').trim() ||
        `${senderName} sent ${amountGcoin} Dash${message ? `: ${message}` : ''}`
    };
  }, []);

  const pushGiftShoutout = useCallback((gift: any) => {
    const normalizedGift = buildGiftShoutout(gift);
    if (!normalizedGift) return;

    setGiftFeed((prev) => [...prev.filter((entry) => entry.id !== normalizedGift.id), normalizedGift].slice(-80));
    if (liveExperienceConfig.enableGiftShoutouts) {
      setGiftShoutout(normalizedGift);
    }
    setSession((prev) => {
      if (!prev) return prev;
      const nextGifts = [
        normalizedGift,
        ...(Array.isArray(prev.gifts) ? prev.gifts.filter((entry) => entry.id !== normalizedGift.id) : [])
      ].slice(0, 40);
      return {
        ...prev,
        gifts: nextGifts
      };
    });

    if (!liveExperienceConfig.enableGiftShoutouts) return;
    if (giftShoutoutTimerRef.current) {
      window.clearTimeout(giftShoutoutTimerRef.current);
    }
    giftShoutoutTimerRef.current = window.setTimeout(() => {
      setGiftShoutout((current) => (current?.id === normalizedGift.id ? null : current));
      giftShoutoutTimerRef.current = null;
    }, 6500);
  }, [buildGiftShoutout, liveExperienceConfig.enableGiftShoutouts]);

  const applyParticipantRealtimeUpdate = useCallback(
    (payload: {
      userId?: string;
      role?: string;
      status?: string;
      viewerCount?: number;
      peakViewerCount?: number;
      emittedAt?: string;
    }) => {
      const participantUserId = String(payload.userId || '').trim();
      const nextStatus = String(payload.status || '').trim().toLowerCase();
      const nextRole = String(payload.role || 'viewer').trim().toLowerCase() || 'viewer';
      const emittedAt = String(payload.emittedAt || new Date().toISOString());
      setSession((prev) => {
        if (!prev) return prev;
        const participants = Array.isArray(prev.participants) ? [...prev.participants] : [];
        if (participantUserId) {
          const index = participants.findIndex((entry) => String(entry.userId || '').trim() === participantUserId);
          if (index >= 0) {
            const current = participants[index];
            participants[index] = {
              ...current,
              role: nextRole || current.role,
              status: nextStatus || current.status,
              joinedAt: nextStatus === 'joined' ? emittedAt : current.joinedAt || null,
              leftAt: nextStatus === 'left' ? emittedAt : nextStatus === 'joined' ? null : current.leftAt || null
            };
          } else {
            participants.push({
              id: `realtime:${participantUserId}`,
              userId: participantUserId,
              role: nextRole,
              micState: true,
              cameraState: true,
              status: nextStatus || 'joined',
              joinedAt: nextStatus === 'joined' ? emittedAt : null,
              leftAt: nextStatus === 'left' ? emittedAt : null
            });
          }
        }

        const viewerCount = Number.isFinite(Number(payload.viewerCount))
          ? Number(payload.viewerCount)
          : Number(prev.viewerCount || 0);
        const peakViewerCount = Number.isFinite(Number(payload.peakViewerCount))
          ? Number(payload.peakViewerCount)
          : Math.max(Number(prev.peakViewerCount || 0), viewerCount);

        return {
          ...prev,
          participants,
          viewerCount,
          peakViewerCount
        };
      });
    },
    []
  );

  const chatEntries = useMemo<LiveChatEntry[]>(
    () =>
      [...comments.map((comment) => ({
        kind: 'comment' as const,
        id: `comment:${String(comment?.id || Math.random())}`,
        createdAt: String(comment?.createdAt || new Date().toISOString()),
        comment
      })), ...giftFeed.map((gift) => ({
        kind: 'gift' as const,
        id: `gift:${gift.id}`,
        createdAt: String(gift.createdAt || new Date().toISOString()),
        gift
      }))]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-200),
    [comments, giftFeed]
  );

  const openDeviceSettings = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      if (typeof (CapacitorApp as any)?.openSettings === 'function') {
        await (CapacitorApp as any).openSettings();
      } else {
        showNotification('warning', 'Livestream', 'Open Android app settings and allow Camera + Microphone permissions.');
      }
    } catch {
      showNotification('warning', 'Livestream', 'Open Android app settings and allow Camera + Microphone permissions.');
    }
  }, [showNotification]);

  const ensureLocalMedia = useCallback(async () => {
    if (hasUsableLocalStream(localStreamRef.current)) return localStreamRef.current as MediaStream;
    if (localStreamRef.current) {
      stopStreamTracks(localStreamRef.current);
      localStreamRef.current = null;
      setLocalStream(null);
    }
    setMediaInitBusy(true);
    setMediaError(null);
    try {
      const primed = consumePrimedLiveMediaStream();
      const { stream, audioLimited } = primed || (await requestLiveMediaStream());
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(Boolean(stream.getAudioTracks()[0]?.enabled ?? true));
      setCameraEnabled(Boolean(stream.getVideoTracks()[0]?.enabled ?? true));
      setConnectionState('connecting');
      updateConnectionDiagnostics({
        localMediaReady: true,
        transportMode: 'unknown'
      });
      if (audioLimited) {
        const warning =
          'Microphone access is unavailable in app mode. Video is running without audio. Enable microphone in app settings and tap Retry Camera.';
        setMediaError(warning);
        showNotification('warning', 'Livestream', warning);
      }
      return stream;
    } catch (error: any) {
      const message = toCompactErrorMessage(error);
      setMediaError(message);
      setConnectionState('failed');
      updateConnectionDiagnostics({ localMediaReady: false });
      throw error;
    } finally {
      setMediaInitBusy(false);
    }
  }, [showNotification, updateConnectionDiagnostics]);

  const createHostPeer = useCallback(
    async (target: string | LiveSignalTarget, options?: { replaceExisting?: boolean }) => {
      const normalizedTarget = normalizeSignalTarget(target);
      const connectionKey = getSignalConnectionKey(normalizedTarget);
      if (!connectionKey) return null;
      if (options?.replaceExisting) {
        closeHostPeer(connectionKey);
      }
      const existing = hostPeersRef.current.get(connectionKey);
      if (existing) {
        const existingState = String(existing.connectionState || '').toLowerCase();
        if (existingState === 'failed' || existingState === 'closed') {
          closeHostPeer(connectionKey);
        } else {
          hostPeerTargetsRef.current.set(connectionKey, normalizedTarget);
          return existing;
        }
      }
      const recycled = hostPeersRef.current.get(connectionKey);
      if (recycled) {
        hostPeerTargetsRef.current.set(connectionKey, normalizedTarget);
        return recycled;
      }
      const pc = new RTCPeerConnection(toLiveRtcConfiguration(realtimeConfigRef.current));
      hostPeersRef.current.set(connectionKey, pc);
      hostPeerTargetsRef.current.set(connectionKey, normalizedTarget);

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const nextTarget = normalizeSignalTarget(hostPeerTargetsRef.current.get(connectionKey));
        if (!nextTarget.userId && !nextTarget.socketId) return;
        sendSignal(nextTarget, {
          kind: 'ice-candidate',
          candidate: event.candidate.toJSON()
        });
      };

      pc.onicecandidateerror = (event: any) => {
        console.warn('Live host ICE candidate error', event);
      };

      pc.onnegotiationneeded = () => {
        void publishHostOffer(connectionKey, pc).catch((error) => {
          console.warn('Failed to renegotiate live host stream', error);
        });
      };

      pc.onconnectionstatechange = () => {
        const state = String(pc.connectionState || '').toLowerCase();
        applyPeerStateSnapshot(pc);
        if (state === 'connected') setConnectionState('connected');
        if (state === 'disconnected') {
          setConnectionState('connecting');
          if (typeof pc.restartIce === 'function') {
            try {
              pc.restartIce();
            } catch (error) {
              console.warn('Failed to restart host ICE', error);
            }
          }
          return;
        }
        if (state === 'failed' || state === 'closed') {
          closeHostPeer(connectionKey);
        }
      };

      pc.oniceconnectionstatechange = () => {
        applyPeerStateSnapshot(pc);
      };

      pc.onsignalingstatechange = () => {
        applyPeerStateSnapshot(pc);
      };

      const stream = await ensureLocalMedia();
      ensureTrackSenders(pc, stream);

      return pc;
    },
    [applyPeerStateSnapshot, closeHostPeer, ensureLocalMedia, publishHostOffer, sendSignal]
  );

  const createViewerPeer = useCallback(() => {
    if (viewerPeerRef.current) {
      const currentState = String(viewerPeerRef.current.connectionState || '').toLowerCase();
      if (!['failed', 'closed', 'disconnected'].includes(currentState)) {
        return viewerPeerRef.current;
      }
      closeViewerPeer({ preserveRemote: true });
    }
    const pc = new RTCPeerConnection(toLiveRtcConfiguration(realtimeConfigRef.current));
    viewerPeerRef.current = pc;

    const inboundStream = new MediaStream();
    refreshRemoteStreamState(inboundStream);

    pc.ontrack = (event) => {
      const incomingTracks: MediaStreamTrack[] = [];
      if (event.streams.length > 0) {
        event.streams.forEach((stream) => {
          stream.getTracks().forEach((track) => {
            incomingTracks.push(track);
          });
        });
      } else if (event.track) {
        incomingTracks.push(event.track);
      }
      attachInboundTracks(inboundStream, incomingTracks);
      syncRemoteReceiversToStream(pc, inboundStream);
      applyPeerStateSnapshot(pc);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const activeHostTarget = normalizeSignalTarget(viewerHostTargetRef.current.userId ? viewerHostTargetRef.current : { userId: hostUserId });
      if (!activeHostTarget.userId && !activeHostTarget.socketId) return;
      sendSignal(activeHostTarget, {
        kind: 'ice-candidate',
        candidate: event.candidate.toJSON()
      });
    };

    pc.onicecandidateerror = (event: any) => {
      console.warn('Live viewer ICE candidate error', event);
    };

    pc.onconnectionstatechange = () => {
      const state = String(pc.connectionState || '').toLowerCase();
      applyPeerStateSnapshot(pc);
      if (state === 'connected') {
        setConnectionState('connected');
        clearConnectionTimeout();
        syncRemoteReceiversToStream(pc, inboundStream);
        clearPeerStatsTimer();
        peerStatsTimerRef.current = window.setInterval(() => {
          void inspectPeerStats(pc);
        }, 4000);
      } else if (state === 'connecting') {
        setConnectionState('connecting');
        scheduleViewerConnectionTimeout();
      } else if (state === 'disconnected') {
        setConnectionState('connecting');
        scheduleViewerConnectionTimeout();
        if (typeof pc.restartIce === 'function') {
          try {
            pc.restartIce();
          } catch (error) {
            console.warn('Failed to restart viewer ICE after disconnect', error);
          }
        }
      } else if (state === 'failed') {
        setConnectionState('failed');
        if (liveExperienceConfig.enableStandbyRecovery && viewerRetryCountRef.current < realtimeConfigRef.current.viewerRetryLimit) {
          requestViewerOffer({ resetPeer: true, incrementRetry: true });
        } else {
          scheduleViewerConnectionTimeout();
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      applyPeerStateSnapshot(pc);
      const state = String(pc.iceConnectionState || '').toLowerCase();
      if (state === 'connected' || state === 'completed') {
        clearConnectionTimeout();
        syncRemoteReceiversToStream(pc, inboundStream);
      }
      if (state === 'failed' && typeof pc.restartIce === 'function') {
        try {
          pc.restartIce();
        } catch (error) {
          console.warn('Failed to restart viewer ICE', error);
        }
      }
    };

    pc.onsignalingstatechange = () => {
      applyPeerStateSnapshot(pc);
    };

    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch {
      // Older engines may not support transceivers consistently.
    }

    return pc;
  }, [
    applyPeerStateSnapshot,
    clearConnectionTimeout,
    clearPeerStatsTimer,
    closeViewerPeer,
    hostUserId,
    inspectPeerStats,
    liveExperienceConfig.enableStandbyRecovery,
    requestViewerOffer,
    refreshRemoteStreamState,
    scheduleViewerConnectionTimeout,
    sendSignal,
    attachInboundTracks,
    syncRemoteReceiversToStream,
    updateConnectionDiagnostics
  ]);

  const closeAllPeers = useCallback(() => {
    Array.from(hostPeersRef.current.keys()).forEach((viewerUserId) => closeHostPeer(viewerUserId));
    closeViewerPeer();
  }, [closeHostPeer, closeViewerPeer]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }, [micEnabled]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const retryViewerConnection = useCallback(() => {
    if (!hostUserId) return;
    requestViewerOffer({ resetPeer: true, incrementRetry: true });
  }, [hostUserId, requestViewerOffer]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    if (!giftModalOpen || !liveFeatureStatus.enableGifts || !liveExperienceConfig.enableDashQuickAction) return;
    let active = true;
    setGiftBalanceLoading(true);
    GcoinService.getMe()
      .then((wallet) => {
        if (!active) return;
        setGiftBalance(Number(wallet?.balance ?? 0));
      })
      .catch(() => {
        if (!active) return;
        setGiftBalance(null);
      })
      .finally(() => {
        if (active) setGiftBalanceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [giftModalOpen, liveExperienceConfig.enableDashQuickAction, liveFeatureStatus.enableGifts]);

  useEffect(() => {
    if (liveExperienceConfig.enableDashQuickAction) return;
    setGiftModalOpen(false);
    setViewerSupportExpanded(false);
    if (activeConsoleTab === 'support') {
      setActiveConsoleTab('overview');
    }
  }, [activeConsoleTab, liveExperienceConfig.enableDashQuickAction]);

  useEffect(() => {
    if (liveExperienceConfig.enableReactions) return;
    setReactionTrayOpen(false);
  }, [liveExperienceConfig.enableReactions]);

  useEffect(() => {
    if (liveExperienceConfig.enableShare) return;
    setShareSheetOpen(false);
  }, [liveExperienceConfig.enableShare]);

  useEffect(() => {
    if (liveExperienceConfig.enableRepost) return;
    setRepostOpen(false);
  }, [liveExperienceConfig.enableRepost]);

  useEffect(() => {
    setGiftFeed([]);
    setGiftShoutout(null);
    viewerRetryCountRef.current = 0;
    processedSignalIdsRef.current = [];
    setConnectionDiagnostics({
      ...DEFAULT_DIAGNOSTICS,
      socketReady: isConnected,
      relayConfigured: realtimeConfigRef.current.relayConfigured,
      relayRecommended: realtimeConfigRef.current.relayRecommended
    });
    if (giftShoutoutTimerRef.current) {
      window.clearTimeout(giftShoutoutTimerRef.current);
      giftShoutoutTimerRef.current = null;
    }
  }, [isConnected, sessionId]);

  useEffect(() => {
    if (!socket || !isConnected || !sessionId) {
      setSessionRoomReady(false);
      return;
    }
    let cancelled = false;
    setSessionRoomReady(false);
    socket.timeout(12000).emit('live:join', { sessionId }, (error: any, response: any) => {
      if (cancelled) return;
      if (error || response?.success === false) {
        setSessionRoomReady(false);
        console.warn('Failed to join live session room', error || response);
        return;
      }
      setSessionRoomReady(true);
    });
    return () => {
      cancelled = true;
      setSessionRoomReady(false);
      if (!isHost && socket.connected) {
        socket.emit('live:leave', { sessionId });
      }
    };
  }, [socket, isConnected, sessionId, isHost]);

  useEffect(() => {
    const pruneTimer = setInterval(() => {
      setFloatingReactions((prev) => prev.slice(-12));
    }, 1200);
    return () => clearInterval(pruneTimer);
  }, []);

  useEffect(() => () => {
    if (giftShoutoutTimerRef.current) {
      window.clearTimeout(giftShoutoutTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (status !== 'live' || !liveExperienceConfig.enableSafetyNotice) {
      setShowSafetyNotice(false);
      return;
    }

    const sessionAnchorMs = sessionStartedAtMs ?? Date.now();
    const elapsedMs = Math.max(0, Date.now() - sessionAnchorMs);
    const initialDelayMs = elapsedMs >= safetyNoticeDelayMs ? 0 : safetyNoticeDelayMs - elapsedMs;
    let startTimer: number | null = null;
    let repeatTimer: number | null = null;
    let hideTimer: number | null = null;

    const showAndScheduleHide = () => {
      setShowSafetyNotice(true);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setShowSafetyNotice(false), safetyNoticeVisibleMs);
    };

    startTimer = window.setTimeout(() => {
      showAndScheduleHide();
      repeatTimer = window.setInterval(showAndScheduleHide, safetyNoticeRepeatMs);
    }, initialDelayMs);

    return () => {
      if (startTimer) window.clearTimeout(startTimer);
      if (repeatTimer) window.clearInterval(repeatTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [
    liveExperienceConfig.enableSafetyNotice,
    safetyNoticeDelayMs,
    safetyNoticeRepeatMs,
    safetyNoticeVisibleMs,
    sessionStartedAtMs,
    status
  ]);

  useEffect(() => {
    const parsed = parseLiveFilter(sessionMetadata);
    setActiveFilterPreset(parsed.preset);
    setActiveFilterStrength(parsed.strength);
  }, [sessionMetadata]);

  useEffect(() => {
    const onReaction = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          likesCount: Number(detail.likesCount ?? prev.likesCount ?? 0),
          lovesCount: Number(detail.lovesCount ?? prev.lovesCount ?? 0)
        };
      });
      const emoji = String(detail.type || '').toLowerCase() === 'love' ? '\u2764\uFE0F' : '\u{1F44D}';
      setFloatingReactions((prev) => [...prev.slice(-10), { id: `${Date.now()}-${Math.random()}`, emoji }]);
    };

    const onViewer = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      setSession((prev) => {
        if (!prev) return prev;
        const viewerCount = Number(detail.viewerCount ?? prev.viewerCount ?? 0);
        const peak = Math.max(Number(prev.peakViewerCount || 0), viewerCount);
        return {
          ...prev,
          viewerCount,
          peakViewerCount: peak
        };
      });
    };

    const onEnded = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const detailSessionId = String(detail.sessionId || detail.session?.id || '').trim();
      if (detailSessionId !== sessionId) return;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'ended',
              endedAt: detail?.session?.endedAt || new Date().toISOString()
            }
          : prev
      );
    };

    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const detailSessionId = String(detail.sessionId || detail.session?.id || '').trim();
      if (detailSessionId !== sessionId) return;
      if (detail?.session) {
        setSession(detail.session);
      } else {
        void loadSession();
      }
    };

    const onJoined = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      const joinedUserId = String(detail.userId || '').trim();
      const joinedSocketId = String(detail.socketId || '').trim();
      applyParticipantRealtimeUpdate({
        userId: joinedUserId,
        role: detail.role,
        status: detail.status || 'joined',
        viewerCount: detail.viewerCount,
        peakViewerCount: detail.peakViewerCount,
        emittedAt: detail.emittedAt
      });
      if (
        isHost &&
        status === 'live' &&
        joinedUserId &&
        joinedUserId !== String(user?.id || '').trim()
      ) {
        const stableLayout = liveExperienceConfig.keepViewerLayoutStable;
        const matchingEntries = joinedSocketId
          ? Array.from(hostPeerTargetsRef.current.entries()).filter(
              ([connectionKey, target]) =>
                connectionKey === joinedSocketId || String(target.socketId || '').trim() === joinedSocketId
            )
          : stableLayout
            ? []
            : Array.from(hostPeerTargetsRef.current.entries()).filter(
                ([, target]) => String(target.userId || '').trim() === joinedUserId
              );

        matchingEntries.forEach(([connectionKey, pcTarget]) => {
            const peer = hostPeersRef.current.get(connectionKey);
            if (!peer) return;
            hostPeerTargetsRef.current.set(
              connectionKey,
              normalizeSignalTarget({
                userId: joinedUserId || pcTarget.userId,
                socketId: joinedSocketId || pcTarget.socketId
              })
            );
            void publishHostOffer(connectionKey, peer).catch((error) => {
              console.warn('Failed to republish live offer for existing viewer socket', error);
            });
          });
      }
    };

    const onLeft = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      applyParticipantRealtimeUpdate({
        userId: detail.userId,
        status: 'left',
        viewerCount: detail.viewerCount,
        peakViewerCount: detail.peakViewerCount,
        emittedAt: detail.emittedAt
      });
    };

    const onGift = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      if (!detail.gift?.id) return;
      pushGiftShoutout(detail.gift);
    };

    const onComment = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      const nextComment = detail.comment;
      if (!nextComment?.id) return;
      setComments((prev) => {
        const exists = prev.some((entry) => String(entry?.id) === String(nextComment.id));
        if (exists) return prev;
        return [...prev, nextComment].slice(-200);
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              commentsCount: Number(detail.commentsCount ?? prev.commentsCount ?? 0)
            }
          : prev
      );
    };

    const onRecordingChange = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || detail.session?.id || '') !== sessionId) return;
      void loadSession();
    };

    const onFilterUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      const preset = normalizeFilterPreset(detail?.filter?.preset ?? detail?.preset);
      const strength = clampFilterStrength(detail?.filter?.strength ?? detail?.strength);
      setActiveFilterPreset(preset);
      setActiveFilterStrength(strength);
      setSession((prev) => {
        if (!prev) return prev;
        const metadata =
          prev.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
            ? { ...(prev.metadata as Record<string, any>) }
            : {};
        metadata.liveFilter = { preset, strength, updatedAt: detail?.emittedAt || new Date().toISOString() };
        return { ...prev, metadata };
      });
    };

    const onRestriction = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.userId || '') !== String(user?.id || '')) return;
      const restrictionType = String(detail?.restriction?.type || '').toUpperCase();
      if (restrictionType === 'LIVE_BAN' || restrictionType === 'LIVE_SUSPEND') {
        showNotification('warning', 'Livestream', 'Livestream access is restricted by admin policy.');
      }
    };

    window.addEventListener('live:reaction', onReaction as EventListener);
    window.addEventListener('live:viewer_count_updated', onViewer as EventListener);
    window.addEventListener('live:started', onStarted as EventListener);
    window.addEventListener('live:ended', onEnded as EventListener);
    window.addEventListener('live:participant_joined', onJoined as EventListener);
    window.addEventListener('live:participant_left', onLeft as EventListener);
    window.addEventListener('live:gift_sent', onGift as EventListener);
    window.addEventListener('live:comment', onComment as EventListener);
    window.addEventListener('live:recording_updated', onRecordingChange as EventListener);
    window.addEventListener('live:recording_published', onRecordingChange as EventListener);
    window.addEventListener('live:recording_unpublished', onRecordingChange as EventListener);
    window.addEventListener('live:recording_deleted', onRecordingChange as EventListener);
    window.addEventListener('live:restriction_updated', onRestriction as EventListener);
    window.addEventListener('live:filter_updated', onFilterUpdated as EventListener);
    return () => {
      window.removeEventListener('live:reaction', onReaction as EventListener);
      window.removeEventListener('live:viewer_count_updated', onViewer as EventListener);
      window.removeEventListener('live:started', onStarted as EventListener);
      window.removeEventListener('live:ended', onEnded as EventListener);
      window.removeEventListener('live:participant_joined', onJoined as EventListener);
      window.removeEventListener('live:participant_left', onLeft as EventListener);
      window.removeEventListener('live:gift_sent', onGift as EventListener);
      window.removeEventListener('live:comment', onComment as EventListener);
      window.removeEventListener('live:recording_updated', onRecordingChange as EventListener);
      window.removeEventListener('live:recording_published', onRecordingChange as EventListener);
      window.removeEventListener('live:recording_unpublished', onRecordingChange as EventListener);
      window.removeEventListener('live:recording_deleted', onRecordingChange as EventListener);
      window.removeEventListener('live:restriction_updated', onRestriction as EventListener);
      window.removeEventListener('live:filter_updated', onFilterUpdated as EventListener);
    };
  }, [
    applyParticipantRealtimeUpdate,
    createHostPeer,
    isHost,
    loadSession,
    publishHostOffer,
    liveExperienceConfig.keepViewerLayoutStable,
    pushGiftShoutout,
    sessionId,
    showNotification,
    status,
    user?.id
  ]);

  useEffect(() => {
    const onSignal = async (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '').trim() !== sessionId) return;
      const signalId = String(detail.signalId || '').trim();
      if (signalId) {
        if (processedSignalIdsRef.current.includes(signalId)) return;
        processedSignalIdsRef.current = [...processedSignalIdsRef.current.slice(-199), signalId];
      }
      const fromUserId = String(detail.fromUserId || '').trim();
      const fromSocketId = String(detail.fromSocketId || '').trim();
      const toUserId = String(detail.toUserId || '').trim();
      const signal = detail.signal || {};
      const kind = String(signal.kind || '').trim();
      const currentUserId = String(user?.id || '').trim();
      if (toUserId && currentUserId && toUserId !== currentUserId) return;
      if (!fromUserId || !kind) return;
      updateConnectionDiagnostics({ lastSignalAt: new Date().toISOString() });

      try {
        if (isHost) {
          const hostPeerKey = getSignalConnectionKey({ userId: fromUserId, socketId: fromSocketId });
          if (kind === 'viewer-ready') {
            emitLiveTrace({
              liveStage: 'host-viewer-ready:received',
              fromUserId,
              fromSocketId,
              connectionKey: hostPeerKey
            });
            const existingPeer = hostPeersRef.current.get(hostPeerKey) || null;
            const shouldReplacePeer =
              Boolean(existingPeer) &&
              ['failed', 'closed'].includes(String(existingPeer?.connectionState || '').toLowerCase());
            const pc = await createHostPeer(
              { userId: fromUserId, socketId: fromSocketId },
              shouldReplacePeer ? { replaceExisting: true } : undefined
            );
            if (!pc) return;
            await publishHostOffer(hostPeerKey, pc);
            return;
          }

          const hostPeer =
            hostPeersRef.current.get(hostPeerKey) ||
            hostPeersRef.current.get(String(fromUserId || '').trim());
          if (!hostPeer) return;

          if (kind === 'answer' && signal.sdp) {
            if (String(hostPeer.signalingState || '').toLowerCase() !== 'have-local-offer') {
              return;
            }
            try {
              await hostPeer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: String(signal.sdp) }));
            } catch (answerError) {
              console.warn('Failed to apply live viewer answer; recreating host peer', answerError);
              closeHostPeer(hostPeerKey);
              const replacementPeer = await createHostPeer({ userId: fromUserId, socketId: fromSocketId });
              if (replacementPeer) {
                await publishHostOffer(hostPeerKey, replacementPeer);
              }
              return;
            }
            const pendingCandidates = pendingHostCandidatesRef.current.get(hostPeerKey) || [];
            if (pendingCandidates.length) {
              pendingHostCandidatesRef.current.delete(hostPeerKey);
              for (const candidate of pendingCandidates) {
                try {
                  await hostPeer.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (candidateError) {
                  console.warn('Failed to apply queued host ICE candidate', candidateError);
                }
              }
            }
            return;
          }

          if (kind === 'ice-candidate' && signal.candidate) {
            const hasRemoteDescription = Boolean(hostPeer.remoteDescription && hostPeer.remoteDescription.type);
            if (!hasRemoteDescription) {
              const pending = pendingHostCandidatesRef.current.get(hostPeerKey) || [];
              pending.push(signal.candidate as RTCIceCandidateInit);
              pendingHostCandidatesRef.current.set(hostPeerKey, pending.slice(-60));
              return;
            }
            await hostPeer.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          return;
        }

        if (!hostUserId || fromUserId !== hostUserId) return;
        viewerHostTargetRef.current = {
          userId: hostUserId,
          socketId: fromSocketId || null
        };

        if (kind === 'offer' && signal.sdp) {
          const currentViewerPeer = viewerPeerRef.current;
          const shouldResetViewerPeer =
            Boolean(currentViewerPeer) &&
            (
              String(currentViewerPeer?.signalingState || '').toLowerCase() !== 'stable' ||
              Boolean(currentViewerPeer?.remoteDescription?.type) ||
              Boolean(currentViewerPeer?.localDescription?.type)
            );
          if (shouldResetViewerPeer) {
            closeViewerPeer({ preserveRemote: true });
          }
          const pc = createViewerPeer();
          clearConnectionTimeout();
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: String(signal.sdp) }));
          syncRemoteReceiversToStream(pc);
          if (pendingViewerCandidatesRef.current.length) {
            const pending = [...pendingViewerCandidatesRef.current];
            pendingViewerCandidatesRef.current = [];
            for (const candidate of pending) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (candidateError) {
                console.warn('Failed to apply queued viewer ICE candidate', candidateError);
              }
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(viewerHostTargetRef.current.userId ? viewerHostTargetRef.current : hostUserId, {
            kind: 'answer',
            sdp: answer.sdp || ''
          });
          scheduleViewerConnectionTimeout();
          return;
        }

        if (kind === 'ice-candidate' && signal.candidate) {
          const pc = createViewerPeer();
          const hasRemoteDescription = Boolean(pc.remoteDescription && pc.remoteDescription.type);
          if (!hasRemoteDescription) {
            pendingViewerCandidatesRef.current = [...pendingViewerCandidatesRef.current, signal.candidate as RTCIceCandidateInit].slice(-80);
            return;
          }
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (error: any) {
        emitLiveTrace({
          liveStage: isHost ? 'host-signal:error' : 'viewer-signal:error',
          fromUserId,
          fromSocketId: fromSocketId || null,
          kind,
          message: String(error?.message || error || 'unknown')
        });
        console.error('Live signal handling failed', error);
      }
    };

    window.addEventListener('live:signal', onSignal as EventListener);
    return () => {
      window.removeEventListener('live:signal', onSignal as EventListener);
    };
  }, [
    clearConnectionTimeout,
    closeHostPeer,
    closeViewerPeer,
    createHostPeer,
    createViewerPeer,
    hostUserId,
    isHost,
    publishHostOffer,
    scheduleViewerConnectionTimeout,
    sendSignal,
    sessionId,
    syncRemoteReceiversToStream,
    updateConnectionDiagnostics,
    emitLiveTrace,
    user?.id
  ]);

  useEffect(() => {
    if (!session) return;
    if (!isHost) return;
    if (status !== 'live' && !isHostPreview) return;

    // Camera/mic readiness must not depend on socket state. If signaling reconnects
    // slowly, the host should still get an immediate permission prompt and local preview.
    void ensureLocalMedia().catch(() => {
      // user-visible message already set via mediaError state
    });
  }, [ensureLocalMedia, isHost, isHostPreview, session, status]);

  useEffect(() => {
    if (!isHost || !localStream || status !== 'live') return;
    hostPeersRef.current.forEach((pc, viewerUserId) => {
      void (async () => {
        try {
          await syncPeerSenders(pc, localStream);
          await publishHostOffer(viewerUserId, pc);
        } catch (error) {
          console.warn('Failed to sync host live tracks to viewer peer', error);
        }
      })();
    });
  }, [isHost, localStream, publishHostOffer, status]);

  useEffect(() => {
    if (!isHost || status !== 'live' || !sessionRoomReady || !localStream) {
      hostPublishSignatureRef.current = '';
      return;
    }
    const targetConnectionKeys = Array.from(hostPeerTargetsRef.current.keys()).sort();
    const streamSignature = localStream
      .getTracks()
      .map((track) => `${track.kind}:${track.id}:${track.readyState}`)
      .sort()
      .join('|');
    const nextSignature = [sessionId, sessionRoomReady ? '1' : '0', streamSignature, targetConnectionKeys.join(',')].join(':');
    if (!targetConnectionKeys.length || hostPublishSignatureRef.current === nextSignature) return;
    hostPublishSignatureRef.current = nextSignature;
    targetConnectionKeys.forEach((connectionKey) => {
      void (async () => {
        try {
          const target = hostPeerTargetsRef.current.get(connectionKey);
          const pc = await createHostPeer(target || connectionKey);
          if (!pc) return;
          await publishHostOffer(connectionKey, pc);
        } catch (error) {
          console.warn('Failed to republish live stream after host/session refresh', error);
        }
      })();
    });
  }, [createHostPeer, isHost, localStream, publishHostOffer, sessionId, sessionRoomReady, status]);

  useEffect(() => {
    if (canPlayVideo && !remoteTrackCount && !isHost) {
      updateConnectionDiagnostics({ transportMode: 'hls-fallback' });
    }
  }, [canPlayVideo, isHost, remoteTrackCount, updateConnectionDiagnostics]);

  useEffect(() => {
    if (!sessionId || !isConnected || !socket) {
      viewerBootstrapSignatureRef.current = '';
      return;
    }
    if (!sessionRoomReady || status !== 'live' || isHost || !hostUserId) {
      viewerBootstrapSignatureRef.current = '';
      return;
    }

    const bootstrapSignature = [sessionId, hostUserId, status, isConnected ? '1' : '0', sessionRoomReady ? '1' : '0'].join(':');
    if (viewerBootstrapSignatureRef.current === bootstrapSignature) return;
    viewerBootstrapSignatureRef.current = bootstrapSignature;

    viewerRetryCountRef.current = 0;
    updateConnectionDiagnostics({ retryCount: 0 });
    requestViewerOffer({ resetPeer: true });

    return () => {
      clearConnectionTimeout();
    };
  }, [
    clearConnectionTimeout,
    hostUserId,
    isConnected,
    isHost,
    requestViewerOffer,
    sessionId,
    sessionRoomReady,
    socket,
    status,
    updateConnectionDiagnostics
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !session) return;

    if (isHost && localStream && (status === 'live' || isHostPreview)) {
      video.srcObject = localStream;
      video.muted = true;
      video.controls = false;
      video.autoplay = true;
      video.playsInline = true;
      void video.play().catch(() => {});
      return;
    }

    if (!isHost && remoteStream && remoteTrackCount > 0) {
      video.srcObject = remoteStream;
      video.muted = viewerMuted;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      void video.play().catch(() => {});
      return;
    }

    if (canPlayVideo) {
      video.srcObject = null;
      video.src = session.hlsUrl || session.streamUrl || '';
      video.muted = viewerMuted;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      void video.play().catch(() => {});
      return;
    }

    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
  }, [canPlayVideo, isHost, isHostPreview, localStream, remoteStream, remoteTrackCount, session, status, viewerMuted]);

  useEffect(() => {
    return () => {
      clearConnectionTimeout();
      clearPeerStatsTimer();
      closeAllPeers();
      stopStreamTracks(localStreamRef.current);
      localStreamRef.current = null;
      viewerHostTargetRef.current = { userId: null, socketId: null };
    };
  }, [clearConnectionTimeout, clearPeerStatsTimer, closeAllPeers]);

  const sendReaction = useCallback(
    async (type: 'like' | 'love') => {
      if (!liveExperienceConfig.enableReactions) return;
      if (!sessionId) return;
      try {
        const result = await LiveService.react(sessionId, type);
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            likesCount: Number(result?.likesCount ?? prev.likesCount ?? 0),
            lovesCount: Number(result?.lovesCount ?? prev.lovesCount ?? 0)
          };
        });
        setFloatingReactions((prev) => [
          ...prev.slice(-10),
          { id: `${Date.now()}-${Math.random()}`, emoji: type === 'love' ? '\u2764\uFE0F' : '\u{1F44D}' }
        ]);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to react.';
        showNotification('error', 'Livestream', message);
      }
    },
    [liveExperienceConfig.enableReactions, sessionId, showNotification]
  );

  const sendGift = useCallback(
    async (payload: { amountGcoin: number; message?: string }) => {
      if (!liveFeatureStatus.enableGifts || !liveExperienceConfig.enableDashQuickAction) return;
      if (!sessionId) return;
      try {
        setGiftSending(true);
        const result = await LiveService.sendGift(sessionId, payload);
        if (result?.gift) {
          pushGiftShoutout(result.gift);
        }
        setGiftBalance((prev) =>
          prev === null ? prev : Math.max(0, Number(prev || 0) - Number(payload.amountGcoin || 0))
        );
        setGiftModalOpen(false);
        showNotification('success', 'Livestream', 'Gift sent.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to send gift.';
        showNotification('error', 'Livestream', message);
      } finally {
        setGiftSending(false);
      }
    },
    [liveExperienceConfig.enableDashQuickAction, liveFeatureStatus.enableGifts, pushGiftShoutout, sessionId, showNotification]
  );

  const startFromPreview = useCallback(async () => {
    if (!sessionId || !isHostPreview) return;
    try {
      const media = await ensureLocalMedia();
      const updated = await LiveService.startSession(sessionId);
      setSession(updated);
      if (media.audioLimited) {
        showNotification(
          'warning',
          'Livestream',
          'Microphone access is unavailable in app mode. Live started with camera only. Enable microphone in app settings, then retry camera.'
        );
      }
      showNotification('success', 'Livestream', 'Live session started.');
      navigate(`/live/${encodeURIComponent(sessionId)}`, { replace: true });
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        (error?.name ? toCompactErrorMessage(error) : null) ||
        error?.message ||
        'Failed to start livestream.';
      showNotification('error', 'Livestream', message);
    }
  }, [ensureLocalMedia, isHostPreview, navigate, sessionId, showNotification]);

  const leaveStream = useCallback(async () => {
    if (!sessionId) return;
    try {
      await LiveService.leaveSession(sessionId);
      showNotification('success', 'Livestream', 'You left the stream.');
      navigate('/live/studio');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to leave livestream.';
      showNotification('error', 'Livestream', message);
    }
  }, [navigate, sessionId, showNotification]);

  const endStream = useCallback(async () => {
    if (!sessionId) return;
    if (!window.confirm('End this live stream for all participants and viewers?')) return;
    try {
      const updated = await LiveService.endSession(sessionId);
      setSession(updated);
      showNotification('success', 'Livestream', 'Live stream ended for all participants.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to end livestream.';
      showNotification('error', 'Livestream', message);
    }
  }, [sessionId, showNotification]);

  const sendComment = useCallback(async () => {
    if (!sessionId || commentSending) return;
    const messageText = String(commentDraft || '').trim();
    if (!messageText) return;
    try {
      setCommentSending(true);
      const result = await LiveService.addComment(sessionId, messageText);
      setComments((prev) => [...prev, result.comment].slice(-200));
      setCommentDraft('');
      setSession((prev) =>
        prev
          ? {
              ...prev,
              commentsCount: Number(result.commentsCount ?? prev.commentsCount ?? 0)
            }
          : prev
      );
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to send comment.';
      showNotification('error', 'Livestream', message);
    } finally {
      setCommentSending(false);
    }
  }, [commentDraft, commentSending, sessionId, showNotification]);

  const applyFilter = useCallback(async () => {
    if (!sessionId || !isHost || filterBusy) return;
    try {
      setFilterBusy(true);
      const result = await LiveService.setFilter(sessionId, {
        preset: activeFilterPreset,
        strength: activeFilterStrength
      });
      const preset = normalizeFilterPreset(result?.filter?.preset ?? activeFilterPreset);
      const strength = clampFilterStrength(result?.filter?.strength ?? activeFilterStrength);
      setActiveFilterPreset(preset);
      setActiveFilterStrength(strength);
      setSession((prev) => {
        if (!prev) return prev;
        const metadata =
          prev.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
            ? { ...(prev.metadata as Record<string, any>) }
            : {};
        metadata.liveFilter = { preset, strength, updatedAt: new Date().toISOString() };
        return { ...prev, metadata };
      });
      showNotification('success', 'Livestream', 'Live filter updated.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to update live filter.';
      showNotification('error', 'Livestream', message);
    } finally {
      setFilterBusy(false);
    }
  }, [activeFilterPreset, activeFilterStrength, filterBusy, isHost, sessionId, showNotification]);

  const saveRecording = useCallback(async () => {
    if (!sessionId || recordingBusy) return;
    const fileId = String(recordingFileIdDraft || '').trim();
    if (!fileId) {
      showNotification('warning', 'Livestream', 'Recording file ID is required.');
      return;
    }
    try {
      setRecordingBusy(true);
      const updated = await LiveService.saveRecording(sessionId, {
        recordingFileId: fileId,
        title: String(recordingTitleDraft || '').trim() || undefined,
        description: String(recordingDescriptionDraft || '').trim() || undefined
      });
      setSession(updated);
      showNotification('success', 'Livestream', 'Recording details saved.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to save recording.';
      showNotification('error', 'Livestream', message);
    } finally {
      setRecordingBusy(false);
    }
  }, [recordingBusy, recordingDescriptionDraft, recordingFileIdDraft, recordingTitleDraft, sessionId, showNotification]);

  const publishRecording = useCallback(
    async (target: 'post' | 'scroll') => {
      if (!sessionId || recordingBusy) return;
      try {
        setRecordingBusy(true);
        const updated = await LiveService.publishRecording(sessionId, { target });
        setSession(updated);
        showNotification('success', 'Livestream', `Recording published to ${target === 'scroll' ? 'Scroll' : 'Posts'}.`);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to publish recording.';
        showNotification('error', 'Livestream', message);
      } finally {
        setRecordingBusy(false);
      }
    },
    [recordingBusy, sessionId, showNotification]
  );

  const unpublishRecording = useCallback(async () => {
    if (!sessionId || recordingBusy) return;
    try {
      setRecordingBusy(true);
      const updated = await LiveService.unpublishRecording(sessionId);
      setSession(updated);
      showNotification('success', 'Livestream', 'Recording unpublished.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to unpublish recording.';
      showNotification('error', 'Livestream', message);
    } finally {
      setRecordingBusy(false);
    }
  }, [recordingBusy, sessionId, showNotification]);

  const deleteRecording = useCallback(async () => {
    if (!sessionId || recordingBusy) return;
    if (!window.confirm('Delete this saved recording from the live session?')) return;
    try {
      setRecordingBusy(true);
      const updated = await LiveService.deleteRecording(sessionId);
      setSession(updated);
      showNotification('success', 'Livestream', 'Recording removed.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete recording.';
      showNotification('error', 'Livestream', message);
    } finally {
      setRecordingBusy(false);
    }
  }, [recordingBusy, sessionId, showNotification]);

  useEffect(() => {
    if (!session) return;
    const recording = session.recording || {};
    setRecordingFileIdDraft(String(recording.fileId || session.recordingFileId || '').trim());
    setRecordingTitleDraft(String(recording.title || session.title || '').trim());
    setRecordingDescriptionDraft(String(recording.description || session.description || '').trim());
  }, [session]);

  const handleShare = useCallback(() => {
    if (!liveExperienceConfig.enableShare) return;
    setShareSheetOpen(true);
  }, [liveExperienceConfig.enableShare]);

  const handleShareChannel = useCallback(
    async (channel: 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'whatsapp' | 'copy') => {
      const encodedUrl = encodeURIComponent(liveUrl);
      const encodedText = encodeURIComponent(liveShareText);

      if (channel === 'copy') {
        try {
          await navigator.clipboard.writeText(liveUrl);
          showNotification('success', 'Livestream', 'Live URL copied.');
        } catch {
          showNotification('warning', 'Livestream', liveUrl);
        }
        setShareSheetOpen(false);
        return;
      }

      if (channel === 'tiktok') {
        try {
          await navigator.clipboard.writeText(liveUrl);
        } catch {}
        window.open('https://www.tiktok.com/', '_blank', 'noopener,noreferrer');
        showNotification('success', 'Livestream', 'Live URL copied for TikTok sharing.');
        setShareSheetOpen(false);
        return;
      }

      const targetUrl =
        channel === 'facebook'
          ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
          : channel === 'twitter'
            ? `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
            : channel === 'linkedin'
              ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
              : `https://wa.me/?text=${encodedText}`;
      window.open(targetUrl, '_blank', 'noopener,noreferrer,width=720,height=720');
      setShareSheetOpen(false);
    },
    [liveShareText, liveUrl, showNotification]
  );

  const repostLiveToFeed = useCallback(
    async (comment?: string) => {
      if (!liveExperienceConfig.enableRepost || actionBusy) return;
      if (!user?.id) {
        showNotification('warning', 'Livestream', 'Please sign in to repost this live stream.');
        return;
      }
      setActionBusy(true);
      try {
        const wrapperComment = String(comment || '').trim();
        const sessionTitle = String(session?.title || '').trim() || `${hostName} is live on Scrolith`;
        const sessionDescription = String(session?.description || '').trim();
        await CommunityService.createPost({
          title: sessionTitle,
          content: wrapperComment ? `${wrapperComment}\n\n${liveUrl}` : `${sessionDescription || sessionTitle}\n\n${liveUrl}`,
          visibility: 'public'
        });
        showNotification('success', 'Livestream', 'Live stream reposted to your Scrolith feed.');
        setRepostOpen(false);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Unable to repost this live stream.';
        showNotification('error', 'Livestream', message);
      } finally {
        setActionBusy(false);
      }
    },
    [actionBusy, hostName, liveExperienceConfig.enableRepost, liveUrl, session?.description, session?.title, showNotification, user?.id]
  );

  const openGiftComposer = useCallback(() => {
    if (!liveFeatureStatus.enableGifts || !liveExperienceConfig.enableDashQuickAction || isHost) return;
    setViewerSupportExpanded(true);
    setActiveConsoleTab('support');
    setGiftModalOpen(true);
  }, [isHost, liveExperienceConfig.enableDashQuickAction, liveFeatureStatus.enableGifts]);

  const closeGiftComposer = useCallback(() => {
    setGiftModalOpen(false);
  }, []);

  const toggleReactionTray = useCallback(() => {
    if (!liveExperienceConfig.enableReactions) return;
    setReactionTrayOpen((prev) => !prev);
  }, [liveExperienceConfig.enableReactions]);

  const closeReactionTray = useCallback(() => {
    setReactionTrayOpen(false);
  }, []);

  const effectiveConnectionState: 'idle' | 'connecting' | 'connected' | 'failed' = isHost
    ? mediaError
      ? 'failed'
      : (status === 'live' || isHostPreview) && localStream
        ? 'connected'
        : mediaInitBusy || status === 'live' || isHostPreview
          ? 'connecting'
          : 'idle'
    : canPlayVideo && !remoteTrackCount && status === 'live'
      ? 'connected'
      : connectionState;

  useEffect(() => {
    if (!liveExperienceConfig.enableStandbyRecovery) return;
    if (isHost || status !== 'live' || !sessionRoomReady || !hostUserId) return;
    if (effectiveConnectionState === 'connected') return;
    const intervalMs = Number(realtimeConfig.viewerRetryIntervalMs || 0);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
    const interval = window.setInterval(() => {
      if (isHost || status !== 'live' || !sessionRoomReady || !hostUserId) return;
      if (remoteTrackCountRef.current > 0) return;
      if (viewerRetryCountRef.current >= realtimeConfigRef.current.viewerRetryLimit) return;
      requestViewerOffer({ resetPeer: true, incrementRetry: true });
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [
    effectiveConnectionState,
    hostUserId,
    isHost,
    liveExperienceConfig.enableStandbyRecovery,
    requestViewerOffer,
    realtimeConfig.viewerRetryIntervalMs,
    sessionRoomReady,
    status
  ]);

  useEffect(() => {
    if (!(giftModalOpen || reactionTrayOpen)) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setGiftModalOpen(false);
      setReactionTrayOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [giftModalOpen, reactionTrayOpen]);

  const consoleTabs = useMemo<Array<{ id: LiveConsoleTab; label: string }>>(() => {
    const tabs: Array<{ id: LiveConsoleTab; label: string }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'chat', label: 'Chat' }
    ];
    if (isHost) {
      tabs.push({ id: 'tools', label: 'Controls' });
    } else if (liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction) {
      tabs.push({ id: 'support', label: 'Dash' });
    }
    if (canManageRecording) {
      tabs.push({ id: 'recording', label: 'Recording' });
    }
    return tabs;
  }, [canManageRecording, isHost, liveExperienceConfig.enableDashQuickAction, liveFeatureStatus.enableGifts]);

  useEffect(() => {
    if (consoleTabs.some((tab) => tab.id === activeConsoleTab)) return;
    setActiveConsoleTab('overview');
  }, [activeConsoleTab, consoleTabs]);

  const connectionLabel =
    isHost
      ? isHostPreview
        ? effectiveConnectionState === 'connected'
          ? 'Preview ready'
          : effectiveConnectionState === 'connecting'
            ? 'Preparing preview'
            : effectiveConnectionState === 'failed'
              ? 'Preview issue'
              : 'Preview standby'
        : effectiveConnectionState === 'connected'
        ? 'Broadcast ready'
        : effectiveConnectionState === 'connecting'
          ? 'Preparing broadcast'
          : effectiveConnectionState === 'failed'
            ? 'Device issue'
            : 'Standby'
      : effectiveConnectionState === 'connected'
        ? connectionDiagnostics.transportMode === 'webrtc-relay'
          ? 'Relay live'
          : connectionDiagnostics.transportMode === 'hls-fallback'
            ? 'Playback fallback'
            : 'Connected'
        : effectiveConnectionState === 'connecting'
          ? 'Connecting'
          : effectiveConnectionState === 'failed'
            ? 'Connection issue'
            : 'Idle';

  const diagnosticsSummary = useMemo(() => {
    if (isHost) {
      if (isHostPreview) {
        if (effectiveConnectionState === 'connected') {
          return {
            title: 'Preview is ready',
            body: 'Camera and microphone are primed. Review framing, lighting, and session details before you go live.'
          };
        }
        if (effectiveConnectionState === 'connecting') {
          return {
            title: 'Preparing preview',
            body: 'Scrolith is opening the local camera and microphone so the host can review the session before broadcast.'
          };
        }
        if (effectiveConnectionState === 'failed') {
          return {
            title: 'Preview attention needed',
            body: mediaError || 'Camera or microphone access needs attention before this session can go live.'
          };
        }
        return {
          title: 'Preview on standby',
          body: 'Use this room to rehearse the session, then start the broadcast when everything looks right.'
        };
      }
      if (effectiveConnectionState === 'connected') {
        return {
          title: 'Broadcast ready',
          body: realtimeConfig.relayConfigured
            ? 'Camera, microphone, and signaling are ready. Viewers can connect with relay-assisted coverage across restrictive networks.'
            : 'Camera and microphone are live. Viewer delivery is running in direct WebRTC mode until TURN relay is configured.'
        };
      }
      if (effectiveConnectionState === 'connecting') {
        return {
          title: 'Preparing host stream',
          body: 'Scrolith is priming local media and waiting for the next viewer negotiation request.'
        };
      }
      if (effectiveConnectionState === 'failed') {
        return {
          title: 'Host device attention needed',
          body: mediaError || 'Camera or microphone access needs attention before viewers can receive the stream.'
        };
      }
      return {
        title: 'Ready when you are',
        body: 'Open the camera and keep this page active while viewers join.'
      };
    }
    if (effectiveConnectionState === 'connected') {
      return {
        title: connectionDiagnostics.transportMode === 'webrtc-relay' ? 'Relay protected' : 'Live transport active',
        body:
          connectionDiagnostics.transportMode === 'webrtc-relay'
            ? 'TURN relay is carrying this session, which is the most stable mode across carrier NAT and restrictive Wi-Fi.'
            : connectionDiagnostics.transportMode === 'hls-fallback'
              ? 'Viewer playback is using the recorded stream path instead of a direct realtime peer.'
              : 'WebRTC peer transport is active and the live track is flowing.'
      };
    }
    if (effectiveConnectionState === 'connecting') {
      return {
        title: 'Negotiating live link',
        body: realtimeConfig.relayConfigured
          ? 'Scrolith is retrying session signaling and relay candidates until the live track is established.'
          : 'Scrolith is trying direct WebRTC routes. TURN relay is recommended for stronger cross-network compatibility.'
      };
    }
    if (effectiveConnectionState === 'failed') {
      return {
        title: 'Connection recovery required',
        body: realtimeConfig.relayConfigured
          ? 'The last negotiation stalled. Retry will force a fresh peer and relay path.'
          : 'The direct peer route failed. TURN relay is recommended for reliable mobile-to-mobile and mixed-network sessions.'
      };
    }
    return {
      title: 'Waiting for broadcast',
      body: 'Stay on this page while Scrolith requests a fresh host offer.'
    };
  }, [
    connectionDiagnostics.transportMode,
    effectiveConnectionState,
    isHost,
    isHostPreview,
    mediaError,
    realtimeConfig.relayConfigured
  ]);

  const diagnosticsTone = useMemo<'ready' | 'warning' | 'critical'>(() => {
    if (effectiveConnectionState === 'connected') return 'ready';
    if (realtimeConfig.relayConfigured || effectiveConnectionState === 'connecting') return 'warning';
    return 'critical';
  }, [effectiveConnectionState, realtimeConfig.relayConfigured]);

  const overviewPanel = (
    <div className="space-y-4">
      <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.94),_rgba(255,255,255,1))] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(status)}`}>
                {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {String(session?.visibility || 'public').toUpperCase()}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getConnectionTone(effectiveConnectionState)}`}>
                {connectionLabel}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">{session?.title || 'Untitled livestream'}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {session?.description || 'No description provided.'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live age</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{streamAgeLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Viewers</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session?.viewerCount || 0))}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Peak</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session?.peakViewerCount || 0))}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Likes</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session?.likesCount || 0))}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Loves</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session?.lovesCount || 0))}</p>
        </div>
      </div>

      <div className={`rounded-2xl border px-4 py-4 ${getDiagnosticsTone(diagnosticsTone)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Realtime health</p>
            <p className="mt-2 text-sm font-semibold">{diagnosticsSummary.title}</p>
            <p className="mt-1 text-xs leading-5">{diagnosticsSummary.body}</p>
          </div>
          <div className="rounded-xl border border-current/15 bg-white/60 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Retry count</p>
            <p className="mt-1 text-sm font-semibold">{formatMetric(connectionDiagnostics.retryCount)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Transport</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{getTransportModeLabel(connectionDiagnostics.transportMode)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Relay</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {connectionDiagnostics.relayConfigured ? 'Configured' : 'Direct only'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Candidate path</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {getCandidateTypeLabel(connectionDiagnostics.remoteCandidateType || connectionDiagnostics.localCandidateType)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">RTT</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {connectionDiagnostics.currentRoundTripTimeMs ? `${connectionDiagnostics.currentRoundTripTimeMs} ms` : '--'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {liveExperienceConfig.enableReactions ? (
          <>
            <button
              type="button"
              onClick={() => void sendReaction('like')}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {formatMetric(Number(session?.likesCount || 0))}
            </button>
            <button
              type="button"
              onClick={() => void sendReaction('love')}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Heart className="h-3.5 w-3.5" />
              {formatMetric(Number(session?.lovesCount || 0))}
            </button>
          </>
        ) : null}
        {liveExperienceConfig.enableShare ? (
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Share stream
          </button>
        ) : null}
        {liveExperienceConfig.enableRepost ? (
          <button
            type="button"
            onClick={() => setRepostOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <Repeat2 className="h-3.5 w-3.5" />
            Repost to feed
          </button>
        ) : null}
        {!isHost && liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
          <button
            type="button"
            onClick={openGiftComposer}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            <Gift className="h-3.5 w-3.5" />
            Open Dash
          </button>
        ) : null}
        {!isHost ? (
          <button
            type="button"
            onClick={retryViewerConnection}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reconnect live
          </button>
        ) : null}
      </div>

      {mentionedUsers.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mentioned people</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {mentionedUsers.map((entry) => (
              <span key={`mention-${entry.id || entry.username}`} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                @{entry.username || entry.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {taggedPages.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tagged pages</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {taggedPages.map((entry) => (
              <span key={`page-${entry.id || entry.slug || entry.handle}`} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                {entry.name || entry.handle || entry.slug || 'Page'}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {contentOfferTags.length ? <ContentOfferTags offerTags={contentOfferTags} /> : null}

      <ParticipantGrid participants={session?.participants || []} />
    </div>
  );

  const chatPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live Chat</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Realtime audience conversation</h3>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {formatMetric(chatEntries.length)} messages
        </div>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {chatEntries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">
            No comments yet. Start the conversation.
          </p>
        ) : (
          chatEntries.map((entry) =>
            entry.kind === 'gift' ? (
              <div key={entry.id} className="rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,_#fffbeb,_#fff7ed)] px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Public Dash</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {entry.gift.fromUser?.name || entry.gift.fromUser?.username || 'Someone'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-700">
                    {formatMetric(Number(entry.gift.amountGcoin || 0))} GC
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{entry.gift.shoutoutText}</p>
              </div>
            ) : (
              <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-semibold text-slate-700">
                  {String(entry.comment?.user?.name || entry.comment?.user?.username || 'Scrolith user')}
                </p>
                <p className="mt-1 text-sm text-slate-700">{String(entry.comment?.message || '')}</p>
              </div>
            )
          )
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="Write a comment..."
            className="min-w-0 w-full rounded-2xl border border-slate-200 px-10 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            maxLength={500}
          />
        </div>
        <button
          type="button"
          onClick={() => void sendComment()}
          disabled={commentSending || !String(commentDraft || '').trim()}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-60"
          aria-label="Send comment"
        >
          {commentSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  const hostControlsPanel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={toggleMic}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${
            micEnabled ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {micEnabled ? 'Mic On' : 'Mic Off'}
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${
            cameraEnabled ? 'bg-sky-500/10 text-sky-700 ring-1 ring-sky-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          {cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          {cameraEnabled ? 'Camera On' : 'Camera Off'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          <Wand2 className="h-3.5 w-3.5 text-violet-500" />
          Live filter
        </div>
        <div className="mt-3 space-y-3">
          <select
            value={activeFilterPreset}
            onChange={(event) => setActiveFilterPreset(normalizeFilterPreset(event.target.value))}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
          >
            {LIVE_FILTER_PRESETS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={activeFilterStrength}
            onChange={(event) => setActiveFilterStrength(clampFilterStrength(event.target.value))}
            className="w-full accent-violet-500"
          />
          <button
            type="button"
            onClick={() => void applyFilter()}
            disabled={filterBusy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <BadgeCheck className="h-4 w-4" />
            {filterBusy ? 'Applying...' : `Apply ${activeFilterLabel}`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Socket</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{isConnected ? 'Connected' : 'Disconnected'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Room status</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{sessionRoomReady ? 'Joined' : 'Joining'}</p>
        </div>
      </div>
    </div>
  );

  const recordingPanel = (
    <div className="space-y-4">
      <div className="space-y-2">
        <input
          type="text"
          value={recordingFileIdDraft}
          onChange={(event) => setRecordingFileIdDraft(event.target.value)}
          placeholder="Recording file ID"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />
        <input
          type="text"
          value={recordingTitleDraft}
          onChange={(event) => setRecordingTitleDraft(event.target.value)}
          placeholder="Recording title"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />
        <textarea
          value={recordingDescriptionDraft}
          onChange={(event) => setRecordingDescriptionDraft(event.target.value)}
          placeholder="Recording description"
          rows={3}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void saveRecording()}
          disabled={recordingBusy}
          className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {recordingBusy ? 'Saving...' : 'Save Recording'}
        </button>
        <button
          type="button"
          onClick={() => void publishRecording('post')}
          disabled={recordingBusy}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Publish to Post
        </button>
        <button
          type="button"
          onClick={() => void publishRecording('scroll')}
          disabled={recordingBusy}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Publish to Scroll
        </button>
        <button
          type="button"
          onClick={() => void unpublishRecording()}
          disabled={recordingBusy}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
        >
          Unpublish
        </button>
        <button
          type="button"
          onClick={() => void deleteRecording()}
          disabled={recordingBusy}
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
        >
          Delete Recording
        </button>
      </div>
      {session?.recording?.downloadUrl ? (
        <a
          href={String(session.recording.downloadUrl)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          Download Recording
        </a>
      ) : null}
    </div>
  );

  const supportPanel = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.94),_rgba(255,255,255,1))] p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Audience support</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Keep gifting, reactions, reposts, and sharing in one clean dock.</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Open Dash in a popup, react without shaking the stream, share the live URL to external networks, and repost the session to your Scrolith feed.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
              <button
                type="button"
                onClick={openGiftComposer}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Open Dash popup
                <span className="mt-1 block text-xs font-normal text-emerald-700/80">
                  {giftBalanceLoading ? 'Loading balance...' : `Balance ${Number(giftBalance || 0)} GC`}
                </span>
              </button>
            ) : null}
            {liveExperienceConfig.enableShare ? (
              <button
                type="button"
                onClick={() => setShareSheetOpen(true)}
                className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                Share live URL
                <span className="mt-1 block text-xs font-normal text-sky-700/80">Facebook, X, LinkedIn, TikTok, WhatsApp, copy link</span>
              </button>
            ) : null}
            {liveExperienceConfig.enableRepost ? (
              <button
                type="button"
                onClick={() => setRepostOpen(true)}
                className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
              >
                Repost to feed
                <span className="mt-1 block text-xs font-normal text-violet-700/80">Share this live stream directly to your Scrolith feed.</span>
              </button>
            ) : null}
            {liveExperienceConfig.enableReactions ? (
              <button
                type="button"
                onClick={toggleReactionTray}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Reaction tray
                <span className="mt-1 block text-xs font-normal text-rose-700/80">Like or love without interrupting the stream playback.</span>
              </button>
            ) : null}
          </div>
        </div>
        <div className={`rounded-[26px] border p-4 shadow-sm ${getDiagnosticsTone(diagnosticsTone)}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em]">Live delivery</p>
          <h3 className="mt-2 text-lg font-semibold">{diagnosticsSummary.title}</h3>
          <p className="mt-2 text-sm leading-6">{diagnosticsSummary.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!isHost ? (
              <button
                type="button"
                onClick={retryViewerConnection}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-current/15 bg-white/70 px-4 py-2.5 text-xs font-semibold transition hover:bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reconnect live
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void loadSession()}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-current/15 bg-white/70 px-4 py-2.5 text-xs font-semibold transition hover:bg-white"
            >
              <Signal className="h-3.5 w-3.5" />
              Refresh session
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const currentConsolePanel =
    activeConsoleTab === 'chat'
      ? chatPanel
      : activeConsoleTab === 'support'
        ? supportPanel
        : activeConsoleTab === 'tools'
          ? hostControlsPanel
          : activeConsoleTab === 'recording'
            ? recordingPanel
            : overviewPanel;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5 overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%),linear-gradient(135deg,_#020617,_#0f172a_52%,_#172554)] px-4 py-4 text-white sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/live/studio')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Studio
              </button>
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                  isHostPreview
                    ? 'border-sky-300/40 bg-sky-500/15 text-sky-100'
                    : status === 'live'
                      ? 'border-rose-300/40 bg-rose-500/15 text-rose-100'
                      : 'border-white/15 bg-white/10 text-slate-100'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                {isHostPreview ? 'PREVIEW' : status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
              </div>
              <div className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100 sm:inline-flex">
                {isHostPreview ? 'Review before going live' : streamAgeLabel}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isHostPreview ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate('/live/studio')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Save for Later
                  </button>
                  <button
                    type="button"
                    onClick={() => void startFromPreview()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    Start Now
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void leaveStream()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Exit Stream
                </button>
              )}
              {isHost && status === 'live' ? (
                <button
                  type="button"
                  onClick={() => void endStream()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  <Square className="h-3.5 w-3.5" />
                  End Live Stream
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          Loading livestream...
        </div>
      ) : !session ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
          Livestream session not found.
        </div>
      ) : true ? (
        <div className="space-y-5">
          {isHostPreview ? (
            <div className="overflow-hidden rounded-[30px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_44%),linear-gradient(135deg,_rgba(239,246,255,0.96),_rgba(255,255,255,1))] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Host preview
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-950">Review the session before you go live.</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Frame the camera, confirm audio access, and check the session brief here. When everything looks right, start the broadcast from this same screen.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/live/studio')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Save for later
                  </button>
                  <button
                    type="button"
                    onClick={() => void startFromPreview()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Radio className="h-4 w-4" />
                    Start now
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_-38px_rgba(15,23,42,0.28)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#0f172a,_#172554)] px-4 py-4 text-white sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      status === 'live' ? 'border-rose-300/40 bg-rose-500/15 text-rose-100' : 'border-white/15 bg-white/10 text-slate-100'
                    }`}
                  >
                    {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                    {String(session.visibility || 'public').toUpperCase()}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">
                    {streamAgeLabel}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getConnectionTone(effectiveConnectionState)}`}>
                    {connectionLabel}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {liveExperienceConfig.enableReactions ? (
                    <button
                      type="button"
                      onClick={toggleReactionTray}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        reactionTrayOpen
                          ? 'border-rose-300/45 bg-rose-500/15 text-rose-100'
                          : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      <Heart className="h-3.5 w-3.5" />
                      React
                    </button>
                  ) : null}
                  {liveExperienceConfig.enableRepost ? (
                    <button
                      type="button"
                      onClick={() => setRepostOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      <Repeat2 className="h-3.5 w-3.5" />
                      Repost
                    </button>
                  ) : null}
                  {!isHost && liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
                    <button
                      type="button"
                      onClick={openGiftComposer}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-500/25"
                    >
                      <Gift className="h-3.5 w-3.5" />
                      Dash
                    </button>
                  ) : null}
                  {!isHost && effectiveConnectionState !== 'connected' ? (
                    <button
                      type="button"
                      onClick={retryViewerConnection}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </button>
                  ) : null}
                  {liveExperienceConfig.enableShare ? (
                    <button
                      type="button"
                      onClick={handleShare}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Share
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-black" onDoubleClick={() => void sendReaction('like')}>
              <div className="relative aspect-[9/16] min-h-[360px] w-full bg-black sm:aspect-[16/9] sm:min-h-[520px]">
                {shouldRenderVideoSurface ? (
                  <video
                    ref={videoRef}
                    className="absolute inset-0 h-full w-full bg-black object-cover"
                    controls={canPlayVideo && !isHost && !(remoteTrackCount > 0)}
                    playsInline
                    style={{ filter: activeVideoFilter }}
                  />
                ) : null}
                {shouldShowVideoPlaceholder ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 text-center text-sm text-slate-300">
                    {mediaInitBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    <span>
                      {isHost
                        ? isHostPreview
                          ? 'Preparing the host preview camera and microphone.'
                          : 'Preparing camera and microphone for this live session.'
                        : 'Waiting for host camera to start streaming.'}
                    </span>
                    {mediaError ? (
                      <span className="inline-flex items-center gap-2 rounded-xl bg-rose-900/50 px-3 py-2 text-xs text-rose-100">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {mediaError}
                      </span>
                    ) : null}
                    {isHost ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void ensureLocalMedia().catch(() => {});
                          }}
                          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Retry Camera
                        </button>
                        {Capacitor.isNativePlatform() ? (
                          <button
                            type="button"
                            onClick={() => {
                              void openDeviceSettings();
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                          >
                            Open Settings
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={retryViewerConnection}
                        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry Stream
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/65 to-transparent" />

                <div className="absolute left-3 top-3 flex max-w-[calc(100%-140px)] items-start gap-2 sm:left-4 sm:top-4">
                  <img
                    src={session.host?.avatar || '/api/placeholder/48/48'}
                    alt={hostName}
                    className="h-10 w-10 rounded-2xl border border-white/20 object-cover shadow-lg shadow-black/25 sm:h-12 sm:w-12"
                  />
                  <div className="min-w-0 rounded-2xl border border-white/12 bg-black/35 px-3 py-2 text-white backdrop-blur-sm">
                    <p className="truncate text-sm font-semibold">{hostName}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-200">{session.title || 'Untitled livestream'}</p>
                  </div>
                </div>

                <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
                  <div className="rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                    Viewers {formatMetric(Number(session.viewerCount || 0))}
                  </div>
                  <div className="rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                    Peak {formatMetric(Number(session.peakViewerCount || 0))}
                  </div>
                </div>

                {giftShoutout ? (
                  <div className="pointer-events-none absolute inset-x-3 top-20 z-20 flex justify-center sm:inset-x-4 sm:top-24">
                    <div className="w-full max-w-2xl rounded-[28px] border border-amber-200/70 bg-[linear-gradient(135deg,rgba(245,158,11,0.92),rgba(251,191,36,0.88))] px-4 py-4 text-slate-950 shadow-[0_22px_55px_-28px_rgba(251,191,36,0.85)] backdrop-blur-sm sm:px-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-900/70">Public Dash Shout-out</p>
                          <p className="mt-2 text-base font-semibold leading-tight text-slate-950 sm:text-lg">{giftShoutout.shoutoutText}</p>
                          <p className="mt-1 text-xs text-slate-900/75">
                            From {giftShoutout.fromUser?.name || giftShoutout.fromUser?.username || 'Someone'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-900/10 bg-white/55 px-4 py-3 text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">Gcoin</p>
                          <p className="mt-1 text-2xl font-bold text-slate-950">{formatMetric(Number(giftShoutout.amountGcoin || 0))}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="absolute inset-x-3 bottom-3 hidden flex-wrap items-end justify-between gap-2 sm:flex sm:inset-x-4 sm:bottom-4">
                  <div className="flex max-w-full flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(status)}`}>
                      {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getConnectionTone(effectiveConnectionState)}`}>
                      {connectionLabel}
                    </span>
                    <span className="rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                      Participants {formatMetric(activeParticipantsCount)}
                    </span>
                    {activeFilterPreset !== 'none' ? (
                      <span className="rounded-full border border-violet-300/20 bg-violet-500/15 px-3 py-1 text-[11px] font-semibold text-violet-100">
                        Filter {activeFilterLabel}
                      </span>
                    ) : null}
                  </div>

                  {!isHost ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {liveExperienceConfig.enableReactions ? (
                        <button
                          type="button"
                          onClick={toggleReactionTray}
                          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold backdrop-blur-sm transition ${
                            reactionTrayOpen
                              ? 'border-rose-300/45 bg-rose-500/20 text-rose-50'
                              : 'border-white/12 bg-black/50 text-white hover:bg-black/65'
                          }`}
                        >
                          <Heart className="h-3.5 w-3.5" />
                          React
                        </button>
                      ) : null}
                      {liveExperienceConfig.enableRepost ? (
                        <button
                          type="button"
                          onClick={() => setRepostOpen(true)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/65"
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                          Repost
                        </button>
                      ) : null}
                      {liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
                        <button
                          type="button"
                          onClick={openGiftComposer}
                          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold backdrop-blur-sm transition ${
                            giftModalOpen || viewerSupportExpanded || activeConsoleTab === 'support'
                              ? 'border-emerald-300/45 bg-emerald-500/20 text-emerald-50'
                              : 'border-white/12 bg-black/50 text-white hover:bg-black/65'
                          }`}
                        >
                          <Gift className="h-3.5 w-3.5" />
                          Dash
                        </button>
                      ) : null}
                      {liveExperienceConfig.enableShare ? (
                        <button
                          type="button"
                          onClick={handleShare}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/65"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Share
                        </button>
                      ) : null}
                      {((remoteTrackCount > 0) || canPlayVideo) ? (
                        <button
                          type="button"
                          onClick={() => setViewerMuted((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/65"
                        >
                          {viewerMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          {viewerMuted ? 'Unmute stream' : 'Mute stream'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <ReactionOverlay items={floatingReactions} />
                {showSafetyNotice ? (
                  <div className="pointer-events-none absolute inset-x-3 bottom-16 z-20 rounded-xl border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-[11px] font-semibold text-amber-100 backdrop-blur sm:bottom-20">
                    {safetyNoticeText}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-3 sm:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(status)}`}>
                    {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getConnectionTone(effectiveConnectionState)}`}>
                    {connectionLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                    Participants {formatMetric(activeParticipantsCount)}
                  </span>
                  {activeFilterPreset !== 'none' ? (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700">
                      Filter {activeFilterLabel}
                    </span>
                  ) : null}
                </div>

                {!isHost ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {liveExperienceConfig.enableReactions ? (
                      <button
                        type="button"
                        onClick={toggleReactionTray}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                          reactionTrayOpen
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <Heart className="h-3.5 w-3.5" />
                        React
                      </button>
                    ) : null}
                    {liveExperienceConfig.enableRepost ? (
                      <button
                        type="button"
                        onClick={() => setRepostOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600"
                      >
                        <Repeat2 className="h-3.5 w-3.5" />
                        Repost
                      </button>
                    ) : null}
                    {liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
                      <button
                        type="button"
                        onClick={openGiftComposer}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                          giftModalOpen || viewerSupportExpanded || activeConsoleTab === 'support'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <Gift className="h-3.5 w-3.5" />
                        Dash
                      </button>
                    ) : null}
                    {liveExperienceConfig.enableShare ? (
                      <button
                        type="button"
                        onClick={handleShare}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Share
                      </button>
                    ) : null}
                    {((remoteTrackCount > 0) || canPlayVideo) ? (
                      <button
                        type="button"
                        onClick={() => setViewerMuted((prev) => !prev)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600"
                      >
                        {viewerMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        {viewerMuted ? 'Unmute' : 'Mute'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {!isHost && viewerSupportExpanded ? (
            <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,_rgba(236,253,245,0.96),_rgba(255,255,255,1))] p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dash quick access</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">Send Dash and trigger live shout-outs in one tap.</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Open the Dash popup without shifting the stream surface. Public gifts trigger an on-stream shout-out for the host and viewers.
                  </p>
                  {giftShoutout ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Latest public Dash</p>
                      <p className="mt-1 font-semibold text-slate-900">{giftShoutout.shoutoutText}</p>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openGiftComposer}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Gift className="h-3.5 w-3.5" />
                    Open Dash
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewerSupportExpanded(false)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Hide
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))] px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live Console</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    {isHost ? 'Studio controls and delivery health' : 'Viewer tools, support, and chat'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Everything below stays in one screen using toggles so the video view remains clear.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Socket {isConnected ? 'connected' : 'offline'} | Room {sessionRoomReady ? 'joined' : 'joining'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {consoleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveConsoleTab(tab.id)}
                    className={`rounded-2xl px-4 py-2.5 text-xs font-semibold transition ${
                      activeConsoleTab === tab.id
                        ? 'bg-slate-950 text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 sm:p-5">{currentConsolePanel}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div
              className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_-38px_rgba(15,23,42,0.28)]"
            >
              <div className="relative overflow-hidden bg-black" onDoubleClick={() => void sendReaction('like')}>
              {shouldRenderVideoSurface ? (
                <video
                  ref={videoRef}
                  className="h-[62vh] w-full bg-black object-cover"
                  controls={canPlayVideo && !isHost && !(remoteTrackCount > 0)}
                  playsInline
                  style={{ filter: activeVideoFilter }}
                />
              ) : null}
              {shouldShowVideoPlaceholder ? (
                <div className="absolute inset-0 flex h-[62vh] w-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-300">
                  {mediaInitBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  <span>
                    {isHost
                      ? isHostPreview
                        ? 'Preparing the host preview camera and microphone.'
                        : 'Preparing camera and microphone for this live session.'
                      : 'Waiting for host camera to start streaming.'}
                  </span>
                  {mediaError ? (
                    <span className="inline-flex items-center gap-2 rounded-xl bg-rose-900/50 px-3 py-2 text-xs text-rose-100">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {mediaError}
                    </span>
                  ) : null}
                  {isHost ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void ensureLocalMedia().catch(() => {});
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry Camera
                      </button>
                      {Capacitor.isNativePlatform() ? (
                        <button
                          type="button"
                          onClick={() => {
                            void openDeviceSettings();
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                        >
                          Open Settings
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={retryViewerConnection}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry Stream
                    </button>
                  )}
                </div>
              ) : null}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute left-4 top-4 flex max-w-[calc(100%-150px)] items-start gap-3">
                <img
                  src={session.host?.avatar || '/api/placeholder/48/48'}
                  alt={hostName}
                  className="h-11 w-11 rounded-2xl border border-white/20 object-cover shadow-lg shadow-black/25"
                />
                <div className="min-w-0 rounded-2xl border border-white/12 bg-black/35 px-3 py-2 text-white backdrop-blur-sm">
                  <p className="truncate text-sm font-semibold">{hostName}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-200">{session.title || 'Untitled livestream'}</p>
                </div>
              </div>
              <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
                <div className="rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                  Viewers {formatMetric(Number(session.viewerCount || 0))}
                </div>
                <div className="rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                  Peak {formatMetric(Number(session.peakViewerCount || 0))}
                </div>
              </div>
              {giftShoutout ? (
                <div className="pointer-events-none absolute inset-x-4 top-24 z-20 flex justify-center">
                  <div className="w-full max-w-2xl rounded-[28px] border border-amber-200/70 bg-[linear-gradient(135deg,rgba(245,158,11,0.92),rgba(251,191,36,0.88))] px-5 py-4 text-slate-950 shadow-[0_22px_55px_-28px_rgba(251,191,36,0.85)] backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-900/70">Public Dash Shout-out</p>
                        <p className="mt-2 text-lg font-semibold leading-tight text-slate-950">{giftShoutout.shoutoutText}</p>
                        <p className="mt-1 text-xs text-slate-900/75">
                          From {giftShoutout.fromUser?.name || giftShoutout.fromUser?.username || 'Someone'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-900/10 bg-white/55 px-4 py-3 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">Gcoin</p>
                        <p className="mt-1 text-2xl font-bold text-slate-950">{formatMetric(Number(giftShoutout.amountGcoin || 0))}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
                <div className="max-w-2xl rounded-[24px] border border-white/12 bg-black/40 px-4 py-3 text-white backdrop-blur-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(status)}`}>
                      {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
                    </span>
                    <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                      {String(session.visibility || 'public').toUpperCase()}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getConnectionTone(connectionState)}`}>
                      {connectionLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold">{session.title || 'Untitled livestream'}</p>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-slate-200">
                    {session.description || 'No description provided.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
                    <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1">{streamAgeLabel}</span>
                    <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1">
                      Participants {formatMetric(activeParticipantsCount)}
                    </span>
                    <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1">
                      {connectionDiagnostics.relayConfigured ? 'Relay coverage ready' : 'Direct WebRTC only'}
                    </span>
                    {activeFilterPreset !== 'none' ? (
                      <span className="rounded-full border border-violet-300/20 bg-violet-500/15 px-3 py-1 text-violet-100">
                        Filter {activeFilterLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              {!isHost && ((remoteTrackCount > 0) || canPlayVideo) ? (
                <button
                  type="button"
                  onClick={() => setViewerMuted((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-black/50 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/65"
                >
                  {viewerMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {viewerMuted ? 'Unmute stream' : 'Mute stream'}
                </button>
              ) : null}
              </div>
              <ReactionOverlay items={floatingReactions} />
              {showSafetyNotice ? (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-xl border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-[11px] font-semibold text-amber-100 backdrop-blur">
                  {safetyNoticeText}
                </div>
              ) : null}
            </div>

              <div className="grid grid-cols-1 gap-4 border-t border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.9),_rgba(255,255,255,1))] p-5 lg:grid-cols-[minmax(0,1fr)_330px]">
                <div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Viewers</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.viewerCount || 0))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Peak</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.peakViewerCount || 0))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Likes</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.likesCount || 0))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Loves</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatMetric(Number(session.lovesCount || 0))}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {liveExperienceConfig.enableReactions ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void sendReaction('like')}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          {formatMetric(Number(session.likesCount || 0))}
                        </button>
                        <button
                          type="button"
                          onClick={() => void sendReaction('love')}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Heart className="h-3.5 w-3.5" />
                          {formatMetric(Number(session.lovesCount || 0))}
                        </button>
                      </>
                    ) : null}
                    {liveExperienceConfig.enableShare ? (
                      <button
                        type="button"
                        onClick={handleShare}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Share stream
                      </button>
                    ) : null}
                    {liveExperienceConfig.enableRepost ? (
                      <button
                        type="button"
                        onClick={() => setRepostOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                      >
                        <Repeat2 className="h-3.5 w-3.5" />
                        Repost to feed
                      </button>
                    ) : null}
                    {!isHost && liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
                      <button
                        type="button"
                        onClick={openGiftComposer}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        Open Dash
                      </button>
                    ) : null}
                    {liveExperienceConfig.enableReactions ? (
                      <div className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700">
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Double tap video to like
                      </div>
                    ) : null}
                  </div>

                  {mentionedUsers.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mentioned people</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {mentionedUsers.map((entry) => (
                          <span key={`mention-${entry.id || entry.username}`} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                            @{entry.username || entry.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {taggedPages.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tagged pages</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {taggedPages.map((entry) => (
                          <span key={`page-${entry.id || entry.slug || entry.handle}`} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                            {entry.name || entry.handle || entry.slug || 'Page'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {contentOfferTags.length ? (
                    <div className="mt-4">
                      <ContentOfferTags offerTags={contentOfferTags} />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
                  <div className="flex items-start gap-3">
                    <img
                      src={session.host?.avatar || '/api/placeholder/48/48'}
                      alt={hostName}
                      className="h-12 w-12 rounded-2xl border border-white/10 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{hostName}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {isHost ? 'You are managing this live session.' : 'Host controls remain isolated from viewers.'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Connection</p>
                      <p className="mt-2 text-sm font-semibold text-white">{connectionLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Participants</p>
                      <p className="mt-2 text-sm font-semibold text-white">{formatMetric(activeParticipantsCount)}</p>
                    </div>
                  </div>

                  <div className={`mt-4 rounded-2xl border px-3 py-3 ${getDiagnosticsTone(diagnosticsTone)}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Realtime health</p>
                    <p className="mt-2 text-sm font-semibold">{diagnosticsSummary.title}</p>
                    <p className="mt-1 text-xs leading-5">{diagnosticsSummary.body}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Transport</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {getTransportModeLabel(connectionDiagnostics.transportMode)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Relay</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {connectionDiagnostics.relayConfigured ? 'Configured' : 'Not configured'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Candidate path</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {getCandidateTypeLabel(connectionDiagnostics.remoteCandidateType || connectionDiagnostics.localCandidateType)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Retry count</p>
                      <p className="mt-2 text-sm font-semibold text-white">{formatMetric(connectionDiagnostics.retryCount)}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Diagnostics</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          ICE {connectionDiagnostics.iceConnectionState || 'new'} · Peer {connectionDiagnostics.peerConnectionState || 'new'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">RTT</p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {connectionDiagnostics.currentRoundTripTimeMs ? `${connectionDiagnostics.currentRoundTripTimeMs} ms` : '--'}
                        </p>
                      </div>
                    </div>
                    {!connectionDiagnostics.relayConfigured ? (
                      <p className="mt-3 text-xs leading-5 text-amber-200">
                        TURN relay is not configured yet. Direct WebRTC can stall on some mobile carriers and restrictive Wi-Fi networks.
                      </p>
                    ) : null}
                  </div>

                  {!isHost ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={retryViewerConnection}
                        className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-100"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reconnect live
                      </button>
                      <button
                        type="button"
                        onClick={() => void loadSession()}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                      >
                        <Signal className="h-3.5 w-3.5" />
                        Refresh session
                      </button>
                    </div>
                  ) : null}

                  {isHost ? (
                    <>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={toggleMic}
                          className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-semibold ${
                            micEnabled ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20' : 'bg-white/5 text-slate-200 ring-1 ring-white/10'
                          }`}
                        >
                          {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                          {micEnabled ? 'Mic On' : 'Mic Off'}
                        </button>
                        <button
                          type="button"
                          onClick={toggleCamera}
                          className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-semibold ${
                            cameraEnabled ? 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/20' : 'bg-white/5 text-slate-200 ring-1 ring-white/10'
                          }`}
                        >
                          {cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                          {cameraEnabled ? 'Cam On' : 'Cam Off'}
                        </button>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                          <Wand2 className="h-3.5 w-3.5 text-violet-300" />
                          Live filter
                        </div>
                        <div className="mt-3 space-y-3">
                          <select
                            value={activeFilterPreset}
                            onChange={(event) => setActiveFilterPreset(normalizeFilterPreset(event.target.value))}
                            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none"
                          >
                            {LIVE_FILTER_PRESETS.map((entry) => (
                              <option key={entry.value} value={entry.value}>
                                {entry.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={activeFilterStrength}
                            onChange={(event) => setActiveFilterStrength(clampFilterStrength(event.target.value))}
                            className="w-full accent-violet-400"
                          />
                          <button
                            type="button"
                            onClick={() => void applyFilter()}
                            disabled={filterBusy}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
                          >
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {filterBusy ? 'Applying...' : `Apply ${activeFilterLabel}`}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      Use reactions, chat, and gifting without leaving the stream.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ParticipantGrid participants={session.participants || []} />
          </div>

          <div className="space-y-4">
            {!isHost ? (
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_40%),linear-gradient(135deg,_#f8fafc,_#ffffff)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live actions</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">React, share, repost, and Dash without covering the stream.</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Viewer actions stay inside popup panels so the video view remains stable on desktop and mobile.
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  {liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction ? (
                    <button
                      type="button"
                      onClick={openGiftComposer}
                      className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Open Dash popup
                      <span className="mt-1 block text-xs font-normal text-emerald-700/80">
                        {giftBalanceLoading ? 'Loading balance...' : `Available balance ${Number(giftBalance || 0)} GC`}
                      </span>
                    </button>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {liveExperienceConfig.enableReactions ? (
                      <button
                        type="button"
                        onClick={toggleReactionTray}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Open reaction tray
                        <span className="mt-1 block text-xs font-normal text-rose-700/80">Like or love without shifting the broadcast layout.</span>
                      </button>
                    ) : null}
                    {liveExperienceConfig.enableShare ? (
                      <button
                        type="button"
                        onClick={handleShare}
                        className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        Share live URL
                        <span className="mt-1 block text-xs font-normal text-sky-700/80">Facebook, X, LinkedIn, TikTok, WhatsApp, or copy link.</span>
                      </button>
                    ) : null}
                    {liveExperienceConfig.enableRepost ? (
                      <button
                        type="button"
                        onClick={() => setRepostOpen(true)}
                        className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                      >
                        Repost to feed
                        <span className="mt-1 block text-xs font-normal text-violet-700/80">Share this live session to your Scrolith feed with or without a comment.</span>
                      </button>
                    ) : null}
                    {!isHost ? (
                      <button
                        type="button"
                        onClick={retryViewerConnection}
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                      >
                        Reconnect live
                        <span className="mt-1 block text-xs font-normal text-amber-700/80">Use standby recovery without disturbing the host or other viewers.</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_40%),linear-gradient(135deg,_#f8fafc,_#ffffff)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live Chat</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">Realtime audience conversation</h3>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {formatMetric(chatEntries.length)} messages
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {chatEntries.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">
                    No comments yet. Start the conversation.
                  </p>
                ) : (
                  chatEntries.map((entry) =>
                    entry.kind === 'gift' ? (
                      <div key={entry.id} className="rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,_#fffbeb,_#fff7ed)] px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Public Dash</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {entry.gift.fromUser?.name || entry.gift.fromUser?.username || 'Someone'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-700">
                            {formatMetric(Number(entry.gift.amountGcoin || 0))} GC
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{entry.gift.shoutoutText}</p>
                      </div>
                    ) : (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-semibold text-slate-700">
                          {String(entry.comment?.user?.name || entry.comment?.user?.username || 'Scrolith user')}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{String(entry.comment?.message || '')}</p>
                      </div>
                    )
                  )
                )}
              </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      placeholder="Write a comment..."
                      className="min-w-0 w-full rounded-2xl border border-slate-200 px-10 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      maxLength={500}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void sendComment()}
                    disabled={commentSending || !String(commentDraft || '').trim()}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-60"
                    aria-label="Send comment"
                  >
                    {commentSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {canManageRecording ? (
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.12),_transparent_40%),linear-gradient(135deg,_#f8fafc,_#ffffff)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recording Management</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">Control replay distribution after the broadcast.</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Save, publish, unpublish, download, or delete stream recordings after or during session.
                  </p>
                </div>
                <div className="p-5">
                <div className="space-y-2">
                  <input
                    type="text"
                    value={recordingFileIdDraft}
                    onChange={(event) => setRecordingFileIdDraft(event.target.value)}
                    placeholder="Recording file ID"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  />
                  <input
                    type="text"
                    value={recordingTitleDraft}
                    onChange={(event) => setRecordingTitleDraft(event.target.value)}
                    placeholder="Recording title"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  />
                  <textarea
                    value={recordingDescriptionDraft}
                    onChange={(event) => setRecordingDescriptionDraft(event.target.value)}
                    placeholder="Recording description"
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveRecording()}
                    disabled={recordingBusy}
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {recordingBusy ? 'Saving...' : 'Save Recording'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishRecording('post')}
                    disabled={recordingBusy}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Publish to Post
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishRecording('scroll')}
                    disabled={recordingBusy}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Publish to Scroll
                  </button>
                  <button
                    type="button"
                    onClick={() => void unpublishRecording()}
                    disabled={recordingBusy}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    Unpublish
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRecording()}
                    disabled={recordingBusy}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                  >
                    Delete Recording
                  </button>
                </div>
                {session?.recording?.downloadUrl ? (
                  <a
                    href={String(session.recording.downloadUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Recording
                  </a>
                ) : null}
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#f8fafc,_#ffffff)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Realtime events</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Delivery status</h3>
              </div>
              <div className="space-y-3 p-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Signal className="h-4 w-4 text-sky-600" />
                    Socket connection
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Connected: {isConnected ? 'Yes' : 'No'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Session room
                  </div>
                  <p className="mt-1 break-all text-xs text-slate-500">live:session:{session.id}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {liveExperienceConfig.enableReactions && reactionTrayOpen ? (
        <div className="fixed inset-0 z-[72] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55"
            aria-label="Close reaction tray"
            onClick={closeReactionTray}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.14),_transparent_42%),linear-gradient(135deg,_#fff1f2,_#ffffff)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700">Live reactions</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">React without disturbing the stream.</h3>
                  <p className="mt-1 text-sm text-slate-500">Your reaction is sent in real time while the video stays in place for everyone else.</p>
                </div>
                <button
                  type="button"
                  onClick={closeReactionTray}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                  aria-label="Close reaction tray"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5">
              <button
                type="button"
                onClick={() => {
                  void sendReaction('like');
                  closeReactionTray();
                }}
                className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5 text-left transition hover:border-sky-200 hover:bg-sky-50"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm">
                  <ThumbsUp className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-900">Like</p>
                <p className="mt-1 text-xs text-slate-500">Quick approval that appears live without interrupting playback.</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  void sendReaction('love');
                  closeReactionTray();
                }}
                className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5 text-left transition hover:border-rose-200 hover:bg-rose-50"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm">
                  <Heart className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-900">Love</p>
                <p className="mt-1 text-xs text-slate-500">Send stronger support and trigger floating live hearts.</p>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LiveShareSheet
        isOpen={liveExperienceConfig.enableShare && shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        onShare={handleShareChannel}
      />

      <RepostModal
        isOpen={liveExperienceConfig.enableRepost && repostOpen}
        onClose={() => {
          if (actionBusy) return;
          setRepostOpen(false);
        }}
        busy={actionBusy}
        onRepostNow={async () => repostLiveToFeed()}
        onRepostWithComment={async (comment) => repostLiveToFeed(comment)}
      />

      {!isHost && liveFeatureStatus.enableGifts && liveExperienceConfig.enableDashQuickAction && giftModalOpen ? (
        <div className="fixed inset-0 z-[71] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Close Dash popup"
            onClick={closeGiftComposer}
          />
          <div className="relative w-full max-w-2xl">
            <GiftPanel
              sending={giftSending}
              minAmount={Number(liveFeatureStatus.minGiftGcoin || 1)}
              maxAmount={Number(liveFeatureStatus.maxGiftGcoin || 50000)}
              title="Dash the host without leaving the stream."
              subtitle="See your Gcoin balance, choose any amount, and send support in a popup that keeps the livestream surface clear."
              badgeLabel="Dash support"
              balance={giftBalance}
              balanceLoading={giftBalanceLoading}
              messageLabel="Note (optional)"
              submitLabel="Send Dash"
              onCancel={closeGiftComposer}
              onSend={async (payload) => {
                await sendGift(payload);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LiveViewer;
