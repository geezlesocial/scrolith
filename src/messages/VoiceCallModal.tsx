import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, UserPlus, Volume2, VolumeX } from 'lucide-react';
import ConferenceParticipantsPanel from './ConferenceParticipantsPanel';
import MobileDialog from '../components/mobile/MobileDialog';

type ParticipantUser = {
  id: string;
  name?: string;
  avatar?: string;
};

type CallParticipant = {
  userId: string;
  status?: string;
  user?: ParticipantUser;
};

type VoiceCallModalProps = {
  open: boolean;
  title?: string;
  statusLabel?: string;
  incoming?: boolean;
  canAddParticipant?: boolean;
  addBusy?: boolean;
  muted?: boolean;
  speakerOn?: boolean;
  participantUsers?: ParticipantUser[];
  participants?: CallParticipant[];
  meId?: string;
  remoteStreams?: Record<string, MediaStream>;
  onClose?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
  onToggleSpeaker?: () => void;
  onAddParticipant?: (userId: string) => void;
};

const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  open,
  title = 'Voice call',
  statusLabel,
  incoming,
  canAddParticipant,
  addBusy,
  muted,
  speakerOn = true,
  participantUsers = [],
  participants = [],
  meId,
  remoteStreams = {},
  onClose,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onAddParticipant
}) => {
  if (!open) return null;

  return (
    <MobileDialog
      open={open}
      onClose={onClose || (() => undefined)}
      size="md"
      zIndexClassName="z-[140]"
      title={title}
      description={statusLabel}
      footer={
        <div className="flex flex-wrap items-center justify-center gap-3">
          {incoming ? (
            <>
              <button
                type="button"
                onClick={onReject}
                className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4" /> Reject
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Phone className="h-4 w-4" /> Accept
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleSpeaker}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {speakerOn ? 'Speaker' : 'Earpiece'}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              {canAddParticipant ? (
                <button
                  type="button"
                  onClick={() => undefined}
                  className="inline-flex h-11 cursor-default items-center justify-center gap-2 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-400"
                  title="Use Add in participants panel"
                >
                  <UserPlus className="h-4 w-4" /> Add
                </button>
              ) : null}
              <button
                type="button"
                onClick={onEnd}
                className="inline-flex h-11 min-w-[96px] items-center justify-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4" /> End
              </button>
            </>
          )}
        </div>
      }
    >
        <ConferenceParticipantsPanel
          participants={participants}
          meId={meId}
          candidateUsers={participantUsers}
          canAddParticipant={canAddParticipant}
          addBusy={addBusy}
          onAddParticipant={onAddParticipant}
        />

        {Object.entries(remoteStreams).map(([userId, stream]) => (
          <audio
            key={userId}
            autoPlay
            playsInline
            muted={!speakerOn}
            ref={(node) => {
              if (!node) return;
              if (node.srcObject !== stream) node.srcObject = stream;
              node.volume = speakerOn ? 1 : 0;
            }}
          />
        ))}
    </MobileDialog>
  );
};

export default VoiceCallModal;
