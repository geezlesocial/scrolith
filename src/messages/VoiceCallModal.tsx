import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, UserPlus, X } from 'lucide-react';
import ConferenceParticipantsPanel from './ConferenceParticipantsPanel';

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
  participantUsers?: ParticipantUser[];
  participants?: CallParticipant[];
  meId?: string;
  remoteStreams?: Record<string, MediaStream>;
  onClose?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
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
  participantUsers = [],
  participants = [],
  meId,
  remoteStreams = {},
  onClose,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onAddParticipant
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {statusLabel ? <p className="text-xs text-gray-500">{statusLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ConferenceParticipantsPanel
          participants={participants}
          meId={meId}
          candidateUsers={participantUsers}
          canAddParticipant={canAddParticipant}
          addBusy={addBusy}
          onAddParticipant={onAddParticipant}
        />

        {Object.entries(remoteStreams).map(([userId, stream]) => (
          <audio key={userId} autoPlay playsInline ref={(node) => {
            if (!node) return;
            if (node.srcObject !== stream) node.srcObject = stream;
          }} />
        ))}

        <div className="mt-4 flex items-center justify-center gap-3">
          {incoming ? (
            <>
              <button
                type="button"
                onClick={onReject}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4" /> Reject
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Phone className="h-4 w-4" /> Accept
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              {canAddParticipant ? (
                <button
                  type="button"
                  onClick={() => undefined}
                  className="inline-flex cursor-default items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-400"
                  title="Use Add in participants panel"
                >
                  <UserPlus className="h-4 w-4" /> Add
                </button>
              ) : null}
              <button
                type="button"
                onClick={onEnd}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4" /> End
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceCallModal;
