import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  bindScrolithCallRingtoneUnlock,
  startScrolithCallTone,
  stopScrolithCallTone,
  type RingtoneRole,
  type RingtoneStopReason
} from './scrolithCallRingtone';
import { buildCallMediaConstraints, buildCallMediaFallbackConstraints } from './callMediaConstraints';

type ParticipantOption = {
  id: string;
  name: string;
  avatar?: string;
};

type VoiceCallParticipant = {
  userId: string;
  status?: string;
  user?: ParticipantOption;
};

type CallState = {
  callId: string;
  conversationId: string;
  initiatorId: string;
  status: string;
  callType: 'direct' | 'conference' | string;
  mediaMode?: 'audio' | 'video' | string;
};

export type StartCallOptions = {
  conference?: boolean;
  /** When true, request camera + microphone and signal mediaMode=video. */
  video?: boolean;
  /** Override provider conversation (required for global shell). */
  conversationId?: string;
  participantUsers?: ParticipantOption[];
  callTargets?: ParticipantOption[];
};

type VoiceCallContextValue = {
  open: boolean;
  incoming: boolean;
  statusLabel: string;
  muted: boolean;
  speakerOn: boolean;
  cameraOff: boolean;
  addBusy: boolean;
  mediaMode: 'audio' | 'video' | string;
  localStream: MediaStream | null;
  participantUsers: ParticipantOption[];
  participants: VoiceCallParticipant[];
  remoteStreams: Record<string, MediaStream>;
  startCall: (options?: StartCallOptions) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => Promise<void>;
  switchToVideo: () => Promise<void>;
  addParticipant: (userId: string) => Promise<void>;
  /** REQUEST mode: ask host/mods for permission to join. */
  requestJoin: () => Promise<void>;
  approveJoinRequest: (requestId: string) => Promise<void>;
  rejectJoinRequest: (requestId: string, reason?: string) => Promise<void>;
  cancelJoinRequest: () => Promise<void>;
  pendingJoinRequests: Array<{
    requestId: string;
    requesterId: string;
    status: string;
    requestedAt?: string;
  }>;
  myJoinRequestStatus: string | null;
};

const VoiceCallContext = createContext<VoiceCallContextValue | undefined>(undefined);

const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 4
};

const emitWithAck = (socket: Socket | null, event: string, payload: any): Promise<any> => {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ success: false, error: 'Socket unavailable.' });
      return;
    }
    let finished = false;
    const timeout = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ success: false, error: `${event} timeout` });
    }, 10000);
    socket.emit(event, payload, (response: any) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      resolve(response || { success: true });
    });
  });
};

const normalizeParticipants = (ids: string[], users: ParticipantOption[], status = 'invited'): VoiceCallParticipant[] => {
  const userMap = new Map(users.map((entry) => [entry.id, entry]));
  return ids.map((userId) => ({ userId, status, user: userMap.get(userId) }));
};

const statusToLabel = (status: string, incoming: boolean, mediaMode?: string, callType?: string) => {
  const mediaLabel = String(mediaMode || '').toLowerCase() === 'video' ? 'video call' : 'voice call';
  const conferenceLabel = String(callType || '').toLowerCase() === 'conference' ? 'conference ' : '';
  if (incoming && status === 'ringing') return `Incoming ${conferenceLabel}${mediaLabel}`;
  if (status === 'connecting') return `Connecting ${conferenceLabel}${mediaLabel}...`;
  if (status === 'ringing') return `Calling ${conferenceLabel}${mediaLabel}...`;
  if (status === 'active') return `${conferenceLabel}${mediaLabel.charAt(0).toUpperCase()}${mediaLabel.slice(1)} in progress`;
  if (status === 'missed') return 'Missed call';
  if (status === 'failed') return 'Call failed';
  if (status === 'busy') return 'User is busy';
  if (status === 'cancelled') return 'Call cancelled';
  if (status === 'ended') return 'Call ended';
  if (status === 'rejected') return 'Call rejected';
  return 'Connecting...';
};

const toneStopReasonForStatus = (status: string): RingtoneStopReason => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'missed') return 'timeout';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'busy') return 'busy';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'left') return 'left';
  if (normalized === 'ended') return 'ended';
  return 'manual';
};

const emitVoiceLifecycleEvent = (type: string, payload?: Record<string, any>) => {
  try {
    window.dispatchEvent(
      new CustomEvent('voicecall:lifecycle', {
        detail: {
          type,
          ...(payload || {})
        }
      })
    );
  } catch {
    // noop
  }
};

type VoiceCallProviderProps = {
  socket: Socket | null;
  userId?: string;
  conversationId?: string;
  participantUsers: ParticipantOption[];
  callTargets?: ParticipantOption[];
  children: React.ReactNode;
};

export const VoiceCallProvider: React.FC<VoiceCallProviderProps> = ({
  socket,
  userId,
  conversationId,
  participantUsers,
  callTargets,
  children
}) => {
  const [callState, setCallState] = useState<CallState | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraOff, setCameraOff] = useState(false);
  const [participants, setParticipants] = useState<VoiceCallParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [addBusy, setAddBusy] = useState(false);
  const [pendingJoinRequests, setPendingJoinRequests] = useState<
    Array<{ requestId: string; requesterId: string; status: string; requestedAt?: string }>
  >([]);
  const [myJoinRequestStatus, setMyJoinRequestStatus] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const offeredPeersRef = useRef<Set<string>>(new Set());
  const callIdRef = useRef<string>('');
  const conversationIdRef = useRef<string>('');
  const userIdRef = useRef<string>('');
  const resetTimerRef = useRef<number | null>(null);
  const permissionNoticeShownRef = useRef(false);
  const rtcConfigRef = useRef<RTCConfiguration>(DEFAULT_RTC_CONFIG);
  const iceRestartingRef = useRef<Set<string>>(new Set());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const activeStartTokenRef = useRef(0);

  useEffect(() => {
    callIdRef.current = callState?.callId || '';
    conversationIdRef.current = callState?.conversationId || '';
    userIdRef.current = String(userId || '').trim();
  }, [callState?.callId, callState?.conversationId, userId]);

  useEffect(() => bindScrolithCallRingtoneUnlock(), []);

  const clearPeers = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // noop
      }
    });
    peerConnectionsRef.current.clear();
    setRemoteStreams({});
  }, []);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const stopRingingAlert = useCallback((reason: RingtoneStopReason = 'manual') => {
    stopScrolithCallTone(reason);
  }, []);

  const startRingingAlert = useCallback((callId?: string | null, role: RingtoneRole = 'incoming') => {
    const activeCallId = String(callId || callIdRef.current || '').trim();
    if (!activeCallId) return;
    void startScrolithCallTone({ callId: activeCallId, role });
  }, []);

  const clearLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStreamState(null);
  }, []);

  const resetCallState = useCallback(() => {
    clearResetTimer();
    stopRingingAlert();
    setIncoming(false);
    setCallState(null);
    setParticipants([]);
    setMuted(false);
    setCameraOff(false);
    activeStartTokenRef.current += 1;
    permissionNoticeShownRef.current = false;
    offeredPeersRef.current.clear();
    pendingCandidatesRef.current.clear();
    clearPeers();
    clearLocalStream();
  }, [clearLocalStream, clearPeers, clearResetTimer, stopRingingAlert]);

  // Load ICE/TURN from runtime voice config (admin/platform env on backend).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { MessagingService } = await import('../services/messaging');
        const config = await MessagingService.getVoiceRuntimeConfig();
        if (cancelled || !config) return;
        const servers = Array.isArray((config as any).iceServers)
          ? (config as any).iceServers
          : null;
        if (servers?.length) {
          rtcConfigRef.current = {
            iceServers: servers,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceCandidatePoolSize: 4,
            iceTransportPolicy:
              (config as any).iceTransportPolicy === 'relay' ? 'relay' : 'all'
          };
        }
      } catch {
        // Keep default STUN.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mediaModeRef = useRef<'audio' | 'video'>('audio');
  const [mediaMode, setMediaMode] = useState<'audio' | 'video' | string>('audio');
  const [localStreamState, setLocalStreamState] = useState<MediaStream | null>(null);

  const ensureLocalMedia = useCallback(async (wantVideo = false) => {
    const existing = localStreamRef.current;
    if (existing) {
      const hasVideo = existing.getVideoTracks().some((t) => t.readyState === 'live');
      if (!wantVideo || hasVideo) {
        setLocalStreamState(existing);
        return existing;
      }
      // Upgrade audio-only stream to A/V.
      existing.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildCallMediaConstraints({ video: wantVideo }));
      localStreamRef.current = stream;
      setLocalStreamState(stream);
      return stream;
    } catch (error: any) {
      // Fallback if advanced constraints rejected by device.
      try {
        const stream = await navigator.mediaDevices.getUserMedia(buildCallMediaFallbackConstraints(wantVideo));
        localStreamRef.current = stream;
        setLocalStreamState(stream);
        return stream;
      } catch (fallbackError: any) {
        const name = String(fallbackError?.name || error?.name || '').toLowerCase();
        const denied =
          name.includes('notallowed') ||
          name.includes('permissiondenied') ||
          name.includes('securityerror');
        if (denied) {
          throw new Error(
            wantVideo
              ? 'Camera/microphone permission denied. Enable access and try again.'
              : 'Microphone permission denied. Enable microphone access and try again.'
          );
        }
        throw new Error(
          String(
            fallbackError?.message ||
              error?.message ||
              (wantVideo ? 'Unable to access camera/microphone.' : 'Unable to access microphone.')
          )
        );
      }
    }
  }, []);

  /** @deprecated Prefer ensureLocalMedia — kept for internal call sites. */
  const ensureLocalAudio = useCallback(async () => ensureLocalMedia(false), [ensureLocalMedia]);

  /** Serialize WebRTC objects for Socket.IO (RTCIceCandidate/RTCSessionDescription are not plain JSON). */
  const toPlainSignal = useCallback((signal: any) => {
    if (!signal || typeof signal !== 'object') return signal;
    const type = String(signal.type || '').toLowerCase();
    if (type === 'offer' || type === 'answer' || type === 'pranswer') {
      const sdpValue = signal.sdp;
      // Accept nested RTCSessionDescriptionInit or string sdp.
      if (sdpValue && typeof sdpValue === 'object') {
        return {
          type: String(sdpValue.type || type),
          sdp: String(sdpValue.sdp || '')
        };
      }
      return { type, sdp: String(sdpValue || '') };
    }
    if (type === 'candidate' || signal.candidate) {
      const candidate = signal.candidate ?? signal;
      const plain =
        candidate && typeof candidate.toJSON === 'function'
          ? candidate.toJSON()
          : {
              candidate: String(candidate?.candidate || ''),
              sdpMid: candidate?.sdpMid ?? null,
              sdpMLineIndex: candidate?.sdpMLineIndex ?? null,
              usernameFragment: candidate?.usernameFragment ?? undefined
            };
      return { type: 'candidate', candidate: plain };
    }
    return signal;
  }, []);

  const sendSignal = useCallback(
    async (toUserId: string, signal: any) => {
      const callId = callIdRef.current;
      if (!callId || !toUserId) return;
      const plain = toPlainSignal(signal);
      await emitWithAck(socket, 'call:signal', { callId, toUserId, signal: plain });
    },
    [socket, toPlainSignal]
  );

  const createPeerConnection = useCallback(
    async (remoteUserId: string) => {
      if (!remoteUserId) return null;
      const existing = peerConnectionsRef.current.get(remoteUserId);
      if (existing) return existing;

      let stream: MediaStream | null = null;
      try {
        stream = await ensureLocalMedia(mediaModeRef.current === 'video');
      } catch (error: any) {
        if (!permissionNoticeShownRef.current) {
          permissionNoticeShownRef.current = true;
          emitVoiceLifecycleEvent('permission_denied', {
            message: String(error?.message || 'Media permission denied.')
          });
        }
      }
      const peer = new RTCPeerConnection(rtcConfigRef.current || DEFAULT_RTC_CONFIG);

      if (stream) {
        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream as MediaStream);
        });
      }

      peer.ontrack = (event) => {
        const [remoteStream] = event.streams || [];
        if (!remoteStream) return;
        setRemoteStreams((prev) => ({ ...prev, [remoteUserId]: remoteStream }));
      };

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        // Always plain-object candidate — raw RTCIceCandidate drops fields over Socket.IO.
        void sendSignal(remoteUserId, {
          type: 'candidate',
          candidate:
            typeof event.candidate.toJSON === 'function'
              ? event.candidate.toJSON()
              : {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  usernameFragment: event.candidate.usernameFragment
                }
        });
      };

      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        if (state === 'failed' || state === 'disconnected') {
          // Enterprise recovery: ICE restart once per peer.
          if (!iceRestartingRef.current.has(remoteUserId)) {
            iceRestartingRef.current.add(remoteUserId);
            void (async () => {
              try {
                const offer = await peer.createOffer({
                  iceRestart: true,
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: mediaModeRef.current === 'video'
                });
                await peer.setLocalDescription(offer);
                await sendSignal(remoteUserId, { type: 'offer', sdp: offer, iceRestart: true });
                emitVoiceLifecycleEvent('reconnecting', {
                  callId: callIdRef.current,
                  peerUserId: remoteUserId
                });
              } catch {
                setRemoteStreams((prev) => {
                  if (!prev[remoteUserId]) return prev;
                  const next = { ...prev };
                  delete next[remoteUserId];
                  return next;
                });
              } finally {
                window.setTimeout(() => iceRestartingRef.current.delete(remoteUserId), 8000);
              }
            })();
          }
        }
        if (state === 'closed') {
          setRemoteStreams((prev) => {
            if (!prev[remoteUserId]) return prev;
            const next = { ...prev };
            delete next[remoteUserId];
            return next;
          });
        }
        if (state === 'connected' || state === 'completed') {
          iceRestartingRef.current.delete(remoteUserId);
          setCallState((prev) => (prev ? { ...prev, status: 'active' } : prev));
        }
      };

      peerConnectionsRef.current.set(remoteUserId, peer);
      return peer;
    },
    [ensureLocalMedia, sendSignal]
  );

  const ensureParticipantEntry = useCallback((id: string, status?: string, userOverride?: ParticipantOption) => {
    setParticipants((prev) => {
      const exists = prev.some((entry) => entry.userId === id);
      if (exists) {
        return prev.map((entry) =>
          entry.userId === id
            ? { ...entry, status: status || entry.status, user: userOverride || entry.user }
            : entry
        );
      }
      const user = userOverride || participantUsers.find((entry) => entry.id === id);
      return [...prev, { userId: id, status: status || 'invited', user }];
    });
  }, [participantUsers]);

  const createOfferForUser = useCallback(
    async (remoteUserId: string) => {
      if (!remoteUserId || remoteUserId === userIdRef.current) return;
      // Avoid double offers when both call-room and user-room join events fire.
      if (offeredPeersRef.current.has(remoteUserId)) return;
      offeredPeersRef.current.add(remoteUserId);
      try {
        const peer = await createPeerConnection(remoteUserId);
        if (!peer) {
          offeredPeersRef.current.delete(remoteUserId);
          return;
        }
        const wantVideo = mediaModeRef.current === 'video';
        const offer = await peer.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: wantVideo
        });
        await peer.setLocalDescription(offer);
        await sendSignal(remoteUserId, {
          type: 'offer',
          sdp: { type: offer.type, sdp: offer.sdp }
        });
      } catch (error: any) {
        offeredPeersRef.current.delete(remoteUserId);
        setCallState((prev) => (prev ? { ...prev, status: 'failed' } : prev));
        emitVoiceLifecycleEvent('failed', {
          callId: callIdRef.current,
          conversationId: conversationIdRef.current,
          error: String(error?.message || 'Failed to establish call media.')
        });
      }
    },
    [createPeerConnection, sendSignal]
  );

  const publishLocalTracksToPeers = useCallback((stream: MediaStream) => {
    peerConnectionsRef.current.forEach((peer) => {
      stream.getTracks().forEach((track) => {
        const sender = peer.getSenders().find((entry) => entry.track?.kind === track.kind);
        if (sender) {
          void sender.replaceTrack(track).catch(() => undefined);
        } else {
          try {
            peer.addTrack(track, stream);
          } catch {
            // Track may already be attached on some WebRTC implementations.
          }
        }
      });
    });
  }, []);

  const renegotiatePeerMedia = useCallback(
    async (remoteUserId: string, peer: RTCPeerConnection) => {
      if (!remoteUserId || peer.signalingState === 'closed') return;
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mediaModeRef.current === 'video'
      });
      await peer.setLocalDescription(offer);
      await sendSignal(remoteUserId, {
        type: 'offer',
        sdp: { type: offer.type, sdp: offer.sdp },
        mediaMode: mediaModeRef.current
      });
    },
    [sendSignal]
  );

  const renegotiateAllPeerMedia = useCallback(async () => {
    const entries = Array.from(peerConnectionsRef.current.entries());
    await Promise.all(entries.map(([remoteUserId, peer]) => renegotiatePeerMedia(remoteUserId, peer)));
  }, [renegotiatePeerMedia]);

  const switchToVideo = useCallback(async () => {
    const stream = await ensureLocalMedia(true);
    stream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    mediaModeRef.current = 'video';
    setMediaMode('video');
    setCameraOff(false);
    setCallState((prev) => (prev ? { ...prev, mediaMode: 'video' } : prev));
    publishLocalTracksToPeers(stream);
    await renegotiateAllPeerMedia();
    emitVoiceLifecycleEvent('video_enabled', {
      callId: callIdRef.current,
      conversationId: conversationIdRef.current
    });
  }, [ensureLocalMedia, publishLocalTracksToPeers, renegotiateAllPeerMedia]);

  const toggleCamera = useCallback(async () => {
    if (mediaModeRef.current !== 'video') {
      await switchToVideo();
      return;
    }
    const stream = localStreamRef.current;
    const videoTracks = stream?.getVideoTracks().filter((track) => track.readyState === 'live') || [];
    if (!videoTracks.length) {
      await switchToVideo();
      return;
    }
    const nextCameraOff = !cameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
    emitVoiceLifecycleEvent(nextCameraOff ? 'camera_disabled' : 'camera_enabled', {
      callId: callIdRef.current,
      conversationId: conversationIdRef.current
    });
  }, [cameraOff, switchToVideo]);

  const handleIncomingSignal = useCallback(
    async (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const fromUserId = String(payload?.fromUserId || '').trim();
      const signal = payload?.signal;
      if (!callId || !fromUserId || !signal) return;
      if (callIdRef.current && callIdRef.current !== callId) return;

      const peer = await createPeerConnection(fromUserId);
      if (!peer) return;

      const signalType = String(signal?.type || '').toLowerCase();
      const resolveDescriptionInit = (raw: any): RTCSessionDescriptionInit | null => {
        if (!raw) return null;
        if (typeof raw === 'string') {
          return { type: signalType as RTCSdpType, sdp: raw };
        }
        if (typeof raw === 'object') {
          // Nested { type, sdp } or already flat
          if (typeof raw.sdp === 'string') {
            return {
              type: (String(raw.type || signalType) as RTCSdpType) || (signalType as RTCSdpType),
              sdp: raw.sdp
            };
          }
          if (raw.sdp && typeof raw.sdp === 'object' && typeof raw.sdp.sdp === 'string') {
            return {
              type: (String(raw.sdp.type || raw.type || signalType) as RTCSdpType),
              sdp: String(raw.sdp.sdp)
            };
          }
        }
        return null;
      };

      if (signalType === 'offer') {
        const desc = resolveDescriptionInit(signal.sdp ?? signal);
        if (!desc?.sdp) return;
        if (/\bm=video\b/i.test(desc.sdp)) {
          mediaModeRef.current = 'video';
          setMediaMode('video');
          setCallState((prev) => (prev ? { ...prev, mediaMode: 'video' } : prev));
        }
        await peer.setRemoteDescription(new RTCSessionDescription(desc));
        // Flush queued ICE candidates after remote description is set.
        const queued = pendingCandidatesRef.current.get(fromUserId) || [];
        for (const candidate of queued) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // ignore race
          }
        }
        pendingCandidatesRef.current.delete(fromUserId);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal(fromUserId, {
          type: 'answer',
          sdp: { type: answer.type, sdp: answer.sdp }
        });
      } else if (signalType === 'answer' || signalType === 'pranswer') {
        const desc = resolveDescriptionInit(signal.sdp ?? signal);
        if (!desc?.sdp) return;
        await peer.setRemoteDescription(new RTCSessionDescription(desc));
        const queued = pendingCandidatesRef.current.get(fromUserId) || [];
        for (const candidate of queued) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // ignore race
          }
        }
        pendingCandidatesRef.current.delete(fromUserId);
      } else if (signalType === 'candidate' && signal?.candidate) {
        try {
          const candInit =
            typeof signal.candidate === 'object'
              ? signal.candidate
              : { candidate: String(signal.candidate || '') };
          if (!peer.remoteDescription) {
            const queue = pendingCandidatesRef.current.get(fromUserId) || [];
            queue.push(candInit);
            pendingCandidatesRef.current.set(fromUserId, queue);
          } else {
            await peer.addIceCandidate(new RTCIceCandidate(candInit));
          }
        } catch {
          // candidate race; ignore
        }
      }
    },
    [createPeerConnection, sendSignal]
  );

  useEffect(() => {
    if (!socket || !userId) return;

    const finalizeCallState = (status: string, payload?: any, delayMs = 1200) => {
      clearResetTimer();
      stopRingingAlert(toneStopReasonForStatus(status));
      setIncoming(false);
      setCallState((prev) => (prev ? { ...prev, status } : prev));
      if (status === 'missed' || status === 'failed' || status === 'rejected') {
        emitVoiceLifecycleEvent(status, {
          callId: String(payload?.callId || callIdRef.current || ''),
          conversationId: String(payload?.conversationId || conversationIdRef.current || ''),
          error: String(payload?.error || '')
        });
      }
      if (delayMs <= 0) {
        resetCallState();
        return;
      }
      resetTimerRef.current = window.setTimeout(() => {
        resetCallState();
      }, delayMs);
    };

    const onRinging = (payload: any) => {
      const payloadConversationId = String(payload?.conversationId || '').trim();
      const payloadCallId = String(payload?.callId || '').trim();
      const targetConversationId = String(conversationId || '').trim();
      if (!payloadCallId) return;
      clearResetTimer();
      const sameConversation =
        !targetConversationId || !payloadConversationId || payloadConversationId === targetConversationId;

      const initiatorId = String(payload?.initiatorId || '').trim();
      const incomingCall = initiatorId && initiatorId !== String(userId || '').trim();
      setIncoming(incomingCall);
      const incomingMedia =
        String(payload?.mediaMode || 'audio').toLowerCase() === 'video' ? 'video' : 'audio';
      mediaModeRef.current = incomingMedia;
      setMediaMode(incomingMedia);
      conversationIdRef.current = payloadConversationId || conversationIdRef.current;
      setCallState({
        callId: payloadCallId,
        conversationId: payloadConversationId,
        initiatorId,
        status: String(payload?.status || 'ringing').toLowerCase(),
        callType: String(payload?.callType || 'direct').toLowerCase(),
        mediaMode: incomingMedia
      });

      const ids = Array.isArray(payload?.participantIds)
        ? payload.participantIds.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const payloadUsers = Array.isArray(payload?.participants)
        ? payload.participants
            .map((entry: any) => ({
              id: String(entry?.id || '').trim(),
              name: String(entry?.name || entry?.username || '').trim() || 'Participant',
              avatar: String(entry?.avatar || '').trim() || undefined
            }))
            .filter((entry: ParticipantOption) => Boolean(entry.id))
        : [];
      const participantLookup = new Map<string, ParticipantOption>(
        [...participantUsers, ...payloadUsers].map((entry) => [String(entry.id || '').trim(), entry])
      );
      const fallbackIds = (() => {
        if (!sameConversation) {
          return [initiatorId, String(userId || '').trim()].filter(Boolean);
        }
        const knownIds = new Set(
          [
            String(userId || '').trim(),
            ...participantUsers.map((entry) => String(entry?.id || '').trim()),
            ...payloadUsers.map((entry: ParticipantOption) => String(entry?.id || '').trim())
          ].filter(Boolean)
        );
        const sanitizedIds = ids.filter((id) => knownIds.has(id));
        return sanitizedIds.length
          ? sanitizedIds
          : [initiatorId, String(userId || '').trim()].filter((id) => Boolean(id) && knownIds.has(id));
      })();
      setParticipants(
        fallbackIds.map((participantId) => ({
          userId: participantId,
          status: 'invited',
          user: participantLookup.get(participantId)
        }))
      );
      if (String(payload?.status || 'ringing').toLowerCase() === 'ringing') {
        startRingingAlert(payloadCallId, incomingCall ? 'incoming' : 'outgoing');
      } else {
        stopRingingAlert(toneStopReasonForStatus(String(payload?.status || 'manual')));
      }
      if (incomingCall) {
        emitVoiceLifecycleEvent('incoming', {
          callId: payloadCallId,
          conversationId: payloadConversationId,
          initiatorId
        });
      } else if (sameConversation) {
        emitVoiceLifecycleEvent('ringing', {
          callId: payloadCallId,
          conversationId: payloadConversationId,
          initiatorId
        });
      }
    };

    const onInitiated = (payload: any) => {
      const initiatorId = String(payload?.initiatorId || '').trim();
      if (!initiatorId || initiatorId !== String(userId || '').trim()) return;
      onRinging(payload);
    };

    const onParticipantJoined = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const joinedUserId = String(payload?.userId || '').trim();
      if (!callId || !joinedUserId || callId !== callIdRef.current) return;
      ensureParticipantEntry(joinedUserId, 'joined');
      setCallState((prev) => (prev ? { ...prev, status: 'active' } : prev));
      stopRingingAlert('answered');
      if (joinedUserId !== userIdRef.current) {
        void createOfferForUser(joinedUserId);
      }
    };

    const onParticipantAdded = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const addedUserId = String(payload?.userId || payload?.participantId || '').trim();
      if (!callId || !addedUserId || callId !== callIdRef.current) return;
      const participant = payload?.participant && typeof payload.participant === 'object'
        ? {
            id: String(payload.participant.id || addedUserId).trim(),
            name: String(payload.participant.name || payload.participant.username || '').trim() || 'Participant',
            avatar: String(payload.participant.avatar || '').trim() || undefined
          }
        : undefined;
      ensureParticipantEntry(addedUserId, 'invited', participant);
    };

    const onParticipantLeft = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const leftUserId = String(payload?.userId || '').trim();
      if (!callId || !leftUserId || callId !== callIdRef.current) return;
      ensureParticipantEntry(leftUserId, 'left');
    };

    const onCallEnded = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (!callId || (callIdRef.current && callId !== callIdRef.current)) return;
      const status = String(payload?.status || 'ended').trim().toLowerCase() || 'ended';
      finalizeCallState(status, payload, 1000);
    };

    const onCallRejected = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const rejectedUserId = String(payload?.userId || '').trim();
      if (!callId || callId !== callIdRef.current) return;
      ensureParticipantEntry(rejectedUserId, 'rejected');
      finalizeCallState('rejected', payload, 1400);
    };

    const onSignal = (payload: any) => {
      void handleIncomingSignal(payload);
    };

    const onLifecycleJoined = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const joinedUserId = String(payload?.userId || '').trim();
      if (!callId || !joinedUserId || callId !== callIdRef.current) return;
      ensureParticipantEntry(joinedUserId, 'joined');
      setCallState((prev) => (prev ? { ...prev, status: 'active' } : prev));
      stopRingingAlert('answered');
      // Backup for call-room delivery: user-room messenger:call_joined also triggers offer.
      if (joinedUserId !== userIdRef.current) {
        void createOfferForUser(joinedUserId);
      }
    };

    const onLifecycleMissed = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (!callId || (callIdRef.current && callId !== callIdRef.current)) return;
      finalizeCallState('missed', payload, 1600);
    };

    const onLifecycleFailed = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (callIdRef.current && callId && callId !== callIdRef.current) return;
      setCallState((prev) => {
        const nextCallId = callId || callIdRef.current || '';
        if (!prev && !nextCallId) return prev;
        return {
          callId: nextCallId,
          conversationId: String(payload?.conversationId || conversationIdRef.current || ''),
          initiatorId: String(payload?.initiatorId || userIdRef.current || ''),
          status: 'failed',
          callType: String(payload?.callType || 'direct').toLowerCase()
        };
      });
      finalizeCallState('failed', payload, 1800);
    };

    const onCallBusy = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (callIdRef.current && callId && callId !== callIdRef.current) return;
      emitVoiceLifecycleEvent('busy', {
        callId: callId || callIdRef.current || '',
        conversationId: String(payload?.conversationId || conversationIdRef.current || ''),
        busyUserId: String(payload?.busyUserId || '').trim(),
        busyUserName: String(payload?.busyUserName || '').trim(),
        error: String(payload?.error || 'User is currently on another call.')
      });
      finalizeCallState('failed', payload, 1200);
    };

    const onLifecycleEnded = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (!callId || (callIdRef.current && callId !== callIdRef.current)) return;
      const status = String(payload?.status || 'ended').trim().toLowerCase() || 'ended';
      finalizeCallState(status, payload, 900);
    };

    socket.on('call:initiate', onInitiated);
    socket.on('call:ringing', onRinging);
    socket.on('call:participant:joined', onParticipantJoined);
    socket.on('call:participant:add', onParticipantAdded);
    socket.on('call:participant:left', onParticipantLeft);
    socket.on('call:end', onCallEnded);
    socket.on('call:reject', onCallRejected);
    socket.on('call:busy', onCallBusy);
    const onJoinRequested = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (!callId || (callIdRef.current && callId !== callIdRef.current)) return;
      const request = payload?.request;
      if (!request?.requestId) return;
      const entry = {
        requestId: String(request.requestId),
        requesterId: String(request.requesterId || ''),
        status: String(request.status || 'pending'),
        requestedAt: request.requestedAt
      };
      setPendingJoinRequests((prev) => {
        if (prev.some((row) => row.requestId === entry.requestId)) {
          return prev.map((row) => (row.requestId === entry.requestId ? entry : row));
        }
        return [...prev, entry];
      });
      if (entry.requesterId === String(userId || '')) {
        setMyJoinRequestStatus(entry.status);
      }
    };

    const onJoinApproved = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (!callId || (callIdRef.current && callId !== callIdRef.current)) return;
      const request = payload?.request;
      const requestId = String(request?.requestId || '');
      const requesterId = String(request?.requesterId || '');
      setPendingJoinRequests((prev) =>
        prev.map((row) =>
          row.requestId === requestId ? { ...row, status: 'approved' } : row
        )
      );
      if (requesterId === String(userId || '')) {
        setMyJoinRequestStatus('approved');
        emitVoiceLifecycleEvent('join_approved', { callId, requestId });
      }
    };

    const onJoinRejected = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      if (!callId || (callIdRef.current && callId !== callIdRef.current)) return;
      const request = payload?.request;
      const requestId = String(request?.requestId || '');
      const requesterId = String(request?.requesterId || '');
      setPendingJoinRequests((prev) =>
        prev.map((row) =>
          row.requestId === requestId ? { ...row, status: 'rejected' } : row
        )
      );
      if (requesterId === String(userId || '')) {
        setMyJoinRequestStatus('rejected');
      }
    };

    socket.on('call:signal', onSignal);
    socket.on('messenger:call_joined', onLifecycleJoined);
    socket.on('messenger:call_missed', onLifecycleMissed);
    socket.on('messenger:call_failed', onLifecycleFailed);
    socket.on('messenger:call_ended', onLifecycleEnded);
    socket.on('call:join-requested', onJoinRequested);
    socket.on('call:join-approved', onJoinApproved);
    socket.on('call:join-rejected', onJoinRejected);

    return () => {
      socket.off('call:initiate', onInitiated);
      socket.off('call:ringing', onRinging);
      socket.off('call:participant:joined', onParticipantJoined);
      socket.off('call:participant:add', onParticipantAdded);
      socket.off('call:participant:left', onParticipantLeft);
      socket.off('call:end', onCallEnded);
      socket.off('call:reject', onCallRejected);
      socket.off('call:busy', onCallBusy);
      socket.off('call:signal', onSignal);
      socket.off('messenger:call_joined', onLifecycleJoined);
      socket.off('messenger:call_missed', onLifecycleMissed);
      socket.off('messenger:call_failed', onLifecycleFailed);
      socket.off('messenger:call_ended', onLifecycleEnded);
      socket.off('call:join-requested', onJoinRequested);
      socket.off('call:join-approved', onJoinApproved);
      socket.off('call:join-rejected', onJoinRejected);
    };
  }, [
    socket,
    userId,
    conversationId,
    participantUsers,
    clearResetTimer,
    ensureParticipantEntry,
    createOfferForUser,
    handleIncomingSignal,
    resetCallState,
    startRingingAlert,
    stopRingingAlert
  ]);

  const startCall = useCallback(
    async (options?: StartCallOptions) => {
      if (!socket || !userId) {
        throw new Error('Not connected. Wait for messaging to reconnect and try again.');
      }
      const activeConversationId = String(options?.conversationId || conversationId || '').trim();
      if (!activeConversationId) {
        throw new Error('Open a conversation before starting a call.');
      }
      const rosterSource =
        (Array.isArray(options?.callTargets) && options.callTargets.length
          ? options.callTargets
          : null) ||
        (Array.isArray(options?.participantUsers) && options.participantUsers.length
          ? options.participantUsers
          : null) ||
        (Array.isArray(callTargets) && callTargets.length ? callTargets : participantUsers);
      const startCandidates = rosterSource
        .map((entry) => ({ ...entry, id: String(entry?.id || '').trim() }))
        .filter((entry) => Boolean(entry.id) && entry.id !== String(userId));
      const participantIds = startCandidates.map((entry) => entry.id);
      const targetParticipantIds = options?.conference ? participantIds : participantIds.slice(0, 1);
      if (!targetParticipantIds.length) {
        throw new Error('No valid participant available for this call.');
      }

      const wantVideo = Boolean(options?.video);
      const startToken = Date.now();
      activeStartTokenRef.current = startToken;
      const pendingCallId = `pending-${startToken}`;
      const resolvedCallType = String(options?.conference ? 'conference' : 'direct');
      const rosterForUi = [
        ...participantUsers,
        ...startCandidates,
        ...(Array.isArray(options?.participantUsers) ? options.participantUsers : [])
      ];
      mediaModeRef.current = wantVideo ? 'video' : 'audio';
      setMediaMode(wantVideo ? 'video' : 'audio');
      setIncoming(false);
      conversationIdRef.current = activeConversationId;
      setCallState({
        callId: pendingCallId,
        conversationId: activeConversationId,
        initiatorId: String(userId),
        status: 'connecting',
        callType: resolvedCallType,
        mediaMode: wantVideo ? 'video' : 'audio'
      });
      setParticipants(
        normalizeParticipants(
          Array.from(new Set([String(userId), ...targetParticipantIds])),
          rosterForUi,
          'invited'
        )
      );
      // Acquire devices before creating the server call so permission failures do not
      // leave a ringing call that later records as "missed".
      try {
        await ensureLocalMedia(wantVideo);
      } catch (error: any) {
        setCallState((prev) => (prev ? { ...prev, status: 'failed' } : prev));
        resetTimerRef.current = window.setTimeout(() => resetCallState(), 1500);
        throw error;
      }
      if (activeStartTokenRef.current !== startToken) {
        clearLocalStream();
        return;
      }

      const response = await emitWithAck(socket, 'call:initiate', {
        conversationId: activeConversationId,
        participantIds: targetParticipantIds,
        callType: resolvedCallType,
        mediaMode: wantVideo ? 'video' : 'audio'
      });
      if (activeStartTokenRef.current !== startToken) {
        const serverCallId = String(response?.data?.callId || '').trim();
        if (serverCallId) {
          await emitWithAck(socket, 'call:end', { callId: serverCallId });
        }
        clearLocalStream();
        return;
      }
      if (response?.success === false) {
        const errorMessage = String(response?.error || 'Failed to initiate call.');
        const responseCode = String(response?.code || response?.data?.code || '').toLowerCase();
        if (responseCode.includes('busy')) {
          emitVoiceLifecycleEvent('busy', {
            conversationId: activeConversationId,
            busyUserId: String(response?.data?.busyUserId || '').trim(),
            busyUserName: String(response?.data?.busyUserName || '').trim(),
            error: errorMessage
          });
        } else {
          emitVoiceLifecycleEvent('failed', {
            conversationId: activeConversationId,
            error: errorMessage
          });
        }
        stopRingingAlert(responseCode.includes('busy') ? 'busy' : 'failed');
        clearLocalStream();
        setLocalStreamState(null);
        setCallState((prev) => (prev ? { ...prev, status: 'failed' } : prev));
        resetTimerRef.current = window.setTimeout(() => resetCallState(), 1500);
        throw new Error(String(response?.error || 'Failed to initiate call.'));
      }
      const data = response?.data || {};
      const resolvedMedia =
        String(data.mediaMode || (wantVideo ? 'video' : 'audio')).toLowerCase() === 'video'
          ? 'video'
          : 'audio';
      mediaModeRef.current = resolvedMedia;
      setMediaMode(resolvedMedia);
      setIncoming(false);
      conversationIdRef.current = String(data.conversationId || activeConversationId);
      setCallState({
        callId: String(data.callId || ''),
        conversationId: String(data.conversationId || activeConversationId),
        initiatorId: String(data.initiatorId || userId),
        status: String(data.status || 'ringing'),
        callType: String(data.callType || resolvedCallType),
        mediaMode: resolvedMedia
      });
      if (String(data?.status || 'ringing').toLowerCase() === 'ringing') {
        startRingingAlert(String(data.callId || ''), 'outgoing');
      } else {
        stopRingingAlert(toneStopReasonForStatus(String(data?.status || 'manual')));
      }
      const ids = Array.isArray(data?.participantIds)
        ? data.participantIds.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [userId, ...targetParticipantIds];
      setParticipants(normalizeParticipants(Array.from(new Set(ids)), rosterForUi, 'invited'));
    },
    [
      socket,
      userId,
      conversationId,
      callTargets,
      participantUsers,
      ensureLocalMedia,
      clearLocalStream,
      resetCallState,
      startRingingAlert,
      stopRingingAlert
    ]
  );

  const acceptCall = useCallback(async () => {
    if (!socket || !callState?.callId) return;
    // Capture media before accept so the first offer/answer includes tracks.
    try {
      await ensureLocalMedia(mediaModeRef.current === 'video');
    } catch (error: any) {
      throw new Error(String(error?.message || 'Media permission required to join the call.'));
    }
    const response = await emitWithAck(socket, 'call:accept', { callId: callState.callId });
    if (response?.success === false) {
      const code = String(response?.code || '');
      if (code === 'GROUP_CALL_JOIN_REQUEST_REQUIRED') {
        setMyJoinRequestStatus('required');
        throw new Error(
          String(response?.error || 'You must request to join this call and wait for approval.')
        );
      }
      throw new Error(String(response?.error || 'Failed to accept call.'));
    }
    stopRingingAlert('answered');
    setIncoming(false);
    setMyJoinRequestStatus(null);
    setCallState((prev) => (prev ? { ...prev, status: 'active' } : prev));
    ensureParticipantEntry(String(userId || ''), 'joined');
  }, [socket, callState?.callId, ensureParticipantEntry, ensureLocalMedia, userId, stopRingingAlert]);

  const requestJoin = useCallback(async () => {
    if (!socket || !callState?.callId) return;
    const response = await emitWithAck(socket, 'call:join-request', { callId: callState.callId });
    if (response?.success === false) {
      throw new Error(String(response?.error || 'Failed to request join.'));
    }
    const status = String(response?.data?.request?.status || 'pending');
    setMyJoinRequestStatus(status);
    if (response?.data?.request) {
      setPendingJoinRequests((prev) => {
        const id = String(response.data.request.requestId || '');
        if (prev.some((entry) => entry.requestId === id)) return prev;
        return [
          ...prev,
          {
            requestId: id,
            requesterId: String(response.data.request.requesterId || userId || ''),
            status,
            requestedAt: response.data.request.requestedAt
          }
        ];
      });
    }
  }, [socket, callState?.callId, userId]);

  const approveJoinRequest = useCallback(
    async (requestId: string) => {
      if (!socket || !callState?.callId || !requestId) return;
      const response = await emitWithAck(socket, 'call:join-approve', {
        callId: callState.callId,
        requestId
      });
      if (response?.success === false) {
        throw new Error(String(response?.error || 'Failed to approve join request.'));
      }
    },
    [socket, callState?.callId]
  );

  const rejectJoinRequest = useCallback(
    async (requestId: string, reason?: string) => {
      if (!socket || !callState?.callId || !requestId) return;
      const response = await emitWithAck(socket, 'call:join-reject', {
        callId: callState.callId,
        requestId,
        reason: reason || 'rejected'
      });
      if (response?.success === false) {
        throw new Error(String(response?.error || 'Failed to reject join request.'));
      }
    },
    [socket, callState?.callId]
  );

  const cancelJoinRequest = useCallback(async () => {
    if (!socket || !callState?.callId) return;
    const mine = pendingJoinRequests.find(
      (entry) =>
        entry.requesterId === String(userId || '') && entry.status === 'pending'
    );
    const response = await emitWithAck(socket, 'call:join-cancel', {
      callId: callState.callId,
      requestId: mine?.requestId
    });
    if (response?.success === false) {
      throw new Error(String(response?.error || 'Failed to cancel join request.'));
    }
    setMyJoinRequestStatus('cancelled');
  }, [socket, callState?.callId, pendingJoinRequests, userId]);

  const rejectCall = useCallback(async () => {
    if (!socket || !callState?.callId) {
      stopRingingAlert('rejected');
      resetCallState();
      return;
    }
    await emitWithAck(socket, 'call:reject', { callId: callState.callId });
    stopRingingAlert('rejected');
    resetCallState();
  }, [socket, callState?.callId, resetCallState, stopRingingAlert]);

  const endCall = useCallback(async () => {
    if (socket && callState?.callId) {
      if (String(callState.callId).startsWith('pending-')) {
        stopRingingAlert('cancelled');
        resetCallState();
        return;
      }
      const joinedCount = participants.filter(
        (entry) => String(entry.status || '').toLowerCase() === 'joined'
      ).length;
      const isConference =
        String(callState.callType || '').toLowerCase() === 'conference' || joinedCount > 2;
      // Multi-party: leave individually so others can continue; 1:1 ends the call.
      if (isConference && joinedCount > 2) {
        await emitWithAck(socket, 'call:participant:left', { callId: callState.callId });
      } else {
        await emitWithAck(socket, 'call:end', { callId: callState.callId });
      }
    }
    stopRingingAlert('ended');
    resetCallState();
  }, [socket, callState?.callId, callState?.callType, participants, resetCallState, stopRingingAlert]);

  const addParticipant = useCallback(
    async (targetUserId: string) => {
      if (!socket || !callState?.callId || !targetUserId) return;
      setAddBusy(true);
      try {
        const response = await emitWithAck(socket, 'call:participant:add', {
          callId: callState.callId,
          userId: targetUserId
        });
        if (response?.success === false) {
          throw new Error(String(response?.error || 'Failed to add participant.'));
        }
        ensureParticipantEntry(targetUserId, 'invited');
      } finally {
        setAddBusy(false);
      }
    },
    [socket, callState?.callId, ensureParticipantEntry]
  );

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    const nextMuted = !muted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      resetCallState();
      clearResetTimer();
      stopRingingAlert('ended');
    };
  }, [resetCallState, clearResetTimer, stopRingingAlert]);

  const open = Boolean(callState?.callId);
  const statusLabel = statusToLabel(
    String(callState?.status || ''),
    incoming,
    callState?.mediaMode || mediaMode,
    callState?.callType
  );

  const value = useMemo<VoiceCallContextValue>(
    () => ({
      open,
      incoming,
      statusLabel,
      muted,
      speakerOn,
      cameraOff,
      addBusy,
      mediaMode: callState?.mediaMode || mediaMode,
      localStream: localStreamState,
      participantUsers,
      participants,
      remoteStreams,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleSpeaker,
      toggleCamera,
      switchToVideo,
      addParticipant,
      requestJoin,
      approveJoinRequest,
      rejectJoinRequest,
      cancelJoinRequest,
      pendingJoinRequests,
      myJoinRequestStatus
    }),
    [
      open,
      incoming,
      statusLabel,
      muted,
      speakerOn,
      cameraOff,
      addBusy,
      callState?.mediaMode,
      mediaMode,
      localStreamState,
      participantUsers,
      participants,
      remoteStreams,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleSpeaker,
      toggleCamera,
      switchToVideo,
      addParticipant,
      requestJoin,
      approveJoinRequest,
      rejectJoinRequest,
      cancelJoinRequest,
      pendingJoinRequests,
      myJoinRequestStatus
    ]
  );

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
};

export const useVoiceCall = () => {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error('useVoiceCall must be used within VoiceCallProvider');
  }
  return context;
};
