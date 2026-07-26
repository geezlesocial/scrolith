import React, { useEffect, useMemo, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { VoiceCallProvider, useVoiceCall } from './VoiceCallProvider';
import VoiceCallModal from './VoiceCallModal';

/**
 * Always-mounted call layer so incoming rings are received even when the user is
 * not on /messages and no dock chat window is open. Without this, unanswered
 * rings expire server-side as "missed" with no accept UI.
 */
const GlobalVoiceCallOverlay: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [minimized, setMinimized] = useState(false);
  const {
    open,
    incoming,
    statusLabel,
    muted,
    speakerOn,
    cameraOff,
    addBusy,
    mediaMode,
    localStream,
    participantUsers,
    participants,
    remoteStreams,
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
  } = useVoiceCall();

  const title = useMemo(() => {
    if (String(mediaMode || '').toLowerCase() === 'video') {
      return incoming ? 'Incoming video call' : 'Video call';
    }
    return incoming ? 'Incoming voice call' : 'Voice call';
  }, [incoming, mediaMode]);

  const onError = (message: string) => {
    showNotification('error', 'Call', message);
  };

  useEffect(() => {
    if (!open) setMinimized(false);
    if (incoming) setMinimized(false);
  }, [incoming, open]);

  if (open && minimized) {
    return (
      <div
        className="fixed bottom-4 left-4 right-4 z-[160] flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur sm:left-auto sm:right-5 sm:w-[24rem]"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="Return to active call"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg">
            <Phone className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{title}</span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-white/70">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="truncate">{statusLabel || 'Call in progress'}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void endCall().catch(() => undefined)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg hover:bg-rose-500"
          aria-label="End call"
          title="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <VoiceCallModal
      open={open && !minimized}
      title={title}
      incoming={incoming}
      statusLabel={statusLabel}
      muted={muted}
      speakerOn={speakerOn}
      cameraOff={cameraOff}
      addBusy={addBusy}
      mediaMode={mediaMode}
      localStream={localStream}
      canAddParticipant={false}
      participantUsers={participantUsers}
      participants={participants}
      meId={user?.id}
      remoteStreams={remoteStreams}
      onClose={() => setMinimized(true)}
      onAccept={() =>
        void acceptCall().catch((error: any) =>
          onError(error?.message || 'Unable to accept call.')
        )
      }
      onReject={() =>
        void rejectCall().catch((error: any) =>
          onError(error?.message || 'Unable to reject call.')
        )
      }
      onEnd={() => void endCall().catch(() => undefined)}
      onToggleMute={toggleMute}
      onToggleSpeaker={toggleSpeaker}
      onToggleCamera={() =>
        void toggleCamera().catch((error: any) =>
          onError(error?.message || 'Unable to toggle camera.')
        )
      }
      onSwitchToVideo={() =>
        void switchToVideo().catch((error: any) =>
          onError(error?.message || 'Unable to switch to video.')
        )
      }
      onAddParticipant={(userId) =>
        void addParticipant(userId).catch((error: any) =>
          onError(error?.message || 'Unable to add participant.')
        )
      }
      myJoinRequestStatus={myJoinRequestStatus}
      pendingJoinRequests={pendingJoinRequests}
      canModerateJoinRequests={!incoming}
      onRequestJoin={() =>
        void requestJoin().catch((error: any) =>
          onError(error?.message || 'Unable to request join.')
        )
      }
      onCancelJoinRequest={() =>
        void cancelJoinRequest().catch((error: any) =>
          onError(error?.message || 'Unable to cancel join request.')
        )
      }
      onApproveJoinRequest={(requestId) =>
        void approveJoinRequest(requestId).catch((error: any) =>
          onError(error?.message || 'Unable to approve join request.')
        )
      }
      onRejectJoinRequest={(requestId) =>
        void rejectJoinRequest(requestId).catch((error: any) =>
          onError(error?.message || 'Unable to reject join request.')
        )
      }
    />
  );
};

const GlobalVoiceCallShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const { user } = useUser();

  return (
    <VoiceCallProvider socket={socket} userId={user?.id} participantUsers={[]}>
      {children}
      <GlobalVoiceCallOverlay />
    </VoiceCallProvider>
  );
};

export default GlobalVoiceCallShell;
