import React, { useEffect, useMemo, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { VoiceCallProvider, useVoiceCall } from './VoiceCallProvider';
import VoiceCallModal from './VoiceCallModal';

const MiniCallButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}> = ({ label, icon, onClick, tone = 'neutral' }) => {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-500 text-white hover:bg-emerald-400'
      : tone === 'danger'
        ? 'bg-rose-600 text-white hover:bg-rose-500'
        : tone === 'warning'
          ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
          : tone === 'primary'
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'bg-slate-800 text-white hover:bg-slate-700';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex min-w-[3.25rem] flex-col items-center gap-1 text-[10px] font-semibold text-white/85 transition hover:text-white"
      aria-label={label}
      title={label}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg ring-1 ring-white/10 ${toneClass}`}>
        {icon}
      </span>
      <span className="max-w-[4.5rem] truncate leading-tight">{label}</span>
    </button>
  );
};

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

  const isVideo = String(mediaMode || '').toLowerCase() === 'video';

  useEffect(() => {
    if (!open) setMinimized(false);
    if (incoming) setMinimized(false);
  }, [incoming, open]);

  if (open && minimized) {
    return (
      <div
        className="fixed bottom-4 left-3 right-3 z-[9999] rounded-3xl border border-white/10 bg-slate-950/95 px-3 py-3 text-white shadow-2xl backdrop-blur sm:left-auto sm:right-5 sm:w-[29rem]"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        role="status"
        aria-live="polite"
        data-testid="active-call-inbox-overlay"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label="Return to active call"
            title="Return to active call"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg">
              {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{title}</span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-white/70">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="truncate">{statusLabel || 'Call in progress'}</span>
              </span>
            </span>
            <Maximize2 className="hidden h-4 w-4 shrink-0 text-white/60 sm:block" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-1 overflow-x-auto pb-0.5">
          <MiniCallButton
            label={muted ? 'Unmute' : 'Mute'}
            icon={muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            tone={muted ? 'warning' : 'success'}
            onClick={toggleMute}
          />
          <MiniCallButton
            label={speakerOn ? 'Speaker' : 'Speaker off'}
            icon={speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            tone={speakerOn ? 'primary' : 'neutral'}
            onClick={toggleSpeaker}
          />
          <MiniCallButton
            label={isVideo ? (cameraOff ? 'Camera on' : 'Camera off') : 'Video'}
            icon={isVideo ? cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            tone={isVideo && cameraOff ? 'warning' : 'primary'}
            onClick={() => {
              const action = isVideo ? toggleCamera() : switchToVideo();
              void action.catch((error: any) =>
                onError(error?.message || (isVideo ? 'Unable to toggle camera.' : 'Unable to switch to video.'))
              );
            }}
          />
          <MiniCallButton
            label="Open"
            icon={<Maximize2 className="h-5 w-5" />}
            tone="neutral"
            onClick={() => setMinimized(false)}
          />
          <MiniCallButton
            label="End"
            icon={<PhoneOff className="h-5 w-5" />}
            tone="danger"
            onClick={() => void endCall().catch(() => undefined)}
          />
        </div>
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
