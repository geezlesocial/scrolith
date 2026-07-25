import React, { useMemo } from 'react';
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
  const {
    open,
    incoming,
    statusLabel,
    muted,
    speakerOn,
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

  return (
    <VoiceCallModal
      open={open}
      title={title}
      incoming={incoming}
      statusLabel={statusLabel}
      muted={muted}
      speakerOn={speakerOn}
      addBusy={addBusy}
      mediaMode={mediaMode}
      localStream={localStream}
      canAddParticipant={false}
      participantUsers={participantUsers}
      participants={participants}
      meId={user?.id}
      remoteStreams={remoteStreams}
      onClose={() => void endCall().catch(() => undefined)}
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
