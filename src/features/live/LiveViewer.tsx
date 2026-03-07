import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Heart,
  LogOut,
  Loader2,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  SendHorizontal,
  Square,
  ThumbsUp,
  Video,
  VideoOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { LiveService, type LiveSession } from '../../services/live';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import ParticipantGrid from './components/ParticipantGrid';
import GiftPanel from './components/GiftPanel';
import ReactionOverlay from './components/ReactionOverlay';
import { consumePrimedLiveMediaStream, requestLiveMediaStream, stopStreamTracks } from './liveMedia';

type FloatingReaction = {
  id: string;
  emoji: string;
};

type SignalPayload = {
  kind: 'viewer-ready' | 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

type LiveFilterPreset = 'none' | 'vibrant' | 'cinematic' | 'bw' | 'sepia' | 'warm' | 'cool' | 'contrast';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  iceCandidatePoolSize: 8
};

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

const SAFETY_NOTICE_TEXT =
  'Warning: Illegal activity, nudity/explicit content, and illegal product promotion are prohibited. All livestreams must follow Scrolith Terms and Community Guidelines.';

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

const LiveViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const sessionId = String(id || '').trim();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { socket, isConnected } = useSocket();
  const { user } = useUser();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hostPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const pendingHostCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingViewerCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const connectionRetryTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [giftSending, setGiftSending] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [mediaInitBusy, setMediaInitBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [viewerMuted, setViewerMuted] = useState(true);
  const [activeFilterPreset, setActiveFilterPreset] = useState<LiveFilterPreset>('none');
  const [activeFilterStrength, setActiveFilterStrength] = useState(70);
  const [filterBusy, setFilterBusy] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [showSafetyNotice, setShowSafetyNotice] = useState(false);
  const [recordingFileIdDraft, setRecordingFileIdDraft] = useState('');
  const [recordingTitleDraft, setRecordingTitleDraft] = useState('');
  const [recordingDescriptionDraft, setRecordingDescriptionDraft] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const remoteTrackCount = remoteStream?.getTracks().length || 0;

  const status = String(session?.status || '').toLowerCase();
  const canPlayVideo = useMemo(() => Boolean(session?.hlsUrl || session?.streamUrl), [session?.hlsUrl, session?.streamUrl]);
  const isHost = useMemo(() => {
    if (!session) return false;
    if (session?.viewer?.isHost) return true;
    return String(session.hostUserId || '') === String(user?.id || '');
  }, [session, user?.id]);

  const hostUserId = String(session?.hostUserId || '').trim();
  const canManageRecording = isHost || String(user?.role || '').toLowerCase().includes('admin');
  const sessionMetadata = useMemo(() => {
    const raw = session?.metadata;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  }, [session?.metadata]);
  const activeVideoFilter = useMemo(
    () => toCssFilter(activeFilterPreset, activeFilterStrength),
    [activeFilterPreset, activeFilterStrength]
  );
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

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const data = await LiveService.getSession(sessionId);
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

  const sendSignal = useCallback(
    (toUserId: string, signal: SignalPayload) => {
      if (!socket || !isConnected || !sessionId) return;
      const normalizedToUserId = String(toUserId || '').trim();
      if (!normalizedToUserId) return;
      socket.emit('live:signal', {
        sessionId,
        toUserId: normalizedToUserId,
        signal
      });
    },
    [isConnected, sessionId, socket]
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
    if (localStreamRef.current) return localStreamRef.current;
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
      throw error;
    } finally {
      setMediaInitBusy(false);
    }
  }, [showNotification]);

  const createHostPeer = useCallback(
    async (viewerUserId: string) => {
      const normalizedViewerUserId = String(viewerUserId || '').trim();
      if (!normalizedViewerUserId) return null;
      const existing = hostPeersRef.current.get(normalizedViewerUserId);
      if (existing) return existing;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      hostPeersRef.current.set(normalizedViewerUserId, pc);

      const stream = await ensureLocalMedia();
      ensureTrackSenders(pc, stream);

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignal(normalizedViewerUserId, {
          kind: 'ice-candidate',
          candidate: event.candidate.toJSON()
        });
      };

      pc.onconnectionstatechange = () => {
        const state = String(pc.connectionState || '').toLowerCase();
        if (state === 'connected') setConnectionState('connected');
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          hostPeersRef.current.delete(normalizedViewerUserId);
          try {
            pc.close();
          } catch {}
        }
      };

      return pc;
    },
    [ensureLocalMedia, sendSignal]
  );

  const createViewerPeer = useCallback(() => {
    if (viewerPeerRef.current) return viewerPeerRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    viewerPeerRef.current = pc;

    const inboundStream = new MediaStream();
    setRemoteStream(inboundStream);

    pc.ontrack = (event) => {
      event.streams.forEach((stream) => {
        stream.getTracks().forEach((track) => {
          const exists = inboundStream.getTracks().some((entry) => entry.id === track.id);
          if (!exists) inboundStream.addTrack(track);
        });
      });
      if (videoRef.current) {
        videoRef.current.srcObject = inboundStream;
        videoRef.current.muted = viewerMuted;
      }
      setRemoteStream(inboundStream);
      setConnectionState('connected');
      setMediaError(null);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !hostUserId) return;
      sendSignal(hostUserId, {
        kind: 'ice-candidate',
        candidate: event.candidate.toJSON()
      });
    };

    pc.onconnectionstatechange = () => {
      const state = String(pc.connectionState || '').toLowerCase();
      if (state === 'connected') {
        setConnectionState('connected');
      } else if (state === 'connecting') {
        setConnectionState('connecting');
      } else if (state === 'failed' || state === 'disconnected') {
        setConnectionState('failed');
      }
    };

    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch {
      // Older engines may not support transceivers consistently.
    }

    return pc;
  }, [hostUserId, sendSignal]);

  const closeAllPeers = useCallback(() => {
    hostPeersRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    hostPeersRef.current.clear();
    if (viewerPeerRef.current) {
      try {
        viewerPeerRef.current.close();
      } catch {}
      viewerPeerRef.current = null;
    }
    pendingHostCandidatesRef.current.clear();
    pendingViewerCandidatesRef.current = [];
  }, []);

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
    closeAllPeers();
    setRemoteStream(null);
    pendingViewerCandidatesRef.current = [];
    sendSignal(hostUserId, { kind: 'viewer-ready' });
    setConnectionState('connecting');
  }, [closeAllPeers, hostUserId, sendSignal]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    if (!socket || !isConnected || !sessionId) return;
    socket.emit('live:join', { sessionId });
    return () => {
      socket.emit('live:leave', { sessionId });
    };
  }, [socket, isConnected, sessionId]);

  useEffect(() => {
    const pruneTimer = setInterval(() => {
      setFloatingReactions((prev) => prev.slice(-12));
    }, 1200);
    return () => clearInterval(pruneTimer);
  }, []);

  useEffect(() => {
    if (status !== 'live') {
      setShowSafetyNotice(false);
      return;
    }
    let hideTimer: number | null = null;
    const showAndScheduleHide = () => {
      setShowSafetyNotice(true);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setShowSafetyNotice(false), 15000);
    };
    showAndScheduleHide();
    const interval = window.setInterval(showAndScheduleHide, 90000);
    return () => {
      window.clearInterval(interval);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [status]);

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

    const onJoined = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      void loadSession();
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
    window.addEventListener('live:ended', onEnded as EventListener);
    window.addEventListener('live:participant_joined', onJoined as EventListener);
    window.addEventListener('live:participant_left', onJoined as EventListener);
    window.addEventListener('live:gift_sent', onJoined as EventListener);
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
      window.removeEventListener('live:ended', onEnded as EventListener);
      window.removeEventListener('live:participant_joined', onJoined as EventListener);
      window.removeEventListener('live:participant_left', onJoined as EventListener);
      window.removeEventListener('live:gift_sent', onJoined as EventListener);
      window.removeEventListener('live:comment', onComment as EventListener);
      window.removeEventListener('live:recording_updated', onRecordingChange as EventListener);
      window.removeEventListener('live:recording_published', onRecordingChange as EventListener);
      window.removeEventListener('live:recording_unpublished', onRecordingChange as EventListener);
      window.removeEventListener('live:recording_deleted', onRecordingChange as EventListener);
      window.removeEventListener('live:restriction_updated', onRestriction as EventListener);
      window.removeEventListener('live:filter_updated', onFilterUpdated as EventListener);
    };
  }, [loadSession, sessionId, showNotification, user?.id]);

  useEffect(() => {
    const onSignal = async (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '').trim() !== sessionId) return;
      const fromUserId = String(detail.fromUserId || '').trim();
      const signal = detail.signal || {};
      const kind = String(signal.kind || '').trim();
      if (!fromUserId || !kind) return;

      try {
        if (isHost) {
          if (kind === 'viewer-ready') {
            const pc = await createHostPeer(fromUserId);
            if (!pc) return;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(fromUserId, {
              kind: 'offer',
              sdp: offer.sdp || ''
            });
            return;
          }

          const hostPeer = hostPeersRef.current.get(fromUserId);
          if (!hostPeer) return;

          if (kind === 'answer' && signal.sdp) {
            await hostPeer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: String(signal.sdp) }));
            const pendingCandidates = pendingHostCandidatesRef.current.get(fromUserId) || [];
            if (pendingCandidates.length) {
              pendingHostCandidatesRef.current.delete(fromUserId);
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
              const pending = pendingHostCandidatesRef.current.get(fromUserId) || [];
              pending.push(signal.candidate as RTCIceCandidateInit);
              pendingHostCandidatesRef.current.set(fromUserId, pending.slice(-60));
              return;
            }
            await hostPeer.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          return;
        }

        if (!hostUserId || fromUserId !== hostUserId) return;
        const pc = createViewerPeer();

        if (kind === 'offer' && signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: String(signal.sdp) }));
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
          sendSignal(hostUserId, {
            kind: 'answer',
            sdp: answer.sdp || ''
          });
          return;
        }

        if (kind === 'ice-candidate' && signal.candidate) {
          const hasRemoteDescription = Boolean(pc.remoteDescription && pc.remoteDescription.type);
          if (!hasRemoteDescription) {
            pendingViewerCandidatesRef.current = [...pendingViewerCandidatesRef.current, signal.candidate as RTCIceCandidateInit].slice(-80);
            return;
          }
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (error: any) {
        console.error('Live signal handling failed', error);
      }
    };

    window.addEventListener('live:signal', onSignal as EventListener);
    return () => {
      window.removeEventListener('live:signal', onSignal as EventListener);
    };
  }, [createHostPeer, createViewerPeer, hostUserId, isHost, sendSignal, sessionId]);

  useEffect(() => {
    if (!session) return;
    if (status !== 'live') return;
    if (!isHost) return;

    // Camera/mic readiness must not depend on socket state. If signaling reconnects
    // slowly, the host should still get an immediate permission prompt and local preview.
    void ensureLocalMedia().catch(() => {
      // user-visible message already set via mediaError state
    });
  }, [ensureLocalMedia, isHost, session, status]);

  useEffect(() => {
    if (!session || !isConnected || !socket) return;
    if (status !== 'live') return;
    if (isHost) return;
    if (!hostUserId) return;

    const requestHostOffer = () => {
      sendSignal(hostUserId, { kind: 'viewer-ready' });
      setConnectionState('connecting');
    };

    requestHostOffer();

    if (connectionRetryTimerRef.current) {
      window.clearInterval(connectionRetryTimerRef.current);
      connectionRetryTimerRef.current = null;
    }

    connectionRetryTimerRef.current = window.setInterval(() => {
      const hasRemoteTrack = Boolean(remoteStream && remoteStream.getTracks().length > 0);
      if (!hasRemoteTrack) {
        requestHostOffer();
      }
    }, 4500);

    return () => {
      if (connectionRetryTimerRef.current) {
        window.clearInterval(connectionRetryTimerRef.current);
        connectionRetryTimerRef.current = null;
      }
    };
  }, [hostUserId, isConnected, isHost, remoteStream, sendSignal, session, socket, status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !session) return;

    if (isHost && localStream) {
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
  }, [canPlayVideo, isHost, localStream, remoteStream, remoteTrackCount, session, viewerMuted]);

  useEffect(() => {
    return () => {
      if (connectionRetryTimerRef.current) {
        window.clearInterval(connectionRetryTimerRef.current);
        connectionRetryTimerRef.current = null;
      }
      closeAllPeers();
      stopStreamTracks(localStreamRef.current);
      localStreamRef.current = null;
    };
  }, [closeAllPeers]);

  const sendReaction = useCallback(
    async (type: 'like' | 'love') => {
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
    [sessionId, showNotification]
  );

  const sendGift = useCallback(
    async (payload: { amountGcoin: number; message?: string }) => {
      if (!sessionId) return;
      try {
        setGiftSending(true);
        await LiveService.sendGift(sessionId, payload);
        showNotification('success', 'Livestream', 'Gift sent.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to send gift.';
        showNotification('error', 'Livestream', message);
      } finally {
        setGiftSending(false);
      }
    },
    [sessionId, showNotification]
  );

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
    const href = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(href)
        .then(() => showNotification('success', 'Livestream', 'Link copied.'))
        .catch(() => showNotification('warning', 'Livestream', 'Unable to copy link.'));
      return;
    }
    showNotification('warning', 'Livestream', href);
  }, [showNotification]);

  const connectionLabel =
    connectionState === 'connected'
      ? 'Connected'
      : connectionState === 'connecting'
        ? 'Connecting'
        : connectionState === 'failed'
          ? 'Connection issue'
          : 'Idle';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/live/studio')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Studio
        </button>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white">
            <Radio className="h-3.5 w-3.5 text-rose-300" />
            {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
          </div>
          <button
            type="button"
            onClick={() => void leaveStream()}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit Stream
          </button>
          {isHost && status === 'live' ? (
            <button
              type="button"
              onClick={() => void endStream()}
              className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <Square className="h-3.5 w-3.5" />
              End Live Stream
            </button>
          ) : null}
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
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-black" onDoubleClick={() => void sendReaction('like')}>
              {(isHost && localStream) || (!isHost && remoteTrackCount > 0) || canPlayVideo ? (
                <video
                  ref={videoRef}
                  className="h-[58vh] w-full bg-black object-cover"
                  controls={canPlayVideo && !isHost && !(remoteTrackCount > 0)}
                  playsInline
                  style={{ filter: activeVideoFilter }}
                />
              ) : (
                <div className="flex h-[58vh] w-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-300">
                  {mediaInitBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  <span>
                    {isHost ? 'Preparing camera and microphone for this live session.' : 'Waiting for host camera to start streaming.'}
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
              )}
              <div className="absolute left-3 top-3 rounded-xl bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                {session.title || 'Untitled livestream'}
              </div>
              <div className="absolute right-3 top-3 rounded-xl bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                Viewers {Number(session.viewerCount || 0)}
              </div>
              {!isHost && ((remoteTrackCount > 0) || canPlayVideo) ? (
                <button
                  type="button"
                  onClick={() => setViewerMuted((prev) => !prev)}
                  className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/70"
                >
                  {viewerMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {viewerMuted ? 'Unmute' : 'Mute'}
                </button>
              ) : null}
              <ReactionOverlay items={floatingReactions} />
              {showSafetyNotice ? (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-xl border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-[11px] font-semibold text-amber-100 backdrop-blur">
                  {SAFETY_NOTICE_TEXT}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{session.title || 'Untitled livestream'}</h2>
              <p className="mt-1 text-sm text-slate-600">{session.description || 'No description provided.'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{String(session.visibility || 'public').toUpperCase()}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Viewers {Number(session.viewerCount || 0)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Peak {Number(session.peakViewerCount || 0)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{connectionLabel}</span>
                {activeFilterPreset !== 'none' ? (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                    Filter {LIVE_FILTER_PRESETS.find((entry) => entry.value === activeFilterPreset)?.label || activeFilterPreset}
                  </span>
                ) : null}
              </div>
              {mentionedUsers.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Mentioned</span>
                  {mentionedUsers.map((entry) => (
                    <span key={`mention-${entry.id || entry.username}`} className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                      @{entry.username || entry.name}
                    </span>
                  ))}
                </div>
              ) : null}
              {taggedPages.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Tagged pages</span>
                  {taggedPages.map((entry) => (
                    <span key={`page-${entry.id || entry.slug || entry.handle}`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                      {entry.name || entry.handle || entry.slug || 'Page'}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void sendReaction('like')}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {Number(session.likesCount || 0)}
                </button>
                <button
                  type="button"
                  onClick={() => void sendReaction('love')}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Heart className="h-3.5 w-3.5" /> {Number(session.lovesCount || 0)}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Share
                </button>
                {isHost ? (
                  <>
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                        micEnabled ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 text-slate-700'
                      }`}
                    >
                      {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                      {micEnabled ? 'Mic On' : 'Mic Off'}
                    </button>
                    <button
                      type="button"
                      onClick={toggleCamera}
                      className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                        cameraEnabled ? 'border border-blue-200 bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-700'
                      }`}
                    >
                      {cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                      {cameraEnabled ? 'Cam On' : 'Cam Off'}
                    </button>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
                      <select
                        value={activeFilterPreset}
                        onChange={(event) => setActiveFilterPreset(normalizeFilterPreset(event.target.value))}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
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
                        className="w-24 accent-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => void applyFilter()}
                        disabled={filterBusy}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {filterBusy ? 'Applying...' : 'Apply Filter'}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <ParticipantGrid participants={session.participants || []} />
          </div>

          <div className="space-y-4">
            <GiftPanel
              sending={giftSending}
              minAmount={1}
              maxAmount={50000}
              onSend={async (payload) => {
                await sendGift(payload);
              }}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Live Chat</p>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-xs text-slate-500">No comments yet. Start the conversation.</p>
                ) : (
                  comments.map((comment: any) => (
                    <div key={String(comment?.id || Math.random())} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-slate-700">
                        {String(comment?.user?.name || comment?.user?.username || 'Scrolith user')}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-700">{String(comment?.message || '')}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400"
                  maxLength={500}
                />
                <button
                  type="button"
                  onClick={() => void sendComment()}
                  disabled={commentSending || !String(commentDraft || '').trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  aria-label="Send comment"
                >
                  {commentSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {canManageRecording ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Recording Management</p>
                <p className="mt-1 text-xs text-slate-500">
                  Save, publish, unpublish, download, or delete stream recordings after or during session.
                </p>
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={recordingFileIdDraft}
                    onChange={(event) => setRecordingFileIdDraft(event.target.value)}
                    placeholder="Recording file ID"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700"
                  />
                  <input
                    type="text"
                    value={recordingTitleDraft}
                    onChange={(event) => setRecordingTitleDraft(event.target.value)}
                    placeholder="Recording title"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700"
                  />
                  <textarea
                    value={recordingDescriptionDraft}
                    onChange={(event) => setRecordingDescriptionDraft(event.target.value)}
                    placeholder="Recording description"
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveRecording()}
                    disabled={recordingBusy}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {recordingBusy ? 'Saving...' : 'Save Recording'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishRecording('post')}
                    disabled={recordingBusy}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Publish to Post
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishRecording('scroll')}
                    disabled={recordingBusy}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Publish to Scroll
                  </button>
                  <button
                    type="button"
                    onClick={() => void unpublishRecording()}
                    disabled={recordingBusy}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                  >
                    Unpublish
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRecording()}
                    disabled={recordingBusy}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    Delete Recording
                  </button>
                </div>
                {session?.recording?.downloadUrl ? (
                  <a
                    href={String(session.recording.downloadUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Recording
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Realtime events</p>
              <p className="mt-1 text-xs text-slate-500">
                Connected: {isConnected ? 'Yes' : 'No'} | Socket room: live:session:{session.id}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveViewer;
