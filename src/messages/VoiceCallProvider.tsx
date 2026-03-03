import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

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
};

type VoiceCallContextValue = {
  open: boolean;
  incoming: boolean;
  statusLabel: string;
  muted: boolean;
  addBusy: boolean;
  participantUsers: ParticipantOption[];
  participants: VoiceCallParticipant[];
  remoteStreams: Record<string, MediaStream>;
  startCall: (options?: { conference?: boolean }) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  addParticipant: (userId: string) => Promise<void>;
};

const VoiceCallContext = createContext<VoiceCallContextValue | undefined>(undefined);

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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

const statusToLabel = (status: string, incoming: boolean) => {
  if (incoming && status === 'ringing') return 'Incoming voice call';
  if (status === 'ringing') return 'Calling...';
  if (status === 'active') return 'Call in progress';
  if (status === 'missed') return 'Missed call';
  if (status === 'failed') return 'Call failed';
  if (status === 'cancelled') return 'Call cancelled';
  if (status === 'ended') return 'Call ended';
  if (status === 'rejected') return 'Call rejected';
  return 'Connecting...';
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
  children: React.ReactNode;
};

export const VoiceCallProvider: React.FC<VoiceCallProviderProps> = ({
  socket,
  userId,
  conversationId,
  participantUsers,
  children
}) => {
  const [callState, setCallState] = useState<CallState | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<VoiceCallParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [addBusy, setAddBusy] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const callIdRef = useRef<string>('');
  const conversationIdRef = useRef<string>('');
  const userIdRef = useRef<string>('');
  const ringAudioContextRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const permissionNoticeShownRef = useRef(false);

  useEffect(() => {
    callIdRef.current = callState?.callId || '';
    conversationIdRef.current = callState?.conversationId || '';
    userIdRef.current = String(userId || '').trim();
  }, [callState?.callId, callState?.conversationId, userId]);

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

  const playRingPulse = useCallback(() => {
    try {
      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!ringAudioContextRef.current) {
        ringAudioContextRef.current = new AudioContextCtor();
      }
      const ctx = ringAudioContextRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 920;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      oscillator.start(now);
      oscillator.stop(now + 0.27);
    } catch {
      // noop
    }
  }, []);

  const stopRingingAlert = useCallback(() => {
    if (ringIntervalRef.current) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  const startRingingAlert = useCallback(() => {
    if (ringIntervalRef.current) return;
    playRingPulse();
    ringIntervalRef.current = window.setInterval(() => {
      playRingPulse();
    }, 1900);
  }, [playRingPulse]);

  const clearLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    clearResetTimer();
    stopRingingAlert();
    setIncoming(false);
    setCallState(null);
    setParticipants([]);
    setMuted(false);
    permissionNoticeShownRef.current = false;
    clearPeers();
    clearLocalStream();
  }, [clearLocalStream, clearPeers, clearResetTimer, stopRingingAlert]);

  const ensureLocalAudio = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (error: any) {
      const name = String(error?.name || '').toLowerCase();
      const denied =
        name.includes('notallowed') ||
        name.includes('permissiondenied') ||
        name.includes('securityerror');
      if (denied) {
        throw new Error('Microphone permission denied. Enable microphone access and try again.');
      }
      throw new Error(String(error?.message || 'Unable to access microphone.'));
    }
  }, []);

  const sendSignal = useCallback(
    async (toUserId: string, signal: any) => {
      const callId = callIdRef.current;
      if (!callId || !toUserId) return;
      await emitWithAck(socket, 'call:signal', { callId, toUserId, signal });
    },
    [socket]
  );

  const createPeerConnection = useCallback(
    async (remoteUserId: string) => {
      if (!remoteUserId) return null;
      const existing = peerConnectionsRef.current.get(remoteUserId);
      if (existing) return existing;

      let stream: MediaStream | null = null;
      try {
        stream = await ensureLocalAudio();
      } catch (error: any) {
        if (!permissionNoticeShownRef.current) {
          permissionNoticeShownRef.current = true;
          emitVoiceLifecycleEvent('permission_denied', {
            message: String(error?.message || 'Microphone permission denied.')
          });
        }
      }
      const peer = new RTCPeerConnection(RTC_CONFIG);

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
        void sendSignal(remoteUserId, { type: 'candidate', candidate: event.candidate });
      };

      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          setRemoteStreams((prev) => {
            if (!prev[remoteUserId]) return prev;
            const next = { ...prev };
            delete next[remoteUserId];
            return next;
          });
        }
      };

      peerConnectionsRef.current.set(remoteUserId, peer);
      return peer;
    },
    [ensureLocalAudio, sendSignal]
  );

  const ensureParticipantEntry = useCallback((id: string, status?: string) => {
    setParticipants((prev) => {
      const exists = prev.some((entry) => entry.userId === id);
      if (exists) {
        return prev.map((entry) => (entry.userId === id ? { ...entry, status: status || entry.status } : entry));
      }
      const user = participantUsers.find((entry) => entry.id === id);
      return [...prev, { userId: id, status: status || 'invited', user }];
    });
  }, [participantUsers]);

  const createOfferForUser = useCallback(
    async (remoteUserId: string) => {
      if (!remoteUserId || remoteUserId === userIdRef.current) return;
      try {
        const peer = await createPeerConnection(remoteUserId);
        if (!peer) return;
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await peer.setLocalDescription(offer);
        await sendSignal(remoteUserId, { type: 'offer', sdp: offer });
      } catch (error: any) {
        setCallState((prev) => (prev ? { ...prev, status: 'failed' } : prev));
        emitVoiceLifecycleEvent('failed', {
          callId: callIdRef.current,
          conversationId: conversationIdRef.current,
          error: String(error?.message || 'Failed to establish voice call.')
        });
      }
    },
    [createPeerConnection, sendSignal]
  );

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
      if (signalType === 'offer' && signal?.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal(fromUserId, { type: 'answer', sdp: answer });
      } else if (signalType === 'answer' && signal?.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signalType === 'candidate' && signal?.candidate) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
      stopRingingAlert();
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
      setCallState({
        callId: payloadCallId,
        conversationId: payloadConversationId,
        initiatorId,
        status: String(payload?.status || 'ringing').toLowerCase(),
        callType: String(payload?.callType || 'direct').toLowerCase()
      });

      const ids = Array.isArray(payload?.participantIds)
        ? payload.participantIds.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const fallbackIds = (() => {
        if (!sameConversation) {
          return [initiatorId, String(userId || '').trim()].filter(Boolean);
        }
        const knownIds = new Set(
          [String(userId || '').trim(), ...participantUsers.map((entry) => String(entry?.id || '').trim())].filter(Boolean)
        );
        const sanitizedIds = ids.filter((id) => knownIds.has(id));
        return sanitizedIds.length
          ? sanitizedIds
          : [initiatorId, String(userId || '').trim()].filter((id) => Boolean(id) && knownIds.has(id));
      })();
      setParticipants(normalizeParticipants(fallbackIds, participantUsers, 'invited'));
      if (incomingCall) {
        startRingingAlert();
        emitVoiceLifecycleEvent('incoming', {
          callId: payloadCallId,
          conversationId: payloadConversationId,
          initiatorId
        });
      } else {
        stopRingingAlert();
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
      stopRingingAlert();
      if (joinedUserId !== userIdRef.current) {
        void createOfferForUser(joinedUserId);
      }
    };

    const onParticipantAdded = (payload: any) => {
      const callId = String(payload?.callId || '').trim();
      const addedUserId = String(payload?.userId || payload?.participantId || '').trim();
      if (!callId || !addedUserId || callId !== callIdRef.current) return;
      ensureParticipantEntry(addedUserId, 'invited');
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
      stopRingingAlert();
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
    socket.on('call:signal', onSignal);
    socket.on('messenger:call_joined', onLifecycleJoined);
    socket.on('messenger:call_missed', onLifecycleMissed);
    socket.on('messenger:call_failed', onLifecycleFailed);
    socket.on('messenger:call_ended', onLifecycleEnded);

    return () => {
      socket.off('call:initiate', onInitiated);
      socket.off('call:ringing', onRinging);
      socket.off('call:participant:joined', onParticipantJoined);
      socket.off('call:participant:add', onParticipantAdded);
      socket.off('call:participant:left', onParticipantLeft);
      socket.off('call:end', onCallEnded);
      socket.off('call:reject', onCallRejected);
      socket.off('call:signal', onSignal);
      socket.off('messenger:call_joined', onLifecycleJoined);
      socket.off('messenger:call_missed', onLifecycleMissed);
      socket.off('messenger:call_failed', onLifecycleFailed);
      socket.off('messenger:call_ended', onLifecycleEnded);
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
    async (options?: { conference?: boolean }) => {
      if (!socket || !userId || !conversationId) return;
      const participantIds = participantUsers.map((entry) => entry.id).filter(Boolean);
      const targetParticipantIds = options?.conference ? participantIds : participantIds.slice(0, 1);
      if (!targetParticipantIds.length) {
        throw new Error('No valid participant available for this call.');
      }
      const response = await emitWithAck(socket, 'call:initiate', {
        conversationId,
        participantIds: targetParticipantIds,
        callType: options?.conference ? 'conference' : 'direct'
      });
      if (response?.success === false) {
        emitVoiceLifecycleEvent('failed', {
          conversationId,
          error: String(response?.error || 'Failed to initiate call.')
        });
        throw new Error(String(response?.error || 'Failed to initiate call.'));
      }
      const data = response?.data || {};
      stopRingingAlert();
      setIncoming(false);
      setCallState({
        callId: String(data.callId || ''),
        conversationId: String(data.conversationId || conversationId),
        initiatorId: String(data.initiatorId || userId),
        status: String(data.status || 'ringing'),
        callType: String(data.callType || (options?.conference ? 'conference' : 'direct'))
      });
      const ids = Array.isArray(data?.participantIds)
        ? data.participantIds.map((id: any) => String(id || '').trim()).filter(Boolean)
        : [userId, ...targetParticipantIds];
      setParticipants(normalizeParticipants(Array.from(new Set(ids)), participantUsers, 'invited'));
    },
    [socket, userId, conversationId, participantUsers, stopRingingAlert]
  );

  const acceptCall = useCallback(async () => {
    if (!socket || !callState?.callId) return;
    const response = await emitWithAck(socket, 'call:accept', { callId: callState.callId });
    if (response?.success === false) {
      throw new Error(String(response?.error || 'Failed to accept call.'));
    }
    stopRingingAlert();
    setIncoming(false);
    setCallState((prev) => (prev ? { ...prev, status: 'active' } : prev));
    ensureParticipantEntry(String(userId || ''), 'joined');
  }, [socket, callState?.callId, ensureParticipantEntry, userId, stopRingingAlert]);

  const rejectCall = useCallback(async () => {
    if (!socket || !callState?.callId) {
      resetCallState();
      return;
    }
    await emitWithAck(socket, 'call:reject', { callId: callState.callId });
    resetCallState();
  }, [socket, callState?.callId, resetCallState]);

  const endCall = useCallback(async () => {
    if (socket && callState?.callId) {
      await emitWithAck(socket, 'call:end', { callId: callState.callId });
    }
    resetCallState();
  }, [socket, callState?.callId, resetCallState]);

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

  useEffect(() => {
    return () => {
      resetCallState();
      clearResetTimer();
      stopRingingAlert();
      if (ringAudioContextRef.current) {
        try {
          void ringAudioContextRef.current.close();
        } catch {
          // noop
        }
        ringAudioContextRef.current = null;
      }
    };
  }, [resetCallState, clearResetTimer, stopRingingAlert]);

  const open = Boolean(callState?.callId);
  const statusLabel = statusToLabel(String(callState?.status || ''), incoming);

  const value = useMemo<VoiceCallContextValue>(
    () => ({
      open,
      incoming,
      statusLabel,
      muted,
      addBusy,
      participantUsers,
      participants,
      remoteStreams,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      addParticipant
    }),
    [
      open,
      incoming,
      statusLabel,
      muted,
      addBusy,
      participantUsers,
      participants,
      remoteStreams,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      addParticipant
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
